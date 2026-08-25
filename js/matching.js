// Planned-vs-actual matching: pure functions, recomputed on every render (dataset is small).

/**
 * @param plan   normalized Plan object (see schema.js)
 * @param activities  array of normalized activity objects (see activityImport.js)
 * @param manualMatches  { [activityId]: workoutId } overrides, consulted first
 * @returns { matchesByWorkoutId: Map<workoutId, MatchResult>, unmatchedActivities: Activity[] }
 */
export function computeMatches(plan, activities, manualMatches = {}) {
  const workouts = plan?.workouts || [];
  const byDate = new Map();
  workouts.forEach((w) => {
    if (!byDate.has(w.date)) byDate.set(w.date, []);
    byDate.get(w.date).push(w);
  });

  const claimedActivityIds = new Set();
  const matchesByWorkoutId = new Map();

  // 1. Manual overrides win first.
  for (const [activityId, workoutId] of Object.entries(manualMatches)) {
    const activity = activities.find((a) => a.id === activityId);
    const workout = workouts.find((w) => w.id === workoutId);
    if (!activity || !workout) continue;
    addActivityToWorkout(matchesByWorkoutId, workout, activity);
    claimedActivityIds.add(activityId);
  }

  // 2. Date-based matching for everything else, with a sport-similarity tiebreak
  //    when multiple workouts share a day.
  for (const activity of activities) {
    if (claimedActivityIds.has(activity.id)) continue;
    const candidates = byDate.get(activity.date);
    if (!candidates || !candidates.length) continue;

    let target = candidates[0];
    if (candidates.length > 1) {
      const scored = candidates.map((w) => ({ w, score: sportSimilarity(w, activity) }));
      scored.sort((a, b) => b.score - a.score);
      target = scored[0].w;
    }
    addActivityToWorkout(matchesByWorkoutId, target, activity);
    claimedActivityIds.add(activity.id);
  }

  // 3. Finalize comparisons.
  for (const workout of workouts) {
    const entry = matchesByWorkoutId.get(workout.id);
    if (!entry) {
      matchesByWorkoutId.set(workout.id, {
        activities: [],
        comparison: emptyComparison(),
        completionStatus: isPast(workout.date) ? (isRestLike(workout) ? 'rested' : 'missed') : 'planned',
      });
      continue;
    }
    entry.comparison = buildComparison(workout, entry.activities);
    entry.completionStatus = deriveStatus(workout, entry.comparison);
  }

  const unmatchedActivities = activities.filter((a) => !claimedActivityIds.has(a.id));

  return { matchesByWorkoutId, unmatchedActivities };
}

function sportSimilarity(workout, activity) {
  const sport = (workout.sport || '').toLowerCase();
  const hay = `${activity.sport || ''} ${activity.activityName || ''}`.toLowerCase();
  if (sport === 'indoor' && /indoor|trainer|virtual|zwift/.test(hay)) return 2;
  if (sport === 'mountain' && /mountain|mtb/.test(hay)) return 2;
  if (sport === 'gravel' && /gravel/.test(hay)) return 2;
  if (sport === 'road' && /road|cycling/.test(hay)) return 1;
  return 0;
}

function addActivityToWorkout(map, workout, activity) {
  if (!map.has(workout.id)) map.set(workout.id, { activities: [] });
  map.get(workout.id).activities.push(activity);
}

function emptyComparison() {
  return {
    plannedDistanceKm: null, actualDistanceKm: null,
    plannedElevationM: null, actualElevationM: null,
    plannedDurationMin: null, actualDurationMin: null,
    actualAvgHR: null, actualMaxHR: null,
    actualAvgPowerW: null, actualMaxPowerW: null,
    actualAvgCadenceRpm: null, actualMaxCadenceRpm: null,
    actualAvgSpeedKmh: null, actualMaxSpeedKmh: null,
    actualCalories: null,
    hrZoneStatus: null,
  };
}

