#!/usr/bin/env node
/**
 * Verifica los snapshots generados sin llamar al INE.
 *
 * Cubre:
 * - Que los cálculos derivados se puedan reconstruir desde las series fuente.
 * - Que la variación anual del IPC coincida con la que publica el INE.
 * - Identidades y estadísticos de salario, paro y pirámide.
 *
 * Uso: npm run verify
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));

const close = (actual, expected, tolerance, label) => {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: esperado ${expected}, recibido ${actual}`
  );
};

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
};

const inflation = load('inflacion.json');
const inflationSeries = load('inflacion-serie.json');
const inflationSource = load('inflacion-fuente.json');
const paro = load('paro.json');
const pyramid = load('piramide.json');
const salary = load('salario-real.json');

const auditMap = (array) =>
  new Map(inflationSource.months.map((ym, i) => [ym, array[i]]));

const generalIndices = auditMap(inflationSource.indices.general);
const groupIndices = Object.fromEntries(
  Object.entries(inflationSource.indices.groups).map(([key, values]) => [
    key,
    auditMap(values),
  ])
);
const generalRates = auditMap(inflationSource.annualRates.general);
const groupRates = Object.fromEntries(
  Object.entries(inflationSource.annualRates.groups).map(([key, values]) => [
    key,
    auditMap(values),
  ])
);

/* ------------------------------------------------------------------ IPC */

check('IPC: auditoría con 297 meses y 14 series', () => {
  assert.equal(inflationSource.months.length, 297);
  assert.equal(inflationSource.months[0], '2002-01');
  assert.equal(inflationSource.months.at(-1), '2026-09');
  assert.equal(inflationSource.indices.general.length, 297);
  assert.equal(Object.keys(inflationSource.indices.groups).length, 13);
  for (const values of Object.values(inflationSource.indices.groups)) {
    assert.equal(values.length, 297);
  }
});

check('IPC: 13 grupos y pesos que suman 100', () => {
  assert.equal(inflation.groups.length, 13);
  assert.equal(inflation.years.length, 24);
  const sum = inflation.groups.reduce((a, g) => a + g.weight, 0);
  close(sum, 100, 0.5, 'pesos');
  for (const group of inflation.groups) {
    assert.equal(Object.keys(group.byYear).length, 24, group.short);
  }
});

check('IPC: cambios de barras reconstruidos desde los índices', () => {
  const refMonth = inflation.latest;
  const refGeneral = generalIndices.get(refMonth);
  assert.ok(refGeneral != null, `falta ${refMonth} en el índice general`);

  for (const year of inflation.years) {
    const ym = `${year}-${refMonth.slice(5)}`;
    const value = generalIndices.get(ym);
    assert.ok(value != null, `falta ${ym} en el índice general`);
    const expected = 100 * (refGeneral / value - 1);
    close(inflation.general[String(year)], expected, 0.02, `general ${year}`);
  }

  for (const group of inflation.groups) {
    const indices = groupIndices[group.short];
    assert.ok(indices, `falta el grupo ${group.short}`);
    for (const year of inflation.years) {
      const ym = `${year}-${refMonth.slice(5)}`;
      const ref = indices.get(refMonth);
      const value = indices.get(ym);
      assert.ok(ref != null && value != null, `falta ${group.short} ${year}`);
      const expected = 100 * (ref / value - 1);
      close(group.byYear[String(year)], expected, 0.02, `${group.short} ${year}`);
    }
  }
});

check('IPC: serie anual reconstruida desde los índices', () => {
  const months = inflationSeries.months;
  assert.equal(months.length, 285);
  assert.equal(months[0], '2003-01');
  assert.equal(months.at(-1), '2026-09');
  assert.equal(Object.keys(inflationSeries.series).length, 14);

  const derive = (map) =>
    months.map((ym) => {
      const [year, month] = ym.split('-').map(Number);
      const prev = `${year - 1}-${String(month).padStart(2, '0')}`;
      const now = map.get(ym);
      const then = map.get(prev);
      if (now == null || then == null) return null;
      return 100 * (now / then - 1);
    });

  for (const [key, values] of Object.entries(inflationSeries.series)) {
    const map = key === 'general' ? generalIndices : groupIndices[key];
    assert.ok(map, `falta la serie ${key}`);
    const expected = derive(map);
    assert.equal(values.length, 285, key);
    values.forEach((value, i) => {
      assert.ok(value != null, `${key} tiene un hueco en ${months[i]}`);
      close(value, expected[i], 0.02, `${key} ${months[i]}`);
    });
  }
});

