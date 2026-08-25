import { state, setActivities } from '../state.js';
import { buildFileDropZone } from '../components/fileDropZone.js';
import { importFiles } from '../activityImport.js';
import { formatDisplayDate, formatDistance, formatElevation, formatDuration } from '../dateUtils.js';
import { escapeHtml } from '../domUtils.js';

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
  summaryEl.innerHTML = lines.join('');
  // Note: renderLog already ran fresh inside the setActivities-triggered re-render above (it's
  // called at the bottom of renderActivities using the updated state), so no need to call it again.
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
    const row = document.createElement('div');
    row.className = 'activity-row';
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
      </div>
    `;
    table.appendChild(row);
  });
  logEl.appendChild(table);
}
