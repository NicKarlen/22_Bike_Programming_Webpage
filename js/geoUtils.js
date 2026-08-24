// Geo / track math used when deriving summary stats from raw GPX/TCX trackpoints.

const EARTH_RADIUS_M = 6371000;

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/** Sums forward positive elevation deltas, ignoring jitter below `noiseThresholdM`. */
export function computeElevationGain(altitudes, noiseThresholdM = 1) {
  if (!altitudes || altitudes.length < 2) return 0;
  let gain = 0;
  let base = altitudes[0];
  for (let i = 1; i < altitudes.length; i++) {
    const alt = altitudes[i];
    if (alt == null || base == null) {
      base = alt;
      continue;
    }
    const delta = alt - base;
    if (delta >= noiseThresholdM) {
      gain += delta;
      base = alt;
    } else if (delta < 0) {
      base = alt;
    }
  }
  return Math.round(gain);
}

export function computeTrackDistanceMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.lat == null || b.lat == null) continue;
    total += haversineDistanceMeters(a.lat, a.lon, b.lat, b.lon);
  }
  return Math.round(total);
}
