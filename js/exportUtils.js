// Builds the two export shapes: the aggregated, Claude-facing "update plan" export (§6 of the
// plan doc) and the verbatim full-backup export used for personal portability.

import { PLAN_SCHEMA_VERSION } from './schema.js';
import { startOfWeek } from './dateUtils.js';

export function buildExportForClaude(plan, activities, matches) {
  const workoutComparisons = plan.workouts.map((w) => {
    const entry = matches.matchesByWorkoutId.get(w.id);
    const c = entry?.comparison || {};
    return {
      workoutId: w.id,
      date: w.date,
      plannedTitle: w.title,
      plannedType: w.type,
      plannedDistanceKm: c.plannedDistanceKm ?? null,
      actualDistanceKm: c.actualDistanceKm ?? null,
      plannedElevationM: c.plannedElevationM ?? null,
      actualElevationM: c.actualElevationM ?? null,
      plannedDurationMin: c.plannedDurationMin ?? null,
      actualDurationMin: c.actualDurationMin ?? null,
      actualAvgHR: c.actualAvgHR ?? null,
      actualAvgPowerW: c.actualAvgPowerW ?? null,
      completionStatus: entry?.completionStatus || 'planned',
      matchedActivityIds: (entry?.activities || []).map((a) => a.id),
    };
  });

  const unmatchedActivities = matches.unmatchedActivities.map((a) => ({
    activityId: a.id,
    date: a.date,
    activityName: a.activityName,
    distanceKm: a.distanceM != null ? round1(a.distanceM / 1000) : null,
    elevationM: a.elevationGainM ?? null,
    durationMin: a.durationSec != null ? Math.round(a.durationSec / 60) : null,
  }));

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    currentPlan: plan,
    activitySummary: buildActivitySummary(activities),
    workoutComparisons,
    unmatchedActivities,
  };
}

function buildActivitySummary(activities) {
  if (!activities.length) {
    return { rangeStart: null, rangeEnd: null, totalRides: 0, totalDistanceKm: 0, totalElevationM: 0, totalDurationHr: 0, weeklyBreakdown: [] };
  }
  const sorted = [...activities].sort((a, b) => a.date.localeCompare(b.date));
  const byWeek = new Map();
  sorted.forEach((a) => {
    const weekStart = startOfWeek(a.date);
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, { weekStart, distanceKm: 0, elevationM: 0, durationHr: 0, rideCount: 0 });
    const w = byWeek.get(weekStart);
    w.distanceKm += (a.distanceM || 0) / 1000;
    w.elevationM += a.elevationGainM || 0;
    w.durationHr += (a.durationSec || 0) / 3600;
    w.rideCount += 1;
  });
  const weeklyBreakdown = [...byWeek.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => ({ ...w, distanceKm: round1(w.distanceKm), elevationM: Math.round(w.elevationM), durationHr: round1(w.durationHr) }));

  return {
    rangeStart: sorted[0].date,
    rangeEnd: sorted[sorted.length - 1].date,
    totalRides: activities.length,
    totalDistanceKm: round1(activities.reduce((s, a) => s + (a.distanceM || 0), 0) / 1000),
    totalElevationM: Math.round(activities.reduce((s, a) => s + (a.elevationGainM || 0), 0)),
    totalDurationHr: round1(activities.reduce((s, a) => s + (a.durationSec || 0), 0) / 3600),
    weeklyBreakdown,
  };
}

export function buildFullBackup(plan, activities, settings) {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    plan,
    activities,
    settings,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
