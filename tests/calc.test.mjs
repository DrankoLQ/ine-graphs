import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annualAverage,
  cumulativeChange,
  deflate,
  pyramidStats,
  sameMonthChange,
  unemploymentStats,
  yearOnYear,
} from '../src/lib/calc.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `esperado ${expected}, recibido ${actual}`
  );
};

test('annualAverage calcula la media aritmética', () => {
  assert.equal(annualAverage([2, 4, 6]), 4);
  closeTo(annualAverage([72.9624, 71.4, 74.0]), 72.78746666666667);
});

test('annualAverage rechaza arrays vacíos o no finitos', () => {
  assert.throws(() => annualAverage([]), /no vacío/);
  assert.throws(() => annualAverage([1, Number.NaN]), /finitos/);
});

test('deflate pasa un salario nominal a euros de la base', () => {
  // 29.540,26 € de 2024 con IPC 97,3964, base 2008 = 72,9624.
  closeTo(deflate(29540.26, 97.3964, 72.9624), 22129.446, 0.01);
  // Si el IPC no cambia, el salario real es el nominal.
  closeTo(deflate(110, 110, 100), 100);
});

test('deflate rechaza índices no positivos', () => {
  assert.throws(() => deflate(100, 0, 100), /positivos/);
  assert.throws(() => deflate(100, 100, 0), /positivos/);
});

test('cumulativeChange acumula respecto al primer valor', () => {
  const changes = cumulativeChange([21883.42, 29540.26]);
  closeTo(changes[0], 0);
  closeTo(changes[1], 34.99, 0.01);
});

test('cumulativeChange rechaza una base cero', () => {
  assert.throws(() => cumulativeChange([0, 10]), /base no puede ser cero/);
});

test('sameMonthChange compara el mismo mes entre años', () => {
  const byMonth = new Map([
    ['2026-09', 120],
    ['2019-09', 100],
    ['2002-09', 80],
  ]);
  const changes = sameMonthChange(byMonth, '2026-09', [2002, 2019]);
  closeTo(changes['2002'], 50);
  closeTo(changes['2019'], 20);
});

test('sameMonthChange acepta objetos y falla si falta un mes', () => {
  const changes = sameMonthChange({ '2026-09': 120, '2019-09': 100 }, '2026-09', [2019]);
  closeTo(changes['2019'], 20);
  assert.throws(
    () => sameMonthChange({ '2026-09': 120 }, '2026-09', [2019]),
    /falta 2019-09/
  );
});

test('yearOnYear calcula la variación anual y deja null si falta el año anterior', () => {
  const byMonth = new Map([
    ['2022-01', 100],
    ['2023-01', 110],
    ['2023-02', 120],
  ]);
  const changes = yearOnYear(byMonth, ['2023-01', '2023-02']);
  closeTo(changes[0], 10);
  assert.equal(changes[1], null);
});

test('pyramidStats suma sexos, calcula jóvenes, mayores y edad modal', () => {
  const stats = pyramidStats([1, 2, 3], [1, 2, 3], [0, 1, 65]);
  assert.equal(stats.total, 12);
  closeTo(stats.young, 50);
  closeTo(stats.old, 50);
  assert.equal(stats.modalAge, 65);
});

test('pyramidStats resuelve empates por la primera edad', () => {
  const stats = pyramidStats([2, 2, 0], [0, 0, 0], [0, 1, 2]);
  assert.equal(stats.total, 4);
  assert.equal(stats.modalAge, 0);
});

test('pyramidStats valida longitudes y total positivo', () => {
  assert.throws(() => pyramidStats([1], [1, 2], [0, 1]), /misma longitud/);
  assert.throws(() => pyramidStats([0], [0], [0]), /total debe ser positiva/);
});

test('unemploymentStats calcula último dato, pico, mínimo y brecha', () => {
  const stats = unemploymentStats(
    ['2020-01', '2020-04', '2020-07'],
    [10, 20, 15],
    [20, 40, 30]
  );
  assert.equal(stats.latest.quarter, '2020-07');
  assert.equal(stats.latest.total, 15);
  assert.equal(stats.latest.youth, 30);
  assert.equal(stats.latest.gap, 15);
  closeTo(stats.latest.ratio, 2);
  assert.equal(stats.peak.quarter, '2020-04');
  assert.equal(stats.peak.youth, 40);
  assert.equal(stats.low.quarter, '2020-01');
  assert.equal(stats.low.youth, 20);
  assert.equal(stats.totalPeak.quarter, '2020-04');
  assert.equal(stats.totalPeak.value, 20);
  closeTo(stats.ratio.min, 2);
  closeTo(stats.ratio.max, 2);
});

test('unemploymentStats ordena la relación juvenil/total', () => {
  const stats = unemploymentStats(
    ['2020-01', '2020-04', '2020-07'],
    [10, 10, 10],
    [15, 20, 30]
  );
  assert.equal(stats.ratio.minQuarter, '2020-01');
  closeTo(stats.ratio.min, 1.5);
  assert.equal(stats.ratio.maxQuarter, '2020-07');
  closeTo(stats.ratio.max, 3);
});

test('unemploymentStats rechaza datos incoherentes', () => {
  assert.throws(() => unemploymentStats(['2020-01'], [10, 10], [20]), /misma longitud/);
  assert.throws(() => unemploymentStats(['2020-01'], [10], [10]), /no supera/);
  assert.throws(() => unemploymentStats(['2020-01'], [110], [120]), /fuera de rango/);
});
