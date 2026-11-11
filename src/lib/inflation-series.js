import * as d3 from 'd3';
// Efecto secundario necesario: registra Selection.prototype.transition.
import 'd3-transition';

const COLOR = {
  warm: '#b4553f',
  ink: '#1d1d1b',
  muted: '#7a7873',
  general: '#9b9994',
  grid: '#e6e3dc',
  line: '#c9c5bb',
};

const MARGIN = { top: 28, right: 14, bottom: 30, left: 42 };
// Rango por defecto, ajustado a la serie general. Si un grupo se sale, el eje
// se expande lo justo: nunca se recorta un dato.
const Y_MIN = -10;
const Y_MAX = 20;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const nf = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fmtPct = (v) => `${v > 0 ? '+' : ''}${nf.format(v)} %`;

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function initInflationSeries() {
  const dataEl = document.getElementById('inflacion-serie-data');
  const host = document.querySelector('[data-chart-series]');
  const select = document.querySelector('[data-series-select]');
  if (!dataEl || !host) return;

  const data = JSON.parse(dataEl.textContent);
  const { months, series } = data;
  const keys = Object.keys(series);
  const groups = keys.filter((k) => k !== 'general');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Pico del general, anotado de forma permanente.
  let peak = { value: -Infinity, index: 0 };
  series.general.forEach((v, i) => {
    if (v != null && v > peak.value) peak = { value: v, index: i };
  });

  const svg = d3.select(host).append('svg').attr('role', 'img');
  const layerGrid = svg.append('g');
  const layerArea = svg.append('g');
  const layerLines = svg.append('g');
  const layerAxis = svg.append('g');
  const layerNote = svg.append('g');

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

  const areaPath = layerArea
    .append('path')
    .attr('fill', COLOR.warm)
    .attr('opacity', 0.07);

  const generalPath = layerLines
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', COLOR.general)
    .attr('stroke-width', 1.6);

  const activePath = layerLines
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', COLOR.warm)
    .attr('stroke-width', 2.2);

  let width = 0;
  let height = 0;
  let innerW = 0;
  let innerH = 0;
  let x;
  let y;
  let current = 'general';

  const line = d3
    .line()
    .defined((v) => v != null)
    .x((v, i) => x(months[i]))
    .y((v) => y(v));

  const area = d3
    .area()
    .defined((v) => v != null)
    .x((v, i) => x(months[i]))
    .y0(() => y(0))
    .y1((v) => y(v));

  function layout() {
    width = Math.max(300, host.clientWidth);
    height = width < 560 ? 260 : Math.round(Math.min(470, Math.max(330, width * 0.33)));
    innerW = width - MARGIN.left - MARGIN.right;
    innerH = height - MARGIN.top - MARGIN.bottom;

    x = d3.scalePoint().domain(months).range([0, innerW]).padding(0);
    y = d3.scaleLinear().range([innerH, 0]);

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    layerGrid.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    layerArea.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    layerLines.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    layerAxis.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    layerNote.attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    rule.attr('x1', MARGIN.left).attr('x2', MARGIN.left).attr('y1', MARGIN.top).attr('y2', MARGIN.top + innerH);
    overlay
      .attr('x', MARGIN.left)
      .attr('y', MARGIN.top)
      .attr('width', innerW)
      .attr('height', innerH);
  }

  function draw(key, animate = true) {
    current = key;
    const values = series[key] ?? series.general;
    const isGeneral = key === 'general';

    const duration = animate ? 220 : 0;

    // Dominio ajustado a la serie, con un mínimo de −10 a +20.
    const present = values.filter((v) => v != null);
    const lo = Math.min(...present);
    const hi = Math.max(...present);
    const domain = [
      Math.min(Y_MIN, Math.floor(lo / 5) * 5),
      Math.max(Y_MAX, Math.ceil(hi / 5) * 5),
    ];
    y.domain(domain);

    // Rejilla y ejes
    layerGrid.selectAll('*').remove();
    const ticks = d3.ticks(domain[0], domain[1], 5);
    for (const t of ticks) {
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
        .attr('class', 'series-tick')
        .text(`${t} %`);
    }

    // Años en el eje X
    layerAxis.selectAll('*').remove();
    const yearStep = width < 560 ? 8 : 4;
    months.forEach((m, i) => {
      const [year, month] = m.split('-').map(Number);
      if (month !== 1 || year % yearStep !== 0) return;
      layerAxis
        .append('text')
        .attr('x', x(m))
        .attr('y', innerH + 18)
        .attr('text-anchor', 'middle')
        .attr('class', 'series-tick')
        .text(year);
    });

    // Series
    if (isGeneral) {
      generalPath.attr('display', 'none');
      activePath.attr('stroke', COLOR.warm).attr('stroke-width', 2.2);
    } else {
      generalPath.attr('display', null);
      activePath.attr('stroke', COLOR.warm).attr('stroke-width', 2.2);
    }

    generalPath.attr('d', line(series.general));

    const newPath = line(values);
    const newArea = area(values);

    activePath
      .attr('opacity', animate ? 0 : 1)
      .attr('d', newPath)
      .transition()
      .duration(duration)
      .attr('opacity', 1);

    areaPath
      .attr('opacity', animate ? 0 : 0.07)
      .attr('d', newArea)
      .transition()
      .duration(duration)
      .attr('opacity', 0.07);

    // Anotación del pico del general: solo en la vista general, para no chocar
    // con la línea del grupo seleccionado.
    layerNote.selectAll('*').remove();
    if (peak.index != null) {
      const px = x(months[peak.index]);
      const py = y(peak.value);
      layerNote
        .append('circle')
        .attr('cx', px)
        .attr('cy', py)
        .attr('r', 3)
        .attr('fill', COLOR.ink);
      if (isGeneral) {
        layerNote
          .append('text')
          .attr('x', px - 8)
          .attr('y', py - 8)
          .attr('text-anchor', 'end')
          .attr('class', 'series-note')
          .text(`${nf.format(peak.value)} % · ${monthLabel(months[peak.index])}`);
      }
    }

    svg.attr(
      'aria-label',
      `Variación anual del IPC, ${key === 'general' ? 'índice general' : series[key] ? key : ''}, de ${monthLabel(months[0])} a ${monthLabel(months.at(-1))}.`
    );
  }

  // Hover
  overlay
    .on('mousemove', (event) => {
      const [mx, my] = d3.pointer(event, host);
      const rel = mx - MARGIN.left;
      if (rel < 0 || rel > innerW) return;

      const step = months.length > 1 ? innerW / (months.length - 1) : innerW;
      const idx = Math.max(0, Math.min(months.length - 1, Math.round(rel / step)));
      const ym = months[idx];

      const gVal = series.general[idx];
      const aVal = series[current][idx];

      rule
        .attr('x1', MARGIN.left + x(ym))
        .attr('x2', MARGIN.left + x(ym))
        .attr('opacity', 0.35);

      const rows = [`<strong>${monthLabel(ym)}</strong>`];
      rows.push(
        `<span><i style="background:${COLOR.general}"></i>General ${gVal == null ? '—' : fmtPct(gVal)}</span>`
      );
      if (current !== 'general') {
        rows.push(
          `<span><i style="background:${COLOR.warm}"></i>${current} ${aVal == null ? '—' : fmtPct(aVal)}</span>`
        );
      }

      tooltip
        .attr('hidden', null)
        .style('left', `${Math.min(width - 200, Math.max(8, MARGIN.left + x(ym) + 14))}px`)
        .style('top', `${Math.max(8, my - 60)}px`)
        .html(rows.join(''));
    })
    .on('mouseleave', () => {
      tooltip.attr('hidden', true);
      rule.attr('opacity', 0);
    });

  // Selector
  if (select) {
    for (const key of groups) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = key;
      select.append(option);
    }
    select.addEventListener('change', () => {
      draw(select.value, !reduceMotion);
    });
  }

  // Responsive
  let resizeTimer;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (Math.abs(host.clientWidth - width) > 8) {
        layout();
        draw(current, false);
      }
    }, 120);
  });
  observer.observe(host);

  layout();
  draw('general', false);
}
