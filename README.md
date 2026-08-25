# Bike Training Tracker

A phone-first cycling training tracker and planner. No server, no accounts, no API keys —
everything runs in your browser and is stored in `localStorage`. Training plans are created by
copying a prompt into [claude.ai](https://claude.ai) (a separate tab, not connected to this app)
and pasting the resulting JSON back in. Ride data comes from GPX/TCX files you export from Garmin
Connect and upload here.

## Why no live Garmin sync?

Garmin Connect's API doesn't allow requests from a third-party website's browser JavaScript
(no CORS support), so a "connect and auto-sync" feature would require either committing your
personal ride data into this public repo via a scheduled job, or routing your Garmin password
through some other server. Both were rejected in favor of keeping this **fully static and
private**: you export files from Garmin yourself, and everything else happens locally in your
browser. See `data/` for a sample plan fixture used only in local development.

## Using it

1. Open the deployed site (see hosting below) on your phone or in a browser.
2. **Get a plan:** go to **Prompts → Create plan**, fill in your goal (optional), tap
   **Generate prompt**, copy it, paste it into a claude.ai conversation. Copy Claude's JSON reply
   and paste it into the **Import a plan** section further down the same Prompts page.
3. **Log rides:** in Garmin Connect (works from your phone's browser, not the native app —
   the native app doesn't offer file export), open a ride → the settings/gear menu → **Export to
   TCX** (preferred — carries HR/power/cadence) or **Export to GPX**. Upload the file(s) in the
   **Activities** tab — you can select many at once.
4. Your plan (**Plan** tab, List or Calendar) will automatically show actual vs. planned stats
   for any day where a ride was imported. Click a workout to see its **Planned** vs **Done** tabs.
5. **Update your plan later:** go to **Prompts → Update plan**, generate the prompt (it includes
   your plan + results automatically), paste into Claude, then import the JSON it returns the
   same way as step 2 — it fully replaces the stored plan (you'll see a diff preview first).
6. Use **Settings → Export / backup → Download full backup JSON** any time to back up everything
   locally. That's a personal backup only — it doesn't talk to Claude; use step 5 for that.

## Hosting on GitHub Pages

1. Push this repo to GitHub.
2. Repo Settings → Pages → Deploy from a branch → select your default branch, folder `/ (root)`.
3. Open the published URL. That's it — no build step, no secrets to configure.

Anyone can fork this repo and use their own copy immediately; there's nothing to deploy or
configure beyond enabling Pages.

## Local development

The app uses ES modules and a service worker, both of which require `http(s)://`, not
`file://`. Serve the folder with any static file server, e.g.:

```
python -m http.server 8000
```

or, if you don't have Python, the zero-dependency Node script included here:

```
node dev-server.mjs
```

then open `http://localhost:8000` (or `:8123` for `dev-server.mjs`). Neither script is part of
the deployed app — GitHub Pages serves the static files directly.

## Don't commit your real ride files

`data/` is meant only for `sample-plan.json` (a dev fixture with fake data). If you drop real
Garmin exports or backup JSON there while testing locally, `.gitignore` already excludes them —
but double-check `git status` before pushing, especially if this repo is public. The whole point
of the file-import design (see above) is that your real ride data never has to leave your
browser; don't undo that by committing it.

## Known limitations

- **Icons are SVG-only** (`icons/icon.svg`). This installs fine as a PWA on Android/Chrome, but
  iOS home-screen icons look best with real PNGs — swap in `icon-192.png` / `icon-512.png` /
  `icon-maskable-512.png` and update `manifest.json` if you want a polished iOS icon.
- **GPX files** generally lack power data (TCX carries it via Garmin's extension) and sometimes
  lack heart rate — prefer TCX exports when available.
- HR-zone comparison only shows the actual recorded average HR next to your target zone label;
  it doesn't compute true zone percentages, since that needs athlete-specific zone thresholds.
