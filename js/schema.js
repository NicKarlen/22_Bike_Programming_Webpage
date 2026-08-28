// Training plan JSON schema: constants, validation, normalization.
// This is the schema embedded verbatim into the Claude prompts (see promptTemplates.js) —
// keep field names/shape here as the single source of truth.

import { generateWorkoutId, uniqueId } from './idUtils.js';
import { isValidISODate } from './dateUtils.js';

export const PLAN_SCHEMA_VERSION = 1;

export const WORKOUT_TYPES = [
  'endurance', 'recovery', 'interval', 'tempo', 'threshold',
  'vo2max', 'long_ride', 'race', 'rest', 'cross_train', 'other',
];

export const SPORT_TYPES = ['road', 'gravel', 'mountain', 'indoor', 'any'];

export function emptyPlan() {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    athlete: { name: null, ftpWatts: null, maxHR: null, restingHR: null },
    goal: null,
    planStart: null,
    planEnd: null,
    weeks: [],
    workouts: [],
  };
}

export function createWorkout(partial = {}) {
  const date = partial.date;
  const title = partial.title || 'Ride';
  return {
    id: partial.id || generateWorkoutId(date, title),
    date,
    weekNumber: partial.weekNumber ?? null,
    title,
    type: partial.type || 'endurance',
    sport: partial.sport || 'any',
    description: partial.description || '',
    targets: {
      durationMin: partial.targets?.durationMin ?? null,
      distanceKm: partial.targets?.distanceKm ?? null,
      elevationM: partial.targets?.elevationM ?? null,
      intensity: partial.targets?.intensity ?? null,
      targetHRZone: partial.targets?.targetHRZone ?? null,
      targetPowerW: partial.targets?.targetPowerW ?? null,
      tss: partial.targets?.tss ?? null,
    },
    status: partial.status || 'planned',
    // Deliberately two separate free-text fields, not one: `notes` is authored before the ride
    // (coaching intent — shown/edited on the Planned tab, via workoutForm.js); `doneNotes` is
    // authored after (retrospective — shown/edited on the Done tab, via doneNotesForm.js). Keeping
    // them apart means an update-plan response's retrospective commentary never overwrites the
    // original pre-workout guidance, and vice versa.
    notes: partial.notes || '',
    doneNotes: partial.doneNotes || '',
  };
}

/**
 * Validates a parsed JSON object against the plan schema.
 * Deliberately lenient on `type`/`sport` (unknown values are allowed, just flagged)
 * so slightly-off Claude output isn't rejected outright.
 */
export function validatePlan(obj) {
  const errors = [];
  const warnings = [];

  if (!obj || typeof obj !== 'object') {
    return { valid: false, errors: ['Not a JSON object.'], warnings };
  }
  if (obj.schemaVersion !== PLAN_SCHEMA_VERSION) {
    warnings.push(`Expected schemaVersion ${PLAN_SCHEMA_VERSION}, got ${JSON.stringify(obj.schemaVersion)}. Importing anyway.`);
  }
  if (!Array.isArray(obj.workouts)) {
    errors.push('Missing or invalid "workouts" array.');
    return { valid: false, errors, warnings };
  }

  const seenIds = new Set();
  obj.workouts.forEach((w, i) => {
    const where = `workouts[${i}]`;
    if (!w || typeof w !== 'object') { errors.push(`${where}: not an object.`); return; }
    if (!w.date || !isValidISODate(w.date)) errors.push(`${where}: missing/invalid "date".`);
    if (!w.title) errors.push(`${where}: missing "title".`);
    if (!w.type) errors.push(`${where}: missing "type".`);
    if (w.type && !WORKOUT_TYPES.includes(w.type)) warnings.push(`${where}: unrecognized type "${w.type}" — will still be shown.`);
    if (w.sport && !SPORT_TYPES.includes(w.sport)) warnings.push(`${where}: unrecognized sport "${w.sport}" — will still be shown.`);
    if (w.id && seenIds.has(w.id)) warnings.push(`${where}: duplicate id "${w.id}" — will be de-duplicated on import.`);
    if (w.id) seenIds.add(w.id);
  });

  return { valid: errors.length === 0, errors, warnings };
}

/** Fills in defaults/derived fields (ids, weekNumber) so downstream code can rely on a consistent shape. */
export function normalizePlan(obj) {
  const plan = emptyPlan();
  plan.schemaVersion = PLAN_SCHEMA_VERSION;
  plan.generatedAt = obj.generatedAt || plan.generatedAt;
  plan.athlete = { ...plan.athlete, ...(obj.athlete || {}) };
  plan.goal = obj.goal || null;
  plan.planStart = obj.planStart || null;
  plan.planEnd = obj.planEnd || null;
  plan.weeks = Array.isArray(obj.weeks) ? obj.weeks : [];

  const usedIds = new Set();
  plan.workouts = (obj.workouts || [])
    .filter((w) => w && w.date)
    .map((w) => {
      const workout = createWorkout(w);
      workout.id = uniqueId(workout.id, usedIds);
      usedIds.add(workout.id);
      return workout;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return plan;
}

/** Produces a short diff summary (counts only) between the currently-stored plan and an incoming one. */
export function diffPlans(oldPlan, newPlan) {
  const oldIds = new Map((oldPlan?.workouts || []).map((w) => [w.id, w]));
  const newIds = new Map((newPlan?.workouts || []).map((w) => [w.id, w]));
  let added = 0, removed = 0, changed = 0, unchanged = 0;
  for (const [id, w] of newIds) {
    if (!oldIds.has(id)) added++;
    else if (JSON.stringify(oldIds.get(id)) !== JSON.stringify(w)) changed++;
    else unchanged++;
  }
  for (const id of oldIds.keys()) if (!newIds.has(id)) removed++;
  return { added, removed, changed, unchanged, totalNew: newIds.size, totalOld: oldIds.size };
}
