import * as d3 from 'd3';

const COLOR = {
  male: '#3d6b8c',
  female: '#b45c7d',
  ghost: '#8a8a86',
  ink: '#1d1d1b',
  muted: '#7a7873',
  grid: '#d9d6cf',
};

const MARGIN = { top: 64, right: 28, bottom: 54, left: 28 };
const CENTER_GAP = 30;
const STEP_MS = 150;
const FADE_MS = 90;

const fmtInt = d3.format(',');
const fmtPct = (v) => `${d3.format('.1f')(v).replace('.', ',')} %`;
const fmtShort = d3.format('.2s');

function statsFor(data, i) {
  const ages = data.ages;
  const m = data.male[i];
  const f = data.female[i];

  let total = 0;
  let young = 0;
  let old = 0;
  let modalAge = ages[0];
  let modalValue = -1;

  for (let k = 0; k < ages.length; k += 1) {
    const age = ages[k];
    const v = m[k] + f[k];
    total += v;
    if (age <= 14) young += v;
    if (age >= 65) old += v;
    if (v > modalValue) {
      modalValue = v;
      modalAge = age;
    }
  }

  return {
    total,
    young: (100 * young) / total,
    old: (100 * old) / total,
    modalAge,
  };
}

export function initPyramid() {
  const dataEl = document.getElementById('piramide-data');
  const host = document.querySelector('[data-chart]');
  if (!dataEl || !host) return;

  const data = JSON.parse(dataEl.textContent);
  const years = data.years;
  const ages = data.ages;
  const last = years.length - 1;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const svg = d3.select(host).append('svg').attr('role', 'img');

  const layerGrid = svg.append('g');
  const layerGhost = svg.append('g');
  const layerBars = svg.append('g');
  const layerLabels = svg.append('g');

  const tooltip = d3.select(host).append('div').attr('class', 'pyramid-tooltip').attr('hidden', true);
  const highlight = svg.append('rect').attr('class', 'pyramid-highlight').attr('opacity', 0);

  let width = 0;
  let height = 0;
  let xMale;
  let xFemale;
  let y;
  let rowCenters = [];
  let barWidth = 0;
  let frame = 0;
  let timer = null;

  const maxValue = d3.max([...data.male.flat(), ...data.female.flat()]);

  const maleBars = layerBars
    .selectAll('rect.male')
    .data(ages)
    .join('rect')
    .attr('class', 'male')
    .attr('fill', COLOR.male);

  const femaleBars = layerBars
    .selectAll('rect.female')
    .data(ages)
    .join('rect')
    .attr('class', 'female')
    .attr('fill', COLOR.female);

  const ageLabels = layerLabels
    .selectAll('text.age')
    .data(ages)
    .join('text')
    .attr('class', 'age');

  const yearLabel = svg
    .append('text')
    .attr('class', 'pyramid-year')
    .attr('text-anchor', 'middle');

  const legend = layerLabels.append('g').attr('class', 'pyramid-legend');
  const legendItems = [
    { label: 'Hombres', x: 0, anchor: 'start', fill: COLOR.male },
    { label: 'Mujeres', x: 1, anchor: 'end', fill: COLOR.female },
  ];
  const legendNodes = legend
    .selectAll('g')
    .data(legendItems)
    .join('g');
  legendNodes.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', (d) => d.fill);
  legendNodes
    .append('text')
    .text((d) => d.label)
    .attr('x', (d) => (d.anchor === 'start' ? 15 : -15))
    .attr('dy', '0.72em')
    .attr('text-anchor', (d) => d.anchor);

  // Línea del perfil de 1981, como referencia fija detrás del frame actual.
  // Silueta de 1981: área tenue + contorno discontinuo, por encima de las barras.
  const ghostArea = layerGhost.append('g').attr('class', 'ghost-area').attr('fill', COLOR.ghost).attr('fill-opacity', 0.07);
  const ghostAreaMale = ghostArea.append('path');
  const ghostAreaFemale = ghostArea.append('path');
  const ghostMale = layerGhost.append('path').attr('class', 'ghost').attr('fill', 'none');
  const ghostFemale = layerGhost.append('path').attr('class', 'ghost').attr('fill', 'none');

  // El perfil de 1981 va por encima de las barras: si queda detrás, solo se ven
  // los fragmentos donde la silueta antigua sobresale y parece un trazo suelto.
  layerGhost.raise();
  layerLabels.raise();

  const overlay = svg
    .append('rect')
    .attr('class', 'pyramid-overlay')
    .attr('fill', 'transparent');

  function layout() {
    width = Math.max(300, host.clientWidth);
    height = Math.round(Math.min(820, Math.max(420, width * 0.78)));

    const innerHeight = height - MARGIN.top - MARGIN.bottom;
    const cx = width / 2;
    const halfWidth = (width - MARGIN.left - MARGIN.right - CENTER_GAP) / 2;

    xMale = d3.scaleLinear().domain([0, maxValue]).range([cx - CENTER_GAP / 2, cx - CENTER_GAP / 2 - halfWidth]);
    xFemale = d3.scaleLinear().domain([0, maxValue]).range([cx + CENTER_GAP / 2, cx + CENTER_GAP / 2 + halfWidth]);

    y = d3.scaleBand().domain(ages).range([height - MARGIN.bottom, MARGIN.top]).paddingInner(0.18);
    rowCenters = ages.map((a) => y(a) + y.bandwidth() / 2);
    barWidth = y.bandwidth();

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    // Rejilla y etiquetas numéricas
    layerGrid.selectAll('*').remove();
    const gridValues = [maxValue / 2, maxValue].map((v) => Math.round(v));
    for (const v of gridValues) {
      layerGrid
        .append('line')
        .attr('x1', xMale(v))
        .attr('x2', xMale(v))
        .attr('y1', MARGIN.top)
        .attr('y2', height - MARGIN.bottom)
        .attr('stroke', COLOR.grid)
        .attr('stroke-width', 1)
        .attr('opacity', 0.55);
      layerGrid
        .append('line')
        .attr('x1', xFemale(v))
        .attr('x2', xFemale(v))
        .attr('y1', MARGIN.top)
        .attr('y2', height - MARGIN.bottom)
        .attr('stroke', COLOR.grid)
        .attr('stroke-width', 1)
        .attr('opacity', 0.55);

      layerGrid
        .append('text')
        .attr('x', xMale(v))
        .attr('y', height - MARGIN.bottom + 18)
        .attr('text-anchor', 'middle')
        .attr('class', 'pyramid-tick')
        .text(fmtShort(v));
      layerGrid
        .append('text')
        .attr('x', xFemale(v))
        .attr('y', height - MARGIN.bottom + 18)
        .attr('text-anchor', 'middle')
        .attr('class', 'pyramid-tick')
        .text(fmtShort(v));
    }

    layerGrid
      .append('text')
      .attr('x', width / 2)
      .attr('y', height - MARGIN.bottom + 38)
      .attr('text-anchor', 'middle')
      .attr('class', 'pyramid-axis-title')
      .text('habitantes por edad');

    // Etiquetas de edad en el eje central
    const ageStep = height < 520 ? 10 : 5;
    ageLabels
      .attr('x', width / 2)
      .attr('y', (a) => y(a) + y.bandwidth() / 2)
      .attr('dy', '0.32em')
      .text((a) => (a % ageStep === 0 ? a : ''));

    // Leyenda
    legend.attr('transform', `translate(${MARGIN.left}, 16)`);
    legendNodes.attr('transform', (d) => `translate(${d.anchor === 'start' ? 0 : width - MARGIN.left - MARGIN.right}, 0)`);

    // Año grande, esquina superior central
    yearLabel.attr('x', width / 2).attr('y', 50);

    // Perfil 1981
    const value1981 = (sex, a) => data[sex][0][ages.indexOf(a)];
    const cy = (a) => y(a) + y.bandwidth() / 2;

    const lineM = d3.line().x((a) => xMale(value1981('male', a))).y(cy);
    const lineF = d3.line().x((a) => xFemale(value1981('female', a))).y(cy);

    const areaM = d3.area().x0(xMale(0)).x1((a) => xMale(value1981('male', a))).y(cy);
    const areaF = d3.area().x0(xFemale(0)).x1((a) => xFemale(value1981('female', a))).y(cy);

    ghostAreaMale.datum(ages).attr('d', areaM);
    ghostAreaFemale.datum(ages).attr('d', areaF);

    ghostMale.datum(ages).attr('d', lineM).attr('stroke', COLOR.ghost).attr('stroke-width', 1.4).attr('stroke-dasharray', '4 3').attr('stroke-opacity', 0.55);
    ghostFemale.datum(ages).attr('d', lineF).attr('stroke', COLOR.ghost).attr('stroke-width', 1.4).attr('stroke-dasharray', '4 3').attr('stroke-opacity', 0.55);

    overlay.attr('x', MARGIN.left).attr('y', MARGIN.top).attr('width', width - MARGIN.left - MARGIN.right).attr('height', innerHeight);

    highlight.attr('x', MARGIN.left).attr('width', width - MARGIN.left - MARGIN.right).attr('fill', COLOR.ink).attr('opacity', 0);

    drawFrame(frame, 0);
  }

  function drawFrame(i, duration = FADE_MS) {
    frame = i;
    const m = data.male[i];
    const f = data.female[i];
    const transition = d3.transition().duration(duration);

    maleBars
      .transition(transition)
      .attr('x', (a, k) => xMale(m[k]))
      .attr('y', (a) => y(a))
      .attr('width', (a, k) => xMale(0) - xMale(m[k]))
      .attr('height', barWidth);

    femaleBars
      .transition(transition)
      .attr('x', () => xFemale(0))
      .attr('y', (a) => y(a))
      .attr('width', (a, k) => xFemale(f[k]) - xFemale(0))
      .attr('height', barWidth);

    yearLabel.text(years[i]);

    svg.attr(
      'aria-label',
      `Pirámide de población de España en ${years[i]}. Hombres a la izquierda, mujeres a la derecha, edad de 0 a 99 años.`
    );

    const stats = statsFor(data, i);
    document.querySelector('[data-stat="total"]').textContent = fmtInt(stats.total);
    document.querySelector('[data-stat="young"]').textContent = fmtPct(stats.young);
    document.querySelector('[data-stat="old"]').textContent = fmtPct(stats.old);
    document.querySelector('[data-stat="modal"]').textContent = `${stats.modalAge} años`;

    const yearEl = document.querySelector('[data-year]');
    if (yearEl) yearEl.textContent = years[i];

    const slider = document.querySelector('[data-slider]');
    if (slider && Number(slider.value) !== i) slider.value = String(i);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    const btn = document.querySelector('[data-play]');
    if (btn) btn.textContent = 'Reproducir';
    btn?.setAttribute('aria-pressed', 'false');
  }

  function play() {
    if (timer) {
      stop();
      return;
    }
    if (frame >= last) drawFrame(0, 0);
    const btn = document.querySelector('[data-play]');
    if (btn) btn.textContent = 'Pausa';
    btn?.setAttribute('aria-pressed', 'true');

    timer = setInterval(() => {
      if (frame >= last) {
        stop();
        return;
      }
      drawFrame(frame + 1);
    }, STEP_MS);
  }

  // Controles
  document.querySelector('[data-play]')?.addEventListener('click', play);
  document.querySelector('[data-slider]')?.addEventListener('input', (event) => {
    stop();
    drawFrame(Number(event.target.value), 0);
  });

  // Tooltip
  overlay
    .on('mousemove', (event) => {
      const [mx, my] = d3.pointer(event);
      const nearestCenter = d3.least(rowCenters, (c) => Math.abs(c - my));
      const age = ages[rowCenters.indexOf(nearestCenter)];
      if (age == null) return;

      const k = ages.indexOf(age);
      const mVal = data.male[frame][k];
      const fVal = data.female[frame][k];

      highlight.attr('y', y(age)).attr('height', barWidth).attr('opacity', 0.06);

      tooltip
        .attr('hidden', null)
        .style('left', `${Math.min(width - 190, Math.max(8, mx + 14))}px`)
        .style('top', `${Math.max(8, my - 52)}px`)
        .html(
          `<strong>${age} ${age === 1 ? 'año' : 'años'}</strong>` +
            `<span><i style="background:${COLOR.male}"></i>Hombres ${fmtInt(mVal)}</span>` +
            `<span><i style="background:${COLOR.female}"></i>Mujeres ${fmtInt(fVal)}</span>`
        );
    })
    .on('mouseleave', () => {
      tooltip.attr('hidden', true);
      highlight.attr('opacity', 0);
    });

  // Responsive
  let resizeTimer;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (Math.abs(host.clientWidth - width) > 8) layout();
    }, 120);
  });
  observer.observe(host);

  layout();

  if (!reduceMotion) {
    // Arranque suave: un frame y pausa, para no sorprender.
    drawFrame(0, 0);
  }
}
