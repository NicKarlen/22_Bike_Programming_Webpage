import { state, setSettingsSilent, setPlan } from '../state.js';
import { buildCreatePlanPrompt, buildUpdatePlanPrompt, computeRecentTrainingSummary } from '../promptTemplates.js';
import { todayISO } from '../dateUtils.js';
import { buildExportForClaude } from '../exportUtils.js';
import { validatePlan, normalizePlan, diffPlans } from '../schema.js';
import { navigate } from '../router.js';
import { escapeHtml, escapeAttr } from '../domUtils.js';

let activeTab = 'create';

export function renderPrompts(container) {
  const view = document.createElement('div');
  view.className = 'view prompts-view';

  view.innerHTML = `
    <h1>Prompts</h1>
    <p class="view-subtitle">Copy a prompt into <strong>claude.ai</strong> (a separate tab/app — this site doesn't connect to Claude directly). Paste the JSON it gives you back into the "Import a plan" section below.</p>
    <div class="segmented-control">
      <button class="segment ${activeTab === 'create' ? 'active' : ''}" data-tab="create">Create plan</button>
      <button class="segment ${activeTab === 'update' ? 'active' : ''}" data-tab="update">Update plan</button>
    </div>
    <div id="prompt-tab-content"></div>

    <section class="ie-section">
      <h2>Import a plan</h2>
      <p class="view-subtitle">Paste the JSON Claude gave you above back in here.</p>
      <textarea id="plan-json-input" class="wide-textarea" rows="10" placeholder="Paste plan JSON here..."></textarea>
      <button class="btn btn-primary" id="validate-plan-btn">Validate &amp; preview</button>
      <div id="plan-import-result"></div>
    </section>
  `;

  view.querySelectorAll('.segment').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderPrompts.rerender?.();
    });
  });

  const content = view.querySelector('#prompt-tab-content');
  if (activeTab === 'create') content.appendChild(buildCreateTab(view));
  else content.appendChild(buildUpdateTab());

  view.querySelector('#validate-plan-btn').addEventListener('click', () => handleValidate(container));

  container.appendChild(view);
  // allow the segment click handler above to trigger a full re-render of this view
  renderPrompts.rerender = () => { container.innerHTML = ''; renderPrompts(container); };
}

function buildCreateTab(rootView) {
  const wrap = document.createElement('div');
  const goal = state.settings.goal || {};
  const athlete = state.settings.athlete || {};

  wrap.innerHTML = `
    <fieldset class="prompt-form">
      <legend>Goal event (optional)</legend>
      <div class="form-row">
        <label>Event name<input type="text" id="pf-event-name" value="${escapeAttr(goal.eventName || '')}"></label>
        <label>Event date<input type="date" id="pf-event-date" value="${goal.eventDate || ''}"></label>
      </div>
      <label>Description<input type="text" id="pf-event-desc" value="${escapeAttr(goal.description || '')}" placeholder="e.g. 100km, ~1200m climbing"></label>
    </fieldset>
    <label class="checkbox-row"><input type="checkbox" id="pf-include-summary" checked> Include a summary of my recent training (last 10 weeks)</label>
    <button class="btn btn-primary" id="pf-generate">Generate prompt</button>
    <div id="pf-output"></div>
  `;

  wrap.querySelector('#pf-generate').addEventListener('click', () => {
    const eventName = wrap.querySelector('#pf-event-name').value.trim();
    const eventDate = wrap.querySelector('#pf-event-date').value;
    const description = wrap.querySelector('#pf-event-desc').value.trim();
    const goalObj = eventName ? { eventName, eventDate: eventDate || null, eventType: 'goal', description } : null;

    setSettingsSilent({ goal: goalObj });

    const includeSummary = wrap.querySelector('#pf-include-summary').checked;
    const recentSummary = computeRecentTrainingSummary(state.activities, 10);
    const prompt = buildCreatePlanPrompt({
      today: todayISO(),
      goal: goalObj,
      athlete,
      recentSummary,
      includeSummary,
    });

    renderPromptOutput(wrap.querySelector('#pf-output'), prompt);
  });

  return wrap;
}

function buildUpdateTab() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <label>Anything you want to tell Claude? (optional)
      <textarea id="uf-note" rows="3" placeholder="How you're feeling, upcoming schedule conflicts, etc."></textarea>
    </label>
    <button class="btn btn-primary" id="uf-generate">Generate prompt</button>
    <div id="uf-output"></div>
  `;

  wrap.querySelector('#uf-generate').addEventListener('click', () => {
    const userNote = wrap.querySelector('#uf-note').value;
    const exportObj = buildExportForClaude(state.plan, state.activities, state.matches);
    const prompt = buildUpdatePlanPrompt({ exportObj, userNote });
    renderPromptOutput(wrap.querySelector('#uf-output'), prompt);
  });

  return wrap;
}

function renderPromptOutput(slot, prompt) {
  slot.innerHTML = `
    <textarea class="prompt-output" readonly>${escapeHtml(prompt)}</textarea>
    <button class="btn btn-secondary" id="copy-prompt-btn">Copy to clipboard</button>
    <span class="copy-feedback" id="copy-feedback"></span>
  `;
  slot.querySelector('#copy-prompt-btn').addEventListener('click', async () => {
    const feedback = slot.querySelector('#copy-feedback');
    try {
      await navigator.clipboard.writeText(prompt);
      feedback.textContent = 'Copied!';
    } catch {
      slot.querySelector('.prompt-output').select();
      feedback.textContent = 'Select-all applied — press Ctrl/Cmd+C';
    }
    setTimeout(() => { feedback.textContent = ''; }, 3000);
  });
}

// `container` (the router's stable node) is passed in, not the view element built in
// renderPrompts, because setPlan() below triggers a full re-render of the current route —
// writing into a DOM node captured before that happens would be invisible (detached).
function handleValidate(container) {
  const view = container.querySelector('.prompts-view');
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
