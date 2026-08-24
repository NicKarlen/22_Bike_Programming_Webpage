// Renders a single planned workout card, with a planned-vs-actual overlay when a match exists.

import { formatDisplayDate } from '../dateUtils.js';

const STATUS_LABEL = {
  planned: 'Planned', completed: 'Completed', partial: 'Partial', missed: 'Missed', extra: 'Extra',
};

export function buildWorkoutCard(workout, matchEntry, { onClick } = {}) {
  const card = document.createElement('div');
  const status = matchEntry?.completionStatus || 'planned';
  card.className = `workout-card type-${workout.type} status-${status}`;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const c = matchEntry?.comparison;
  const hasActual = c && (c.actualDistanceKm != null || c.actualDurationMin != null);

  card.innerHTML = `
    <div class="workout-card-top">
      <span class="chip chip-type">${workout.type.replace('_', ' ')}</span>
      <span class="chip chip-status status-${status}">${STATUS_LABEL[status] || status}</span>
    </div>
    <div class="workout-card-date">${formatDisplayDate(workout.date)}</div>
    <div class="workout-card-title">${escapeHtml(workout.title)}</div>
    ${workout.description ? `<div class="workout-card-desc">${escapeHtml(workout.description)}</div>` : ''}
    <div class="workout-card-targets">
      ${targetChip('Dist', workout.targets.distanceKm, 'km')}
      ${targetChip('Dur', workout.targets.durationMin, 'min')}
      ${targetChip('Elev', workout.targets.elevationM, 'm')}
    </div>
    ${hasActual ? buildComparisonBlock(c) : ''}
  `;

  if (onClick) card.addEventListener('click', () => onClick(workout));
  return card;
}

function targetChip(label, value, unit) {
  if (value == null) return '';
  return `<span class="target-chip">${label} <strong>${value}${unit}</strong></span>`;
}

function buildComparisonBlock(c) {
  const rows = [
    compareRow('Distance', c.plannedDistanceKm, c.actualDistanceKm, 'km'),
    compareRow('Elevation', c.plannedElevationM, c.actualElevationM, 'm'),
    compareRow('Duration', c.plannedDurationMin, c.actualDurationMin, 'min'),
  ].filter(Boolean).join('');

  const extras = [
    c.actualAvgHR != null ? `<span class="stat-pill">Avg HR ${c.actualAvgHR}</span>` : '',
    c.actualMaxHR != null ? `<span class="stat-pill">Max HR ${c.actualMaxHR}</span>` : '',
    c.actualAvgPowerW != null ? `<span class="stat-pill">Avg Power ${c.actualAvgPowerW}W</span>` : '',
    c.actualCalories != null ? `<span class="stat-pill">${c.actualCalories} kcal</span>` : '',
  ].filter(Boolean).join('');

  return `<div class="comparison-block">
    ${rows ? `<div class="compare-rows">${rows}</div>` : ''}
    ${extras ? `<div class="stat-pills">${extras}</div>` : ''}
  </div>`;
}

function compareRow(label, planned, actual, unit) {
  if (planned == null && actual == null) return '';
  return `<div class="compare-row">
    <span class="compare-label">${label}</span>
    <span class="compare-values">${planned ?? '–'}${unit} planned → <strong>${actual ?? '–'}${unit}</strong> actual</span>
  </div>`;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
