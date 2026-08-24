// Minimal hash-based router: maps '#/path' to a render function, keeps the bottom nav in sync.

const routes = new Map();
let container = null;
let navContainer = null;
let currentPath = null;

export function registerView(path, renderFn, navMeta) {
  routes.set(path, { renderFn, navMeta });
}

export function init({ appContainer, navEl, defaultPath = '/dashboard' }) {
  container = appContainer;
  navContainer = navEl;
  window.addEventListener('hashchange', () => renderCurrentRoute());
  if (!location.hash) location.hash = `#${defaultPath}`;
  renderNav();
  renderCurrentRoute();
}

export function navigate(path) {
  location.hash = `#${path}`;
}

export function getCurrentPath() {
  return currentPath;
}

export function renderCurrentRoute() {
  const path = (location.hash || '#/dashboard').slice(1);
  currentPath = routes.has(path) ? path : '/dashboard';
  const route = routes.get(currentPath);
  container.innerHTML = '';
  route.renderFn(container);
  highlightNav();
  window.scrollTo(0, 0);
}

function renderNav() {
  if (!navContainer) return;
  navContainer.innerHTML = '';
  for (const [path, { navMeta }] of routes) {
    if (!navMeta) continue;
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.path = path;
    btn.innerHTML = `<span class="nav-icon">${navMeta.icon}</span><span class="nav-label">${navMeta.label}</span>`;
    btn.addEventListener('click', () => navigate(path));
    navContainer.appendChild(btn);
  }
}

function highlightNav() {
  if (!navContainer) return;
  [...navContainer.children].forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.path === currentPath);
  });
}
