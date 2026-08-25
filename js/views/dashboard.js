import { state, setUi } from '../state.js';
import { navigate } from '../router.js';
import { formatDisplayDate, formatDistance, formatElevation, formatDuration, todayISO } from '../dateUtils.js';
import { buildWorkoutCard } from '../components/workoutCard.js';
import { buildWeeklyChart } from '../components/weeklyChart.js';
import { computeDashboardStats } from '../statsUtils.js';

const TIMEFRAMES = [4, 8, 12];

export function renderDashboard(container) {
  const view = document.createElement('div');
  view.className = 'view dashboard-view';

  const today = todayISO();
  const weeks = TIMEFRAMES.includes(state.ui.dashboardTimeframeWeeks) ? state.ui.dashboardTimeframeWeeks : 8;

  const upcoming = (state.plan.workouts || [])
    .filter((w) => w.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 1);

  const stats = computeDashboardStats({
    activities: state.activities,
    workouts: state.plan.workouts,
    matchesByWorkoutId: state.matches.matchesByWorkoutId,
    today,
    weeks,
  });
  const { totals } = stats;

  view.innerHTML = `
    <h1>Dashboard</h1>

    <div class="timeframe-row">
      <span class="timeframe-range">${formatDisplayDate(stats.rangeStart)} – ${formatDisplayDate(stats.rangeEnd, { year: true })}${stats.clamped ? ' <span class="timeframe-clamped-note">(since plan start)</span>' : ''}</span>
      <div class="timeframe-select">
        <div class="segmented-control">
          ${TIMEFRAMES.map((n) => `<button type="button" class="segment ${n === weeks ? 'active' : ''}" data-weeks="${n}">${n}w</button>`).join('')}
        </div>
      </div>
    </div>

    <section class="summary-cards">
      <div class="summary-card">
        <div class="summary-value">${totals.rides}</div>
        <div class="summary-label">Rides</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatDistance(totals.distanceKm * 1000)}</div>
        <div class="summary-label">Distance</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatElevation(totals.elevationM)}</div>
        <div class="summary-label">Elevation</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${formatDuration(totals.durationSec)}</div>
        <div class="summary-label">Time</div>
      </div>
    </section>

    <section class="summary-cards">
      <div class="summary-card">
        <div class="summary-value">${stats.weeklyAvgDistanceKm} km</div>
        <div class="summary-label">Avg / week</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${stats.completionRate != null ? `${stats.completionRate}%` : '–'}</div>
        <div class="summary-label">On-plan rate</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${stats.longestRideKm} km</div>
        <div class="summary-label">Longest ride</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${trendDisplay(stats.trendPct)}</div>
        <div class="summary-label">vs previous ${spanWeeksLabel(stats.spanDays)}</div>
      </div>
    </section>

    <div id="weekly-chart-slot"></div>

    <div class="section-header">
      <h2>Next workout</h2>
      <button class="link-btn" id="dash-see-plan">See plan →</button>
    </div>
    <div class="workout-list" id="dash-upcoming"></div>

    ${state.activities.length ? '' : emptyStateBanner()}
  `;

  view.querySelectorAll('[data-weeks]').forEach((btn) => {
    btn.addEventListener('click', () => setUi({ dashboardTimeframeWeeks: Number(btn.dataset.weeks) }));
  });

  view.querySelector('#weekly-chart-slot').appendChild(buildWeeklyChart(stats.weeklySeries));

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

// Labels the "vs previous …" comparison using the *actual* window length (which may be shorter
// than the selected 4w/8w/12w button when the plan is younger than that — see statsUtils.js).
function spanWeeksLabel(spanDays) {
  if (spanDays % 7 === 0) return `${spanDays / 7}w`;
  return spanDays === 1 ? '1d' : `${spanDays}d`;
}

function trendDisplay(trendPct) {
  if (trendPct == null) return '–';
  if (trendPct === 0) return '± 0%';
  return trendPct > 0 ? `▲ +${trendPct}%` : `▼ ${trendPct}%`;
}

function emptyStateBanner() {
  return `
    <div class="empty-banner">
      <p>No ride data yet.</p>
      <button class="btn btn-primary" id="dash-import-btn">Import activities</button>
    </div>`;
}
