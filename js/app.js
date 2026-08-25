import { onStateChange } from './state.js';
import { registerView, init as initRouter, renderCurrentRoute } from './router.js';
import { initModalRoot } from './components/modal.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPlan } from './views/plan.js';
import { renderActivities } from './views/activities.js';
import { renderPrompts } from './views/prompts.js';
import { renderSettings } from './views/settings.js';

registerView('/dashboard', renderDashboard, { label: 'Dashboard', icon: '🏠' });
// skipAutoScrollTop: the Plan view marks today's position with [data-scroll-target] and the
// router scrolls there on navigation instead of jumping to the top — see router.js.
registerView('/plan', renderPlan, { label: 'Plan', icon: '📅' }, { skipAutoScrollTop: true });
registerView('/activities', renderActivities, { label: 'Activities', icon: '🚴' });
registerView('/prompts', renderPrompts, { label: 'Prompts', icon: '✨' });
registerView('/settings', renderSettings, { label: 'Settings', icon: '⚙️' });

onStateChange(() => renderCurrentRoute());

initModalRoot(document.getElementById('modal-root'));
initRouter({
  appContainer: document.getElementById('app'),
  navEl: document.getElementById('bottom-nav'),
  defaultPath: '/dashboard',
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  });
}
