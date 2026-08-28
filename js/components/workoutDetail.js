// Read-only workout detail view, opened when clicking an existing workout card. Splits planned
// targets from actual/logged data into two tabs so "what I planned" and "what I did" are never
// shown mixed together in one wall of fields (see the old workoutForm-as-viewer behavior this
// replaces).

import { formatDisplayDate, formatDuration } from '../dateUtils.js';
import { escapeHtml } from '../domUtils.js';
import { statusLabel, statusGlyph } from '../statusMeta.js';
import { buildTargetChips, buildComparisonBlock } from './comparisonBlock.js';
import { buildWorkingSetSectionHtml } from './workingSetSummary.js';
import { buildSeriesChart } from './seriesChart.js';
import { closeModal } from './modal.js';
import { navigate } from '../router.js';

export function buildWorkoutDetail({ workout, matchEntry, onEdit }) {
  const wrap = document.createElement('div');
  wrap.className = 'workout-detail';

  const status = matchEntry?.completionStatus || 'planned';
  const c = matchEntry?.comparison;
  const hasActual = c && (c.actualDistanceKm != null || c.actualDurationMin != null);

  let activeTab = 'planned';

  wrap.innerHTML = `
    <div class="detail-meta-row">
      <span class="chip chip-type"><span class="type-dot type-${workout.type}"></span>${workout.type.replace('_', ' ')}</span>
      <span class="chip chip-status status-${status}">${statusGlyph(status)} ${statusLabel(status)}</span>
      <span class="detail-date">${formatDisplayDate(workout.date, { year: true })}</span>
    </div>
    <div class="segmented-control">
      <button type="button" class="segment active" data-tab="planned">Planned</button>
      <button type="button" class="segment" data-tab="done">Done</button>
    </div>
    <div class="detail-tab-content"></div>
  `;

  const content = wrap.querySelector('.detail-tab-content');
  const tabButtons = wrap.querySelectorAll('.segment');

  function renderTab() {
    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === activeTab));
    content.innerHTML = activeTab === 'planned' ? plannedTabHtml(workout) : doneTabHtml(c, hasActual, matchEntry);

    if (activeTab === 'planned') {
      content.querySelector('[data-action="edit"]')?.addEventListener('click', onEdit);
    } else {
      content.querySelector('[data-action="go-activities"]')?.addEventListener('click', () => {
        closeModal();
        navigate('/activities');
      });
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderTab();
    });
  });

  renderTab();
  return wrap;
}

function plannedTabHtml(workout) {
  return `
    <div class="detail-title">${escapeHtml(workout.title)}</div>
    ${workout.description ? `<p class="detail-desc">${escapeHtml(workout.description)}</p>` : ''}
    <div class="detail-targets">${buildTargetChips(workout.targets)}</div>
    ${extraTargetRows(workout.targets)}
    ${workout.notes ? `<div class="detail-section"><h3>Notes</h3><p>${escapeHtml(workout.notes)}</p></div>` : ''}
    <button type="button" class="btn btn-secondary" data-action="edit">Edit planned workout</button>
  `;
}

function extraTargetRows(targets) {
  const rows = [
    targets.targetHRZone ? row('HR zone', targets.targetHRZone) : '',
    targets.targetPowerW ? row('Power', `${targets.targetPowerW}W`) : '',
    targets.tss != null ? row('TSS', targets.tss) : '',
  ].filter(Boolean).join('');
  return rows ? `<div class="detail-extra-rows">${rows}</div>` : '';
}

function row(label, value) {
  return `<div class="compare-row"><div class="compare-row-top"><span class="compare-label">${label}</span><span class="compare-values"><strong>${value}</strong></span></div></div>`;
}

function doneTabHtml(c, hasActual, matchEntry) {
  if (!hasActual) {
    return `
      <p class="empty-hint">No activity matched yet.</p>
      <button type="button" class="btn btn-secondary" data-action="go-activities">Import a ride from Activities</button>
    `;
  }
  const activities = matchEntry.activities || [];
  const activityNames = activities.map((a) => escapeHtml(a.activityName || 'Ride')).join(', ');

  return `
    ${activityNames ? `<p class="detail-matched-from">From: ${activityNames}</p>` : ''}
    ${activities.length > 1 ? buildPerRideBreakdown(activities) : ''}
    ${buildComparisonBlock(c)}
    ${buildWorkingSetSectionHtml(activities)}
    ${buildRideChartsHtml(activities)}
  `;
}

// Shown only when 2+ rides matched the same planned workout — otherwise the aggregated totals in
// buildComparisonBlock() already represent the single ride exactly, and repeating it here would
// just be noise.
function buildPerRideBreakdown(activities) {
  const rows = activities.map((a) => `
    <div class="ride-row">
      <div class="ride-row-name">${escapeHtml(a.activityName || 'Ride')}</div>
      <div class="ride-row-stats">
        ${a.distanceM != null ? `<span>${(a.distanceM / 1000).toFixed(1)}km</span>` : ''}
        ${a.durationSec != null ? `<span>${formatDuration(a.durationSec)}</span>` : ''}
        ${a.avgHR != null ? `<span>HR ${a.avgHR}</span>` : ''}
        ${a.avgPowerW != null ? `<span>${a.avgPowerW}W</span>` : ''}
      </div>
    </div>
  `).join('');
  return `<div class="detail-section"><h3>Rides (${activities.length})</h3><div class="ride-breakdown">${rows}</div></div>`;
}

// Per-ride HR/power/elevation-over-time charts, only for activities that have a stored `series`
// (see js/seriesUtils.js) — activities imported before that field existed simply show no charts.
function buildRideChartsHtml(activities) {
  return activities.map((a) => buildChartsForRide(a, activities.length > 1)).filter(Boolean).join('');
}

function buildChartsForRide(activity, showRideLabel) {
  const series = activity.series;
  if (!series) return '';
  const charts = [
    buildSeriesChart(series, { metric: 'hrBpm', kind: 'line', color: 'var(--status-missed-border)', unit: ' bpm', label: 'Heart rate' }),
    buildSeriesChart(series, { metric: 'powerW', kind: 'line', color: 'var(--color-accent)', unit: 'W', label: 'Power' }),
    buildSeriesChart(series, { metric: 'elevationM', kind: 'area', color: 'var(--color-type-recovery)', unit: 'm', label: 'Elevation' }),
  ].filter(Boolean);
  if (!charts.length) return '';
  return `<div class="detail-section">
    ${showRideLabel ? `<h3>${escapeHtml(activity.activityName || 'Ride')}</h3>` : ''}
    ${charts.map((el) => el.outerHTML).join('')}
  </div>`;
}
