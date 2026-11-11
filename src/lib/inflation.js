import * as d3 from 'd3';
// d3-transition se registra como efecto secundario sobre Selection.prototype.
// Sin este import explícito, el bundler lo elimina y .transition() no existe.
import 'd3-transition';

const COLOR = {
  warm: '#b4553f',
  cool: '#3d6b8c',
  ink: '#1d1d1b',
  muted: '#7a7873',
};

const ROW_H_BASE = 46;
const TOP = 30;
const MARGIN = { bottom: 44 };
const BAR_H = 16;

const nf = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fmtPct = (v) => `${v > 0 ? '+' : ''}${nf.format(v)} %`;
const fmtPctPlain = (v) => `${nf.format(v)} %`;

export function initInflation() {
  const dataEl = document.getElementById('inflacion-data');
  const host = document.querySelector('[data-chart-bars]');
  if (!dataEl || !host) return;

  const data = JSON.parse(dataEl.textContent);
  const { groups, general, years } = data;
  const refYear = data.reference?.year ?? null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = d3.select(host).append('svg').attr('role', 'img');
  const layerBars = svg.append('g');
  const layerAxis = svg.append('g');
  const layerRef = svg.append('g');

  const tooltip = d3
    .select(host)
    .append('div')
    .attr('class', 'inflacion-tooltip')
    .attr('hidden', true);

  let width = 0;
  let height = 0;
  let labelW = 0;
  let valueW = 58;
  let ROW_H = ROW_H_BASE;
  let x;
  let yFor;
  let current = years.includes(2019) ? '2019' : String(years.at(-1));

  const sortedFor = (year) =>
    [...groups].sort((a, b) => b.byYear[year] - a.byYear[year]);

  // Azul solo para variaciones negativas. Todo lo que sube va en rojo, esté por
  // encima o por debajo de la media; la línea de referencia marca la media.
  const colourFor = (year, d) => (d.byYear[year] < 0 ? COLOR.cool : COLOR.warm);

  function domainFor(year) {
    const values = groups.map((d) => d.byYear[year]);
    const lo = Math.min(0, d3.min(values));
    const hi = Math.max(d3.max(values), general[year]);
    return [lo, hi];
  }

  function layout() {
    width = Math.max(300, host.clientWidth);
    ROW_H = width > 900 ? 54 : ROW_H_BASE;
    labelW = width < 560 ? 118 : width > 900 ? 250 : 210;
    valueW = width < 560 ? 54 : 70;

    const plotTop = TOP;
    const plotHeight = groups.length * ROW_H;
    height = plotTop + plotHeight + MARGIN.bottom;

    yFor = (i) => plotTop + i * ROW_H;

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);
  }

  function draw(year, animate = true, stagger = false) {
    current = year;

    const rows = sortedFor(year);
    const domain = domainFor(year);

    x = d3
      .scaleLinear()
      .domain(domain)
      .range([labelW, width - valueW])
      .nice();

    const barCenter = ROW_H / 2;

    const row = layerBars
      .selectAll('g.row')
      .data(rows, (d) => d.name)
      .join(
        (enter) => {
          const g = enter
            .append('g')
            .attr('class', 'row')
            .attr('transform', (d, i) => `translate(0,${yFor(i)})`);

          g.append('rect')
            .attr('class', 'bar')
            .attr('y', barCenter - BAR_H / 2)
            .attr('height', BAR_H)
            .attr('rx', 3)
            .attr('x', x(0))
            .attr('width', 0);

          g.append('text')
            .attr('class', 'row-name')
            .attr('x', 0)
            .attr('y', barCenter - 5);

          g.append('text')
            .attr('class', 'row-weight')
            .attr('x', 0)
            .attr('y', barCenter + 13);

          g.append('text')
            .attr('class', 'row-value')
            .attr('text-anchor', 'end')
            .attr('x', width - 4)
            .attr('y', barCenter + 4);

          return g;
        },
        (update) => update,
        (exit) => exit.remove()
      )
      .order();

    row
      .select('rect.bar')
      .transition()
      .duration(animate ? 320 : 0)
      .delay(stagger ? (d, i) => i * 22 : 0)
      .attr('x', (d) => (d.byYear[year] >= 0 ? x(0) : x(d.byYear[year])))
      .attr('width', (d) => Math.max(2, Math.abs(x(d.byYear[year]) - x(0))))
      .attr('fill', (d) => colourFor(year, d));

    row
      .select('text.row-name')
      .text((d) => d.short)
      .attr('fill', COLOR.ink);

    row
      .select('text.row-weight')
      .text((d) => (width < 560 ? `${fmtPctPlain(d.weight)}` : `${fmtPctPlain(d.weight)} de la cesta`))
      .attr('fill', COLOR.muted);

    row
      .select('text.row-value')
      .attr('x', width - 4)
      .text((d) => fmtPct(d.byYear[year]))
      .attr('fill', (d) => colourFor(year, d));

    row
      .transition()
      .duration(animate ? 320 : 0)
      .attr('transform', (d, i) => `translate(0,${yFor(i)})`);

    // Eje
    const axisY = TOP + groups.length * ROW_H + 6;
    const axis = d3
      .axisBottom(x)
      .ticks(4)
      .tickFormat((d) => `${d} %`)
      .tickSize(-(groups.length * ROW_H));

    layerAxis
      .attr('transform', `translate(0,${axisY})`)
      .transition()
      .duration(animate ? 200 : 0)
      .call(axis);

    // Línea de referencia: media general del año elegido
    const refValue = general[year];
    const refX = x(refValue);
    const refY1 = TOP - 6;
    const refY2 = TOP + groups.length * ROW_H;

    layerRef.selectAll('*').remove();

    layerRef
      .append('line')
      .attr('x1', refX)
      .attr('x2', refX)
      .attr('y1', refY1)
      .attr('y2', refY2)
      .attr('stroke', COLOR.ink)
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '4 4')
      .attr('opacity', 0.55);

    const labelText = `Media ${fmtPctPlain(refValue)}`;
    const labelRight = refX + 8 + labelText.length * 5.4 > width - valueW;

    layerRef
      .append('text')
      .attr('class', 'ref-label')
      .attr('x', labelRight ? refX - 8 : refX + 8)
      .attr('y', refY1 + 2)
      .attr('text-anchor', labelRight ? 'end' : 'start')
      .text(labelText);

    svg.attr(
      'aria-label',
      `Variación de septiembre de ${refYear} frente a septiembre de ${year} por grupos de consumo. La media general es ${fmtPctPlain(refValue)}.`
    );

    const select = document.querySelector('[data-year-select]');
    if (select && select.value !== year) select.value = year;
  }

  // Interacción con filas
  layerBars
    .on('mousemove', function (event) {
      const bar = event.target.closest?.('g.row');
      if (!bar) return;
      const d = d3.select(bar).datum();
      if (!d) return;

      const [mx, my] = d3.pointer(event, host);
      const diff = d.byYear[current] - general[current];
      const sign = diff >= 0 ? 'por encima' : 'por debajo';

      tooltip
        .attr('hidden', null)
        .style('left', `${Math.min(width - 210, Math.max(8, mx + 14))}px`)
        .style('top', `${Math.max(8, my - 70)}px`)
        .html(
          `<strong>${d.name}</strong>` +
            `<span>${fmtPct(d.byYear[current])} frente a ${current}</span>` +
            `<span>${nf.format(d.weight)} % de la cesta</span>` +
            `<span>${nf.format(Math.abs(diff))} pp ${sign} de la media</span>`
        );
    })
    .on('mouseleave', () => tooltip.attr('hidden', true));

  // Selector de año
  document.querySelector('[data-year-select]')?.addEventListener('change', (event) => {
    const year = event.target.value;
    if (!year || year === current) return;
    draw(year, !reduceMotion);
  });

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
  draw(current, !reduceMotion, !reduceMotion);
}
