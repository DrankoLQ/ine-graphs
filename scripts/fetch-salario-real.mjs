#!/usr/bin/env node
/**
 * Descarga la ganancia media anual de la EAES y el IPC general, y genera
 * src/data/salario-real.json.
 *
 * Fuentes:
 * - INE, Encuesta Anual de Estructura Salarial, tabla 28191.
 *   https://www.ine.es/jaxiT3/Tabla.htm?t=28191
 * - INE, IPC base 2025, tabla 76125.
 *   https://www.ine.es/jaxiT3/Tabla.htm?t=76125
 *
 * Uso: npm run data:salario-real
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { annualAverage, cumulativeChange, deflate, round2 } from '../src/lib/calc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/salario-real.json');

const URL_SALARIOS = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/28191?tip=AM';
const URL_IPC = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/76125?tip=AM';

const VAR_SEXO = 'Sexo';
const VAR_NACIONAL = 'Total Nacional';
const VAR_TIPO = 'Tipo de dato';
const VAR_MEDIDA = 'Medidas estadísticas';

const FIRST_YEAR = 2008;
const LAST_YEAR = 2024;
const EXPECTED_YEARS = LAST_YEAR - FIRST_YEAR + 1;

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function metadataOf(serie) {
  return Object.fromEntries((serie.MetaData ?? []).map((m) => [m.T3_Variable, m.Nombre]));
}

const nf2 = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) fail(`HTTP ${res.status} al descargar ${url}`);
  const json = await res.json();
  if (!Array.isArray(json)) fail(`Respuesta inesperada de ${url}`);
  return json;
}

async function main() {
  console.log('Descargando salarios (EAES 28191) e IPC general (76125)…');
  const started = Date.now();

  const [salarios, ipc] = await Promise.all([fetchJson(URL_SALARIOS), fetchJson(URL_IPC)]);

  // --- Salario nominal -----------------------------------------------------
  const wageSeries = salarios.filter((serie) => {
    const md = metadataOf(serie);
    return (
      md[VAR_SEXO] === 'Ambos sexos' &&
      md[VAR_NACIONAL] === 'Total Nacional' &&
      md[VAR_TIPO] === 'Dato base' &&
      md[VAR_MEDIDA] === 'Media' &&
      md['Percentiles simples'] === undefined
    );
  });

  if (wageSeries.length !== 1) {
    fail(`Se esperaba una serie de salario medio nacional y hay ${wageSeries.length}.`);
  }

  const wages = (wageSeries[0].Data ?? [])
    .filter((d) => d.Valor != null && d.Anyo != null)
    .map((d) => ({ year: Number(d.Anyo), value: Number(d.Valor) }))
    .sort((a, b) => a.year - b.year);

  if (wages.length !== EXPECTED_YEARS) {
    fail(`Se esperaban ${EXPECTED_YEARS} años de salarios y hay ${wages.length}.`);
  }
  if (wages[0].year !== FIRST_YEAR || wages.at(-1).year !== LAST_YEAR) {
    fail(`Cobertura salarial inesperada: ${wages[0].year} → ${wages.at(-1).year}.`);
  }
  for (let i = 0; i < wages.length; i += 1) {
    if (wages[i].year !== FIRST_YEAR + i) fail(`Falta el año ${FIRST_YEAR + i}.`);
  }

  // --- IPC general ---------------------------------------------------------
  const general = ipc.find((serie) => {
    const md = metadataOf(serie);
    return md['Grupos ECOICOP'] === 'Índice general' && md['Índices y Tasas'] === 'Índice';
  });
  if (!general) fail('No se encontró el índice general del IPC.');

  const ipcPoints = (general.Data ?? [])
    .filter((d) => d.Valor != null && d.Fecha)
    .sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));

  const cpi = {};
  const monthly = {};
  for (const { year } of wages) {
    const months = ipcPoints.filter((d) => {
      const tipo = d.T3_TipoDato ?? 'Definitivo';
      return d.Fecha.startsWith(String(year)) && tipo !== 'Avance';
    });
    if (months.length !== 12) {
      fail(`El IPC de ${year} tiene ${months.length} meses definitivos en vez de 12.`);
    }
    monthly[year] = months.map((d) => d.Valor);
    cpi[year] = annualAverage(monthly[year]);
  }

  // --- Salario real y variaciones -----------------------------------------
  const baseYear = wages[0].year;
  const baseCpi = cpi[baseYear];
  const nominal = wages.map((w) => w.value);
  const real = wages.map((w) => deflate(w.value, cpi[w.year], baseCpi));
  const nominalChange = cumulativeChange(nominal);
  const realChange = cumulativeChange(real);
  const ipcChange = cumulativeChange(wages.map((w) => cpi[w.year]));

  const last = wages.length - 1;
  const minReal = real.reduce((best, v, i) => (v < best.value ? { value: v, index: i } : best), {
    value: Infinity,
    index: -1,
  });
  const maxReal = real.reduce((best, v, i) => (v > best.value ? { value: v, index: i } : best), {
    value: -Infinity,
    index: -1,
  });

  const nominalGrowth = 100 * (nominal[last] / nominal[0] - 1);
  const realGrowth = 100 * (real[last] / real[0] - 1);
  const inflation = 100 * (cpi[LAST_YEAR] / cpi[baseYear] - 1);

  // --- Guardas -------------------------------------------------------------
  const close = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;

  if (!close(nominal[0], 21883.42, 0.02)) {
    fail(`Salario nominal de 2008 inesperado: ${nominal[0]}.`);
  }
  if (!close(nominal[last], 29540.26, 0.02)) {
    fail(`Salario nominal de 2024 inesperado: ${nominal[last]}.`);
  }
  if (!close(real[last], 22129.45, 0.05)) {
    fail(`Salario real de 2024 inesperado: ${real[last]}.`);
  }
  if (!close(nominalGrowth, 34.99, 0.05)) {
    fail(`Crecimiento nominal inesperado: ${nominalGrowth.toFixed(2)} %.`);
  }
  if (!close(realGrowth, 1.12, 0.05)) {
    fail(`Crecimiento real inesperado: ${realGrowth.toFixed(2)} %.`);
  }
  if (!close(inflation, 33.49, 0.05)) {
    fail(`Inflación acumulada inesperada: ${inflation.toFixed(2)} %.`);
  }
  if (!close(ipcChange[last], inflation, 0.01)) {
    fail(`El IPC acumulado del último año no coincide: ${ipcChange[last].toFixed(2)} %.`);
  }
  for (let i = 0; i < wages.length; i += 1) {
    const identity =
      (1 + nominalChange[i] / 100) -
      (1 + realChange[i] / 100) * (1 + ipcChange[i] / 100);
    if (Math.abs(identity) > 1e-9) {
      fail(
        `La identidad nominal = real × IPC falla en ${wages[i].year}: ${identity.toExponential(3)}.`
      );
    }
  }
  if (wages[minReal.index].year !== 2013 || !close(100 * (minReal.value / real[0] - 1), -4.69, 0.05)) {
    fail(`Mínimo real inesperado: ${minReal.value} en ${wages[minReal.index]?.year}.`);
  }
  if (wages[maxReal.index].year !== 2009 || !close(100 * (maxReal.value / real[0] - 1), 3.17, 0.05)) {
    fail(`Máximo real inesperado: ${maxReal.value} en ${wages[maxReal.index]?.year}.`);
  }

  const payload = {
    source: {
      name: 'INE — Encuesta Anual de Estructura Salarial',
      table: 28191,
      url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=28191',
      ipcName: 'INE — Índice de Precios de Consumo, base 2025',
      ipcTable: 76125,
      ipcUrl: 'https://www.ine.es/jaxiT3/Tabla.htm?t=76125',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      note: 'Ganancia bruta anual media por trabajador, ambos sexos, total nacional. Salario real expresado en euros de 2008.',
    },
    fetched: new Date().toISOString().slice(0, 10),
    baseYear,
    latest: LAST_YEAR,
    years: wages.map((w) => w.year),
    nominal: nominal.map(round2),
    cpi: wages.map((w) => Number(cpi[w.year].toFixed(4))),
    cpiMonthly: wages.map((w) => monthly[w.year].map((v) => Number(v.toFixed(4)))),
    real: real.map(round2),
    nominalChange: nominalChange.map(round2),
    realChange: realChange.map(round2),
    ipcChange: ipcChange.map(round2),
    stats: {
      nominal: {
        first: round2(nominal[0]),
        last: round2(nominal[last]),
        growth: round2(nominalGrowth),
      },
      real: {
        first: round2(real[0]),
        last: round2(real[last]),
        growth: round2(realGrowth),
        min: {
          year: wages[minReal.index].year,
          value: round2(minReal.value),
          change: round2(100 * (minReal.value / real[0] - 1)),
        },
        max: {
          year: wages[maxReal.index].year,
          value: round2(maxReal.value),
          change: round2(100 * (maxReal.value / real[0] - 1)),
        },
      },
      inflation: {
        first: Number(cpi[baseYear].toFixed(4)),
        last: Number(cpi[LAST_YEAR].toFixed(4)),
        growth: round2(inflation),
      },
      gap: {
        euros: round2(nominal[last] - real[last]),
        points: round2(nominalChange[last] - realChange[last]),
      },
    },
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload), 'utf8');

  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1);
  console.log(`✓ ${wages.length} años (${FIRST_YEAR}-${LAST_YEAR})`);
  console.log(
    `✓ nominal ${nominal[0].toLocaleString('es-ES')} € → ${nominal[last].toLocaleString('es-ES')} € (${nominalGrowth.toFixed(2)} %)`
  );
  console.log(`✓ IPC +${inflation.toFixed(2)} % | real +${realGrowth.toFixed(2)} %`);
  console.log(`✓ real 2024: ${nf2.format(real[last])} € de ${baseYear}`);
  console.log(`✓ mínimo real ${wages[minReal.index].year}: ${(100 * (minReal.value / real[0] - 1)).toFixed(2)} %`);
  console.log(`✓ ${kb} KB → ${OUT}`);
  console.log(`✓ ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => fail(err.stack ?? String(err)));
