// Add/edit workout form, used inside a modal by the Plan view.

import { WORKOUT_TYPES, SPORT_TYPES, createWorkout } from '../schema.js';
import { generateWorkoutId } from '../idUtils.js';

/**
 * @param {object|null} existing  workout to edit, or null to create a new one
 * @param {string} defaultDate    date to prefill when creating
 * @param {(workout:object)=>void} onSave
 * @param {()=>void} [onDelete]
 */
export function buildWorkoutForm({ existing, defaultDate, onSave, onDelete }) {
  const wrap = document.createElement('form');
  wrap.className = 'workout-form';

  const w = existing || createWorkout({ date: defaultDate });

  wrap.innerHTML = `
    <label>Date
      <input type="date" name="date" value="${w.date || defaultDate || ''}" required>
    </label>
    <label>Title
      <input type="text" name="title" value="${escapeAttr(w.title)}" required>
    </label>
    <div class="form-row">
      <label>Type
        <select name="type">${WORKOUT_TYPES.map((t) => `<option value="${t}" ${t === w.type ? 'selected' : ''}>${t.replace('_', ' ')}</option>`).join('')}</select>
      </label>
      <label>Sport
        <select name="sport">${SPORT_TYPES.map((s) => `<option value="${s}" ${s === w.sport ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </label>
    </div>
    <label>Description
      <textarea name="description" rows="3">${escapeHtml(w.description)}</textarea>
    </label>
    <div class="form-row">
      <label>Distance (km)<input type="number" step="0.1" name="distanceKm" value="${w.targets.distanceKm ?? ''}"></label>
      <label>Duration (min)<input type="number" name="durationMin" value="${w.targets.durationMin ?? ''}"></label>
      <label>Elevation (m)<input type="number" name="elevationM" value="${w.targets.elevationM ?? ''}"></label>
    </div>
    <div class="form-row">
      <label>Target HR zone<input type="text" name="targetHRZone" value="${escapeAttr(w.targets.targetHRZone || '')}" placeholder="e.g. Z2"></label>
      <label>Target power (W)<input type="text" name="targetPowerW" value="${escapeAttr(w.targets.targetPowerW || '')}" placeholder="e.g. 180-210"></label>
      <label>TSS<input type="number" name="tss" value="${w.targets.tss ?? ''}"></label>
    </div>
    <label>Notes
      <textarea name="notes" rows="2">${escapeHtml(w.notes)}</textarea>
    </label>
    <div class="form-actions">
      ${existing && onDelete ? '<button type="button" class="btn btn-danger" data-action="delete">Delete</button>' : '<span></span>'}
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  `;

  wrap.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(wrap);
    const date = fd.get('date');
    const title = fd.get('title');
    const updated = {
      ...w,
      id: existing ? w.id : generateWorkoutId(date, title),
      date,
      title,
      type: fd.get('type'),
      sport: fd.get('sport'),
      description: fd.get('description') || '',
      notes: fd.get('notes') || '',
      targets: {
        distanceKm: numOrNull(fd.get('distanceKm')),
        durationMin: numOrNull(fd.get('durationMin')),
        elevationM: numOrNull(fd.get('elevationM')),
        targetHRZone: fd.get('targetHRZone') || null,
        targetPowerW: fd.get('targetPowerW') || null,
        tss: numOrNull(fd.get('tss')),
        intensity: w.targets.intensity ?? null,
      },
    };
    onSave(updated);
  });

  const deleteBtn = wrap.querySelector('[data-action="delete"]');
  if (deleteBtn) deleteBtn.addEventListener('click', () => onDelete());

  return wrap;
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
