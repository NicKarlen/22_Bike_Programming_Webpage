// Id / slug helpers.

export function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'workout';
}

export function generateWorkoutId(dateStr, title) {
  return `${dateStr}-${slugify(title)}`;
}

/** Small random id for things that don't need to be human-legible (manual match overrides, etc). */
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Ensures uniqueness among a list of existing ids by appending -2, -3, ... if needed. */
export function uniqueId(baseId, existingIds) {
  if (!existingIds.has(baseId)) return baseId;
  let n = 2;
  while (existingIds.has(`${baseId}-${n}`)) n++;
  return `${baseId}-${n}`;
}
