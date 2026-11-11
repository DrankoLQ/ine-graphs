#!/usr/bin/env node
/**
 * Descarga la tasa de paro de la EPA por edad y genera src/data/paro.json.
 *
 * Fuente: INE, Encuesta de Población Activa, tabla 14506.
 * https://www.ine.es/jaxiT3/Tabla.htm?t=14506
 *
 * Uso: npm run data:paro
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { round2, unemploymentStats } from '../src/lib/calc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/paro.json');

const URL = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/14506?tip=AM';

const VAR_TIPO = 'Tipo de dato';
const VAR_SEXO = 'Sexo';
const VAR_NACIONAL = 'Total Nacional';
const VAR_EDAD_TOTAL = 'Totales de edad';
const VAR_EDAD_JOVEN = 'Semiintervalos de edad';

const TASA = 'Tasa de paro de la población';

// La EPA publica trimestres: 2002-T1 a 2026-T3 son 99 puntos.
const EXPECTED_QUARTERS = 99;
const FIRST_QUARTER = '2002-01';
const LAST_QUARTER = '2026-07';

const QUARTER_BY_MONTH = { '01': 1, '04': 2, '07': 3, '10': 4 };

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function metadataOf(serie) {
  return Object.fromEntries((serie.MetaData ?? []).map((m) => [m.T3_Variable, m.Nombre]));
}

function quarterOf(dato) {
  const fecha = dato.Fecha?.slice(0, 10);
  if (!fecha) fail('Dato sin fecha.');
  const [year, month] = fecha.split('-');
  const quarter = QUARTER_BY_MONTH[month];
  if (!quarter) fail(`Fecha fuera de trimestre: ${fecha}`);
  if (dato.T3_Periodo && dato.T3_Periodo !== `T${quarter}`) {
    fail(`Periodo ${dato.T3_Periodo} no coincide con la fecha ${fecha}.`);
  }
  return `${year}-${month}`;
}

function pointsOf(serie) {
  const points = (serie.Data ?? [])
    .filter((d) => d.Valor != null && d.Fecha)
    .map((d) => ({ quarter: quarterOf(d), value: Number(d.Valor) }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  const seen = new Set();
  for (const p of points) {
    if (seen.has(p.quarter)) fail(`Trimestre duplicado: ${p.quarter}`);
    seen.add(p.quarter);
  }
  return points;
}

async function main() {
  console.log('Descargando tasa de paro por edad (EPA, tabla 14506)…');
  const started = Date.now();

  const res = await fetch(URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) fail(`HTTP ${res.status} al descargar ${URL}`);

  const raw = await res.json();
  if (!Array.isArray(raw)) fail('La respuesta no es un array de series.');

  const national = (md) =>
    md[VAR_NACIONAL] === 'Total Nacional' &&
    md[VAR_SEXO] === 'Ambos sexos' &&
    md[VAR_TIPO] === TASA;

  const totalSeries = raw.filter((s) => {
    const md = metadataOf(s);
    return national(md) && md[VAR_EDAD_TOTAL] === 'Total';
  });
  const youthSeries = raw.filter((s) => {
    const md = metadataOf(s);
    return national(md) && md[VAR_EDAD_JOVEN] === 'Menores de 25 años';
  });

  if (totalSeries.length !== 1) {
    fail(`Se esperaba una serie total de ámbito nacional y hay ${totalSeries.length}.`);
  }
  if (youthSeries.length !== 1) {
    fail(`Se esperaba una serie de menores de 25 y hay ${youthSeries.length}.`);
  }

  const total = pointsOf(totalSeries[0]);
  const youth = pointsOf(youthSeries[0]);

  // --- Guardas -------------------------------------------------------------
  if (total.length !== EXPECTED_QUARTERS || youth.length !== EXPECTED_QUARTERS) {
    fail(`Se esperaban ${EXPECTED_QUARTERS} trimestres: total=${total.length}, jóvenes=${youth.length}.`);
  }
  if (total[0].quarter !== FIRST_QUARTER || total.at(-1).quarter !== LAST_QUARTER) {
    fail(`Cobertura total inesperada: ${total[0].quarter} → ${total.at(-1).quarter}.`);
  }
  if (youth[0].quarter !== total[0].quarter || youth.at(-1).quarter !== total.at(-1).quarter) {
    fail('Las dos series no cubren el mismo periodo.');
  }

  const quarters = total.map((p) => p.quarter);
  const totalValues = total.map((p) => p.value);
  const youthValues = youth.map((p) => p.value);

  for (let i = 0; i < quarters.length; i += 1) {
    if (youth[i].quarter !== quarters[i]) fail(`Desalineado en ${quarters[i]}.`);
    if (totalValues[i] < 0 || totalValues[i] > 100) {
      fail(`Tasa total fuera de rango en ${quarters[i]}: ${totalValues[i]}.`);
    }
    if (youthValues[i] < 0 || youthValues[i] > 100) {
      fail(`Tasa juvenil fuera de rango en ${quarters[i]}: ${youthValues[i]}.`);
    }
    if (youthValues[i] <= totalValues[i]) {
      fail(`La tasa juvenil no supera la total en ${quarters[i]}.`);
    }
  }

  const stats = unemploymentStats(quarters, totalValues, youthValues);

  const close = (value, expected, tolerance = 0.05) => Math.abs(value - expected) <= tolerance;

  if (!close(stats.latest.total, 10.18)) {
    fail(`Paro total del último trimestre inesperado: ${stats.latest.total}.`);
  }
  if (!close(stats.latest.youth, 23.33)) {
    fail(`Paro juvenil del último trimestre inesperado: ${stats.latest.youth}.`);
  }
  if (stats.peak.quarter !== '2013-01' || !close(stats.peak.youth, 56.92, 0.1)) {
    fail(`Pico juvenil inesperado: ${stats.peak.youth} % en ${stats.peak.quarter}.`);
  }
  if (stats.low.quarter !== '2006-07' || !close(stats.low.youth, 16.9, 0.1)) {
    fail(`Mínimo juvenil inesperado: ${stats.low.youth} % en ${stats.low.quarter}.`);
  }
  if (stats.totalPeak.quarter !== '2013-01' || !close(stats.totalPeak.value, 26.94, 0.1)) {
    fail(`Pico total inesperado: ${stats.totalPeak.value} % en ${stats.totalPeak.quarter}.`);
  }
  if (stats.ratio.min < 1.85 || stats.ratio.min > 2.0) {
    fail(`Relación mínima juvenil/total inesperada: ${stats.ratio.min.toFixed(2)}.`);
  }
  if (stats.ratio.max < 2.5 || stats.ratio.max > 2.7) {
    fail(`Relación máxima juvenil/total inesperada: ${stats.ratio.max.toFixed(2)}.`);
  }

  const payload = {
    source: {
      name: 'INE — Encuesta de Población Activa',
      table: 14506,
      url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=14506',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      note: 'Tasa de paro de la población de 16 y más años, total nacional, ambos sexos.',
    },
    fetched: new Date().toISOString().slice(0, 10),
    latest: stats.latest.quarter,
    quarters,
    series: { total: totalValues, youth: youthValues },
    stats: {
      latest: {
        quarter: stats.latest.quarter,
        total: stats.latest.total,
        youth: stats.latest.youth,
        gap: round2(stats.latest.gap),
        ratio: round2(stats.latest.ratio),
      },
      peak: stats.peak,
      low: stats.low,
      ratio: {
        min: round2(stats.ratio.min),
        minQuarter: stats.ratio.minQuarter,
        max: round2(stats.ratio.max),
        maxQuarter: stats.ratio.maxQuarter,
      },
    },
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload), 'utf8');

  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`✓ ${quarters.length} trimestres (${quarters[0]} → ${quarters.at(-1)})`);
  console.log(
    `✓ último: total ${stats.latest.total} % | jóvenes ${stats.latest.youth} %`
  );
  console.log(`✓ pico juvenil: ${stats.peak.youth} % en ${stats.peak.quarter}`);
  console.log(`✓ mínimo juvenil: ${stats.low.youth} % en ${stats.low.quarter}`);
  console.log(
    `✓ relación juvenil/total: ${stats.ratio.min.toFixed(2)}–${stats.ratio.max.toFixed(2)}`
  );
  console.log(`✓ ${kb} KB → ${OUT}`);
  console.log(`✓ ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => fail(err.stack ?? String(err)));
