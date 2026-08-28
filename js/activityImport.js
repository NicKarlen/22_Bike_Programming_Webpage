// Parses Garmin Connect GPX/TCX exports into a normalized activity record, entirely client-side.
// No network calls, no dependencies — just DOMParser + plain math.

import { computeElevationGain, computeTrackDistanceMeters, haversineDistanceMeters } from './geoUtils.js';
import { toISODate } from './dateUtils.js';
import { downsampleSeries } from './seriesUtils.js';

const NS = {
  tcx: 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2',
  tpx: 'http://www.garmin.com/xmlschemas/ActivityExtension/v2',
  gpxtpx: 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1',
};

// GPS-derived per-point speed (GPX has no native speed field) is noisy — a single bad fix can
// imply an unrealistic speed. Clamp anything above ~90km/h (generous for any road/gravel/MTB
// ride) to null rather than letting it pollute the speed chart or a working-set segment average.
const GPX_MAX_PLAUSIBLE_SPEED_MS = 25;

function num(el, selector, ns) {
  const child = ns ? el?.getElementsByTagNameNS(ns, selector)[0] : el?.querySelector(selector);
  if (!child || !child.textContent) return null;
  const v = parseFloat(child.textContent);
  return isNaN(v) ? null : v;
}

/** Parses a single uploaded File into a normalized activity object, or throws on unrecognized content. */
export async function parseActivityFile(file) {
  const text = await file.text();
  const lower = file.name.toLowerCase();
  const looksLikeTcx = text.includes('TrainingCenterDatabase') || lower.endsWith('.tcx');
  const looksLikeGpx = text.trim().startsWith('<?xml') && text.includes('<gpx') || lower.endsWith('.gpx');

  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error(`${file.name}: not a valid XML file.`);
  }

  if (looksLikeTcx || doc.getElementsByTagNameNS(NS.tcx, 'Activity').length) {
    return parseTCX(doc, file.name);
  }
  if (looksLikeGpx || doc.querySelector('gpx')) {
    return parseGPX(doc, file.name);
  }
  throw new Error(`${file.name}: unrecognized format (expected .gpx or .tcx).`);
}

