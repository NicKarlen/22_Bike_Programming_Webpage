import { state, setPlan } from '../state.js';
import { navigate } from '../router.js';
import { validatePlan, normalizePlan, diffPlans } from '../schema.js';
import { buildFullBackup } from '../exportUtils.js';

export function renderImportExport(container) {
  const view = document.createElement('div');
  view.className = 'view import-export-view';

  view.innerHTML = `
    <h1>Import / Export</h1>

    <section class="ie-section">
      <h2>Import a plan</h2>
      <p class="view-subtitle">Paste the JSON Claude gave you (from the Prompts tab) below.</p>
      <textarea id="plan-json-input" rows="10" placeholder="Paste plan JSON here..."></textarea>
      <button class="btn btn-primary" id="validate-plan-btn">Validate &amp; preview</button>
      <div id="plan-import-result"></div>
    </section>

    <section class="ie-section">
      <h2>Export</h2>
      <p class="view-subtitle">Need to discuss or update your plan with Claude? Use the <a href="#/prompts">Prompts</a> tab's "Update plan" prompt — it includes your plan and results automatically.</p>
      <div class="export-buttons">
        <button class="btn btn-secondary" id="export-backup-btn">Download full backup JSON</button>
        <button class="btn btn-secondary" id="export-plan-btn">Download plan-only JSON</button>
      </div>
    </section>
  `;

  view.querySelector('#validate-plan-btn').addEventListener('click', () => handleValidate(container));
  view.querySelector('#export-backup-btn').addEventListener('click', () => {
    downloadJson(buildFullBackup(state.plan, state.activities, state.settings), 'bike-training-backup.json');
  });
  view.querySelector('#export-plan-btn').addEventListener('click', () => {
    downloadJson(state.plan, 'training-plan.json');
  });

  container.appendChild(view);
}

// `container` (the router's stable node) is passed in, not the view element, because setPlan()
// below triggers a full re-render of the current route — writing into a DOM node captured before
// that happens would be invisible (detached). See the same pattern/comment in views/activities.js.
function handleValidate(container) {
  const view = container.querySelector('.import-export-view');
  const resultEl = view.querySelector('#plan-import-result');
  const raw = view.querySelector('#plan-json-input').value;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    resultEl.innerHTML = `<p class="error-msg">Not valid JSON: ${escapeHtml(err.message)}</p>`;
    return;
  }

  // Accept either a bare plan object, or a full-backup export ({ plan: {...} }).
  const planCandidate = parsed.workouts ? parsed : parsed.plan;
  if (!planCandidate) {
    resultEl.innerHTML = `<p class="error-msg">Couldn't find a "workouts" array — is this the right JSON?</p>`;
    return;
  }

  const validation = validatePlan(planCandidate);
  if (!validation.valid) {
    resultEl.innerHTML = `<p class="error-msg">This plan has problems and can't be imported:</p><ul class="import-errors">${validation.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
    return;
  }

  const normalized = normalizePlan(planCandidate);
  const diff = diffPlans(state.plan, normalized);

  resultEl.innerHTML = `
    ${validation.warnings.length ? `<ul class="import-warnings">${validation.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
    <div class="diff-summary">
      <span class="diff-chip diff-added">+${diff.added} new</span>
      <span class="diff-chip diff-changed">${diff.changed} changed</span>
      <span class="diff-chip diff-removed">-${diff.removed} removed</span>
      <span class="diff-chip diff-unchanged">${diff.unchanged} unchanged</span>
    </div>
    <p>This will <strong>replace</strong> your current plan (${diff.totalOld} workouts) with the new one (${diff.totalNew} workouts).</p>
    <button class="btn btn-primary" id="confirm-import-btn">Replace plan</button>
  `;

  resultEl.querySelector('#confirm-import-btn').addEventListener('click', () => {
    setPlan(normalized); // triggers a full re-render of this route synchronously
    navigate('/plan');
  });
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
