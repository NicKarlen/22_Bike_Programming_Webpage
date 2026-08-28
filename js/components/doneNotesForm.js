// Small standalone editor for a workout's "done" notes — retrospective commentary written after
// the ride (how it actually went, PRs, deviations from plan). Deliberately its own tiny form, not
// another field bundled into workoutForm.js's planned-workout edit form: `notes` (planned) and
// `doneNotes` (done) are separate fields with separate purposes and separate homes (Planned tab
// vs Done tab — see js/schema.js), so they get separate editors too, opened via js/views/plan.js's
// `openDoneNotesModal`.

import { escapeHtml } from '../domUtils.js';

/**
 * @param {object} workout
 * @param {(doneNotes:string)=>void} onSave
 */
export function buildDoneNotesForm({ workout, onSave }) {
  const wrap = document.createElement('form');
  wrap.className = 'done-notes-form';
  wrap.innerHTML = `
    <label>Notes
      <textarea name="doneNotes" rows="5" placeholder="How did it actually go? PRs, how you felt, deviations from the plan...">${escapeHtml(workout.doneNotes || '')}</textarea>
    </label>
    <div class="form-actions">
      <span></span>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  `;

  wrap.addEventListener('submit', (e) => {
    e.preventDefault();
    onSave(new FormData(wrap).get('doneNotes') || '');
  });

  return wrap;
}