function parseTCX(doc, fileName) {
  const activityEl = doc.getElementsByTagNameNS(NS.tcx, 'Activity')[0] || doc.querySelector('Activity');
  if (!activityEl) throw new Error(`${fileName}: no <Activity> element found in TCX.`);

  const sportAttr = (activityEl.getAttribute('Sport') || '').toLowerCase();
  const idEl = activityEl.getElementsByTagNameNS(NS.tcx, 'Id')[0] || activityEl.querySelector('Id');
  const startTime = idEl?.textContent?.trim() || null;
  const activityStartDate = startTime ? new Date(startTime) : null;

  const laps = [...activityEl.getElementsByTagNameNS(NS.tcx, 'Lap'), ...activityEl.querySelectorAll('Lap')];
  const uniqueLaps = [...new Set(laps)];

  let distanceM = 0, durationSec = 0, calories = 0;
  let hrSum = 0, hrCount = 0, maxHR = null;
  let cadSum = 0, cadCount = 0, maxCad = null;

  const altitudes = [];
  const trackpointHR = [];
  const trackpointPower = [];
  let maxSpeed = null;
  // Per-point {tSec, hr, power, ele} samples, downsampled into `series` at the end — this is what
  // powers the HR/power/elevation-over-time charts on the workout detail "Done" tab.
  const rawPoints = [];

  uniqueLaps.forEach((lap) => {
    distanceM += num(lap, 'DistanceMeters', NS.tcx) ?? 0;
    durationSec += num(lap, 'TotalTimeSeconds', NS.tcx) ?? 0;
    calories += num(lap, 'Calories', NS.tcx) ?? 0;

    const avgHrEl = lap.getElementsByTagNameNS(NS.tcx, 'AverageHeartRateBpm')[0];
    const avgHr = avgHrEl ? num(avgHrEl, 'Value', NS.tcx) : null;
    if (avgHr != null) { hrSum += avgHr; hrCount++; }
    const maxHrEl = lap.getElementsByTagNameNS(NS.tcx, 'MaximumHeartRateBpm')[0];
    const lapMaxHr = maxHrEl ? num(maxHrEl, 'Value', NS.tcx) : null;
    if (lapMaxHr != null) maxHR = Math.max(maxHR ?? 0, lapMaxHr);

    const lapCad = num(lap, 'Cadence', NS.tcx);
    if (lapCad != null) { cadSum += lapCad; cadCount++; maxCad = Math.max(maxCad ?? 0, lapCad); }

    const trackpoints = [...lap.getElementsByTagNameNS(NS.tcx, 'Trackpoint'), ...lap.querySelectorAll('Trackpoint')];
    [...new Set(trackpoints)].forEach((tp) => {
      const alt = num(tp, 'AltitudeMeters', NS.tcx);
      if (alt != null) altitudes.push(alt);
      const hrEl = tp.getElementsByTagNameNS(NS.tcx, 'HeartRateBpm')[0];
      const hr = hrEl ? num(hrEl, 'Value', NS.tcx) : null;
      if (hr != null) trackpointHR.push(hr);

      const tpx = tp.getElementsByTagNameNS(NS.tpx, 'TPX')[0];
      let watts = null;
      let spd = null;
      if (tpx) {
        watts = num(tpx, 'Watts', NS.tpx);
        if (watts != null) trackpointPower.push(watts);
        spd = num(tpx, 'Speed', NS.tpx);
        if (spd != null) maxSpeed = Math.max(maxSpeed ?? 0, spd);
        const tpxCad = num(tpx, 'RunCadence', NS.tpx) ?? num(tpx, 'Cadence', NS.tpx);
        if (tpxCad != null) { cadSum += tpxCad; cadCount++; maxCad = Math.max(maxCad ?? 0, tpxCad); }
      }

      const timeEl = tp.getElementsByTagNameNS(NS.tcx, 'Time')[0];
      const tDate = timeEl?.textContent ? new Date(timeEl.textContent.trim()) : null;
      if (activityStartDate && tDate && !isNaN(tDate.getTime())) {
        rawPoints.push({ tSec: (tDate - activityStartDate) / 1000, hr, power: watts, ele: alt, speed: spd });
      }
    });
  });

  const avgHR = hrCount ? Math.round(hrSum / hrCount) : (trackpointHR.length ? Math.round(trackpointHR.reduce((a, b) => a + b, 0) / trackpointHR.length) : null);
  const maxHRFinal = maxHR ?? (trackpointHR.length ? Math.max(...trackpointHR) : null);
  const avgPowerW = trackpointPower.length ? Math.round(trackpointPower.reduce((a, b) => a + b, 0) / trackpointPower.length) : null;
  const maxPowerW = trackpointPower.length ? Math.round(Math.max(...trackpointPower)) : null;
  const avgCadenceRpm = cadCount ? Math.round(cadSum / cadCount) : null;
  const elevationGainM = altitudes.length > 1 ? computeElevationGain(altitudes) : null;
  const avgSpeedMs = durationSec > 0 ? distanceM / durationSec : null;
  const series = downsampleSeries(rawPoints);

  return {
    id: startTime || `tcx-${fileName}`,
    activityName: fileName.replace(/\.[^.]+$/, ''),
    sport: sportAttr || 'unknown',
    startTimeLocal: startTime,
    date: activityStartDate ? toISODate(activityStartDate) : null,
    durationSec: durationSec || null,
    distanceM: distanceM || null,
    elevationGainM,
    avgHR, maxHR: maxHRFinal,
    avgSpeedMs, maxSpeedMs: maxSpeed,
    calories: calories || null,
    avgPowerW, maxPowerW,
    avgCadenceRpm, maxCadenceRpm: maxCad,
    sourceFormat: 'tcx',
    series,
  };
}