check('IPC: variación anual coincide con la publicada por el INE', () => {
  const months = inflationSeries.months;
  for (const [key, values] of Object.entries(inflationSeries.series)) {
    const rates = key === 'general' ? generalRates : groupRates[key];
    assert.ok(rates, `faltan tasas publicadas de ${key}`);
    let compared = 0;
    values.forEach((value, i) => {
      const published = rates.get(months[i]);
      if (published == null || value == null) return;
      close(value, published, 0.06, `${key} ${months[i]}`);
      compared += 1;
    });
    assert.ok(compared >= 280, `${key}: solo ${compared} meses contrastados`);
  }
});

/* ---------------------------------------------------------------- Paro */

check('Paro: 99 trimestres y series alineadas', () => {
  assert.equal(paro.quarters.length, 99);
  assert.equal(paro.quarters[0], '2002-01');
  assert.equal(paro.quarters.at(-1), '2026-07');
  assert.equal(paro.series.total.length, 99);
  assert.equal(paro.series.youth.length, 99);
  for (let i = 0; i < paro.quarters.length; i += 1) {
    const total = paro.series.total[i];
    const youth = paro.series.youth[i];
    assert.ok(Number.isFinite(total) && total >= 0 && total <= 100);
    assert.ok(Number.isFinite(youth) && youth >= 0 && youth <= 100);
    assert.ok(youth > total, `la tasa juvenil no supera la total en ${paro.quarters[i]}`);
  }
});

check('Paro: estadísticos reconstruidos sobre los 99 trimestres', () => {
  const { quarters, series } = paro;
  const total = series.total;
  const youth = series.youth;
  let peak = { value: -Infinity, index: -1 };
  let low = { value: Infinity, index: -1 };
  let ratioMin = { value: Infinity, index: -1 };
  let ratioMax = { value: -Infinity, index: -1 };

  for (let i = 0; i < quarters.length; i += 1) {
    if (youth[i] > peak.value) peak = { value: youth[i], index: i };
    if (youth[i] < low.value) low = { value: youth[i], index: i };
    const ratio = youth[i] / total[i];
    if (ratio < ratioMin.value) ratioMin = { value: ratio, index: i };
    if (ratio > ratioMax.value) ratioMax = { value: ratio, index: i };
  }

  const last = quarters.length - 1;
  assert.equal(paro.stats.latest.quarter, quarters[last]);
  close(paro.stats.latest.total, total[last], 1e-9, 'último total');
  close(paro.stats.latest.youth, youth[last], 1e-9, 'último juvenil');
  close(paro.stats.latest.gap, youth[last] - total[last], 0.01, 'brecha');
  close(paro.stats.latest.ratio, youth[last] / total[last], 0.01, 'ratio');
  assert.equal(paro.stats.peak.quarter, quarters[peak.index]);
  close(paro.stats.peak.youth, peak.value, 1e-9, 'pico');
  assert.equal(paro.stats.low.quarter, quarters[low.index]);
  close(paro.stats.low.youth, low.value, 1e-9, 'mínimo');
  assert.equal(paro.stats.ratio.minQuarter, quarters[ratioMin.index]);
  close(paro.stats.ratio.min, ratioMin.value, 0.01, 'ratio mínimo');
  assert.equal(paro.stats.ratio.maxQuarter, quarters[ratioMax.index]);
  close(paro.stats.ratio.max, ratioMax.value, 0.01, 'ratio máximo');
});

/* ------------------------------------------------------------- Pirámide */

check('Pirámide: 45 años, 100 edades y arrays completos', () => {
  assert.equal(pyramid.years.length, 45);
  assert.equal(pyramid.years[0], 1981);
  assert.equal(pyramid.years.at(-1), 2025);
  assert.equal(pyramid.ages.length, 100);
  assert.equal(pyramid.ages[0], 0);
  assert.equal(pyramid.ages.at(-1), 99);
  assert.equal(pyramid.male.length, 45);
  assert.equal(pyramid.female.length, 45);
  for (let i = 0; i < pyramid.years.length; i += 1) {
    assert.equal(pyramid.male[i].length, 100);
    assert.equal(pyramid.female[i].length, 100);
    for (let age = 0; age < 100; age += 1) {
      assert.ok(pyramid.male[i][age] >= 0);
      assert.ok(pyramid.female[i][age] >= 0);
    }
  }
});

