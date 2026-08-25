// Shared status display metadata (label + glyph), consumed by workout cards, the workout detail
// view, and the calendar legend so all three stay in sync.

export const STATUS_LABEL = {
  planned: 'Planned',
  completed: 'Completed',
  partial: 'Partial',
  missed: 'Missed',
  extra: 'Extra',
  rested: 'Rested',
};

export const STATUS_GLYPH = {
  planned: '○',
  completed: '✓',
  partial: '◐',
  missed: '✕',
  extra: '＋',
  rested: '⟳',
};

// Display order for legends — deliberately excludes "extra" (unplanned rides, shown separately).
export const STATUS_LEGEND_ORDER = ['planned', 'completed', 'partial', 'rested', 'missed'];

export function statusLabel(status) {
  return STATUS_LABEL[status] || status;
}

export function statusGlyph(status) {
  return STATUS_GLYPH[status] || '';
}
