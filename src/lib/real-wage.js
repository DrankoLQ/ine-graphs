import * as d3 from 'd3';

const COLOR = {
  real: '#b4553f',
  nominal: '#8a8883',
  ink: '#1d1d1b',
  grid: '#e6e3dc',
  line: '#c9c5bb',
  gap: '#b4553f',
};

const MARGIN = { top: 34, right: 58, bottom: 30, left: 42 };
// El salario real baja hasta −4,7 % y el nominal sube hasta +35,0 %. El eje
// incluye el cero y deja aire arriba y abajo; no se recorta la escala.
const Y_MIN = -10;
const Y_MAX = 40;

const nf1 = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const nf0 = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 0,
});

const fmtPct = (v) => `${v > 0 ? '+' : ''}${nf1.format(v)} %`;
const fmtEur = (v) => `${nf0.format(v)} €`;

export function initRealWage() {
  const dataEl = document.getElementById('salario-real-data');
  const host = document.querySelector('[data-chart-salario]');
  if (!dataEl || !host) return;

  const data = JSON.parse(dataEl.textContent);
  const { years, nominalChange, realChange, ipcChange, nominal, real } = data;
  const last = years.length - 1;

  const svg = d3.select(host).append('svg').attr('role', 'img');
  const layerGap = svg.append('g');
  const layerGrid = svg.append('g');
  const layerLines = svg.append('g');
  const layerAxis = svg.append('g');
  const layerNotes = svg.append('g');

  const rule = svg
    .append('line')
    .attr('stroke', COLOR.ink)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3 3')
    .attr('opacity', 0);

  const overlay = svg.append('rect').attr('fill', 'transparent');

  const tooltip = d3
    .select(host)
    .append('div')
    .attr('class', 'series-tooltip')
    .attr('hidden', true);

  const gapPath = layerGap
    .append('path')
    .attr('fill', COLOR.gap)
    .attr('opacity', 0.07);

  const nominalPath = layerLines
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', COLOR.nominal)
    .attr('stroke-width', 1.8)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round');

  const realPath = layerLines
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', COLOR.real)
    .attr('stroke-width', 2.4)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round');

  let width = 0;
  let height = 0;
  let innerW = 0;
  let innerH = 0;
  let x;
  let y;

  const line = d3
    .line()
    .x((v, i) => x(years[i]))
    .y((v) => y(v));

  const area = d3
    .area()
    .x((v, i) => x(years[i]))
    .y0((v, i) => y(realChange[i]))
    .y1((v) => y(v));

  function layout() {
    width = Math.max(300, host.clientWidth);
    height = width < 560 ? 270 : Math.round(Math.min(460, Math.max(330, width * 0.33)));
    innerW = width - MARGIN.left - MARGIN.right;
    innerH = height - MARGIN.top - MARGIN.bottom;

    x = d3.scalePoint().domain(years).range([0, innerW]).padding(0);
    y = d3.scaleLinear().domain([Y_MIN, Y_MAX]).range([innerH, 0]);

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    for (const layer of [layerGap, layerGrid, layerLines, layerAxis, layerNotes]) {
      layer.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    }

    rule
      .attr('x1', MARGIN.left)
      .attr('x2', MARGIN.left)
      .attr('y1', MARGIN.top)
      .attr('y2', MARGIN.top + innerH);

    overlay
      .attr('x', MARGIN.left)
      .attr('y', MARGIN.top)
      .attr('width', innerW)
      .attr('height', innerH);
  }

  function draw() {
    gapPath.attr('d', area(nominalChange));
    nominalPath.attr('d', line(nominalChange));
    realPath.attr('d', line(realChange));

    // Rejilla horizontal y eje Y.
    layerGrid.selectAll('*').remove();
    for (const t of d3.ticks(Y_MIN, Y_MAX, 5)) {
      layerGrid
        .append('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', y(t))
        .attr('y2', y(t))
        .attr('stroke', t === 0 ? COLOR.line : COLOR.grid)
        .attr('stroke-width', t === 0 ? 1.2 : 1);
      layerGrid
        .append('text')
        .attr('x', -8)
        .attr('y', y(t))
        .attr('dy', '0.32em')
        .attr('text-anchor', 'end')
        .attr('class', 'salario-tick')
        .text(`${t} %`);
    }

    // Años en el eje X.
    layerAxis.selectAll('*').remove();
    const every = width < 560 ? 4 : 2;
    years.forEach((year, i) => {
      if ((year - years[0]) % every !== 0) return;
      layerAxis
        .append('text')
        .attr('x', x(year))
        .attr('y', innerH + 18)
        .attr('text-anchor', 'middle')
        .attr('class', 'salario-tick')
        .text(year);
    });

    // Anotaciones: mínimo real y valores finales.
    layerNotes.selectAll('*').remove();

    const minIndex = years.indexOf(data.stats.real.min.year);
    if (minIndex !== -1) {
      const px = x(years[minIndex]);
      const py = y(realChange[minIndex]);
      layerNotes.append('circle').attr('cx', px).attr('cy', py).attr('r', 3).attr('fill', COLOR.ink);
      layerNotes
        .append('text')
        .attr('x', px)
        .attr('y', py + 15)
        .attr('text-anchor', 'middle')
        .attr('class', 'salario-note')
        .text(`${fmtPct(realChange[minIndex])} · ${years[minIndex]}`);
    }

    for (const [key, color] of [
      ['nominal', COLOR.nominal],
      ['real', COLOR.real],
    ]) {
      const value = key === 'nominal' ? nominalChange[last] : realChange[last];
      const px = x(years[last]);
      const py = y(value);
      layerNotes.append('circle').attr('cx', px).attr('cy', py).attr('r', 3.5).attr('fill', color);
      layerNotes
        .append('text')
        .attr('x', px + 8)
        .attr('y', py)
        .attr('dy', '0.32em')
        .attr('class', `salario-end salario-end--${key}`)
        .text(fmtPct(value));
    }

    // La distancia entre las líneas es el efecto acumulado de la inflación.
    const gapIndex = years.indexOf(2018);
    if (gapIndex !== -1) {
      layerNotes
        .append('text')
        .attr('x', x(years[gapIndex]))
        .attr('y', (y(nominalChange[gapIndex]) + y(realChange[gapIndex])) / 2)
        .attr('text-anchor', 'middle')
        .attr('class', 'salario-gap-label')
        .text('inflación');
    }

    svg.attr(
      'aria-label',
      `Variación acumulada del salario nominal y real en España desde ${years[0]} hasta ${years[last]}. En ${years[last]}, ${fmtPct(nominalChange[last])} nominal y ${fmtPct(realChange[last])} real.`
    );
  }

  overlay
    .on('mousemove', (event) => {
      const [mx, my] = d3.pointer(event, host);
      const rel = mx - MARGIN.left;
      if (rel < 0 || rel > innerW) return;

      const step = years.length > 1 ? innerW / (years.length - 1) : innerW;
      const idx = Math.max(0, Math.min(last, Math.round(rel / step)));
      const year = years[idx];

      rule
        .attr('x1', MARGIN.left + x(year))
        .attr('x2', MARGIN.left + x(year))
        .attr('opacity', 0.35);

      tooltip
        .attr('hidden', null)
        .style('left', `${Math.min(width - 220, Math.max(8, MARGIN.left + x(year) + 14))}px`)
        .style('top', `${Math.max(8, my - 84)}px`)
        .html(
          [
            `<strong>${year}</strong>`,
            `<span><i style="background:${COLOR.nominal}"></i>Nominal: ${fmtEur(nominal[idx])} (${fmtPct(nominalChange[idx])})</span>`,
            `<span class="tooltip-ipc">IPC acumulado: ${fmtPct(ipcChange[idx])}</span>`,
            `<span><i style="background:${COLOR.real}"></i>Real: ${fmtEur(real[idx])} (${fmtPct(realChange[idx])})</span>`,
          ].join('')
        );
    })
    .on('mouseleave', () => {
      tooltip.attr('hidden', true);
      rule.attr('opacity', 0);
    });

  let resizeTimer;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (Math.abs(host.clientWidth - width) > 8) {
        layout();
        draw();
      }
    }, 120);
  });
  observer.observe(host);

  layout();
  draw();
}
