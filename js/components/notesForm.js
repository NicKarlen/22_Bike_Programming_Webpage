// Small standalone editor for a workout's notes — shown/edited from the Done tab (Planned already
// has `description` for pre-workout intent, see js/schema.js). Opened via js/views/plan.js's
// `openNotesModal`.

import { escapeHtml } from '../domUtils.js';

/**
 * @param {object} workout
 * @param {(notes:string)=>void} onSave
 */
export function buildNotesForm({ workout, onSave }) {
  const wrap = document.createElement('form');
  wrap.className = 'notes-form';
  wrap.innerHTML = `
    <label>Notes
      <textarea name="notes" rows="5" placeholder="How did it actually go? PRs, how you felt, deviations from the plan...">${escapeHtml(workout.notes || '')}</textarea>
    </label>
    <div class="form-actions">
      <span></span>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  `;

  wrap.addEventListener('submit', (e) => {
    e.preventDefault();
    onSave(new FormData(wrap).get('notes') || '');
  });

  return wrap;
}