function buildComparison(workout, matchedActivities) {
  const c = emptyComparison();
  c.plannedDistanceKm = workout.targets?.distanceKm ?? null;
  c.plannedElevationM = workout.targets?.elevationM ?? null;
  c.plannedDurationMin = workout.targets?.durationMin ?? null;

  if (!matchedActivities.length) return c;

  const sum = (fn) => matchedActivities.reduce((acc, a) => acc + (fn(a) || 0), 0);
  const anyMax = (fn) => matchedActivities.reduce((acc, a) => {
    const v = fn(a);
    return v == null ? acc : Math.max(acc ?? 0, v);
  }, null);
  const weightedAvg = (fn) => {
    const withVals = matchedActivities.filter((a) => fn(a) != null);
    if (!withVals.length) return null;
    return Math.round(withVals.reduce((acc, a) => acc + fn(a), 0) / withVals.length);
  };

  c.actualDistanceKm = round1(sum((a) => (a.distanceM || 0) / 1000));
  c.actualElevationM = Math.round(sum((a) => a.elevationGainM || 0));
  c.actualDurationMin = Math.round(sum((a) => (a.durationSec || 0) / 60));
  c.actualAvgHR = weightedAvg((a) => a.avgHR);
  c.actualMaxHR = anyMax((a) => a.maxHR);
  c.actualAvgPowerW = weightedAvg((a) => a.avgPowerW);
  c.actualMaxPowerW = anyMax((a) => a.maxPowerW);
  c.actualAvgCadenceRpm = weightedAvg((a) => a.avgCadenceRpm);
  c.actualMaxCadenceRpm = anyMax((a) => a.maxCadenceRpm);
  const avgSpeedKmh = weightedAvg((a) => (a.avgSpeedMs != null ? a.avgSpeedMs * 3.6 : null));
  const maxSpeedKmh = anyMax((a) => (a.maxSpeedMs != null ? a.maxSpeedMs * 3.6 : null));
  c.actualAvgSpeedKmh = avgSpeedKmh != null ? round1(avgSpeedKmh) : null;
  c.actualMaxSpeedKmh = maxSpeedKmh != null ? round1(maxSpeedKmh) : null;
  c.actualCalories = Math.round(sum((a) => a.calories || 0)) || null;

  c.hrZoneStatus = deriveHrZoneStatus(workout.targets?.targetHRZone, c.actualAvgHR);
  return c;
}

function deriveHrZoneStatus(targetZoneLabel, actualAvgHR) {
  if (!targetZoneLabel || actualAvgHR == null) return null;
  // Zones aren't numerically defined in the schema (they're athlete-specific), so this is
  // intentionally just a presence flag for the UI to show "HR recorded" vs a real in/out-of-zone
  // judgement, which would need the athlete's zone thresholds from Settings to be meaningful.
  return 'recorded';
}

// Types where "did nothing that day" is the plan itself, not a missed session —
// a past-dated, unmatched workout of one of these types should read as "Rested", not "Missed".
const RESTFUL_TYPES = new Set(['rest', 'recovery']);
function isRestLike(workout) {
  return RESTFUL_TYPES.has(workout.type);
}

function deriveStatus(workout, comparison) {
  const hasActual = comparison.actualDistanceKm != null || comparison.actualDurationMin != null;
  if (!hasActual) return isPast(workout.date) ? (isRestLike(workout) ? 'rested' : 'missed') : 'planned';

  const planned = comparison.plannedDistanceKm ?? comparison.plannedDurationMin;
  const actual = comparison.actualDistanceKm ?? comparison.actualDurationMin;
  if (planned == null) return 'completed';
  const ratio = actual / planned;
  if (ratio >= 0.85) return 'completed';
  if (ratio >= 0.4) return 'partial';
  return 'completed'; // did something that day, just short — still counts as done, not "missed"
}

function isPast(dateStr) {
  if (!dateStr) return false;
  return dateStr < new Date().toISOString().slice(0, 10);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
