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

const MIN_WINDOW_SPAN_SEC = 15;
const MIN_SEGMENT_GAP_SEC = 5;
const DETAIL_W = 600, DETAIL_H = 160, DETAIL_PAD = DETAIL_H * 0.08;
const OVERVIEW_W = 600, OVERVIEW_H = 60;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
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

  const root = document.createElement('div');
  root.className = 'ws-chart';
  root.innerHTML = `
    <div class="ws-legend">
      <span class="ws-legend-item"><span class="ws-legend-swatch ws-swatch-power"></span>Power</span>
      <span class="ws-legend-item"><span class="ws-legend-swatch ws-swatch-speed"></span>Speed</span>
      <span class="ws-legend-item"><span class="ws-legend-swatch ws-swatch-hr"></span>Heart rate</span>
    </div>
    <div class="ws-detail">
      <svg class="ws-detail-svg" viewBox="0 0 ${DETAIL_W} ${DETAIL_H}" preserveAspectRatio="none" role="img" aria-label="Ride detail chart, drag segment handles to mark the working set"></svg>
      <div class="ws-detail-overlay"></div>
    </div>
    <div class="ws-overview">
      <svg class="ws-overview-svg" viewBox="0 0 ${OVERVIEW_W} ${OVERVIEW_H}" preserveAspectRatio="none" role="img" aria-label="Full ride overview, drag to zoom the detail chart above"></svg>
      <div class="ws-window">
        <div class="ws-window-handle ws-window-handle-left" data-edge="start"></div>
        <div class="ws-window-handle ws-window-handle-right" data-edge="end"></div>
      </div>
    </div>
  `;

  const detailEl = root.querySelector('.ws-detail');
  const detailSvg = root.querySelector('.ws-detail-svg');
  const detailOverlay = root.querySelector('.ws-detail-overlay');
  const overviewEl = root.querySelector('.ws-overview');
  const overviewSvg = root.querySelector('.ws-overview-svg');
  const windowEl = root.querySelector('.ws-window');

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

    detailSvg.innerHTML = [
      buildLine('powerW', 'ws-line-power', visIdx, xOf),
      buildLine('speedKmh', 'ws-line-speed', visIdx, xOf),
      buildLine('hrBpm', 'ws-line-hr', visIdx, xOf),
    ].join('');

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
        notifyChange();
      });
    }
    function onUp() {
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
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
