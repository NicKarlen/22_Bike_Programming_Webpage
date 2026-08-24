import { state, setSettings, clearAllData } from '../state.js';
import { estimateUsageBytes } from '../storage.js';

export function renderSettings(container) {
  const view = document.createElement('div');
  view.className = 'view settings-view';
  const athlete = state.settings.athlete || {};
  const usageKb = Math.round(estimateUsageBytes() / 1024);

  view.innerHTML = `
    <h1>Settings</h1>

    <fieldset class="prompt-form">
      <legend>Athlete profile</legend>
      <p class="view-subtitle">Used to calibrate the "create plan" prompt — all optional.</p>
      <label>Name<input type="text" id="s-name" value="${escapeAttr(athlete.name || '')}"></label>
      <div class="form-row">
        <label>FTP (W)<input type="number" id="s-ftp" value="${athlete.ftpWatts ?? ''}"></label>
        <label>Max HR<input type="number" id="s-maxhr" value="${athlete.maxHR ?? ''}"></label>
        <label>Resting HR<input type="number" id="s-resthr" value="${athlete.restingHR ?? ''}"></label>
      </div>
      <button class="btn btn-primary" id="save-athlete-btn">Save</button>
      <span class="copy-feedback" id="save-feedback"></span>
    </fieldset>

    <section class="ie-section">
      <h2>Install as an app</h2>
      <p class="view-subtitle">On your phone, use your browser's "Add to Home Screen" (Android/Chrome) or "Add to Home Screen" from the Share menu (iOS/Safari) to install this as an app icon. It works offline once installed.</p>
    </section>

    <section class="ie-section">
      <h2>Storage</h2>
      <p class="view-subtitle">Everything is stored only in this browser's local storage (~${usageKb} KB used). Nothing is sent anywhere — use Import/Export to back up or move data.</p>
      <button class="btn btn-danger" id="clear-data-btn">Clear all data</button>
    </section>
  `;

  view.querySelector('#save-athlete-btn').addEventListener('click', () => {
    setSettings({
      athlete: {
        name: view.querySelector('#s-name').value || null,
        ftpWatts: numOrNull(view.querySelector('#s-ftp').value),
        maxHR: numOrNull(view.querySelector('#s-maxhr').value),
        restingHR: numOrNull(view.querySelector('#s-resthr').value),
      },
    });
    // setSettings triggers a full re-render of the current route, which replaces `view` in the
    // DOM — re-query the feedback element from `container` (the stable node) rather than the
    // now-detached `view`, or "Saved!" would be written somewhere invisible.
    const fb = container.querySelector('#save-feedback');
    if (fb) {
      fb.textContent = 'Saved!';
      setTimeout(() => { fb.textContent = ''; }, 2000);
    }
  });

  view.querySelector('#clear-data-btn').addEventListener('click', () => {
    if (confirm('This will permanently delete your plan, imported activities, and settings from this browser. Continue?')) {
      clearAllData(); // already triggers the route re-render — no manual re-render needed here
    }
  });

  container.appendChild(view);
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function escapeAttr(str) {
  return (str || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
