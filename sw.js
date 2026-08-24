// App-shell cache-first service worker. Bump CACHE_NAME on every deploy that changes
// any cached file so clients pick up the new version instead of a stale cache.
const CACHE_NAME = 'bikeapp-shell-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/views.css',
  './icons/icon.svg',
  './js/app.js',
  './js/router.js',
  './js/state.js',
  './js/storage.js',
  './js/schema.js',
  './js/matching.js',
  './js/activityImport.js',
  './js/exportUtils.js',
  './js/promptTemplates.js',
  './js/dateUtils.js',
  './js/idUtils.js',
  './js/geoUtils.js',
  './js/components/modal.js',
  './js/components/calendarGrid.js',
  './js/components/workoutCard.js',
  './js/components/workoutForm.js',
  './js/components/fileDropZone.js',
  './js/views/dashboard.js',
  './js/views/plan.js',
  './js/views/activities.js',
  './js/views/prompts.js',
  './js/views/importExport.js',
  './js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
