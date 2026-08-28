// Interactive power/speed/HR chart for placing "working set" segments on a ride — the piece the
// working-set editor (js/components/workingSetEditor.js) builds its UI around. Two panes:
//   - a full-ride overview strip with a draggable/resizable window controlling what the detail
//     pane shows (pan = drag the window body, zoom = drag its edge handles)
//   - a larger detail chart (power/speed/HR, each normalized to the *visible* window's own data)
//     with two draggable handles per segment marking its start/end
// Segment drag-handles live only on the detail pane and the window lives only on the overview —
// each pane's draggable elements are structurally disjoint, so no gesture disambiguation is
// needed between "panning/zooming" and "editing a segment".
//
// No charting library (project convention, see components/seriesChart.js) — hand-rolled SVG for
// the read-only polylines, plain absolutely-positioned divs (not SVG) for anything draggable, so
// hit-testing/dragging stays in ordinary CSS-pixel space instead of SVG viewBox coordinates.
//
// Rendering during a drag is imperative (direct attribute/style mutation on already-created
// nodes), not a rebuild-from-scratch — see renderDetail() vs. the lighter repositionSegment() —
// and the `onSegmentsChange` callback is coalesced to one call per animation frame. Nothing here
// ever touches js/state.js: this component is purely local state until the editor's Save button
// reads it back out via `getSegments()`.

import { escapeHtml } from '../domUtils.js';
import { formatClock } from '../dateUtils.js';

const MIN_WINDOW_SPAN_SEC = 15;
const MIN_SEGMENT_GAP_SEC = 5;
const DETAIL_W = 600, DETAIL_H = 160, DETAIL_PAD = DETAIL_H * 0.08;
const OVERVIEW_W = 600, OVERVIEW_H = 60;

// The three lines the detail pane can show — also drives the clickable legend below, which
// toggles each one's `visible` entry on/off. The overview strip always shows power only, as
// fixed ride-shape context, so it isn't affected by these toggles.
const METRICS = [
  { key: 'powerW', cls: 'ws-line-power', swatchCls: 'ws-swatch-power', label: 'Power' },
  { key: 'speedKmh', cls: 'ws-line-speed', swatchCls: 'ws-swatch-speed', label: 'Speed' },
  { key: 'hrBpm', cls: 'ws-line-hr', swatchCls: 'ws-swatch-hr', label: 'Heart rate' },
];

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function formatMetricValue(key, v) {
  if (v == null) return null;
  if (key === 'powerW') return `${Math.round(v)}W`;
  if (key === 'speedKmh') return `${v.toFixed(1)}km/h`;
  if (key === 'hrBpm') return `${Math.round(v)}bpm`;
  return String(v);
}

/**
 * @param {object} series  ride's downsampled series (js/seriesUtils.js) — {tSec, powerW, hrBpm, speedKmh}
 * @param {{id:string, label:string, startSec:number, endSec:number}[]} segments  initial segments
 * @param {(segments:object[])=>void} [onSegmentsChange]  fired (rAF-coalesced) whenever a drag moves a handle
 * @returns {{el:HTMLElement, addSegment:(seg:object)=>void, removeSegment:(id:string)=>void, getSegments:()=>object[]}}
 */
