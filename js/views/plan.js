import { state, setUi, addWorkout, updateWorkout, deleteWorkout } from '../state.js';
import { buildWorkoutCard } from '../components/workoutCard.js';
import { buildCalendarGrid } from '../components/calendarGrid.js';
import { buildWorkoutForm } from '../components/workoutForm.js';
import { openModal, closeModal } from '../components/modal.js';
import { startOfWeek, formatDisplayDate } from '../dateUtils.js';

export function renderPlan(container) {
  const view = document.createElement('div');
  view.className = 'view plan-view';

  const restDayCount = state.plan.workouts.filter((w) => w.type === 'rest').length;

  view.innerHTML = `
    <div class="view-header-row">
      <h1>Plan</h1>
      <button class="btn btn-primary" id="add-workout-btn">+ Add workout</button>
    </div>
    <div class="segmented-control">
      <button class="segment ${state.ui.planViewMode === 'list' ? 'active' : ''}" data-mode="list">List</button>
      <button class="segment ${state.ui.planViewMode === 'calendar' ? 'active' : ''}" data-mode="calendar">Calendar</button>
    </div>
    ${restDayCount ? `
    <label class="checkbox-row plan-filter-row">
      <input type="checkbox" id="show-rest-days-toggle" ${state.ui.showRestDays ? 'checked' : ''}>
      Show rest days${state.ui.showRestDays ? '' : ` (${restDayCount} hidden)`}
    </label>` : ''}
    <div id="plan-content"></div>
  `;

  view.querySelectorAll('.segment').forEach((btn) => {
    btn.addEventListener('click', () => setUi({ planViewMode: btn.dataset.mode }));
  });

  view.querySelector('#add-workout-btn').addEventListener('click', () => openWorkoutModal(null));

  const restToggle = view.querySelector('#show-rest-days-toggle');
  if (restToggle) restToggle.addEventListener('change', () => setUi({ showRestDays: restToggle.checked }));

  const content = view.querySelector('#plan-content');
  if (state.ui.planViewMode === 'calendar') {
    content.appendChild(buildCalendarView());
  } else {
    content.appendChild(buildListView());
  }

  container.appendChild(view);
}

function visibleWorkouts() {
  return state.ui.showRestDays ? state.plan.workouts : state.plan.workouts.filter((w) => w.type !== 'rest');
}

function buildListView() {
  const wrap = document.createElement('div');
  if (!state.plan.workouts.length) {
    wrap.innerHTML = '<p class="empty-hint">No workouts yet. Add one manually, or generate a plan via the Prompts tab and import it.</p>';
    return wrap;
  }

  const workoutsToShow = visibleWorkouts();
  if (!workoutsToShow.length) {
    wrap.innerHTML = '<p class="empty-hint">Everything currently planned is a rest day — check "Show rest days" above to see it.</p>';
    return wrap;
  }

  const byWeek = new Map();
  workoutsToShow.forEach((w) => {
    const weekStart = startOfWeek(w.date);
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, []);
    byWeek.get(weekStart).push(w);
  });

  [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([weekStart, workouts]) => {
    const section = document.createElement('section');
    section.className = 'week-group';
    const h = document.createElement('h3');
    h.className = 'week-group-title';
    h.textContent = `Week of ${formatDisplayDate(weekStart)}`;
    section.appendChild(h);

    const list = document.createElement('div');
    list.className = 'workout-list';
    workouts.sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
      const match = state.matches.matchesByWorkoutId.get(w.id);
      list.appendChild(buildWorkoutCard(w, match, { onClick: () => openWorkoutModal(w) }));
    });
    section.appendChild(list);
    wrap.appendChild(section);
  });

  return wrap;
}

function buildCalendarView() {
  return buildCalendarGrid({
    year: state.ui.calendarYear,
    month: state.ui.calendarMonth,
    plan: { ...state.plan, workouts: visibleWorkouts() },
    matchesByWorkoutId: state.matches.matchesByWorkoutId,
    unmatchedActivities: state.matches.unmatchedActivities,
    onNavigate: (y, m) => setUi({ calendarYear: y, calendarMonth: m }),
    onDayClick: (dateStr) => openDayModal(dateStr),
  });
}

function openWorkoutModal(existing, defaultDate) {
  const form = buildWorkoutForm({
    existing,
    defaultDate: defaultDate || existing?.date,
    onSave: (workout) => {
      if (existing) updateWorkout(existing.id, workout);
      else addWorkout(workout);
      closeModal();
    },
    onDelete: existing ? () => { deleteWorkout(existing.id); closeModal(); } : null,
  });
  openModal({ title: existing ? 'Edit workout' : 'Add workout', bodyEl: form });
}

function openDayModal(dateStr) {
  const workouts = visibleWorkouts().filter((w) => w.date === dateStr);
  const hiddenRestDay = !state.ui.showRestDays && state.plan.workouts.some((w) => w.date === dateStr && w.type === 'rest');
  const unmatched = state.matches.unmatchedActivities.filter((a) => a.date === dateStr);

  const body = document.createElement('div');
  body.className = 'day-modal-body';

  if (!workouts.length && !unmatched.length) {
    body.innerHTML = hiddenRestDay
      ? '<p class="empty-hint">Rest day — check "Show rest days" in Plan to see/edit it.</p>'
      : '<p class="empty-hint">Nothing planned or logged this day.</p>';
  }

  workouts.forEach((w) => {
    const match = state.matches.matchesByWorkoutId.get(w.id);
    const card = buildWorkoutCard(w, match, { onClick: () => { closeModal(); openWorkoutModal(w); } });
    body.appendChild(card);
  });

  unmatched.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'unmatched-activity-card';
    div.innerHTML = `<strong>${escapeHtml(a.activityName || 'Ride')}</strong> — ${((a.distanceM || 0) / 1000).toFixed(1)}km, ${Math.round((a.elevationGainM || 0))}m elev${a.avgHR ? `, avg HR ${a.avgHR}` : ''}
      <div class="unmatched-hint">Not linked to a planned workout.</div>`;
    body.appendChild(div);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary';
  addBtn.textContent = '+ Add workout on this day';
  addBtn.addEventListener('click', () => { closeModal(); openWorkoutModal(null, dateStr); });
  body.appendChild(addBtn);

  openModal({ title: formatDisplayDate(dateStr, { year: true }), bodyEl: body });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
