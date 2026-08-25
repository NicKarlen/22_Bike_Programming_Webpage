// Small hand-rolled inline-SVG line/area chart for a single ride's HR/power/elevation-over-time
// series (see js/seriesUtils.js for how that series is built). Follows the same conventions as
// components/weeklyChart.js: viewBox sized from data, width:100% responsive CSS, theming via CSS
// custom properties — no charting library.

import { escapeHtml, escapeAttr } from '../domUtils.js';

/**
 * @param {{tSec:number[], hrBpm:(number|null)[], powerW:(number|null)[], elevationM:(number|null)[]}} series
 * @param {object} opts
 * @param {'hrBpm'|'powerW'|'elevationM'} opts.metric
 * @param {'line'|'area'} [opts.kind]
 * @param {string} [opts.color]  any valid CSS color, incl. var(--...)
 * @param {string} [opts.unit]
 * @param {string} opts.label
 * @returns {HTMLElement|null}  null when this metric has no data at all for this ride
 */
export function buildSeriesChart(series, { metric, kind = 'line', color = 'var(--color-accent)', unit = '', label }) {
  const values = series?.[metric];
  const tSec = series?.tSec;
  if (!values || !tSec || !values.length) return null;

  const points = tSec.map((t, i) => ({ t, v: values[i] })).filter((p) => p.v != null);
  if (points.length < 2) return null;

  const w = 300, h = 90, padTop = 10, padBottom = 4;
  const chartH = h - padTop - padBottom;
  const minV = Math.min(...points.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.v));
  const vSpan = Math.max(maxV - minV, 1);
  const tMin = points[0].t;
  const tSpan = Math.max(points[points.length - 1].t - tMin, 1);

  const coords = points.map((p) => [
    ((p.t - tMin) / tSpan) * w,
    padTop + chartH - ((p.v - minV) / vSpan) * chartH,
  ]);
  const polyStr = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  let shape;
  if (kind === 'area') {
    const baseline = padTop + chartH;
    const firstX = coords[0][0].toFixed(1);
    const lastX = coords[coords.length - 1][0].toFixed(1);
    const pathD = `M${firstX},${baseline} L${polyStr.split(' ').join(' L')} L${lastX},${baseline} Z`;
    shape = `<path d="${pathD}" class="series-area"></path>`;
  } else {
    shape = `<polyline points="${polyStr}" class="series-line"></polyline>`;
  }

  const wrap = document.createElement('div');
  wrap.className = 'series-chart';
  wrap.style.setProperty('--series-color', color);
  wrap.innerHTML = `
    <div class="series-chart-label">${escapeHtml(label)} <span class="series-chart-range">${Math.round(minV)}–${Math.round(maxV)}${unit}</span></div>
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${escapeAttr(label)} over time, ${Math.round(minV)} to ${Math.round(maxV)}${unit}">${shape}</svg>
  `;
  return wrap;
}
