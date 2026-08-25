// Date helpers. Dates are handled as plain 'YYYY-MM-DD' strings wherever possible
// to avoid timezone surprises; Date objects are only used for calculations.

export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function isValidISODate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(str)) return false;
  const d = parseISODate(str);
  return d instanceof Date && !isNaN(d.getTime());
}

export function addDays(isoStr, n) {
  const d = parseISODate(isoStr);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(isoA, isoB) {
  const a = parseISODate(isoA);
  const b = parseISODate(isoB);
  return Math.round((b - a) / 86400000);
}

// Monday-based start of week
export function startOfWeek(isoStr) {
  const d = parseISODate(isoStr);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function formatDisplayDate(isoStr, opts = {}) {
  const d = parseISODate(isoStr);
  if (!d) return '';
  return d.toLocaleDateString(undefined, {
    weekday: opts.weekday ?? 'short',
    month: 'short',
    day: 'numeric',
    year: opts.year ? 'numeric' : undefined,
  });
}

export function formatMonthYear(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatDuration(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds)) return '–';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/** Same as formatDuration, but takes whole minutes — for fields stored as durationMin. */
export function formatDurationMin(totalMinutes) {
  if (totalMinutes == null || isNaN(totalMinutes)) return '–';
  return formatDuration(totalMinutes * 60);
}

export function formatDistance(meters) {
  if (meters == null || isNaN(meters)) return '–';
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatElevation(meters) {
  if (meters == null || isNaN(meters)) return '–';
  return `${Math.round(meters)} m`;
}

/**
 * Builds a 6x7 month grid (Monday-first) of ISO date strings, including
 * leading/trailing days from adjacent months so every week row is full.
 * Returns array of week rows, each an array of { date, inMonth }.
 */
export function getMonthMatrix(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const firstDow = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const gridStart = new Date(year, month, 1 - firstDow);
  const weeks = [];
  let cursor = new Date(gridStart);
  for (let i = 0; i < totalCells; i++) {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      date: toISODate(cursor),
      inMonth: cursor.getMonth() === month,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return weeks;
}
