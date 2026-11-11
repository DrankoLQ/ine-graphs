import * as d3 from 'd3';

const COLOR = {
  youth: '#b4553f',
  total: '#8a8883',
  ink: '#1d1d1b',
  grid: '#e6e3dc',
  line: '#c9c5bb',
  band: '#f0ede6',
};

const MARGIN = { top: 30, right: 56, bottom: 30, left: 40 };
// La serie juvenil llega a 56,9 % en 2013. El eje arranca en cero: el paro es
// una proporción y recortar la base exageraría las diferencias.
const Y_MAX = 60;

const QUARTERS = ['1T', '2T', '3T', '4T'];

const nf = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fmtPct = (v) => `${nf.format(v)} %`;

function quarterLabel(ym) {
  const [year, month] = ym.split('-').map(Number);
  return `${QUARTERS[(month - 1) / 3]} ${year}`;
}

export function initUnemployment() {
  const dataEl = document.getElementById('paro-data');
  const host = document.querySelector('[data-chart-paro]');
  if (!dataEl || !host) return;

  const data = JSON.parse(dataEl.textContent);
  const { quarters, series } = data;
  const last = quarters.length - 1;

  const svg = d3.select(host).append('svg').attr('role', 'img');
  const layerBand = svg.append('g');
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

  const youthPath = layerLines
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', COLOR.youth)
    .attr('stroke-width', 2.4)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round');

  const totalPath = layerLines
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', COLOR.total)
    .attr('stroke-width', 1.8)
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
    .x((v, i) => x(quarters[i]))
    .y((v) => y(v));

  function layout() {
    width = Math.max(300, host.clientWidth);
    height = width < 560 ? 280 : Math.round(Math.min(480, Math.max(340, width * 0.34)));
    innerW = width - MARGIN.left - MARGIN.right;
    innerH = height - MARGIN.top - MARGIN.bottom;

    x = d3.scalePoint().domain(quarters).range([0, innerW]).padding(0);
    y = d3.scaleLinear().domain([0, Y_MAX]).range([innerH, 0]);

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    for (const layer of [layerBand, layerGrid, layerLines, layerAxis, layerNotes]) {
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
    const youth = series.youth;
    const total = series.total;

    // Banda de la crisis: de 2008-T1 al final de 2013.
    const bandStart = x('2008-01');
    const bandEnd = x('2014-01') ?? innerW;
    layerBand.selectAll('*').remove();
    layerBand
      .append('rect')
      .attr('x', bandStart)
      .attr('y', 0)
      .attr('width', bandEnd - bandStart)
      .attr('height', innerH)
      .attr('fill', COLOR.band);
    if (width >= 560) {
      layerBand
        .append('text')
        .attr('x', (bandStart + bandEnd) / 2)
        .attr('y', innerH - 8)
        .attr('text-anchor', 'middle')
        .attr('class', 'paro-band-label')
        .text('crisis 2008-2013');
    }

    // Rejilla horizontal y eje Y.
    layerGrid.selectAll('*').remove();
    for (const t of d3.ticks(0, Y_MAX, 6)) {
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
        .attr('class', 'paro-tick')
        .text(`${t} %`);
    }

    // Años en el eje X, en el primer trimestre.
    layerAxis.selectAll('*').remove();
    const every = width < 560 ? 8 : 4;
    quarters.forEach((q, i) => {
      const [year, month] = q.split('-').map(Number);
      if (month !== 1 || (year - 2002) % every !== 0) return;
      layerAxis
        .append('text')
        .attr('x', x(quarters[i]))
        .attr('y', innerH + 18)
        .attr('text-anchor', 'middle')
        .attr('class', 'paro-tick')
        .text(year);
    });

    youthPath.attr('d', line(youth));
    totalPath.attr('d', line(total));

    // Anotaciones: pico y valores finales. El mínimo queda en la nota de la
    // página para no cruzar la etiqueta con la línea en pantallas estrechas.
    layerNotes.selectAll('*').remove();

    const peakIndex = data.quarters.indexOf(data.stats.peak.quarter);
    if (peakIndex !== -1) {
      const px = x(quarters[peakIndex]);
      const py = y(youth[peakIndex]);
      // Cerca del máximo, la etiqueta se separa de la línea del 60 %: si no,
      // la rejilla le pasa por detrás en pantallas estrechas.
      const labelY = Math.min(py - 12, y(Y_MAX) - 12);
      layerNotes.append('circle').attr('cx', px).attr('cy', py).attr('r', 3).attr('fill', COLOR.ink);
      layerNotes
        .append('text')
        .attr('x', px + 8)
        .attr('y', labelY)
        .attr('class', 'paro-note')
        .text(`${fmtPct(youth[peakIndex])} · ${quarterLabel(quarters[peakIndex])}`);
    }

    for (const [key, color] of [
      ['youth', COLOR.youth],
      ['total', COLOR.total],
    ]) {
      const px = x(quarters[last]);
      const py = y(series[key][last]);
      layerNotes.append('circle').attr('cx', px).attr('cy', py).attr('r', 3.5).attr('fill', color);
      layerNotes
        .append('text')
        .attr('x', px + 8)
        .attr('y', py)
        .attr('dy', '0.32em')
        .attr('class', `paro-end paro-end--${key}`)
        .text(fmtPct(series[key][last]));
    }

    svg.attr(
      'aria-label',
      `Tasa de paro trimestral en España, menores de 25 años y total, de ${quarterLabel(quarters[0])} a ${quarterLabel(quarters[last])}. Último dato: ${fmtPct(series.youth[last])} y ${fmtPct(series.total[last])}.`
    );
  }

  overlay
    .on('mousemove', (event) => {
      const [mx, my] = d3.pointer(event, host);
      const rel = mx - MARGIN.left;
      if (rel < 0 || rel > innerW) return;

      const step = quarters.length > 1 ? innerW / (quarters.length - 1) : innerW;
      const idx = Math.max(0, Math.min(last, Math.round(rel / step)));
      const ym = quarters[idx];

      rule
        .attr('x1', MARGIN.left + x(ym))
        .attr('x2', MARGIN.left + x(ym))
        .attr('opacity', 0.35);

      tooltip
        .attr('hidden', null)
        .style('left', `${Math.min(width - 210, Math.max(8, MARGIN.left + x(ym) + 14))}px`)
        .style('top', `${Math.max(8, my - 64)}px`)
        .html(
          [
            `<strong>${quarterLabel(ym)}</strong>`,
            `<span><i style="background:${COLOR.youth}"></i>Menores de 25: ${fmtPct(series.youth[idx])}</span>`,
            `<span><i style="background:${COLOR.total}"></i>Total: ${fmtPct(series.total[idx])}</span>`,
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
