// Shared planned-vs-actual rendering: a row of target chips (used on the workout card) and a
// fuller comparison block (used on both the workout card and the workout detail "Done" tab).

import { formatDurationMin } from '../dateUtils.js';

export function buildTargetChips(targets) {
  return [
    targetChip('Dist', targets.distanceKm, 'km'),
    targetChip('Dur', targets.durationMin != null ? formatDurationMin(targets.durationMin) : null),
    targetChip('Elev', targets.elevationM, 'm'),
  ].join('');
}

function targetChip(label, value, unit = '') {
  if (value == null) return '';
  return `<span class="target-chip">${label} <strong>${value}${unit}</strong></span>`;
}

export function buildComparisonBlock(c) {
  const rows = [
    compareRow('Distance', c.plannedDistanceKm, c.actualDistanceKm, 'km'),
    compareRow('Elevation', c.plannedElevationM, c.actualElevationM, 'm'),
    compareRow('Duration', formatDurationMin(c.plannedDurationMin), formatDurationMin(c.actualDurationMin), '', c.plannedDurationMin, c.actualDurationMin),
  ].filter(Boolean).join('');

  const extras = buildStatPills(c);

  return `<div class="comparison-block">
    ${rows ? `<div class="compare-rows">${rows}</div>` : ''}
    ${extras ? `<div class="stat-pills">${extras}</div>` : ''}
  </div>`;
}

export function buildStatPills(c) {
  return [
    c.actualAvgHR != null ? `<span class="stat-pill">Avg HR ${c.actualAvgHR}</span>` : '',
    c.actualMaxHR != null ? `<span class="stat-pill">Max HR ${c.actualMaxHR}</span>` : '',
    c.actualAvgPowerW != null ? `<span class="stat-pill">Avg Power ${c.actualAvgPowerW}W</span>` : '',
    c.actualCalories != null ? `<span class="stat-pill">${c.actualCalories} kcal</span>` : '',
  ].filter(Boolean).join('');
}

// `planned`/`actual` here are already-formatted display strings; `rawPlanned`/`rawActual` (only
// used by the Duration row) are the underlying numbers, so we can still tell "both missing" apart
// from "both zero" without the formatter's '–' placeholder leaking into that check.
function compareRow(label, planned, actual, unit, rawPlanned, rawActual) {
  const pMissing = rawPlanned !== undefined ? rawPlanned == null : planned == null;
  const aMissing = rawActual !== undefined ? rawActual == null : actual == null;
  if (pMissing && aMissing) return '';
  return `<div class="compare-row">
    <span class="compare-label">${label}</span>
    <span class="compare-values">${planned ?? '–'}${unit} planned → <strong>${actual ?? '–'}${unit}</strong> actual</span>
  </div>`;
}
