// Read-only "Working set" section for the workout detail Done tab (js/components/workoutDetail.js)
// — shows each matched ride's user-placed segments (js/components/workingSetEditor.js) with their
// computed averages, alongside (never replacing) the existing whole-ride comparison block, plus an
// Edit/Select button per ride that jumps straight into the editor (wired up by workoutDetail.js's
// `onEditWorkingSet`, since this module only returns markup — see its data-action convention).
// One ride per matched activity, always shown (even with zero segments yet) so this doubles as the
// entry point for setting a working set up in the first place, not just editing an existing one.
// When 2+ matched rides are shown they're listed under their own subheading with no combined
// total, mirroring buildPerRideBreakdown's per-ride layout in workoutDetail.js.

import { escapeHtml, escapeAttr } from '../domUtils.js';
import { formatClock } from '../dateUtils.js';
import { computeSegmentStats, computeAggregateStats } from '../workingSetUtils.js';

/** @param {object[]} activities  activities matched to one workout */
export function buildWorkingSetSectionHtml(activities) {
  const list = activities || [];
  if (!list.length) return '';

  const rides = list.map((activity) => {
    const segments = activity.workingSet?.segments || [];
    const body = segments.length
      ? `<div class="ws-summary-rows">
          ${segments.map((segment) => segmentRowHtml(segment, computeSegmentStats(activity.series, segment))).join('')}
          ${segments.length > 1 ? aggregateRowHtml(computeAggregateStats(activity.series, segments), segments.length) : ''}
        </div>`
      : '<p class="empty-hint ws-summary-empty">No working set selected for this ride yet.</p>';

    return `
      <div class="ws-summary-ride">
        ${list.length > 1 ? `<div class="ws-summary-ride-name">${escapeHtml(activity.activityName || 'Ride')}</div>` : ''}
        ${body}
        <button type="button" class="btn btn-secondary ws-summary-edit-btn" data-action="edit-working-set" data-activity-id="${escapeAttr(activity.id)}">
          ${segments.length ? 'Edit working set' : 'Select working set'}
        </button>
      </div>
    `;
  }).join('');

  return `<div class="detail-section"><h3>Working set</h3>${rides}</div>`;
}

function segmentRowHtml(segment, stats) {
  return `
    <div class="ws-summary-row">
      <span class="ws-summary-label">${escapeHtml(segment.label || 'Segment')}</span>
      <span class="stat-pills">${statPillsHtml(stats)}</span>
    </div>
  `;
}

// Combined average across all of this ride's segments (e.g. all five bouts of a 5x5min
// interval session together) — only shown once there's more than one segment to combine.
function aggregateRowHtml(aggregate, segmentCount) {
  return `
    <div class="ws-summary-row ws-summary-row-aggregate">
      <span class="ws-summary-label">All ${segmentCount} segments</span>
      <span class="stat-pills">${statPillsHtml(aggregate)}</span>
    </div>
  `;
}

function statPillsHtml(stats) {
  if (!stats) return '<span class="stat-pill">No data in range</span>';
  return [
    `<span class="stat-pill">${formatClock(stats.durationSec)}</span>`,
    stats.avgPowerW != null ? `<span class="stat-pill">${stats.avgPowerW}W</span>` : '',
    stats.avgHR != null ? `<span class="stat-pill">HR ${stats.avgHR}</span>` : '',
    stats.avgSpeedKmh != null ? `<span class="stat-pill">${stats.avgSpeedKmh} km/h</span>` : '',
  ].filter(Boolean).join('');
}
