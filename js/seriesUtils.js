// Downsamples raw per-trackpoint samples into a fixed-size, time-bucketed series so a ride's
// stored footprint stays bounded regardless of how long it was (a 5-hour ride still caps out at
// `maxPoints`). Used by activityImport.js right after parsing, before the raw per-point arrays
// (which can be thousands of entries for a long ride) go out of scope and get discarded.

/**
 * @param {{tSec:number, hr:?number, power:?number, ele:?number}[]} points  raw per-trackpoint samples
 * @param {number} maxPoints
 * @returns {{tSec:number[], hrBpm:(number|null)[], powerW:(number|null)[], elevationM:(number|null)[]} | null}
 */
export function downsampleSeries(points, maxPoints = 180) {
  const valid = (points || []).filter((p) => p && p.tSec != null && !isNaN(p.tSec));
  if (!valid.length) return null;

  const tMin = valid[0].tSec;
  const tMax = valid[valid.length - 1].tSec;
  const span = Math.max(tMax - tMin, 1);
  const bucketCount = Math.max(1, Math.min(maxPoints, valid.length));

  const buckets = Array.from({ length: bucketCount }, () => ({
    tSum: 0, tCount: 0, hrSum: 0, hrCount: 0, powerSum: 0, powerCount: 0, eleSum: 0, eleCount: 0,
  }));

  valid.forEach((p) => {
    const frac = (p.tSec - tMin) / span;
    const idx = Math.min(bucketCount - 1, Math.floor(frac * bucketCount));
    const b = buckets[idx];
    b.tSum += p.tSec; b.tCount++;
    if (p.hr != null) { b.hrSum += p.hr; b.hrCount++; }
    if (p.power != null) { b.powerSum += p.power; b.powerCount++; }
    if (p.ele != null) { b.eleSum += p.ele; b.eleCount++; }
  });

  const tSec = [], hrBpm = [], powerW = [], elevationM = [];
  buckets.forEach((b) => {
    if (!b.tCount) return; // empty bucket (no raw samples landed here) — drop rather than interpolate
    tSec.push(Math.round(b.tSum / b.tCount));
    hrBpm.push(b.hrCount ? Math.round(b.hrSum / b.hrCount) : null);
    powerW.push(b.powerCount ? Math.round(b.powerSum / b.powerCount) : null);
    elevationM.push(b.eleCount ? Math.round((b.eleSum / b.eleCount) * 10) / 10 : null);
  });

  return tSec.length ? { tSec, hrBpm, powerW, elevationM } : null;
}
