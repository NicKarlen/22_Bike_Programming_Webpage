// Central app state. Deliberately simple: one mutable object, a persist-then-render pattern,
// no reactivity framework — the dataset (a season of workouts, a few hundred activities) is
// small enough that a full re-render of the active view on every change is cheap and predictable.

import { STORAGE_KEYS, load, save } from './storage.js';
import { emptyPlan } from './schema.js';
import { computeMatches } from './matching.js';

const DEFAULT_SETTINGS = {
  athlete: { name: null, ftpWatts: null, maxHR: null, restingHR: null },
  goal: null,
};

export const state = {
  plan: load(STORAGE_KEYS.PLAN, emptyPlan()),
  activities: load(STORAGE_KEYS.ACTIVITIES, []),
  manualMatches: load(STORAGE_KEYS.MANUAL_MATCHES, {}),
  settings: load(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
  ui: { planViewMode: 'list', calendarYear: new Date().getFullYear(), calendarMonth: new Date().getMonth(), showRestDays: false, dashboardTimeframeWeeks: 8 },
  matches: { matchesByWorkoutId: new Map(), unmatchedActivities: [] },
};

let renderFn = () => {};
export function onStateChange(fn) {
  renderFn = fn;
}

function persistAndRender() {
  recomputeMatches();
  renderFn();
}

function recomputeMatches() {
  state.matches = computeMatches(state.plan, state.activities, state.manualMatches);
}
recomputeMatches();

export function setPlan(newPlan) {
  state.plan = newPlan;
  save(STORAGE_KEYS.PLAN, state.plan);
  persistAndRender();
}

export function updateWorkout(workoutId, patch) {
  state.plan.workouts = state.plan.workouts.map((w) => (w.id === workoutId ? { ...w, ...patch } : w));
  save(STORAGE_KEYS.PLAN, state.plan);
  persistAndRender();
}

export function addWorkout(workout) {
  state.plan.workouts = [...state.plan.workouts, workout].sort((a, b) => a.date.localeCompare(b.date));
  save(STORAGE_KEYS.PLAN, state.plan);
  persistAndRender();
}

export function deleteWorkout(workoutId) {
  state.plan.workouts = state.plan.workouts.filter((w) => w.id !== workoutId);
  save(STORAGE_KEYS.PLAN, state.plan);
  persistAndRender();
}

export function setActivities(newActivities) {
  state.activities = newActivities;
  save(STORAGE_KEYS.ACTIVITIES, state.activities);
  persistAndRender();
}

export function setManualMatch(activityId, workoutId) {
  state.manualMatches = { ...state.manualMatches, [activityId]: workoutId };
  save(STORAGE_KEYS.MANUAL_MATCHES, state.manualMatches);
  persistAndRender();
}

export function clearManualMatch(activityId) {
  const { [activityId]: _, ...rest } = state.manualMatches;
  state.manualMatches = rest;
  save(STORAGE_KEYS.MANUAL_MATCHES, state.manualMatches);
  persistAndRender();
}

export function setSettings(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  save(STORAGE_KEYS.SETTINGS, state.settings);
  persistAndRender();
}

/**
 * Same as setSettings but skips the global re-render. Use when a caller is about to keep
 * writing into DOM nodes it already holds a reference to (e.g. rendering prompt output right
 * after saving the goal) — a full re-render mid-handler would replace those nodes out from
 * under it.
 */
export function setSettingsSilent(newSettings) {
  state.settings = { ...state.settings, ...newSettings };
  save(STORAGE_KEYS.SETTINGS, state.settings);
}

export function setUi(patch) {
  state.ui = { ...state.ui, ...patch };
  renderFn();
}

export function clearAllData() {
  state.plan = emptyPlan();
  state.activities = [];
  state.manualMatches = {};
  state.settings = DEFAULT_SETTINGS;
  save(STORAGE_KEYS.PLAN, state.plan);
  save(STORAGE_KEYS.ACTIVITIES, state.activities);
  save(STORAGE_KEYS.MANUAL_MATCHES, state.manualMatches);
  save(STORAGE_KEYS.SETTINGS, state.settings);
  persistAndRender();
}
