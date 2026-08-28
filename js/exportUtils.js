// Builds the two export shapes: the aggregated, Claude-facing "update plan" export (§6 of the
// plan doc) and the verbatim full-backup export used for personal portability.

import { PLAN_SCHEMA_VERSION } from './schema.js';
import { startOfWeek } from './dateUtils.js';
import { computeSegmentStats, computeAggregateStats } from './workingSetUtils.js';

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
      // actualAvgPower/HR above are whole-ride (warmup/cooldown/rest included). Where the athlete
      // manually marked a "working set" (js/components/workingSetEditor.js — a race's gun-to-finish
      // window, or a structured workout's actual intervals), this gives the more meaningful numbers:
      // per-segment averages plus, when there's more than one segment on a ride, that ride's own
      // pooled average across all of them (js/workingSetUtils.js's computeAggregateStats — no
      // cross-*ride* total, matching how the app itself displays this).
      workingSetRides: buildWorkingSetRidesExport(entry?.activities || []),
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

function buildWorkingSetRidesExport(matchedActivities) {
  const rides = matchedActivities
    .filter((a) => a.workingSet?.segments?.length)
    .map((a) => {
      const segments = a.workingSet.segments.map((seg) => {
        const stats = computeSegmentStats(a.series, seg);
        return {
          label: seg.label || null,
          durationMin: stats ? round1(stats.durationSec / 60) : null,
          avgPowerW: stats?.avgPowerW ?? null,
          avgHR: stats?.avgHR ?? null,
          avgSpeedKmh: stats?.avgSpeedKmh ?? null,
        };
      });
      const aggregate = a.workingSet.segments.length > 1 ? computeAggregateStats(a.series, a.workingSet.segments) : null;
      return {
        activityId: a.id,
        activityName: a.activityName || null,
        segments,
        allSegmentsDurationMin: aggregate ? round1(aggregate.durationSec / 60) : null,
        allSegmentsAvgPowerW: aggregate?.avgPowerW ?? null,
        allSegmentsAvgHR: aggregate?.avgHR ?? null,
        allSegmentsAvgSpeedKmh: aggregate?.avgSpeedKmh ?? null,
      };
    });
  return rides.length ? rides : null;
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

/** Triggers a browser download of `obj` as pretty-printed JSON. */
export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
