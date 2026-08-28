import { state, setActivities } from '../state.js';
import { buildFileDropZone } from '../components/fileDropZone.js';
import { importFiles } from '../activityImport.js';
import { formatDisplayDate, formatDistance, formatElevation, formatDuration } from '../dateUtils.js';
import { escapeHtml } from '../domUtils.js';
import { openWorkingSetEditorModal } from '../components/workingSetEditor.js';

export function renderActivities(container) {
  const view = document.createElement('div');
  view.className = 'view activities-view';

  view.innerHTML = `
    <h1>Activities</h1>
    <p class="view-subtitle">Import rides exported from Garmin Connect as GPX or TCX files — select as many at once as you like.</p>
    <div id="drop-zone-slot"></div>
    <div id="import-summary"></div>
    <div class="section-header"><h2>Log</h2></div>
    <div id="activities-log"></div>
  `;

  const dropSlot = view.querySelector('#drop-zone-slot');
  dropSlot.appendChild(buildFileDropZone({ onFiles: (files) => handleFiles(files, container) }));

  renderLog(view);
  container.appendChild(view);
}

// `container` (the stable #app node the router owns) is passed in rather than the `view` element
// built above, because `setActivities` triggers a full re-render of the current route — that
// replaces `view` in the DOM with a fresh copy. Writing into the old `view` afterwards would be
// invisible (detached node), so we re-query the freshly-rendered view from `container` instead.
async function handleFiles(files, container) {
  const currentView = () => container.querySelector('.activities-view');

  const summaryElBefore = currentView()?.querySelector('#import-summary');
  if (summaryElBefore) summaryElBefore.innerHTML = `<p class="import-status">Importing ${files.length} file(s)…</p>`;

  const result = await importFiles(files, state.activities);
  setActivities(result.activities); // re-renders the current route synchronously if still on /activities

  const summaryEl = currentView()?.querySelector('#import-summary');
  if (!summaryEl) return; // user navigated away while files were being parsed

  const lines = [];
  lines.push(`<p class="import-status">✅ ${result.importedCount} imported${result.updatedCount ? `, ${result.updatedCount} updated` : ''}${result.failed.length ? `, ${result.failed.length} failed` : ''}.</p>`);
  if (result.warnings.length) {
    lines.push(`<ul class="import-warnings">${result.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`);
  }
  if (result.failed.length) {
    lines.push(`<ul class="import-errors">${result.failed.map((f) => `<li>${escapeHtml(f.file)}: ${escapeHtml(f.reason)}</li>`).join('')}</ul>`);
  }
  // Importing exactly one ride pops the working-set editor open right away (the normal "just
  // finished riding" flow, per the user's request that selection happen at import time). A bigger
  // batch — e.g. backfilling old rides — instead gets a banner so the user isn't marched through
  // a stack of modals; they can review on their own time via this button or later from the log.
  if (result.newOrUpdatedIds.length > 1) {
    lines.push(`<p><button type="button" class="btn btn-secondary" data-action="review-working-sets">Review working sets (${result.newOrUpdatedIds.length})</button></p>`);
  }
  summaryEl.innerHTML = lines.join('');
  // Note: renderLog already ran fresh inside the setActivities-triggered re-render above (it's
  // called at the bottom of renderActivities using the updated state), so no need to call it again.

  if (result.newOrUpdatedIds.length === 1) {
    const activity = state.activities.find((a) => a.id === result.newOrUpdatedIds[0]);
    if (activity) openWorkingSetEditorModal(activity);
  } else if (result.newOrUpdatedIds.length > 1) {
    summaryEl.querySelector('[data-action="review-working-sets"]')?.addEventListener('click', () => {
      startWorkingSetReviewQueue([...result.newOrUpdatedIds]);
    });
  }
}

// Opens one working-set editor per id, advancing to the next as soon as the current one closes —
// whether that close came from Save or from the user just dismissing it (X / click-outside).
// `onClose` (see js/components/modal.js) fires exactly once per close regardless of which, so
// there's a single place driving the queue forward, not two that could double-advance it.
function startWorkingSetReviewQueue(ids) {
  const [id, ...rest] = ids;
  if (!id) return;
  const activity = state.activities.find((a) => a.id === id);
  if (!activity) { startWorkingSetReviewQueue(rest); return; }
  openWorkingSetEditorModal(activity, { onClose: () => startWorkingSetReviewQueue(rest) });
}

function renderLog(view) {
  const logEl = view.querySelector('#activities-log');
  if (!state.activities.length) {
    logEl.innerHTML = '<p class="empty-hint">No activities imported yet.</p>';
    return;
  }

  logEl.innerHTML = '';
  const table = document.createElement('div');
  table.className = 'activity-table';
  state.activities.forEach((a) => {
    const segCount = a.workingSet?.segments?.length || 0;
    const row = document.createElement('div');
    row.className = 'activity-row';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.innerHTML = `
      <div class="activity-row-main">
        <span class="activity-date">${formatDisplayDate(a.date)}</span>
        <span class="activity-name">${escapeHtml(a.activityName || 'Ride')}</span>
        <span class="activity-format">${a.sourceFormat.toUpperCase()}</span>
      </div>
      <div class="activity-row-stats">
        <span>${formatDistance(a.distanceM)}</span>
        <span>${formatElevation(a.elevationGainM)}</span>
        <span>${formatDuration(a.durationSec)}</span>
        ${a.avgHR != null ? `<span>HR ${a.avgHR}</span>` : ''}
        ${a.avgPowerW != null ? `<span>${a.avgPowerW}W</span>` : ''}
        ${segCount ? `<span>${segCount} working set${segCount > 1 ? 's' : ''}</span>` : ''}
      </div>
    `;
    // Opens the same editor used right after import, pre-populated with any existing segments —
    // this is the "adjust it later" entry point.
    row.addEventListener('click', () => openWorkingSetEditorModal(a));
    table.appendChild(row);
  });
  logEl.appendChild(table);
}
