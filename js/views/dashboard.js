import { state } from '../state.js';
import { navigate } from '../router.js';
import { formatDisplayDate, formatDistance, formatElevation, formatDuration, todayISO } from '../dateUtils.js';
import { buildWorkoutCard } from '../components/workoutCard.js';

export function renderDashboard(container) {
  const view = document.createElement('div');
  view.className = 'view dashboard-view';

  const today = todayISO();
  const upcoming = (state.plan.workouts || [])
    .filter((w) => w.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  const last8WeeksCutoff = shiftDate(today, -56);
  const recent = state.activities.filter((a) => a.date >= last8WeeksCutoff);
  const totals = {
    distanceKm: recent.reduce((s, a) => s + (a.distanceM || 0), 0) / 1000,
    elevationM: recent.reduce((s, a) => s + (a.elevationGainM || 0), 0),
    durationSec: recent.reduce((s, a) => s + (a.durationSec || 0), 0),
    rides: recent.length,
  };

  view.innerHTML = `
    <h1>Dashboard</h1>
    <section class="summary-cards">
      <div class="summary-card">
        <div class="summary-value">${totals.rides}</div>
        <div class="summary-label">Rides (8 wks)</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatDistance(totals.distanceKm * 1000)}</div>
        <div class="summary-label">Distance (8 wks)</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatElevation(totals.elevationM)}</div>
        <div class="summary-label">Elevation (8 wks)</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatDuration(totals.durationSec)}</div>
        <div class="summary-label">Time (8 wks)</div>
      </div>
    </section>

    <div class="section-header">
      <h2>Up next</h2>
      <button class="link-btn" id="dash-see-plan">See plan →</button>
    </div>
    <div class="workout-list" id="dash-upcoming"></div>

    ${state.activities.length ? '' : emptyStateBanner()}
  `;

  const list = view.querySelector('#dash-upcoming');
  if (!upcoming.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-hint';
    empty.textContent = state.plan.workouts.length
      ? 'No upcoming workouts scheduled — add one from the Plan tab.'
      : 'No training plan yet. Go to Prompts to generate one with Claude, or add workouts manually in Plan.';
    list.appendChild(empty);
  } else {
    upcoming.forEach((w) => {
      const match = state.matches.matchesByWorkoutId.get(w.id);
      list.appendChild(buildWorkoutCard(w, match, { onClick: () => navigate('/plan') }));
    });
  }

  view.querySelector('#dash-see-plan').addEventListener('click', () => navigate('/plan'));
  const importBtn = view.querySelector('#dash-import-btn');
  if (importBtn) importBtn.addEventListener('click', () => navigate('/activities'));

  container.appendChild(view);
}

function emptyStateBanner() {
  return `
    <div class="empty-banner">
      <p>No ride data yet.</p>
      <button class="btn btn-primary" id="dash-import-btn">Import activities</button>
    </div>`;
}

function shiftDate(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