function parseGPX(doc, fileName) {
  const trkpts = [...doc.querySelectorAll('trkpt')];
  if (!trkpts.length) throw new Error(`${fileName}: GPX has no track points.`);

  const points = [];
  const altitudes = [];
  const hrValues = [];
  const cadValues = [];
  let firstTime = null, lastTime = null;
  // Per-point {tSec, hr, power, ele, speed} samples for the HR/power/speed/elevation-over-time
  // charts (GPX carries no standard power field, so `power` stays null here — see parseTCX for
  // the TCX/TPX equivalent). `speed` isn't a native GPX field either — it's derived below from
  // consecutive-point distance/time, since GPS fixes are noisy enough that a single bad fix can
  // imply an absurd speed, we clamp anything above GPX_MAX_PLAUSIBLE_SPEED_MS to null.
  const rawPoints = [];
  let prevPoint = null; // { lat, lon, tDate } of the last point with valid position+time

  trkpts.forEach((tp) => {
    const lat = parseFloat(tp.getAttribute('lat'));
    const lon = parseFloat(tp.getAttribute('lon'));
    const hasPosition = !isNaN(lat) && !isNaN(lon);
    points.push({ lat, lon });

    let alt = null;
    const eleEl = tp.querySelector('ele');
    if (eleEl) {
      const v = parseFloat(eleEl.textContent);
      if (!isNaN(v)) { alt = v; altitudes.push(v); }
    }
    let tDate = null;
    const timeEl = tp.querySelector('time');
    if (timeEl) {
      const t = new Date(timeEl.textContent);
      if (!isNaN(t.getTime())) {
        tDate = t;
        if (!firstTime) firstTime = t;
        lastTime = t;
      }
    }
    let hr = null;
    const hrEl = tp.getElementsByTagNameNS(NS.gpxtpx, 'hr')[0] || tp.querySelector('hr');
    if (hrEl) {
      const v = parseFloat(hrEl.textContent);
      if (!isNaN(v)) { hr = v; hrValues.push(v); }
    }
    const cadEl = tp.getElementsByTagNameNS(NS.gpxtpx, 'cad')[0] || tp.querySelector('cad');
    if (cadEl) {
      const cad = parseFloat(cadEl.textContent);
      if (!isNaN(cad)) cadValues.push(cad);
    }

    let speed = null;
    if (hasPosition && tDate && prevPoint) {
      const dtSec = (tDate - prevPoint.tDate) / 1000;
      if (dtSec > 0) {
        const distM = haversineDistanceMeters(prevPoint.lat, prevPoint.lon, lat, lon);
        const impliedSpeed = distM / dtSec;
        speed = impliedSpeed <= GPX_MAX_PLAUSIBLE_SPEED_MS ? impliedSpeed : null;
      }
    }
    if (hasPosition && tDate) prevPoint = { lat, lon, tDate };

    if (tDate && firstTime) {
      rawPoints.push({ tSec: (tDate - firstTime) / 1000, hr, power: null, ele: alt, speed });
    }
  });

  const distanceM = computeTrackDistanceMeters(points);
  const durationSec = firstTime && lastTime ? Math.round((lastTime - firstTime) / 1000) : null;
  const elevationGainM = altitudes.length > 1 ? computeElevationGain(altitudes) : null;
  const avgHR = hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null;
  const maxHR = hrValues.length ? Math.round(Math.max(...hrValues)) : null;
  const avgCadenceRpm = cadValues.length ? Math.round(cadValues.reduce((a, b) => a + b, 0) / cadValues.length) : null;
  const maxCadenceRpm = cadValues.length ? Math.round(Math.max(...cadValues)) : null;
  const avgSpeedMs = durationSec > 0 ? distanceM / durationSec : null;

  const trackName = doc.querySelector('trk > name')?.textContent?.trim();
  const startTimeLocal = firstTime ? firstTime.toISOString() : null;
  const series = downsampleSeries(rawPoints);

  return {
    id: startTimeLocal || `gpx-${fileName}`,
    activityName: trackName || fileName.replace(/\.[^.]+$/, ''),
    sport: 'unknown',
    startTimeLocal,
    date: firstTime ? toISODate(firstTime) : null,
    durationSec,
    distanceM: distanceM || null,
    elevationGainM,
    avgHR, maxHR,
    avgSpeedMs, maxSpeedMs: null,
    calories: null,
    avgPowerW: null, maxPowerW: null,
    avgCadenceRpm, maxCadenceRpm,
    sourceFormat: 'gpx',
    series,
  };
}

const NON_CYCLING_HINT = /run|jog|walk|hik|swim/i;

/** Non-blocking heuristic used by the UI to warn (not reject) on likely-mismatched imports. */
export function looksNonCycling(activity) {
  return NON_CYCLING_HINT.test(activity.sport) || NON_CYCLING_HINT.test(activity.activityName || '');
}

/**
 * Parses a FileList/array of Files, merges into the existing activities map (keyed by id).
 * Returns a summary plus the updated activities array.
 */
export async function importFiles(files, existingActivities) {
  const byId = new Map(existingActivities.map((a) => [a.id, a]));
  const result = { importedCount: 0, updatedCount: 0, failed: [], warnings: [], newOrUpdatedIds: [] };

  for (const file of Array.from(files)) {
    try {
      const activity = await parseActivityFile(file);
      if (!activity.date) {
        result.failed.push({ file: file.name, reason: 'Could not determine a start date.' });
        continue;
      }
      if (looksNonCycling(activity)) {
        result.warnings.push(`${file.name}: sport looks like "${activity.sport}" — imported anyway, check it belongs.`);
      }
      // Re-importing a file whose id already exists *refreshes* that activity's record (e.g. to
      // backfill fields added to the parser after it was first imported, like the chart `series`)
      // rather than being silently skipped as a no-op duplicate. `workingSet` is the one exception:
      // it's user-authored (segments placed in the working-set editor), not parser-derived, so a
      // re-import must carry it forward rather than silently wiping it.
      const prev = byId.get(activity.id);
      const merged = prev?.workingSet ? { ...activity, workingSet: prev.workingSet } : activity;
      if (prev) result.updatedCount++;
      else result.importedCount++;
      result.newOrUpdatedIds.push(activity.id);
      byId.set(activity.id, merged);
    } catch (err) {
      result.failed.push({ file: file.name, reason: err.message || String(err) });
    }
  }

  const activities = [...byId.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { ...result, activities };
}
