// Modal body for placing/editing a ride's working-set segments (see js/workingSetUtils.js and
// js/components/workingSetChart.js for the underlying data/chart). Opened both right after
// import and later by clicking an existing ride (js/views/activities.js).
//
// The chart component (`js/components/workingSetChart.js`) is the single source of truth for
// segment state once built — this editor never keeps its own parallel segments array, it always
// reads back through `chart.getSegments()`, so there's nothing to keep in sync by hand.

import { uid } from '../idUtils.js';
import { escapeAttr } from '../domUtils.js';
import { formatClock } from '../dateUtils.js';
import { computeSegmentStats } from '../workingSetUtils.js';
import { buildWorkingSetChart } from './workingSetChart.js';

const DEFAULT_NEW_SEGMENT_SEC = 60;
const MIN_NEW_SEGMENT_SEC = 10; // keep new segments comfortably above the chart's own drag-gap floor

/**
 * @param {object} activity
 * @param {(segments:object[])=>void} onSave  called with the final segments array on Save only —
 *   closing/cancelling the modal never calls this (see openModal's `onClose` for that path).
 */
export function buildWorkingSetEditor({ activity, onSave }) {
  const wrap = document.createElement('div');
  wrap.className = 'ws-editor';

  const series = activity.series;
  if (!series?.tSec || series.tSec.length < 2) {
    wrap.innerHTML = '<p class="empty-hint">This ride has no detailed chart data to pick a working set from.</p>';
    return wrap;
  }

  wrap.innerHTML = `
    <div class="ws-chart-slot"></div>
    <div class="ws-toolbar">
      <button type="button" class="btn btn-secondary" data-action="add">+ Add segment</button>
      <button type="button" class="btn btn-secondary" data-action="full-ride">Use full ride</button>
    </div>
    <p class="empty-hint ws-empty-hint">No segments yet — add one, or use "Use full ride" for a race.</p>
    <div class="ws-segment-list"></div>
    <div class="form-actions">
      <span></span>
      <button type="button" class="btn btn-primary" data-action="save">Save</button>
    </div>
  `;

  const chart = buildWorkingSetChart({
    series,
    segments: activity.workingSet?.segments || [],
    onSegmentsChange: updateSegmentRowStats,
  });
  wrap.querySelector('.ws-chart-slot').appendChild(chart.el);

  const listEl = wrap.querySelector('.ws-segment-list');
  const emptyHint = wrap.querySelector('.ws-empty-hint');

  function statPillsHtml(stats) {
    if (!stats) return '<span class="stat-pill">No data in range</span>';
    return [
      `<span class="stat-pill">${formatClock(stats.durationSec)}</span>`,
      stats.avgPowerW != null ? `<span class="stat-pill">${stats.avgPowerW}W</span>` : '',
      stats.avgHR != null ? `<span class="stat-pill">HR ${stats.avgHR}</span>` : '',
      stats.avgSpeedKmh != null ? `<span class="stat-pill">${stats.avgSpeedKmh} km/h</span>` : '',
    ].filter(Boolean).join('');
  }

  function renderList() {
    const segments = chart.getSegments();
    emptyHint.hidden = segments.length > 0;
    listEl.innerHTML = segments.map((seg) => `
      <div class="ws-segment-row" data-seg-id="${seg.id}">
        <div class="ws-segment-row-top">
          <input type="text" class="ws-segment-label-input" value="${escapeAttr(seg.label || '')}" data-seg-id="${seg.id}" aria-label="Segment label">
          <button type="button" class="btn-icon ws-segment-delete" data-seg-id="${seg.id}" aria-label="Delete segment">✕</button>
        </div>
        <div class="ws-segment-range" data-seg-id="${seg.id}">${formatClock(seg.startSec)}–${formatClock(seg.endSec)}</div>
        <div class="stat-pills ws-stat-pills" data-seg-id="${seg.id}">${statPillsHtml(computeSegmentStats(series, seg))}</div>
      </div>
    `).join('');

    listEl.querySelectorAll('.ws-segment-label-input').forEach((input) => {
      input.addEventListener('input', () => chart.renameSegment(input.dataset.segId, input.value));
    });
    listEl.querySelectorAll('.ws-segment-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        chart.removeSegment(btn.dataset.segId);
        renderList();
      });
    });
  }

  // Lighter than renderList() — called on every drag frame (via the chart's onSegmentsChange),
  // so it only patches each row's existing range/stat text rather than rebuilding the list (which
  // would blur/reset the label <input> if the user happened to be mid-edit on another segment).
  function updateSegmentRowStats() {
    chart.getSegments().forEach((seg) => {
      const rangeEl = listEl.querySelector(`.ws-segment-range[data-seg-id="${cssEscape(seg.id)}"]`);
      const pillsEl = listEl.querySelector(`.ws-stat-pills[data-seg-id="${cssEscape(seg.id)}"]`);
      if (rangeEl) rangeEl.textContent = `${formatClock(seg.startSec)}–${formatClock(seg.endSec)}`;
      if (pillsEl) pillsEl.innerHTML = statPillsHtml(computeSegmentStats(series, seg));
    });
  }

  renderList();

  wrap.querySelector('[data-action="add"]').addEventListener('click', () => {
    const { zoomStart, zoomEnd, tMin, tMax } = chart.getBounds();
    const visibleSpan = zoomEnd - zoomStart;
    const width = Math.max(MIN_NEW_SEGMENT_SEC, Math.min(DEFAULT_NEW_SEGMENT_SEC, visibleSpan * 0.3) || DEFAULT_NEW_SEGMENT_SEC);
    const center = (zoomStart + zoomEnd) / 2;
    chart.addSegment({
      id: uid('seg'),
      label: `Segment ${chart.getSegments().length + 1}`,
      startSec: Math.max(tMin, center - width / 2),
      endSec: Math.min(tMax, center + width / 2),
    });
    renderList();
  });

  wrap.querySelector('[data-action="full-ride"]').addEventListener('click', () => {
    const { tMin, tMax } = chart.getBounds();
    chart.getSegments().forEach((s) => chart.removeSegment(s.id));
    chart.addSegment({ id: uid('seg'), label: 'Full ride', startSec: tMin, endSec: tMax });
    renderList();
  });

  wrap.querySelector('[data-action="save"]').addEventListener('click', () => onSave(chart.getSegments()));

  return wrap;
}

function cssEscape(str) {
  return String(str).replace(/["\\]/g, '\\$&');
}
