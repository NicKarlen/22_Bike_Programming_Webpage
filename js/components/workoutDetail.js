// Read-only workout detail view, opened when clicking an existing workout card. Splits planned
// targets from actual/logged data into two tabs so "what I planned" and "what I did" are never
// shown mixed together in one wall of fields (see the old workoutForm-as-viewer behavior this
// replaces).

import { formatDisplayDate } from '../dateUtils.js';
import { escapeHtml } from '../domUtils.js';
import { statusLabel, statusGlyph } from '../statusMeta.js';
import { buildTargetChips, buildComparisonBlock } from './comparisonBlock.js';
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
  return `<div class="compare-row"><span class="compare-label">${label}</span><span class="compare-values"><strong>${value}</strong></span></div>`;
}

function doneTabHtml(c, hasActual, matchEntry) {
  if (!hasActual) {
    return `
      <p class="empty-hint">No activity matched yet.</p>
      <button type="button" class="btn btn-secondary" data-action="go-activities">Import a ride from Activities</button>
    `;
  }
  const activityNames = (matchEntry.activities || [])
    .map((a) => escapeHtml(a.activityName || 'Ride'))
    .join(', ');
  return `
    ${activityNames ? `<p class="detail-matched-from">From: ${activityNames}</p>` : ''}
    ${buildComparisonBlock(c)}
  `;
}
