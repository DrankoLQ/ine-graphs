import { chromium } from 'playwright';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';

// Usa un Chromium ya cacheado si la versión de Playwright espera otra build.
const cached = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const executablePath = existsSync(cached) ? cached : undefined;

mkdirSync('.artifacts', { recursive: true });

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });

const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

const checks = [];
const push = (name, ok, detail = '') => checks.push({ name, ok, detail });

/* ------------------------------------------------------------------- Hub */

await page.goto(BASE, { waitUntil: 'networkidle' });

const cards = await page.locator('.story-card').count();
push('hub: 4 historias', cards === 4, `cards=${cards}`);

const hrefs = await page.locator('.story-card').evaluateAll((els) =>
  els.map((e) => e.getAttribute('href'))
);
push(
  'hub: enlaces a las cuatro historias',
  hrefs.includes('/piramide') &&
    hrefs.includes('/inflacion') &&
    hrefs.includes('/paro') &&
    hrefs.includes('/salario-real'),
  hrefs.join(',')
);

await page.locator('.story-card', { hasText: 'España envejece' }).click();
await page.waitForURL(/\/piramide\/?$/);
await page.waitForTimeout(400);

/* ---------------------------------------------------------------- Pirámide */

const barsM = await page.locator('svg rect.male').count();
const barsF = await page.locator('svg rect.female').count();
push('pirámide: 100 barras por sexo', barsM === 100 && barsF === 100, `m=${barsM} f=${barsF}`);

const year0 = (await page.locator('[data-year]').textContent()).trim();
push('pirámide: año inicial 1981', year0 === '1981', `año=${year0}`);

const total0 = (await page.locator('[data-stat="total"]').textContent()).trim();
push('pirámide: población 1981', total0 === '37,761,297', `total=${total0}`);

const young0 = (await page.locator('[data-stat="young"]').textContent()).trim();
push('pirámide: menores de 15 en 1981', young0 === '25,5 %', `young=${young0}`);

const old0 = (await page.locator('[data-stat="old"]').textContent()).trim();
push('pirámide: mayores de 65 en 1981', old0 === '11,3 %', `old=${old0}`);

await page.locator('[data-slider]').fill('44');
await page.waitForTimeout(300);
const modalEnd = (await page.locator('[data-stat="modal"]').textContent()).trim();
push('pirámide: edad modal 2025', modalEnd === '48 años', `modal=${modalEnd}`);

const youngEnd = (await page.locator('[data-stat="young"]').textContent()).trim();
push('pirámide: menores de 15 en 2025', youngEnd === '12,9 %', `young=${youngEnd}`);

const oldEnd = (await page.locator('[data-stat="old"]').textContent()).trim();
push('pirámide: mayores de 65 en 2025', oldEnd === '20,7 %', `old=${oldEnd}`);

await page.locator('[data-play]').click();
await page.waitForTimeout(800);
const playing = await page.locator('[data-play]').getAttribute('aria-pressed');
push('pirámide: play funciona', playing === 'true', `pressed=${playing}`);
await page.locator('[data-play]').click();

const pyramidProv = (await page.locator('.provenance').textContent()).replace(/\s+/g, ' ').trim();
push(
  'pirámide: trazabilidad de datos',
  pyramidProv.includes('Datos directos') &&
    pyramidProv.includes('Cálculo propio') &&
    pyramidProv.includes('edad modal'),
  `texto=${pyramidProv.slice(0, 90)}`
);

const navCount = await page.locator('.nav-links a').count();
push('nav: un enlace al índice', navCount === 1, `links=${navCount}`);

await page.locator('.nav-links a', { hasText: 'Todas las historias' }).click();
await page.waitForURL(BASE + '/');
const backCards = await page.locator('.story-card').count();
push('nav: vuelve al índice', backCards === 4, `cards=${backCards}`);

/* --------------------------------------------------------------- Inflación */

