// localStorage persistence: versioned keys, safe get/set, migrations.

export const STORAGE_KEYS = {
  PLAN: 'bikeplan.plan.v1',
  SETTINGS: 'bikeplan.settings.v1',
  ACTIVITIES: 'bikeplan.activities.v1',
  MANUAL_MATCHES: 'bikeplan.manualMatches.v1',
};

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] failed to read ${key}, using fallback`, err);
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    console.error(`[storage] failed to write ${key}`, err);
    const quotaExceeded =
      err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
    return { ok: false, quotaExceeded, error: err };
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[storage] failed to remove ${key}`, err);
  }
}

export function clearAll() {
  Object.values(STORAGE_KEYS).forEach(remove);
}

/** Rough estimate of total bytes used by this app's keys, for a settings-screen display. */
export function estimateUsageBytes() {
  let total = 0;
  for (const key of Object.values(STORAGE_KEYS)) {
    const raw = localStorage.getItem(key);
    if (raw) total += raw.length;
  }
  return total;
}
