#!/usr/bin/env node
/**
 * Descarga el IPC por grupos ECOICOP y genera src/data/inflacion.json.
 *
 * Fuente: INE, IPC base 2025, tabla 76125 (índices) y 76156 (ponderaciones).
 * https://www.ine.es/jaxiT3/Tabla.htm?t=76125
 *
 * Uso: npm run data:inflacion
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sameMonthChange, yearOnYear } from '../src/lib/calc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/inflacion.json');
const OUT_SERIES = resolve(__dirname, '../src/data/inflacion-serie.json');
const OUT_AUDIT = resolve(__dirname, '../src/data/inflacion-fuente.json');

const BASE = 'https://servicios.ine.es/wstempus/js/ES';
const URL_INDICES = `${BASE}/DATOS_TABLA/76125?tip=AM`;
const URL_PESOS = `${BASE}/DATOS_TABLA/76156?tip=AM`;

// La tabla 50902, la que aparece en el ejemplo de la documentación del INE,
// está congelada en 2025-12. La viva es la 76125 ("ver.2", base 2025).
// Se compara siempre el mismo mes (septiembre) entre años: así la estacionalidad
// no distorsiona la lectura. Ropa cae un 13 % en enero y sube un 8 % en octubre.
const YEAR_MIN = 2002;

const VAR_GRUPO = 'Grupos ECOICOP';
const VAR_TIPO = 'Índices y Tasas';

const SHORT = [
  [/^Índice general$/i, 'Total'],
  [/^Alimentos/i, 'Alimentos y bebidas'],
  [/^Bebidas alcohólicas/i, 'Alcohol y tabaco'],
  [/^Vestido/i, 'Ropa y calzado'],
  [/^Vivienda/i, 'Vivienda y energía'],
  [/^Muebles/i, 'Muebles y hogar'],
  [/^Sanidad$/i, 'Sanidad'],
  [/^Transporte$/i, 'Transporte'],
  [/^Información/i, 'Comunicaciones'],
  [/^Actividades recreativas/i, 'Ocio y cultura'],
  [/^Enseñanza$/i, 'Enseñanza'],
  [/^Restaurantes/i, 'Restaurantes'],
  [/^Seguros/i, 'Seguros y finanzas'],
  [/^Cuidado personal/i, 'Cuidado personal'],
];

const shortName = (name) => {
  for (const [re, short] of SHORT) if (re.test(name)) return short;
  return name;
};

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function metadataOf(serie) {
  return Object.fromEntries((serie.MetaData ?? []).map((m) => [m.T3_Variable, m.Nombre]));
}

function orderedPoints(serie) {
  return (serie.Data ?? [])
    .filter((d) => d.Valor != null && d.Fecha)
    .sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
}

function definitiveMap(points) {
  const byMonth = new Map();
  for (const p of points) {
    const tipo = p.T3_TipoDato ?? p.TipoDato?.Nombre;
    // Los avances no tienen índice definitivo detrás; fuera de la serie.
    if (tipo === 'Avance') continue;
    byMonth.set(p.Fecha.slice(0, 7), p.Valor);
  }
  return byMonth;
}

function round2(value) {
  return Number(value.toFixed(2));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) fail(`HTTP ${res.status} al descargar ${url}`);
  const json = await res.json();
  if (!Array.isArray(json)) fail(`Respuesta inesperada de ${url}`);
  return json;
}

async function main() {
  console.log('Descargando IPC por grupos (INE)…');
  const started = Date.now();

  const [indices, pesos] = await Promise.all([fetchJson(URL_INDICES), fetchJson(URL_PESOS)]);

  const weights = new Map();
  for (const serie of pesos) {
    const md = metadataOf(serie);
    if (md[VAR_TIPO] !== 'Ponderación') continue;
    const grupo = md[VAR_GRUPO];
    if (!grupo) continue;
    const point = orderedPoints(serie).at(-1);
    if (point) weights.set(grupo, point.Valor / 10); // tanto por mil → %
  }

  const rows = [];
  const pointsByGroup = new Map();

  for (const serie of indices) {
    const md = metadataOf(serie);
    if (md[VAR_TIPO] !== 'Índice') continue;

    const grupo = md[VAR_GRUPO];
    if (!grupo || grupo === 'Índice general') continue;

    const points = orderedPoints(serie);
    if (!points.length) continue;

    pointsByGroup.set(grupo, points);

    const latest = points.at(-1);

    const weight = weights.get(grupo);
    if (weight == null) fail(`Falta la ponderación de "${grupo}".`);

    rows.push({
      name: grupo,
      short: shortName(grupo),
      weight: Number(weight.toFixed(2)),
      latest: latest.Fecha.slice(0, 7),
    });
  }

  const generalSerie = indices.find((s) => {
    const md = metadataOf(s);
    return md[VAR_GRUPO] === 'Índice general' && md[VAR_TIPO] === 'Índice';
  });
  if (!generalSerie) fail('No se encontró el índice general.');

  const generalPoints = orderedPoints(generalSerie);
  const generalLatest = generalPoints.at(-1);
  const latest = generalLatest.Fecha.slice(0, 7);
  const [refYear, refMonth] = latest.split('-').map(Number);

  const years = [];
  for (let y = YEAR_MIN; y < refYear; y += 1) years.push(y);

  const generalMap = definitiveMap(generalPoints);
  const groupMaps = new Map(
    rows.map((row) => [row.name, definitiveMap(pointsByGroup.get(row.name))])
  );

  // Cambio entre el mismo mes del año elegido y el último dato.
  const general = Object.fromEntries(
    Object.entries(sameMonthChange(generalMap, latest, years)).map(([year, value]) => [
      year,
      round2(value),
    ])
  );
  for (const row of rows) {
    const changes = sameMonthChange(groupMaps.get(row.name), latest, years);
    row.byYear = Object.fromEntries(
      Object.entries(changes).map(([year, value]) => [year, round2(value)])
    );
  }

  // --- Guardas -------------------------------------------------------------
  if (rows.length !== 13) fail(`Se esperaban 13 grupos y hay ${rows.length}.`);

  const weightSum = rows.reduce((a, r) => a + r.weight, 0);
  if (Math.abs(weightSum - 100) > 0.5) {
    fail(`Los pesos suman ${weightSum.toFixed(2)} % en vez de 100 %.`);
  }

  const byShort = Object.fromEntries(rows.map((r) => [r.short, r]));

  if (general['2019'] < 27 || general['2019'] > 29) {
    fail(`IPC general frente a 2019 fuera de rango: ${general['2019']}`);
  }
  if (general['2002'] < 72 || general['2002'] > 77) {
    fail(`IPC general frente a 2002 fuera de rango: ${general['2002']}`);
  }
  if (!byShort['Alimentos y bebidas'] || byShort['Alimentos y bebidas'].byYear['2019'] < 39) {
    fail('Alimentos debería superar el 39 % frente a septiembre de 2019.');
  }
  if (
    !byShort['Ropa y calzado'] ||
    byShort['Ropa y calzado'].byYear['2019'] < 10 ||
    byShort['Ropa y calzado'].byYear['2019'] > 12
  ) {
    fail(
      `Ropa y calzado debería subir entre 10 y 12 % con el mismo mes: ${byShort['Ropa y calzado']?.byYear['2019']}`
    );
  }
  if (!byShort['Alcohol y tabaco'] || byShort['Alcohol y tabaco'].byYear['2002'] < 150) {
    fail('Alcohol y tabaco debería superar el 150 % frente a septiembre de 2002.');
  }
  if (!byShort['Comunicaciones'] || byShort['Comunicaciones'].byYear['2002'] > -50) {
    fail('Comunicaciones debería caer más del 50 % frente a septiembre de 2002.');
  }

  // --- Serie mensual: variación anual derivada del índice -----------------
  const START_MONTH = '2003-01';
  const lastMonth = latest;

  const months = [];
  {
    let [y, m] = START_MONTH.split('-').map(Number);
    const [ey, em] = lastMonth.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  const series = {
    general: yearOnYear(generalMap, months).map((v) => (v == null ? null : round2(v))),
  };
  for (const row of rows) {
    series[row.short] = yearOnYear(groupMaps.get(row.name), months).map((v) =>
      v == null ? null : round2(v)
    );
  }

  // --- Auditoría: índices fuente y variación anual publicada por el INE ----
  const auditMonths = [];
  {
    let [y, m] = [YEAR_MIN, 1];
    const [ey, em] = lastMonth.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      auditMonths.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  const auditIndices = {
    general: auditMonths.map((ym) => {
      const value = generalMap.get(ym);
      if (value == null) fail(`Falta el índice general de ${ym}.`);
      return Number(value.toFixed(3));
    }),
    groups: Object.fromEntries(
      rows.map((row) => [
        row.short,
        auditMonths.map((ym) => {
          const value = groupMaps.get(row.name).get(ym);
          if (value == null) fail(`Falta el índice de ${row.short} en ${ym}.`);
          return Number(value.toFixed(3));
        }),
      ])
    ),
  };

  const rateSeriesByGroup = new Map();
  for (const serie of indices) {
    const md = metadataOf(serie);
    if (md[VAR_TIPO] !== 'Variación anual') continue;
    const grupo = md[VAR_GRUPO];
    if (!grupo) continue;
    rateSeriesByGroup.set(grupo, definitiveMap(orderedPoints(serie)));
  }
  if (rateSeriesByGroup.size !== 14) {
    fail(`Se esperaban 14 series de variación anual y hay ${rateSeriesByGroup.size}.`);
  }

  const auditRates = {
    general: auditMonths.map((ym) => {
      const value = rateSeriesByGroup.get('Índice general')?.get(ym);
      return value == null ? null : Number(value.toFixed(2));
    }),
    groups: Object.fromEntries(
      rows.map((row) => [
        row.short,
        auditMonths.map((ym) => {
          const value = rateSeriesByGroup.get(row.name)?.get(ym);
          return value == null ? null : Number(value.toFixed(2));
        }),
      ])
    ),
  };

  // Contraste independiente: nuestra variación anual frente a la que publica
  // el INE para el mismo mes. La tolerancia cubre el redondeo de ambas series.
  let maxCrossDiff = 0;
  let crossCount = 0;
  const crossCheck = (label, rates, derived) => {
    let compared = 0;
    months.forEach((ym, i) => {
      const published = rates?.get(ym);
      const value = derived[i];
      if (published == null || value == null) return;
      const diff = Math.abs(value - published);
      if (diff > 0.06) {
        fail(`Variación anual de ${label} en ${ym}: ${value} % frente a ${published} % publicada.`);
      }
      compared += 1;
      crossCount += 1;
      if (diff > maxCrossDiff) maxCrossDiff = diff;
    });
    if (compared < 280) {
      fail(`Solo se pudieron contrastar ${compared} meses de ${label} con el INE.`);
    }
  };

  crossCheck('IPC general', rateSeriesByGroup.get('Índice general'), series.general);
  for (const row of rows) {
    crossCheck(row.short, rateSeriesByGroup.get(row.name), series[row.short]);
  }

  const peakOf = (arr) => {
    let best = { value: -Infinity, month: null };
    arr.forEach((v, i) => {
      if (v != null && v > best.value) best = { value: v, month: months[i] };
    });
    return best;
  };
  const troughOf = (arr) => {
    let best = { value: Infinity, month: null };
    arr.forEach((v, i) => {
      if (v != null && v < best.value) best = { value: v, month: months[i] };
    });
    return best;
  };

  if (months.length !== 285) fail(`Se esperaban 285 meses y hay ${months.length}.`);
  if (lastMonth !== '2026-09') fail(`Último mes inesperado: ${lastMonth} (¿avance?).`);
  if (Object.keys(series).length !== 14) {
    fail(`Se esperaban 14 series y hay ${Object.keys(series).length}.`);
  }

  const generalPeak = peakOf(series.general);
  if (generalPeak.month !== '2022-07' || Math.abs(generalPeak.value - 10.8) > 0.15) {
    fail(`Pico general inesperado: ${generalPeak.value} % en ${generalPeak.month}.`);
  }

  const generalTrough = troughOf(series.general);
  if (generalTrough.month !== '2009-07' || Math.abs(generalTrough.value + 1.4) > 0.15) {
    fail(`Mínimo general inesperado: ${generalTrough.value} % en ${generalTrough.month}.`);
  }

  const housing = series['Vivienda y energía'];
  const housingPeak = peakOf(housing);
  const housingTrough = troughOf(housing);
  if (housingPeak.month !== '2022-03' || Math.abs(housingPeak.value - 33.1) > 0.15) {
    fail(`Pico de vivienda inesperado: ${housingPeak.value} % en ${housingPeak.month}.`);
  }
  if (housingTrough.month !== '2023-08' || Math.abs(housingTrough.value + 18.0) > 0.15) {
    fail(`Mínimo de vivienda inesperado: ${housingTrough.value} % en ${housingTrough.month}.`);
  }

  const payload = {
    source: {
      name: 'INE — Índice de Precios de Consumo',
      table: 76125,
      weightsTable: 76156,
      url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=76125',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      note: 'Índices por grupos ECOICOP. Serie empalmada por el INE a través de seis bases.',
    },
    fetched: new Date().toISOString().slice(0, 10),
    latest,
    reference: { year: refYear, month: refMonth },
    years,
    method:
      'Cambio entre el mismo mes (septiembre) del año elegido y el último dato disponible.',
    general,
    groups: rows,
  };

  const seriesPayload = { latest: lastMonth, months, series };

  const auditPayload = {
    source: {
      name: 'INE — Índice de Precios de Consumo',
      table: 76125,
      url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=76125',
      note: 'Índices mensuales por grupo y variación anual publicada por el INE. Snapshot de auditoría; no se sirve al navegador.',
    },
    fetched: payload.fetched,
    months: auditMonths,
    indices: auditIndices,
    annualRates: auditRates,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload), 'utf8');
  await writeFile(OUT_SERIES, JSON.stringify(seriesPayload), 'utf8');
  await writeFile(OUT_AUDIT, JSON.stringify(auditPayload), 'utf8');

  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  const kbSeries = (Buffer.byteLength(JSON.stringify(seriesPayload)) / 1024).toFixed(1);
  const kbAudit = (Buffer.byteLength(JSON.stringify(auditPayload)) / 1024).toFixed(1);
  console.log(`✓ ${rows.length} grupos, último dato ${latest}`);
  console.log(`✓ serie mensual: ${months.length} meses, ${Object.keys(series).length} series`);
  console.log(`✓ general: 2019 ${general['2019']} % | 2002 ${general['2002']} %`);
  console.log(
    `✓ contraste con el INE: ${crossCount} comparaciones, diferencia máxima ${maxCrossDiff.toFixed(3)} pp`
  );
  console.log(`✓ ${kb} KB → ${OUT}`);
  console.log(`✓ ${kbSeries} KB → ${OUT_SERIES}`);
  console.log(`✓ ${kbAudit} KB → ${OUT_AUDIT}`);
  console.log(`✓ ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => fail(err.stack ?? String(err)));