await page.goto(`${BASE}/inflacion`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const rows = await page.locator('g.row').count();
push('inflación: 13 barras', rows === 13, `rows=${rows}`);

const foodValue = (
  await page.locator('g.row', { hasText: 'Alimentos y bebidas' }).locator('.row-value').textContent()
).trim();
push('inflación: alimentos +40,9 % (2019)', foodValue === '+40,9 %', `valor=${foodValue}`);

const clothesValue = (
  await page.locator('g.row', { hasText: 'Ropa y calzado' }).locator('.row-value').textContent()
).trim();
push('inflación: ropa +10,9 % (mismo mes)', clothesValue === '+10,9 %', `valor=${clothesValue}`);

const ref2019 = (await page.locator('.ref-label').textContent()).trim();
push('inflación: media 28,1 %', ref2019 === 'Media 28,1 %', `ref=${ref2019}`);

const first2019 = (await page.locator('g.row').first().locator('.row-name').textContent()).trim();
push('inflación: alimentos lidera en 2019', first2019 === 'Alimentos y bebidas', `primero=${first2019}`);

const yearOptions = await page.locator('[data-year-select] option').count();
push('año: 24 opciones (2002-2025)', yearOptions === 24, `options=${yearOptions}`);

const hex = (c) => {
  if (!c) return c;
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    return `#${[1, 2, 3]
      .map((i) => Number(m[i]).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return c.toLowerCase();
};

const fillOf = async (name) =>
  hex(
    await page
      .locator('g.row', { hasText: name })
      .locator('rect.bar')
      .getAttribute('fill')
  );

const fillFood = await fillOf('Alimentos y bebidas');
push('color: positivos en rojo', fillFood === '#b4553f', `fill=${fillFood}`);

const fillComms = await fillOf('Comunicaciones');
push('color: negativos en azul', fillComms === '#3d6b8c', `fill=${fillComms}`);

const fillHealth = await fillOf('Sanidad');
push(
  'color: positivo bajo la media también en rojo',
  fillHealth === '#b4553f',
  `fill=${fillHealth}`
);

// Cambio de año
await page.locator('[data-year-select]').selectOption('2002');
await page.waitForTimeout(600);

const ref2002 = (await page.locator('.ref-label').textContent()).trim();
push('inflación: media 74,2 % (2002)', ref2002 === 'Media 74,2 %', `ref=${ref2002}`);

const first2002 = (await page.locator('g.row').first().locator('.row-name').textContent()).trim();
push('inflación: tabaco lidera en 2002', first2002 === 'Alcohol y tabaco', `primero=${first2002}`);

const tobaccoValue = (
  await page.locator('g.row', { hasText: 'Alcohol y tabaco' }).locator('.row-value').textContent()
).trim();
push('inflación: tabaco +157,0 %', tobaccoValue === '+157,0 %', `valor=${tobaccoValue}`);

const commsValue = (
  await page.locator('g.row', { hasText: 'Comunicaciones' }).locator('.row-value').textContent()
).trim();
push('inflación: comunicaciones -52,5 %', commsValue === '-52,5 %', `valor=${commsValue}`);

const selectedYear = await page.locator('[data-year-select]').inputValue();
push('año: el selector refleja el cambio', selectedYear === '2002', `valor=${selectedYear}`);

const fillCare = await fillOf('Cuidado personal');
push(
  'color: en 2002 los positivos bajo la media siguen en rojo',
  fillCare === '#b4553f',
  `fill=${fillCare}`
);

/* ----------------------------------------------------------- Serie mensual */

const serie = JSON.parse(
  readFileSync(new URL('../src/data/inflacion-serie.json', import.meta.url), 'utf8')
);
const iMar2022 = serie.months.indexOf('2022-03');
const iJul2022 = serie.months.indexOf('2022-07');

push(
  'serie: 285 meses, último 2026-09',
  serie.months.length === 285 && serie.months.at(-1) === '2026-09',
  `n=${serie.months.length} fin=${serie.months.at(-1)}`
);
push(
  'serie: vivienda 33,1 % en marzo 2022',
  Math.abs(serie.series['Vivienda y energía'][iMar2022] - 33.1) < 0.05,
  `valor=${serie.series['Vivienda y energía'][iMar2022]}`
);
push(
  'serie: general 10,8 % en julio 2022',
  Math.abs(serie.series.general[iJul2022] - 10.8) < 0.05,
  `valor=${serie.series.general[iJul2022]}`
);

const options = await page.locator('[data-series-select] option').count();
push('serie: 14 opciones en el selector', options === 14, `options=${options}`);

const activePath = 'path[stroke="#b4553f"]';
const generalPath = 'path[stroke="#9b9994"]';

const beforeD = await page.locator(activePath).getAttribute('d');
const generalHidden = await page.locator(generalPath).getAttribute('display');
push('serie: por defecto solo la línea activa', generalHidden === 'none', `display=${generalHidden}`);

const note = (await page.locator('.series-note').textContent()).trim();
push('serie: anotación del pico general', note === '10,8 % · jul 2022', `nota=${note}`);

await page.locator('[data-series-select]').selectOption('Vivienda y energía');
await page.waitForTimeout(500);

const afterD = await page.locator(activePath).getAttribute('d');
push('serie: el selector cambia la línea', beforeD !== afterD);

const generalVisible = await page.locator(generalPath).getAttribute('display');
push('serie: la general aparece como referencia', generalVisible !== 'none', `display=${generalVisible}`);

const noteAfter = await page.locator('.series-note').count();
push('serie: la anotación se oculta al elegir grupo', noteAfter === 0, `notas=${noteAfter}`);

await page.locator('[data-chart-series] svg').scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
const sbox = await page.locator('[data-chart-series] svg').boundingBox();
await page.mouse.move(sbox.x + sbox.width * 0.62, sbox.y + sbox.height * 0.5);
await page.waitForTimeout(250);
const seriesTip = await page.locator('.series-tooltip').isVisible();
push('serie: tooltip al pasar el ratón', seriesTip);
await page.mouse.move(0, 0);

const inflationProv = (await page.locator('.provenance').textContent()).replace(/\s+/g, ' ').trim();
push(
  'inflación: trazabilidad de datos',
  inflationProv.includes('Datos directos') &&
    inflationProv.includes('Cálculo propio') &&
    inflationProv.includes('variación anual'),
  `texto=${inflationProv.slice(0, 90)}`
);

/* -------------------------------------------------------------- Responsive */

const overflowDesktop = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
);
push('inflación: sin overflow a 1000 px', overflowDesktop <= 0, `overflow=${overflowDesktop}px`);

await page.setViewportSize({ width: 380, height: 900 });
await page.waitForTimeout(500);
const overflowMobile = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
);
push('inflación: sin overflow a 380 px', overflowMobile <= 0, `overflow=${overflowMobile}px`);

const mobileRows = await page.locator('g.row').count();
push('inflación: 13 barras en móvil', mobileRows === 13, `rows=${mobileRows}`);

await page.screenshot({ path: '.artifacts/smoke-inflacion.png', fullPage: true });

/* ------------------------------------------------------------------- Paro */

await page.setViewportSize({ width: 1000, height: 900 });
await page.goto(`${BASE}/paro`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const paro = JSON.parse(
  readFileSync(new URL('../src/data/paro.json', import.meta.url), 'utf8')
);
push(
  'paro: 99 trimestres, último 2026-07',
  paro.quarters.length === 99 && paro.latest === '2026-07',
  `n=${paro.quarters.length} fin=${paro.latest}`
);
push(
  'paro: pico juvenil 56,92 % en 2013-01',
  paro.stats.peak.quarter === '2013-01' && Math.abs(paro.stats.peak.youth - 56.92) < 0.01,
  `${paro.stats.peak.youth} % en ${paro.stats.peak.quarter}`
);

const paroLines = await page.locator('[data-chart-paro] path').count();
push('paro: dos líneas', paroLines === 2, `paths=${paroLines}`);

const ends = await page.locator('.paro-end').allTextContents();
push('paro: valores finales', ends.join('|') === '23,3 %|10,2 %', ends.join('|'));

const peakNote = (await page.locator('.paro-note:not(.paro-note--muted)').textContent()).trim();
push('paro: anotación del pico', peakNote === '56,9 % · 1T 2013', `nota=${peakNote}`);

const paroTableRows = await page.locator('.table-wrap tbody tr').count();
push('paro: tabla con 99 trimestres', paroTableRows === 99, `rows=${paroTableRows}`);

const paroNote = (await page.locator('.chart-note').textContent()).replace(/\s+/g, ' ').trim();
push(
  'paro: el mínimo aparece en la nota',
  paroNote.includes('16,9 %') && paroNote.includes('3T 2006'),
  `nota=${paroNote.slice(0, 70)}`
);

await page.locator('[data-chart-paro] svg').scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
const paroBox = await page.locator('[data-chart-paro] svg').boundingBox();
await page.mouse.move(paroBox.x + paroBox.width * 0.45, paroBox.y + paroBox.height * 0.5);
await page.waitForTimeout(250);
const paroTip = await page.locator('.series-tooltip').isVisible();
const paroTipText = paroTip
  ? (await page.locator('.series-tooltip').textContent()).trim()
  : '';
push(
  'paro: tooltip con el trimestre',
  paroTip && paroTipText.includes('1T 2013'),
  `texto=${paroTipText.slice(0, 40)}`
);
await page.mouse.move(0, 0);

const paroProv = (await page.locator('.provenance').textContent()).replace(/\s+/g, ' ').trim();
push(
  'paro: trazabilidad de datos',
  paroProv.includes('Datos directos') &&
    paroProv.includes('Cálculo propio') &&
    paroProv.includes('no se recalcula'),
  `texto=${paroProv.slice(0, 90)}`
);

const paroOverflowDesktop = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
);
push('paro: sin overflow a 1000 px', paroOverflowDesktop <= 0, `overflow=${paroOverflowDesktop}px`);

await page.setViewportSize({ width: 380, height: 900 });
await page.waitForTimeout(500);
const paroOverflowMobile = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
);
push('paro: sin overflow a 380 px', paroOverflowMobile <= 0, `overflow=${paroOverflowMobile}px`);

const mobileEnds = await page.locator('.paro-end').count();
push('paro: valores finales en móvil', mobileEnds === 2, `labels=${mobileEnds}`);

await page.screenshot({ path: '.artifacts/smoke-paro.png', fullPage: true });

/* ---------------------------------------------------------- Salario real */

await page.setViewportSize({ width: 1000, height: 900 });
await page.goto(`${BASE}/salario-real`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const salary = JSON.parse(
  readFileSync(new URL('../src/data/salario-real.json', import.meta.url), 'utf8')
);
push(
  'salario: 17 años, 2008-2024',
  salary.years.length === 17 && salary.years[0] === 2008 && salary.latest === 2024,
  `n=${salary.years.length} fin=${salary.latest}`
);
push(
  'salario: +35,0 % nominal y +1,1 % real',
  Math.abs(salary.stats.nominal.growth - 34.99) < 0.02 &&
    Math.abs(salary.stats.real.growth - 1.12) < 0.02,
  `${salary.stats.nominal.growth} % / ${salary.stats.real.growth} %`
);
push(
  'salario: IPC acumulado +33,5 %',
  Math.abs(salary.ipcChange.at(-1) - 33.49) < 0.02,
  `${salary.ipcChange.at(-1)} %`
);

const salaryTitle = await page.title();
push('salario: titular con las dos cifras', salaryTitle.includes('35') && salaryTitle.includes('1'), salaryTitle);

const salaryLines = await page.locator('[data-chart-salario] path[fill="none"]').count();
push('salario: dos líneas', salaryLines === 2, `paths=${salaryLines}`);

const salaryEnds = await page.locator('.salario-end').allTextContents();
push('salario: valores finales', salaryEnds.join('|') === '+35,0 %|+1,1 %', salaryEnds.join('|'));

const salaryNote = (await page.locator('.salario-note').textContent()).trim();
push('salario: mínimo -4,7 % en 2013', salaryNote === '-4,7 % · 2013', `nota=${salaryNote}`);

const gapLabel = (await page.locator('.salario-gap-label').textContent()).trim();
push('salario: etiqueta de inflación', gapLabel === 'inflación', `label=${gapLabel}`);

const salaryTableRows = await page.locator('.salario-table tbody tr').count();
push('salario: tabla con 17 años', salaryTableRows === 17, `rows=${salaryTableRows}`);

const salaryHeaders = await page.locator('.salario-table thead th').allTextContents();
push(
  'salario: tabla con IPC',
  salaryHeaders.includes('IPC acumulado'),
  salaryHeaders.join('|')
);

const ipc2024 = (
  await page.locator('.salario-table tbody tr').first().locator('td').nth(1).textContent()
)
  .replace(/\u00A0/g, ' ')
  .trim();
push('salario: IPC de 2024 en la tabla', ipc2024 === '+33,5 %', `valor=${ipc2024}`);

await page.locator('[data-chart-salario] svg').scrollIntoViewIfNeeded();
await page.waitForTimeout(250);
const salaryBox = await page.locator('[data-chart-salario] svg').boundingBox();
await page.mouse.move(salaryBox.x + salaryBox.width * 0.32, salaryBox.y + salaryBox.height * 0.55);
await page.waitForTimeout(250);
const salaryTip = await page.locator('.series-tooltip').isVisible();
const salaryTipText = salaryTip
  ? (await page.locator('.series-tooltip').textContent()).trim()
  : '';
push(
  'salario: tooltip con el año',
  salaryTip &&
    salaryTipText.includes('2013') &&
    salaryTipText.includes('Nominal') &&
    salaryTipText.includes('IPC'),
  `texto=${salaryTipText.slice(0, 70)}`
);
await page.mouse.move(0, 0);

const salaryProv = (await page.locator('.provenance').textContent()).replace(/\s+/g, ' ').trim();
push(
  'salario: trazabilidad de datos',
  salaryProv.includes('Datos directos') &&
    salaryProv.includes('Cálculo propio') &&
    salaryProv.includes('base 2008'),
  `texto=${salaryProv.slice(0, 90)}`
);

const salaryOverflowDesktop = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
);
push(
  'salario: sin overflow a 1000 px',
  salaryOverflowDesktop <= 0,
  `overflow=${salaryOverflowDesktop}px`
);

await page.setViewportSize({ width: 380, height: 900 });
await page.waitForTimeout(500);
const salaryOverflowMobile = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
);
push(
  'salario: sin overflow a 380 px',
  salaryOverflowMobile <= 0,
  `overflow=${salaryOverflowMobile}px`
);

const mobileSalaryEnds = await page.locator('.salario-end').count();
push('salario: valores finales en móvil', mobileSalaryEnds === 2, `labels=${mobileSalaryEnds}`);

await page.screenshot({ path: '.artifacts/smoke-salario.png', fullPage: true });

/* ------------------------------------------------------------ Reduc. motion */

const rm = await browser.newPage({
  viewport: { width: 1000, height: 900 },
  reducedMotion: 'reduce',
});
await rm.goto(`${BASE}/inflacion`, { waitUntil: 'networkidle' });
await rm.waitForTimeout(300);
const rmRef = (await rm.locator('.ref-label').textContent()).trim();
push('inflación: reduced-motion renderiza', rmRef === 'Media 28,1 %', `ref=${rmRef}`);
await rm.close();

push('consola sin errores', errors.length === 0, errors.join(' | ').slice(0, 300));

await browser.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
}

console.log(`\n${checks.length - failed}/${checks.length} comprobaciones`);
process.exit(failed === 0 ? 0 : 1);
