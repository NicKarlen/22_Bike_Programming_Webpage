// Small hand-rolled inline-SVG bar chart for the Dashboard's weekly distance trend.
// No charting library in this project (zero dependencies by design) — this stays dependency-free
// and theme-aware via the app's existing CSS custom properties (see css/components.css).

export function buildWeeklyChart(weeklySeries, { unit = 'km' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'weekly-chart';

  if (!weeklySeries.length || weeklySeries.every((w) => w.distanceKm === 0)) {
    wrap.innerHTML = '<p class="empty-hint">No ride data in this range yet.</p>';
    return wrap;
  }

  const n = weeklySeries.length;
  const barW = 28, gap = 14, chartH = 110, padTop = 18, padBottom = 22;
  const w = n * (barW + gap) + gap;
  const h = chartH + padTop + padBottom;
  const max = Math.max(...weeklySeries.map((s) => s.distanceKm), 1);

  const bars = weeklySeries.map((s, i) => {
    const x = gap + i * (barW + gap);
    const barH = Math.max(2, (s.distanceKm / max) * chartH);
    const y = padTop + (chartH - barH);
    const dateLabel = formatShortDate(s.weekStart);
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" class="bar"><title>Week of ${dateLabel}: ${s.distanceKm}${unit}</title></rect>
        ${s.distanceKm > 0 ? `<text x="${x + barW / 2}" y="${y - 4}" class="bar-value" text-anchor="middle">${s.distanceKm}</text>` : ''}
        <text x="${x + barW / 2}" y="${h - 6}" class="axis-label" text-anchor="middle">${dateLabel}</text>
      </g>`;
  }).join('');

  // Explicit width/height (not just viewBox) so the chart renders at its natural, fixed-bar-size
  // dimensions — the CSS then only ever scales it *down* to fit a narrow card, never stretches it
  // up to fill one. Without this, a short series (few bars => narrow viewBox) stretched to 100%
  // card width would drag its height up proportionally too, ballooning the chart.
  wrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Weekly distance trend">${bars}</svg>`;
  return wrap;
}

function formatShortDate(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}
