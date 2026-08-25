// Hand-rolled month calendar grid (no CDN dependency, so PWA offline caching stays simple).

import { getMonthMatrix, formatMonthYear, todayISO } from '../dateUtils.js';
import { escapeAttr } from '../domUtils.js';

/**
 * @param {number} year
 * @param {number} month  0-based
 * @param {object} plan
 * @param {Map} matchesByWorkoutId
 * @param {object[]} unmatchedActivities
 * @param {(dateStr:string)=>void} onDayClick
 * @param {(year:number, month:number)=>void} onNavigate
 */
export function buildCalendarGrid({ year, month, plan, matchesByWorkoutId, unmatchedActivities, onDayClick, onNavigate }) {
  const root = document.createElement('div');
  root.className = 'calendar-grid';

  const header = document.createElement('div');
  header.className = 'calendar-header';
  header.innerHTML = `
    <button class="cal-nav" data-dir="-1" aria-label="Previous month">‹</button>
    <span class="calendar-title">${formatMonthYear(year, month)}</span>
    <button class="cal-nav" data-dir="1" aria-label="Next month">›</button>
  `;
  header.querySelectorAll('.cal-nav').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = Number(btn.dataset.dir);
      let m = month + dir, y = year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      onNavigate(y, m);
    });
  });
  root.appendChild(header);

  const dowRow = document.createElement('div');
  dowRow.className = 'calendar-dow-row';
  ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-dow';
    cell.textContent = d;
    dowRow.appendChild(cell);
  });
  root.appendChild(dowRow);

  const workoutsByDate = new Map();
  (plan?.workouts || []).forEach((w) => {
    if (!workoutsByDate.has(w.date)) workoutsByDate.set(w.date, []);
    workoutsByDate.get(w.date).push(w);
  });
  const unmatchedByDate = new Map();
  (unmatchedActivities || []).forEach((a) => {
    if (!unmatchedByDate.has(a.date)) unmatchedByDate.set(a.date, []);
    unmatchedByDate.get(a.date).push(a);
  });

  const matrix = getMonthMatrix(year, month);
  const today = todayISO();
  const body = document.createElement('div');
  body.className = 'calendar-body';

  matrix.forEach((week) => {
    week.forEach((cell) => {
      const dayEl = document.createElement('button');
      dayEl.type = 'button';
      dayEl.className = 'calendar-day' + (cell.inMonth ? '' : ' out-month') + (cell.date === today ? ' today' : '');
      if (cell.date === today) dayEl.dataset.scrollTarget = 'today';
      const dayNum = Number(cell.date.slice(-2));

      const dayWorkouts = workoutsByDate.get(cell.date) || [];
      const dayUnmatched = unmatchedByDate.get(cell.date) || [];

      const chips = dayWorkouts.map((w) => {
        const status = matchesByWorkoutId.get(w.id)?.completionStatus || 'planned';
        // Fill = status (dominant signal), ring = workout type (secondary accent).
        return `<span class="cal-chip status-${status} type-ring-${w.type}" title="${escapeAttr(w.title)}"></span>`;
      }).join('');
      const extraDot = dayUnmatched.length ? '<span class="cal-dot" title="Unplanned ride"></span>' : '';

      dayEl.innerHTML = `<span class="calendar-day-num">${dayNum}</span><span class="calendar-day-chips">${chips}${extraDot}</span>`;
      dayEl.addEventListener('click', () => onDayClick(cell.date));
      body.appendChild(dayEl);
    });
  });
  root.appendChild(body);

  return root;
}
