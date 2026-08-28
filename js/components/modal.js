// Generic modal helper. Usage: openModal({ title, bodyEl, onClose }).

let rootEl = null;
// Fires exactly once, on the next closeModal() call, then clears itself — regardless of what
// triggered that close (the X button, clicking outside, or a caller's own onSave handler calling
// closeModal() after saving). Put "always do X when this modal goes away" logic here rather than
// duplicating it across every way the modal can close — e.g. the working-set review queue uses
// this to advance to the next ride whether the current one was saved or skipped.
let pendingOnClose = null;

export function initModalRoot(el) {
  rootEl = el;
}

export function openModal({ title, bodyEl, className = '', onClose = null }) {
  closeModal();
  pendingOnClose = onClose;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  const modal = document.createElement('div');
  modal.className = `modal ${className}`;

  const header = document.createElement('div');
  header.className = 'modal-header';
  const h = document.createElement('h3');
  h.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeModal);
  header.append(h, closeBtn);

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.appendChild(bodyEl);

  modal.append(header, body);
  overlay.appendChild(modal);
  rootEl.appendChild(overlay);
  document.body.classList.add('modal-open');

  return { close: closeModal };
}

export function closeModal() {
  if (!rootEl) return;
  const fn = pendingOnClose;
  pendingOnClose = null;
  rootEl.innerHTML = '';
  document.body.classList.remove('modal-open');
  fn?.();
}
