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

/* ---------------------------------------------------------------- Pirámide */

await page.goto(BASE, { waitUntil: 'networkidle' });

const barsM = await page.locator('svg rect.male').count();
const barsF = await page.locator('svg rect.female').count();
push('pirámide: 100 barras por sexo', barsM === 100 && barsF === 100, `m=${barsM} f=${barsF}`);

const year0 = (await page.locator('[data-year]').textContent()).trim();
push('pirámide: año inicial 1981', year0 === '1981', `año=${year0}`);

const total0 = (await page.locator('[data-stat="total"]').textContent()).trim();
push('pirámide: población 1981', total0 === '37,761,297', `total=${total0}`);

await page.locator('[data-slider]').fill('44');
await page.waitForTimeout(300);
const modalEnd = (await page.locator('[data-stat="modal"]').textContent()).trim();
push('pirámide: edad modal 2025', modalEnd === '48 años', `modal=${modalEnd}`);

await page.locator('[data-play]').click();
await page.waitForTimeout(800);
const playing = await page.locator('[data-play]').getAttribute('aria-pressed');
push('pirámide: play funciona', playing === 'true', `pressed=${playing}`);
await page.locator('[data-play]').click();

const navCount = await page.locator('.nav-links a').count();
push('nav: dos historias enlazadas', navCount === 2, `links=${navCount}`);

/* --------------------------------------------------------------- Inflación */

await page.locator('.nav-links a', { hasText: 'Inflación' }).click();
await page.waitForURL('**/inflacion');
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
