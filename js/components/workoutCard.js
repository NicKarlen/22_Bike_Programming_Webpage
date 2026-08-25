// Renders a single planned workout card, with a planned-vs-actual overlay when a match exists.
// Status (planned/completed/partial/rested/missed) is the dominant visual signal (left border +
// background tint, see css/components.css); workout type is a secondary accent (small dot in the
// type chip) — see the Plan page redesign.

import { formatDisplayDate } from '../dateUtils.js';
import { escapeHtml } from '../domUtils.js';
import { statusLabel, statusGlyph } from '../statusMeta.js';
import { buildTargetChips, buildComparisonBlock } from './comparisonBlock.js';

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
      <span class="chip chip-type"><span class="type-dot type-${workout.type}"></span>${workout.type.replace('_', ' ')}</span>
      <span class="chip chip-status status-${status}">${statusGlyph(status)} ${statusLabel(status)}</span>
    </div>
    <div class="workout-card-date">${formatDisplayDate(workout.date)}</div>
    <div class="workout-card-title">${escapeHtml(workout.title)}</div>
    ${workout.description ? `<div class="workout-card-desc">${escapeHtml(workout.description)}</div>` : ''}
    <div class="workout-card-targets">
      ${buildTargetChips(workout.targets)}
    </div>
    ${hasActual ? buildComparisonBlock(c) : ''}
  `;

  if (onClick) card.addEventListener('click', () => onClick(workout));
  return card;
}
