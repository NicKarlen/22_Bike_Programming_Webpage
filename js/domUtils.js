// Shared DOM/string helpers used across views and components.

export function escapeHtml(str) {
  return (str || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
