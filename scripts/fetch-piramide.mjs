#!/usr/bin/env node
/**
 * Descarga la pirámide de población del INE y genera src/data/piramide.json.
 *
 * Fuente: Estadística Continua de Población (ECP), tabla 56934.
 * https://www.ine.es/jaxiT3/Tabla.htm?t=56934
 *
 * Uso: npm run data
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../src/data/piramide.json');

// jsCache sirve la respuesta cacheada y evita el 301 que hace /wstempus/ en tablas grandes.
const URL =
  'https://servicios.ine.es/wstempus/jsCache/ES/DATOS_TABLA/56934?tip=AM';

// Cobertura homogénea: 1981-2025 tiene edades 0-99 en todos los años.
// 1971-1980 solo llega a 84 años y 2020+ a 105, así que se recorta.
const YEAR_MIN = 1981;
const YEAR_MAX = 2025;
const AGE_MIN = 0;
const AGE_MAX = 99;

// La variable de edad del INE está mal escrita en la API. Es literal.
const VAR_EDAD = 'Valores simples de edad';
const VAR_SEXO = 'Sexo';
const VAR_CONCEPTO = 'Conceptos demógraficos';
const VAR_TIPO_DATO = 'Tipo de dato';

const EXPECTED_YEARS = YEAR_MAX - YEAR_MIN + 1;

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function metadataOf(serie) {
  const entries = (serie.MetaData ?? []).map((m) => [m.T3_Variable, m.Nombre]);
  return Object.fromEntries(entries);
}

function lastPeriodByYear(serie) {
  const byYear = new Map();
  for (const dato of serie.Data ?? []) {
    if (dato.Valor == null) continue;
    const year = dato.Anyo;
    if (year == null) continue;
    const ts = new Date(dato.Fecha).getTime();
    const prev = byYear.get(year);
    if (!prev || ts > prev.ts) byYear.set(year, { ts, valor: dato.Valor });
  }
  return byYear;
}

async function main() {
  console.log('Descargando tabla 56934 del INE…');
  const started = Date.now();

  const res = await fetch(URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) fail(`HTTP ${res.status} al descargar ${URL}`);

  const raw = await res.json();
  if (!Array.isArray(raw)) fail('La respuesta no es un array de series.');

  const useful = raw.filter((serie) => {
    const md = metadataOf(serie);
    return (
      md[VAR_EDAD] !== undefined &&
      (md[VAR_SEXO] === 'Hombres' || md[VAR_SEXO] === 'Mujeres') &&
      md[VAR_CONCEPTO] === 'Población' &&
      md[VAR_TIPO_DATO] === 'Número'
    );
  });

  if (useful.length === 0) {
    fail(
      'Ninguna serie pasó el filtro. ¿Cambió la API? Revisa los nombres de variable.'
    );
  }

  // years -> age -> { m, f }
  const byYear = new Map();

  for (const serie of useful) {
    const md = metadataOf(serie);
    const age = Number.parseInt(md[VAR_EDAD], 10);
    if (!Number.isInteger(age)) continue;

    const sex = md[VAR_SEXO] === 'Hombres' ? 'm' : 'f';
    const periods = lastPeriodByYear(serie);

    for (const [year, { valor }] of periods) {
      if (year < YEAR_MIN || year > YEAR_MAX) continue;
      if (age < AGE_MIN || age > AGE_MAX) continue;

      if (!byYear.has(year)) byYear.set(year, new Map());
      const ages = byYear.get(year);
      if (!ages.has(age)) ages.set(age, {});
      ages.get(age)[sex] = Math.round(valor);
    }
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);

  // --- Guardas -------------------------------------------------------------
  if (years.length !== EXPECTED_YEARS) {
    fail(
      `Se esperaban ${EXPECTED_YEARS} años (${YEAR_MIN}-${YEAR_MAX}) y hay ${years.length}.`
    );
  }

  const ages = Array.from(
    { length: AGE_MAX - AGE_MIN + 1 },
    (_, i) => AGE_MIN + i
  );

  const male = [];
  const female = [];
  const totals = [];

  for (const year of years) {
    const map = byYear.get(year);
    const m = [];
    const f = [];

    for (const age of ages) {
      const cell = map.get(age);
      if (!cell || !Number.isFinite(cell.m) || !Number.isFinite(cell.f)) {
        fail(`Falta el dato de ${year}, edad ${age}.`);
      }
      m.push(cell.m);
      f.push(cell.f);
    }

    male.push(m);
    female.push(f);
    totals.push(m.reduce((a, b) => a + b, 0) + f.reduce((a, b) => a + b, 0));
  }

  const total = (year) => {
    const i = years.indexOf(year);
    return i === -1 ? null : totals[i];
  };

  const t1981 = total(1981);
  const t2025 = total(2025);

  if (t1981 == null || t1981 < 37_500_000 || t1981 > 37_800_000) {
    fail(`Población de 1981 fuera de rango: ${t1981?.toLocaleString('es-ES')}`);
  }
  if (t2025 == null || t2025 < 49_000_000 || t2025 > 49_300_000) {
    fail(`Población de 2025 fuera de rango: ${t2025?.toLocaleString('es-ES')}`);
  }

  const payload = {
    source: {
      name: 'INE — Estadística Continua de Población',
      table: 56934,
      url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=56934',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      note: 'Población residente por sexo y edad simple. Último trimestre de cada año.',
    },
    fetched: new Date().toISOString().slice(0, 10),
    years,
    ages,
    male,
    female,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload), 'utf8');

  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
  console.log(`✓ ${years.length} años (${years[0]}-${years.at(-1)}), ${ages.length} edades`);
  console.log(`✓ 1981: ${t1981.toLocaleString('es-ES')} hab.`);
  console.log(`✓ 2025: ${t2025.toLocaleString('es-ES')} hab.`);
  console.log(`✓ ${kb} KB → ${OUT}`);
  console.log(`✓ ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => fail(err.stack ?? String(err)));
