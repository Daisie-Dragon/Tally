# Tally — Mood Log (PWA)

A standalone, installable mood tracker. All data stays on your phone (browser
localStorage) — nothing goes through Claude or any server you don't control.

## Deploy with GitHub Pages

1. Create a new repo (or reuse an existing one) and push everything in this
   folder to it, e.g.:
   ```
   git init
   git add .
   git commit -m "Tally mood tracker"
   git branch -M main
   git remote add origin https://github.com/<you>/tally.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Source → Deploy from branch → main → / (root)**.
3. Wait a minute, then visit `https://<you>.github.io/tally/`.

## Install to your home screen

- **iPhone (Safari):** open the URL → Share button → **Add to Home Screen**.
- **Android (Chrome):** open the URL → ⋮ menu → **Add to Home screen** / **Install app**.

Once installed it opens full-screen like a native app, and the service worker
(`sw.js`) caches everything so it keeps working with no signal.

## Notes

- Your data lives in that browser's localStorage, tied to the exact URL you
  installed from. If you ever move the site to a new URL, old entries won't
  follow — export first if that matters to you.
- Two independent axes, never blended into one number: **Depressive**
  (minor/medium/severe, weights 1x/2x/3x) always shown, and **Hypomanic**
  (emerging/peak, weights 1x/3x) collapsed under "Energy & activity" — tap
  to expand any day, whether or not you suspect anything's up. Both plot as
  separate lines on the Trends tab.
- **Criteria snapshotting**: every entry saves the exact wording and tier
  list it was logged against. Editing your criteria under the **Edit** tab
  only affects new entries — past scores never silently shift when you
  add, remove, or reword an item later.
- "Anything unusual?" and "Something going on today?" are toggle-to-text —
  off by default, one tap reveals a text box, so a normal day costs nothing
  to log.
- **Backup**: under the **Edit** tab, **Export JSON** downloads everything
  (entries + criteria) as a timestamped file. **Import JSON** restores from
  one — it merges entries by date (imported ones win on conflicts) and
  replaces your criteria lists, after a confirmation prompt. A reminder
  banner appears once 30 days have passed since your last export.
- **Emotional spiral**: a special built-in item at the bottom of the
  Depressive/Severe section, shown as its own button rather than a normal
  checkbox. Checking it counts normally that day, then adds a decaying
  boost to your depressive score for the next 5 days — 80%, 60%, 40%, 20%,
  then 10% of whatever the spiral day itself scored, on top of that day's
  own checks (so a rough follow-up day and a lingering spiral compound
  rather than one silently overriding the other). A new spiral resets the
  countdown rather than stacking. Any day carrying a boost shows a note
  saying how many days ago it started (suppressed on a day that has its own
  spiral checked, to avoid a confusing double-message).
- **Week strip**: on Today, arrowing past the visible 7 days flips the whole
  strip back a full week rather than leaving your selected day off-screen.
- **Delete all data**: a danger-zone button at the bottom of Edit, behind a
  double confirmation, wipes every entry and resets criteria to defaults.
  Export first if you want to keep anything.
- No accounts, no analytics, no location access. The only network activity
  is loading the page itself and, if you use it, importing/exporting a
  file you chose — nothing phones home.
- **Archived history**: your pre-Tally data (June 2024 – August 2026, imported
  from your old Google Sheets system) is bundled in and seeded into its own
  storage slot the first time the app runs. It's never touched by Delete All
  Data, criteria edits, or the backup/import flow for live entries. It lives
  in its own collapsed section below Trends — "Archived history" — tap to
  expand it into its own parchment-toned chart with muted blue/rose lines,
  completely separate from the live graph so the two scales never compete
  for a comparison they can't honestly make.
- **Time-range selector**: the live Trends graph has chips for 30 days, 90
  days, this year (Jan 1 to today), all time, or a custom start/end date
  range. Doesn't affect the archive section, which always shows in full.
- **Streak**: a small "🔥 N-day streak" pill appears on Today once you've
  logged 2+ days in a row. It uses the same 5-day tolerance as the Trends
  line — missing a few days for a vacation doesn't break it, but 5+
  consecutive missed days resets it to zero.
- **Search**: the Log tab has a search box that filters entries by your
  Notes, "unusual", and "event" text fields.
