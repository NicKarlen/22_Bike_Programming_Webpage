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
    c.actualMaxPowerW != null ? `<span class="stat-pill">Max Power ${c.actualMaxPowerW}W</span>` : '',
    c.actualAvgCadenceRpm != null ? `<span class="stat-pill">Cadence ${c.actualAvgCadenceRpm}${c.actualMaxCadenceRpm != null ? ` (max ${c.actualMaxCadenceRpm})` : ''} rpm</span>` : '',
    c.actualAvgSpeedKmh != null ? `<span class="stat-pill">Avg Speed ${c.actualAvgSpeedKmh} km/h</span>` : '',
    c.actualMaxSpeedKmh != null ? `<span class="stat-pill">Max Speed ${c.actualMaxSpeedKmh} km/h</span>` : '',
    c.actualCalories != null ? `<span class="stat-pill">${c.actualCalories} kcal</span>` : '',
  ].filter(Boolean).join('');
}

// `planned`/`actual` here are already-formatted display strings; `rawPlanned`/`rawActual` (only
// used by the Duration row) are the underlying numbers, so we can still tell "both missing" apart
// from "both zero" without the formatter's '–' placeholder leaking into that check, and so the
// proportional bar below always has real numbers to work with regardless of row type.
function compareRow(label, planned, actual, unit, rawPlanned, rawActual) {
  const numPlanned = rawPlanned !== undefined ? rawPlanned : planned;
  const numActual = rawActual !== undefined ? rawActual : actual;
  if (numPlanned == null && numActual == null) return '';

  const showBar = typeof numPlanned === 'number' && typeof numActual === 'number' && numPlanned > 0;
  const ratio = showBar ? numActual / numPlanned : 0;
  const barPct = Math.min(100, Math.max(0, ratio * 100));
  const barClass = ratio >= 1 ? 'compare-bar-fill met' : 'compare-bar-fill';

  return `<div class="compare-row">
    <div class="compare-row-top">
      <span class="compare-label">${label}</span>
      <span class="compare-values">${planned ?? '–'}${unit} planned → <strong>${actual ?? '–'}${unit}</strong> actual</span>
    </div>
    ${showBar ? `<div class="compare-bar"><div class="${barClass}" style="width:${barPct}%"></div></div>` : ''}
  </div>`;
}
