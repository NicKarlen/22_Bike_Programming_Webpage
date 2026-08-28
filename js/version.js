// Single source of truth for the human-readable version label shown in Settings.
//
// This is just a friendly label — it doesn't drive any caching behavior itself. Bump it by hand
// alongside sw.js's CACHE_NAME on every release that changes a cached file (which, in this
// zero-build-step app, is essentially every release): they're two different mechanisms — this is
// what the user reads to sanity-check "am I on the latest build", CACHE_NAME is what actually
// busts the service worker's cache — but should move together so the number on screen is
// meaningful.
export const APP_VERSION = '0.10';
