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
 * Combined stats across every given segment — e.g. for "5x5min" intervals, the average power/HR
 * held across all five work bouts together, not just each one individually. Duration is the plain
 * sum of each segment's own length (what a user means by "25 minutes of work"); the averages pool
 * every sample from every segment (deduplicated by bucket, so an accidental overlap between two
 * segments doesn't double-count that overlap's samples) rather than averaging the segments'
 * already-rounded individual averages, which would compound rounding error.
 * @param {object} series
 * @param {{startSec:number, endSec:number}[]} segments
 * @returns {{segmentCount:number, durationSec:number, avgPowerW:?number, avgHR:?number, avgSpeedKmh:?number}|null}
 */
export function computeAggregateStats(series, segments) {
  if (!series?.tSec?.length || !segments?.length) return null;

  const idxSet = new Set();
  segments.forEach(({ startSec, endSec }) => {
    series.tSec.forEach((t, i) => {
      if (t >= startSec && t <= endSec) idxSet.add(i);
    });
  });
  if (!idxSet.size) return null;
  const idxs = [...idxSet];

  const mean = (arr, decimals = 0) => {
    const vals = idxs.map((i) => arr?.[i]).filter((v) => v != null);
    if (!vals.length) return null;
    const factor = 10 ** decimals;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * factor) / factor;
  };

  return {
    segmentCount: segments.length,
    durationSec: Math.round(segments.reduce((a, s) => a + Math.max(0, s.endSec - s.startSec), 0)),
    avgPowerW: mean(series.powerW),
    avgHR: mean(series.hrBpm),
    avgSpeedKmh: mean(series.speedKmh, 1),
  };
}