export function buildWorkingSetChart({ series, segments, onSegmentsChange }) {
  const tSec = series.tSec;
  const tMin = tSec[0];
  const tMax = tSec[tSec.length - 1];
  const fullSpan = Math.max(tMax - tMin, 1);

  let segs = (segments || []).map((s) => ({ ...s }));
  let zoomStart = tMin;
  let zoomEnd = tMax;
  // Which of the three detail-pane lines are currently shown — toggled by clicking the matching
  // legend button (all on by default). Purely a display filter; never affects stored segment data.
  const visible = { powerW: true, speedKmh: true, hrBpm: true };

  const root = document.createElement('div');
  root.className = 'ws-chart';
  root.innerHTML = `
    <div class="ws-legend">
      ${METRICS.map(({ key, swatchCls, label }) => `
        <button type="button" class="ws-legend-item" data-metric="${key}" aria-pressed="true">
          <span class="ws-legend-swatch ${swatchCls}"></span>${label}
        </button>
      `).join('')}
    </div>
    <div class="ws-detail">
      <svg class="ws-detail-svg" viewBox="0 0 ${DETAIL_W} ${DETAIL_H}" preserveAspectRatio="none" role="img" aria-label="Ride detail chart, drag segment handles to mark the working set"></svg>
      <div class="ws-detail-overlay"></div>
      <div class="ws-value-tooltip" hidden></div>
    </div>
    <div class="ws-overview">
      <svg class="ws-overview-svg" viewBox="0 0 ${OVERVIEW_W} ${OVERVIEW_H}" preserveAspectRatio="none" role="img" aria-label="Full ride overview, drag to zoom the detail chart above"></svg>
      <div class="ws-window">
        <div class="ws-window-handle ws-window-handle-left" data-edge="start"></div>
        <div class="ws-window-handle ws-window-handle-right" data-edge="end"></div>
      </div>
    </div>
  `;

  const legendEl = root.querySelector('.ws-legend');
  const detailEl = root.querySelector('.ws-detail');
  const detailSvg = root.querySelector('.ws-detail-svg');
  const detailOverlay = root.querySelector('.ws-detail-overlay');
  const tooltipEl = root.querySelector('.ws-value-tooltip');
  const overviewEl = root.querySelector('.ws-overview');
  const overviewSvg = root.querySelector('.ws-overview-svg');
  const windowEl = root.querySelector('.ws-window');

  // Index of the series sample closest to time `t` (tSec is sorted ascending) — used to read off
  // the "local" values shown in the drag tooltip below, which are point samples, not averages.
  function nearestIndex(t) {
    if (!tSec.length) return null;
    let lo = 0, hi = tSec.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tSec[mid] < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(tSec[lo - 1] - t) < Math.abs(tSec[lo] - t)) return lo - 1;
    return lo;
  }

  // Small value readout that follows a segment handle while it's being dragged — shows the clock
  // position plus each currently-visible metric's value AT that exact point, so the user can see
  // precisely what they're aligning the handle to (e.g. "12:34 · 312W · 34.2km/h · 154bpm").
  function showValueTooltip(t) {
    const idx = nearestIndex(t);
    if (idx == null) { tooltipEl.hidden = true; return; }
    const parts = METRICS
      .filter(({ key }) => visible[key])
      .map(({ key }) => formatMetricValue(key, series[key]?.[idx]))
      .filter(Boolean);
    tooltipEl.hidden = false;
    tooltipEl.textContent = [formatClock(t), ...parts].join(' · ');
    const span = Math.max(zoomEnd - zoomStart, 1);
    const frac = clamp((t - zoomStart) / span, 0.06, 0.94); // nudge in from the edges so the bubble stays fully visible
    tooltipEl.style.left = `${frac * 100}%`;
  }

  function hideValueTooltip() {
    tooltipEl.hidden = true;
  }

  // Clicking a legend item shows/hides that metric's line in the detail pane above (the overview
  // strip is untouched — it's fixed power-only ride-shape context, not part of what's toggled).
  legendEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.ws-legend-item');
    if (!btn) return;
    const key = btn.dataset.metric;
    visible[key] = !visible[key];
    btn.classList.toggle('inactive', !visible[key]);
    btn.setAttribute('aria-pressed', String(visible[key]));
    renderDetail();
  });

  function notifyChange() {
    onSegmentsChange?.(segs.map((s) => ({ ...s })));
  }

  // ---- overview: static full-ride power line, drawn once ----
  function renderOverviewLine() {
    const pts = tSec.map((t, i) => ({ t, v: series.powerW?.[i] })).filter((p) => p.v != null);
    if (pts.length < 2) return;
    const minV = Math.min(...pts.map((p) => p.v));
    const maxV = Math.max(...pts.map((p) => p.v));
    const vSpan = Math.max(maxV - minV, 1);
    const coords = pts.map((p) => [
      ((p.t - tMin) / fullSpan) * OVERVIEW_W,
      OVERVIEW_H - ((p.v - minV) / vSpan) * OVERVIEW_H,
    ]);
    const polyStr = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    overviewSvg.innerHTML = `<polyline points="${polyStr}" class="ws-overview-line"></polyline>`;
  }

  function renderWindow() {
    const leftPct = ((zoomStart - tMin) / fullSpan) * 100;
    const widthPct = ((zoomEnd - zoomStart) / fullSpan) * 100;
    windowEl.style.left = `${leftPct}%`;
    windowEl.style.width = `${widthPct}%`;
  }

  // ---- detail: rebuilt whenever the visible window changes (zoom/pan) or segments are added/removed ----
  function buildLine(key, cls, visIdx, xOf) {
    const chartH = DETAIL_H - DETAIL_PAD * 2;
    const pts = visIdx.map((i) => ({ t: tSec[i], v: series[key]?.[i] })).filter((p) => p.v != null);
    if (pts.length < 2) return '';
    const minV = Math.min(...pts.map((p) => p.v));
    const maxV = Math.max(...pts.map((p) => p.v));
    const vSpan = Math.max(maxV - minV, 1);
    const coords = pts.map((p) => [xOf(p.t), DETAIL_PAD + chartH - ((p.v - minV) / vSpan) * chartH]);
    const polyStr = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return `<polyline points="${polyStr}" class="${cls}"></polyline>`;
  }

  function renderDetail() {
    const visIdx = [];
    tSec.forEach((t, i) => { if (t >= zoomStart && t <= zoomEnd) visIdx.push(i); });
    const span = Math.max(zoomEnd - zoomStart, 1);
    const xOf = (t) => ((t - zoomStart) / span) * DETAIL_W;

    detailSvg.innerHTML = METRICS
      .filter(({ key }) => visible[key])
      .map(({ key, cls }) => buildLine(key, cls, visIdx, xOf))
      .join('');

    detailOverlay.innerHTML = segs.map((seg, i) => {
      // Cycle a small fixed palette across segments purely so adjacent ones are visually
      // distinguishable — not tied to segment identity/order in any persisted way.
      const colorClass = `ws-seg-color-${i % 3}`;
      return `
      <div class="ws-segment-fill ${colorClass}" data-seg-id="${seg.id}">
        <span class="ws-segment-label" data-seg-id="${seg.id}">${escapeHtml(seg.label || '')}</span>
      </div>
      <div class="ws-detail-handle ${colorClass}" data-seg-id="${seg.id}" data-edge="start" tabindex="0" role="slider" aria-label="${escapeHtml(seg.label || 'Segment')} start"></div>
      <div class="ws-detail-handle ${colorClass}" data-seg-id="${seg.id}" data-edge="end" tabindex="0" role="slider" aria-label="${escapeHtml(seg.label || 'Segment')} end"></div>
    `;
    }).join('');
    segs.forEach((seg) => repositionSegment(seg.id));
  }

  function repositionSegment(segId) {
    const seg = segs.find((s) => s.id === segId);
    if (!seg) return;
    const span = Math.max(zoomEnd - zoomStart, 1);
    const startFrac = (seg.startSec - zoomStart) / span;
    const endFrac = (seg.endSec - zoomStart) / span;
    const fill = detailOverlay.querySelector(`.ws-segment-fill[data-seg-id="${cssEscape(segId)}"]`);
    const hStart = detailOverlay.querySelector(`.ws-detail-handle[data-seg-id="${cssEscape(segId)}"][data-edge="start"]`);
    const hEnd = detailOverlay.querySelector(`.ws-detail-handle[data-seg-id="${cssEscape(segId)}"][data-edge="end"]`);
    if (fill) {
      fill.style.left = `${startFrac * 100}%`;
      fill.style.width = `${Math.max(0, endFrac - startFrac) * 100}%`;
    }
    if (hStart) hStart.style.left = `${startFrac * 100}%`;
    if (hEnd) hEnd.style.left = `${endFrac * 100}%`;
  }

  // ---- overview drag: pan (window body) or resize (edge handles) = change zoomStart/zoomEnd ----
  function computeNewWindow(mode, s0, e0, dt) {
    let s = s0, e = e0;
    if (mode === 'pan') {
      s = s0 + dt; e = e0 + dt;
      if (s < tMin) { e += (tMin - s); s = tMin; }
      if (e > tMax) { s -= (e - tMax); e = tMax; }
      s = clamp(s, tMin, tMax); e = clamp(e, tMin, tMax);
    } else if (mode === 'resize-start') {
      s = clamp(s0 + dt, tMin, e0 - MIN_WINDOW_SPAN_SEC);
    } else {
      e = clamp(e0 + dt, s0 + MIN_WINDOW_SPAN_SEC, tMax);
    }
    return { start: s, end: e };
  }

  windowEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.ws-window-handle');
    const mode = handle ? (handle.dataset.edge === 'start' ? 'resize-start' : 'resize-end') : 'pan';
    const target = handle || windowEl;
    target.setPointerCapture(e.pointerId);
    const rect = overviewEl.getBoundingClientRect();
    const startX = e.clientX;
    const startZoomStart = zoomStart, startZoomEnd = zoomEnd;
    let raf = null;

    function onMove(ev) {
      const dt = ((ev.clientX - startX) / rect.width) * fullSpan;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const next = computeNewWindow(mode, startZoomStart, startZoomEnd, dt);
        zoomStart = next.start; zoomEnd = next.end;
        renderWindow();
        renderDetail();
      });
    }
    function onUp() {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    }
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    e.preventDefault();
  });

  // ---- detail handle drag: move one segment's start/end (delegated — handles are re-created on
  // every renderDetail(), so a single listener on the stable overlay avoids re-wiring per handle) ----
  detailOverlay.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.ws-detail-handle');
    if (!handle) return;
    const seg = segs.find((s) => s.id === handle.dataset.segId);
    if (!seg) return;
    const edge = handle.dataset.edge;
    handle.setPointerCapture(e.pointerId);
    const rect = detailEl.getBoundingClientRect();
    let raf = null;

    showValueTooltip(edge === 'start' ? seg.startSec : seg.endSec);

    function onMove(ev) {
      const frac = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
      const t = zoomStart + frac * (zoomEnd - zoomStart);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const tc = clamp(t, tMin, tMax);
        if (edge === 'start') seg.startSec = clamp(tc, tMin, seg.endSec - MIN_SEGMENT_GAP_SEC);
        else seg.endSec = clamp(tc, seg.startSec + MIN_SEGMENT_GAP_SEC, tMax);
        repositionSegment(seg.id);
        showValueTooltip(edge === 'start' ? seg.startSec : seg.endSec);
        notifyChange();
      });
    }
    function onUp() {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      hideValueTooltip();
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
    e.preventDefault();
  });

  renderOverviewLine();
  renderWindow();
  renderDetail();

  return {
    el: root,
    addSegment(seg) {
      segs.push({ ...seg });
      renderDetail();
      notifyChange();
    },
    removeSegment(id) {
      segs = segs.filter((s) => s.id !== id);
      renderDetail();
      notifyChange();
    },
    /** Cheap label-only update (no reposition) — used as the user types in the editor's segment list. */
    renameSegment(id, label) {
      const seg = segs.find((s) => s.id === id);
      if (!seg) return;
      seg.label = label;
      const labelEl = detailOverlay.querySelector(`.ws-segment-label[data-seg-id="${cssEscape(id)}"]`);
      if (labelEl) labelEl.textContent = label;
    },
    getSegments() {
      return segs.map((s) => ({ ...s }));
    },
    /** ride's [tMin, tMax] plus the currently visible [zoomStart, zoomEnd] — the editor uses this
     *  to size/center a sensible default new-segment width relative to what's on screen. */
    getBounds() {
      return { tMin, tMax, zoomStart, zoomEnd };
    },
  };
}

// data-seg-id values are our own `uid('seg')`-generated ids (safe charset), but escape defensively
// since they're interpolated into an attribute-value CSS selector.
function cssEscape(str) {
  return String(str).replace(/["\\]/g, '\\$&');
}
