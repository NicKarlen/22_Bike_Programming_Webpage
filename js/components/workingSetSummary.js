// Read-only "Working set" section for the workout detail Done tab (js/components/workoutDetail.js)
// — shows each matched ride's user-placed segments (js/components/workingSetEditor.js) with their
// computed averages, alongside (never replacing) the existing whole-ride comparison block. When
// 2+ matched rides each have segments they're listed under their own subheading with no combined
// total, mirroring buildPerRideBreakdown's per-ride layout in workoutDetail.js.

import { escapeHtml } from '../domUtils.js';
import { formatClock } from '../dateUtils.js';
import { buildWorkingSetBreakdown } from '../workingSetUtils.js';

/** @param {object[]} activities  activities matched to one workout */
export function buildWorkingSetSectionHtml(activities) {
  const breakdown = buildWorkingSetBreakdown(activities);
  if (!breakdown.length) return '';

  const rides = breakdown.map(({ activity, segments }) => `
    ${breakdown.length > 1 ? `<div class="ws-summary-ride-name">${escapeHtml(activity.activityName || 'Ride')}</div>` : ''}
    <div class="ws-summary-rows">${segments.map(segmentRowHtml).join('')}</div>
  `).join('');

  return `<div class="detail-section"><h3>Working set</h3>${rides}</div>`;
}

function segmentRowHtml({ segment, stats }) {
  return `
    <div class="ws-summary-row">
      <span class="ws-summary-label">${escapeHtml(segment.label || 'Segment')}</span>
      <span class="stat-pills">${statPillsHtml(stats)}</span>
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
