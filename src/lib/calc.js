/**
 * Cálculos puros compartidos por los scripts de datos, los gráficos y los tests.
 * Sin DOM, sin D3 y sin red: solo aritmética y validaciones.
 */

function assertFiniteArray(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label}: se esperaba un array no vacío.`);
  }
  if (!values.every((v) => Number.isFinite(v))) {
    throw new Error(`${label}: todos los valores deben ser finitos.`);
  }
}

export function round2(value) {
  return Number(value.toFixed(2));
}

/** Media aritmética de los valores. */
export function annualAverage(values) {
  assertFiniteArray(values, 'annualAverage');
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Salario real en euros de la base: nominal × IPC(base) / IPC(año).
 */
export function deflate(nominal, cpi, baseCpi) {
  if (![nominal, cpi, baseCpi].every(Number.isFinite)) {
    throw new Error('deflate: se esperaban tres números finitos.');
  }
  if (cpi <= 0 || baseCpi <= 0) {
    throw new Error('deflate: los índices de precios deben ser positivos.');
  }
  return (nominal * baseCpi) / cpi;
}

/** Variación acumulada de cada valor respecto al primero, en %. */
export function cumulativeChange(values) {
  assertFiniteArray(values, 'cumulativeChange');
  if (values[0] === 0) {
    throw new Error('cumulativeChange: el valor base no puede ser cero.');
  }
  return values.map((v) => 100 * (v / values[0] - 1));
}

function monthValue(byMonth, key) {
  if (byMonth instanceof Map) return byMonth.get(key) ?? null;
  const value = byMonth?.[key];
  return value == null ? null : value;
}

/**
 * Cambio entre un mes de referencia y el mismo mes de cada año.
 * Devuelve un objeto { [año]: variación }.
 */
export function sameMonthChange(byMonth, refMonth, years) {
  if (!/^\d{4}-\d{2}$/.test(refMonth)) {
    throw new Error(`sameMonthChange: mes de referencia inválido (${refMonth}).`);
  }
  const ref = monthValue(byMonth, refMonth);
  if (ref == null) throw new Error(`sameMonthChange: falta ${refMonth}.`);

  const out = {};
  for (const year of years) {
    const key = `${year}-${refMonth.slice(5)}`;
    const value = monthValue(byMonth, key);
    if (value == null) throw new Error(`sameMonthChange: falta ${key}.`);
    out[String(year)] = 100 * (ref / value - 1);
  }
  return out;
}

/**
 * Variación anual de cada mes respecto al mismo mes del año anterior.
 * Devuelve null cuando falta el año anterior.
 */
export function yearOnYear(byMonth, months) {
  if (!Array.isArray(months) || months.length === 0) {
    throw new Error('yearOnYear: se esperaba un array de meses.');
  }
  return months.map((ym) => {
    const [year, month] = ym.split('-').map(Number);
    const prev = `${year - 1}-${String(month).padStart(2, '0')}`;
    const now = monthValue(byMonth, ym);
    const then = monthValue(byMonth, prev);
    if (now == null || then == null) return null;
    return 100 * (now / then - 1);
  });
}

/**
 * Totales, porcentaje de menores de 15 y de 65+, y edad modal.
 */
export function pyramidStats(male, female, ages) {
  if (!Array.isArray(male) || !Array.isArray(female) || !Array.isArray(ages)) {
    throw new Error('pyramidStats: se esperaban tres arrays.');
  }
  if (male.length !== female.length || male.length !== ages.length) {
    throw new Error('pyramidStats: los arrays deben tener la misma longitud.');
  }
  if (male.length === 0) throw new Error('pyramidStats: no hay edades.');

  let total = 0;
  let young = 0;
  let old = 0;
  let modalAge = ages[0];
  let modalValue = -Infinity;

  for (let i = 0; i < ages.length; i += 1) {
    const value = male[i] + female[i];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`pyramidStats: valor inválido en la edad ${ages[i]}.`);
    }
    total += value;
    if (ages[i] <= 14) young += value;
    if (ages[i] >= 65) old += value;
    if (value > modalValue) {
      modalValue = value;
      modalAge = ages[i];
    }
  }

  if (total <= 0) throw new Error('pyramidStats: la población total debe ser positiva.');
  return {
    total,
    young: (100 * young) / total,
    old: (100 * old) / total,
    modalAge,
  };
}

/**
 * Estadísticos de la serie de paro: último dato, pico, mínimo y relación
 * juvenil/total. Valida longitudes, rangos y que la tasa juvenil supere la total.
 */
export function unemploymentStats(quarters, total, youth) {
  if (!Array.isArray(quarters) || !Array.isArray(total) || !Array.isArray(youth)) {
    throw new Error('unemploymentStats: se esperaban tres arrays.');
  }
  if (quarters.length === 0 || quarters.length !== total.length || total.length !== youth.length) {
    throw new Error('unemploymentStats: los arrays deben tener la misma longitud.');
  }

  let totalPeak = { value: -Infinity, index: -1 };
  let youthPeak = { value: -Infinity, index: -1 };
  let youthLow = { value: Infinity, index: -1 };
  let ratioMin = { value: Infinity, index: -1 };
  let ratioMax = { value: -Infinity, index: -1 };

  for (let i = 0; i < quarters.length; i += 1) {
    if (![total[i], youth[i]].every(Number.isFinite)) {
      throw new Error(`unemploymentStats: valor no finito en ${quarters[i]}.`);
    }
    if (total[i] < 0 || total[i] > 100 || youth[i] < 0 || youth[i] > 100) {
      throw new Error(`unemploymentStats: tasa fuera de rango en ${quarters[i]}.`);
    }
    if (youth[i] <= total[i]) {
      throw new Error(`unemploymentStats: la tasa juvenil no supera la total en ${quarters[i]}.`);
    }

    if (total[i] > totalPeak.value) totalPeak = { value: total[i], index: i };
    if (youth[i] > youthPeak.value) youthPeak = { value: youth[i], index: i };
    if (youth[i] < youthLow.value) youthLow = { value: youth[i], index: i };

    const ratio = youth[i] / total[i];
    if (ratio < ratioMin.value) ratioMin = { value: ratio, index: i };
    if (ratio > ratioMax.value) ratioMax = { value: ratio, index: i };
  }

  const last = quarters.length - 1;
  return {
    latest: {
      quarter: quarters[last],
      total: total[last],
      youth: youth[last],
      gap: youth[last] - total[last],
      ratio: youth[last] / total[last],
    },
    peak: {
      quarter: quarters[youthPeak.index],
      youth: youthPeak.value,
      total: total[youthPeak.index],
    },
    low: {
      quarter: quarters[youthLow.index],
      youth: youthLow.value,
      total: total[youthLow.index],
    },
    totalPeak: {
      quarter: quarters[totalPeak.index],
      value: totalPeak.value,
    },
    ratio: {
      min: ratioMin.value,
      minQuarter: quarters[ratioMin.index],
      max: ratioMax.value,
      maxQuarter: quarters[ratioMax.index],
    },
  };
}