check('Pirámide: totales, edad modal y extremos', () => {
  const statsFor = (index) => {
    let total = 0;
    let young = 0;
    let old = 0;
    let modalAge = pyramid.ages[0];
    let modalValue = -Infinity;
    for (let age = 0; age < pyramid.ages.length; age += 1) {
      const value = pyramid.male[index][age] + pyramid.female[index][age];
      total += value;
      if (pyramid.ages[age] <= 14) young += value;
      if (pyramid.ages[age] >= 65) old += value;
      if (value > modalValue) {
        modalValue = value;
        modalAge = pyramid.ages[age];
      }
    }
    return {
      total,
      modalAge,
      young: (100 * young) / total,
      old: (100 * old) / total,
    };
  };

  const first = statsFor(0);
  const last = statsFor(pyramid.years.length - 1);
  close(first.total, 37_761_297, 0, 'población 1981');
  close(last.total, 49_111_259, 0, 'población 2025');
  assert.equal(first.modalAge, 16);
  assert.equal(last.modalAge, 48);
  close(first.young, 25.52087392549043, 0.001, 'menores de 15 en 1981');
  close(first.old, 11.272457087477688, 0.001, 'mayores de 65 en 1981');
  close(last.young, 12.917736440028955, 0.001, 'menores de 15 en 2025');
  close(last.old, 20.690951946477284, 0.001, 'mayores de 65 en 2025');
});

/* -------------------------------------------------------------- Salario */

check('Salario: 17 años, 12 meses de IPC por año y medias anuales', () => {
  assert.equal(salary.years.length, 17);
  assert.equal(salary.years[0], 2008);
  assert.equal(salary.latest, 2024);
  assert.equal(salary.cpiMonthly.length, 17);
  assert.equal(salary.nominal.length, 17);
  assert.equal(salary.cpi.length, 17);
  assert.equal(salary.real.length, 17);
  for (let i = 0; i < salary.years.length; i += 1) {
    assert.equal(salary.cpiMonthly[i].length, 12, `meses de ${salary.years[i]}`);
    const average =
      salary.cpiMonthly[i].reduce((a, b) => a + b, 0) / salary.cpiMonthly[i].length;
    close(salary.cpi[i], average, 0.0001, `IPC medio de ${salary.years[i]}`);
  }
});

check('Salario: real, variaciones e identidad nominal = real × IPC', () => {
  const baseCpi = salary.cpi[0];
  for (let i = 0; i < salary.years.length; i += 1) {
    const real = (salary.nominal[i] * baseCpi) / salary.cpi[i];
    close(salary.real[i], real, 0.05, `salario real de ${salary.years[i]}`);

    const nominalChange = 100 * (salary.nominal[i] / salary.nominal[0] - 1);
    const realChange = 100 * (salary.real[i] / salary.real[0] - 1);
    const ipcChange = 100 * (salary.cpi[i] / salary.cpi[0] - 1);
    close(salary.nominalChange[i], nominalChange, 0.01, `nominal ${salary.years[i]}`);
    close(salary.realChange[i], realChange, 0.01, `real ${salary.years[i]}`);
    close(salary.ipcChange[i], ipcChange, 0.01, `IPC ${salary.years[i]}`);

    const identity =
      1 + salary.nominalChange[i] / 100 -
      (1 + salary.realChange[i] / 100) * (1 + salary.ipcChange[i] / 100);
    close(identity, 0, 0.0005, `identidad de ${salary.years[i]}`);
  }
});

check('Salario: estadísticos y valores de control', () => {
  close(salary.nominal[0], 21_883.42, 0.01, 'nominal 2008');
  close(salary.nominal.at(-1), 29_540.26, 0.01, 'nominal 2024');
  close(salary.real.at(-1), 22_129.45, 0.01, 'real 2024');
  close(salary.stats.nominal.growth, 34.99, 0.01, 'crecimiento nominal');
  close(salary.stats.real.growth, 1.12, 0.01, 'crecimiento real');
  close(salary.stats.inflation.growth, 33.49, 0.01, 'inflación');
  close(salary.stats.real.min.value, 20_857.24, 0.01, 'mínimo real');
  assert.equal(salary.stats.real.min.year, 2013);
  close(salary.stats.real.max.value, 22_576.48, 0.01, 'máximo real');
  assert.equal(salary.stats.real.max.year, 2009);
  close(salary.stats.gap.euros, salary.nominal.at(-1) - salary.real.at(-1), 0.01, 'hueco');
  close(
    salary.stats.gap.points,
    salary.nominalChange.at(-1) - salary.realChange.at(-1),
    0.02,
    'hueco en puntos'
  );
});

/* --------------------------------------------------------------- Salida */

let failed = 0;
for (const result of results) {
  if (!result.ok) failed += 1;
  console.log(`${result.ok ? '✓' : '✗'} ${result.name}${result.error ? `\n  ${result.error}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} verificaciones`);
process.exit(failed === 0 ? 0 : 1);
