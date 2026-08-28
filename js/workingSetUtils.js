// Pure helpers for "working set" segments: user-placed {startSec, endSec} ranges over a ride's
// `series` (see js/seriesUtils.js) marking the part(s) of the ride — a race's gun-to-finish
// window, or a structured workout's work intervals — that should be averaged separately from the
// whole-ride stats. Segment bounds are the only thing persisted (js/state.js's
// setActivityWorkingSet); the averages here are always recomputed on the fly from `series`, so
// they stay correct even if the series' bucket resolution changes later.

/**
 * @param {{tSec:number[], hrBpm:(number|null)[], powerW:(number|null)[], speedKmh:(number|null)[]}} series
 * @param {{startSec:number, endSec:number}} bounds
 * @returns {{durationSec:number, avgPowerW:?number, avgHR:?number, avgSpeedKmh:?number}|null}
 */
export function computeSegmentStats(series, { startSec, endSec }) {
  if (!series?.tSec?.length) return null;

  const idxs = [];
  series.tSec.forEach((t, i) => {
    if (t >= startSec && t <= endSec) idxs.push(i);
  });
  if (!idxs.length) return null;

  const mean = (arr, decimals = 0) => {
    const vals = idxs.map((i) => arr?.[i]).filter((v) => v != null);
    if (!vals.length) return null;
    const factor = 10 ** decimals;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * factor) / factor;
  };

  return {
    durationSec: Math.max(0, Math.round(endSec - startSec)),
    avgPowerW: mean(series.powerW),
    avgHR: mean(series.hrBpm),
    avgSpeedKmh: mean(series.speedKmh, 1),
  };
}

/**
 * Per-ride breakdown of working-set segment stats, for activities that have any. Used by
 * js/components/workingSetSummary.js — one entry per contributing activity, each carrying its
 * own segments' computed stats (no cross-ride combined total, by design).
 * @param {object[]} activities
 * @returns {{activity:object, segments:{segment:object, stats:object|null}[]}[]}
 */
export function buildWorkingSetBreakdown(activities) {
  return (activities || [])
    .filter((a) => a.workingSet?.segments?.length)
    .map((a) => ({
      activity: a,
      segments: a.workingSet.segments.map((segment) => ({
        segment,
        stats: computeSegmentStats(a.series, segment),
      })),
    }));
}
