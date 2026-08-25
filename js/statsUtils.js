// Dashboard analytics: totals, derived stats, and a weekly series for the trend chart, scoped to
// a rolling N-week window ending today — but never starting before the plan's first planned
// session, so a young plan doesn't get its per-week averages diluted by "dead" time before
// training began (e.g. selecting 8w two weeks into a plan should average over 2 weeks, not 8).

import { addDays, startOfWeek, daysBetween } from './dateUtils.js';

/**
 * @param {object[]} activities
 * @param {object[]} workouts        planned workouts (state.plan.workouts)
 * @param {Map} matchesByWorkoutId   state.matches.matchesByWorkoutId
 * @param {string} today             ISO date
 * @param {number} weeks             requested window size in weeks (may be clamped shorter — see above)
 */
export function computeDashboardStats({ activities, workouts, matchesByWorkoutId, today, weeks }) {
  const nominalStart = addDays(today, -(weeks * 7 - 1));
  const firstWorkoutDate = (workouts || []).reduce((min, w) => (w.date && (!min || w.date < min) ? w.date : min), null);
  // Only pull the start date *later* (never earlier) than the nominal lookback — a plan that's
  // been running longer than the selected window still gets the normal rolling window.
  const rangeStart = firstWorkoutDate && firstWorkoutDate > nominalStart ? firstWorkoutDate : nominalStart;
  const clamped = rangeStart !== nominalStart;

  const spanDays = daysBetween(rangeStart, today) + 1; // inclusive of both ends
  const prevRangeEnd = addDays(rangeStart, -1);
  const prevRangeStart = addDays(prevRangeEnd, -(spanDays - 1));

  const inRange = activities.filter((a) => a.date >= rangeStart && a.date <= today);
  const inPrevRange = activities.filter((a) => a.date >= prevRangeStart && a.date <= prevRangeEnd);

  const totals = sumActivities(inRange);
  const prevTotals = sumActivities(inPrevRange);
  const trendPct = prevTotals.distanceKm > 0
    ? Math.round(((totals.distanceKm - prevTotals.distanceKm) / prevTotals.distanceKm) * 100)
    : null;

  const effectiveWeeks = spanDays / 7;
  const weeklyAvgDistanceKm = effectiveWeeks > 0 ? round1(totals.distanceKm / effectiveWeeks) : 0;
  const longestRideKm = round1(inRange.reduce((max, a) => Math.max(max, (a.distanceM || 0) / 1000), 0));

  const completionRate = computeCompletionRate(workouts, matchesByWorkoutId, rangeStart, today);
  const weeklySeries = buildWeeklySeries(activities, rangeStart, today);

  return {
    rangeStart,
    rangeEnd: today,
    spanDays,
    clamped,
    totals,
    trendPct,
    weeklyAvgDistanceKm,
    longestRideKm,
    completionRate,
    weeklySeries,
  };
}

function sumActivities(list) {
  return {
    rides: list.length,
    distanceKm: round1(list.reduce((s, a) => s + (a.distanceM || 0), 0) / 1000),
    elevationM: Math.round(list.reduce((s, a) => s + (a.elevationGainM || 0), 0)),
    durationSec: list.reduce((s, a) => s + (a.durationSec || 0), 0),
  };
}

// % of planned workouts in range that were completed/partial/rested rather than missed
// (workouts still in the future, or with no computed status yet, don't count either way).
function computeCompletionRate(workouts, matchesByWorkoutId, rangeStart, today) {
  const relevant = (workouts || []).filter((w) => w.date >= rangeStart && w.date <= today);
  let onPlan = 0, total = 0;
  relevant.forEach((w) => {
    const status = matchesByWorkoutId.get(w.id)?.completionStatus;
    if (status === 'missed') total++;
    else if (status === 'completed' || status === 'partial' || status === 'rested') { onPlan++; total++; }
  });
  return total > 0 ? Math.round((onPlan / total) * 100) : null;
}

function buildWeeklySeries(activities, rangeStart, today) {
  const series = [];
  let weekStart = startOfWeek(rangeStart);
  const lastWeekStart = startOfWeek(today);
  while (weekStart <= lastWeekStart) {
    const weekEndCapped = addDays(weekStart, 6) > today ? today : addDays(weekStart, 6);
    const weekActivities = activities.filter((a) => a.date >= weekStart && a.date <= weekEndCapped);
    series.push({ weekStart, distanceKm: round1(weekActivities.reduce((s, a) => s + (a.distanceM || 0), 0) / 1000) });
    weekStart = addDays(weekStart, 7);
  }
  return series;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
