// Builds the two copy/paste prompts for claude.ai. Kept as plain string templates so the
// exact wording is easy to tweak without touching any other module.

import { PLAN_SCHEMA_VERSION, WORKOUT_TYPES, SPORT_TYPES } from './schema.js';
import { startOfWeek, addDays } from './dateUtils.js';

const SCHEMA_BLOCK = `{
  "schemaVersion": ${PLAN_SCHEMA_VERSION},
  "generatedAt": "<ISO datetime>",
  "athlete": { "name": string|null, "ftpWatts": number|null, "maxHR": number|null, "restingHR": number|null },
  "goal": { "eventName": string, "eventDate": "YYYY-MM-DD", "eventType": string, "description": string } | null,
  "planStart": "YYYY-MM-DD",
  "planEnd": "YYYY-MM-DD",
  "weeks": [ { "weekNumber": number, "startDate": "YYYY-MM-DD", "focus": string, "notes": string } ],
  "workouts": [
    {
      "id": "<YYYY-MM-DD>-<short-slug>",
      "date": "YYYY-MM-DD",
      "weekNumber": number,
      "title": string,
      "type": one of ${JSON.stringify(WORKOUT_TYPES)},
      "sport": one of ${JSON.stringify(SPORT_TYPES)},
      "description": string,
      "targets": {
        "durationMin": number|null, "distanceKm": number|null, "elevationM": number|null,
        "intensity": string|null, "targetHRZone": string|null, "targetPowerW": string|null, "tss": number|null
      },
      "status": "planned",
      "notes": ""
    }
  ]
}`;
// Per-workout "notes" is shown on the app's Done tab, not the Planned tab (which has
// "description" for pre-workout intent) — so it reads best as commentary on how the workout
// actually went, not as instructions for before it happens.

export function computeRecentTrainingSummary(activities, weeks = 10) {
  if (!activities?.length) return null;
  const cutoff = addDays(startOfWeek(new Date().toISOString().slice(0, 10)), -7 * weeks);
  const recent = activities.filter((a) => a.date >= cutoff);
  if (!recent.length) return null;

  const totalDistanceKm = recent.reduce((sum, a) => sum + (a.distanceM || 0) / 1000, 0);
  const totalElevationM = recent.reduce((sum, a) => sum + (a.elevationGainM || 0), 0);
  const totalDurationHr = recent.reduce((sum, a) => sum + (a.durationSec || 0) / 3600, 0);
  const longestRideKm = Math.max(...recent.map((a) => (a.distanceM || 0) / 1000));

  return {
    windowWeeks: weeks,
    rideCount: recent.length,
    totalDistanceKm: round1(totalDistanceKm),
    totalElevationM: Math.round(totalElevationM),
    totalDurationHr: round1(totalDurationHr),
    avgRidesPerWeek: round1(recent.length / weeks),
    longestRideKm: round1(longestRideKm),
  };
}

export function buildCreatePlanPrompt({ today, goal, athlete, recentSummary, includeSummary }) {
  const parts = [];
  parts.push(`I'd like you to build me a structured cycling training plan. Today's date is ${today}.`);

  if (athlete && (athlete.name || athlete.ftpWatts || athlete.maxHR || athlete.restingHR)) {
    parts.push(`\nAbout me:\n${JSON.stringify(athlete, null, 2)}`);
  }

  if (goal && goal.eventName) {
    parts.push(`\nMy goal event:\n${JSON.stringify(goal, null, 2)}`);
  } else {
    parts.push(`\nI don't have a specific goal event — build a sensible general fitness/endurance progression for the next 8-12 weeks.`);
  }

  if (includeSummary && recentSummary) {
    parts.push(`\nMy recent training (last ${recentSummary.windowWeeks} weeks, from my own ride data): ${JSON.stringify(recentSummary, null, 2)}\nPlease calibrate the plan's starting intensity/volume to this.`);
  }

  parts.push(`\nReturn the plan as a single JSON object matching EXACTLY this schema (field names, types, and structure):\n\n${SCHEMA_BLOCK}`);

  parts.push(`\nInstructions:
- Return ONLY the JSON object. No markdown code fences, no commentary before or after.
- Use "schemaVersion": ${PLAN_SCHEMA_VERSION}.
- Generate each workout "id" as "<date>-<short-slug>", e.g. "2026-09-01-endurance-ride".
- Use only the listed values for "type" and "sport" where they apply.
- Build a realistic week-by-week progression (varying intensity/volume, including recovery weeks) appropriate to the goal date and my recent training load.
- Every workout needs a "date" in the plan's date range — don't leave gaps unless a day is deliberately a rest day (use "type": "rest").`);

  return parts.join('\n');
}

export function buildUpdatePlanPrompt({ exportObj, userNote }) {
  const parts = [];
  parts.push(`Here is my current cycling training plan along with how my actual rides compared to what was planned, and my full recent ride history summary. Please review my adherence and progress, then adjust my UPCOMING (future-dated) workouts accordingly. Leave past workouts as-is unless there's a good reason to revise them.`);

  if (userNote && userNote.trim()) {
    parts.push(`\nA note from me: ${userNote.trim()}`);
  }

  parts.push(`\nCurrent plan + results (JSON):\n${JSON.stringify(exportObj, null, 2)}`);

  parts.push(`\nNote on "workoutComparisons[].actualAvgPowerW"/"actualAvgHR": these are whole-ride averages, including warmup/cooldown/rest. Where "workingSetRides" is present on a workout, that's my own manually-marked "working set" — a race's actual race-time window, or a structured workout's real intervals — with per-segment averages plus (when there's more than one segment) that ride's combined average across all of them. Prefer those numbers over the whole-ride ones when judging how an interval session or race actually went.`);

  parts.push(`\nReturn a FULL REPLACEMENT plan as a single JSON object, in the exact same schema as "currentPlan" above ("schemaVersion": ${PLAN_SCHEMA_VERSION}, same "workouts" field shape). For each COMPLETED workout (one with a "workoutComparisons" entry showing actual results), write a short "notes" — your read on how it actually went, using the actual/workingSetRides numbers (e.g. "held target power well, HR drifted late" or "well under target, may need more recovery"). For future/upcoming workouts, revise "description"/targets as needed per the adherence review above and leave "notes" empty. Return ONLY the JSON object — no markdown fences, no commentary.`);

  return parts.join('\n');
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
