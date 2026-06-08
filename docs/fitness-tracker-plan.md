# Fitness Tracker PWA — Implementation Plan

## Context

Building a personal fitness tracking PWA from scratch at `/Users/skpkuma/wd/discipline-page/`. The spec (`docs/fitness-tracker-spec.md`) is the single existing file. The app targets iPhone Safari with Add-to-Home-Screen support, uses only `localStorage` + vanilla JS/CSS, and must feel like a native iOS app. No framework required; ES modules committed directly.

---

## File Structure

```
discipline-page/
├── index.html
├── style.css
├── manifest.json
├── app.js                        ← entry point, tab routing, global modals
├── modules/
│   ├── uuid.js                   ← crypto.getRandomValues UUID v4
│   ├── store.js                  ← localStorage R/W, PALETTE, nextColor()
│   ├── streak.js                 ← calcStreakStats(activityId, min, logs)
│   ├── accomplishments.js        ← recalculate(state) → new accomplishments[]
│   ├── ui.js                     ← showToast, showConfirm, showModal, openSheet
│   ├── numberPad.js              ← custom digit-grid bottom sheet
│   ├── thumbnail.js              ← resizeImage(file), renderFallbackAvatar()
│   ├── confetti.js               ← lazy-load canvas-confetti CDN, celebrate()
│   ├── sync.js                   ← syncNow(state, url) → fetch POST
│   └── views/
│       ├── home.js               ← View 1: activity tiles + quick-log
│       ├── calendar.js           ← View 2: monthly grid + dot rendering
│       ├── accomplishments.js    ← View 3: four sections
│       ├── rawLog.js             ← View 4: table, filter, edit
│       └── activityDetail.js    ← slide-over panel: Progress/Streak/Log
├── icons/
│   ├── icon-180.png              ← Apple touch icon (180×180)
│   ├── icon-192.png
│   └── icon-512.png
└── docs/
    └── fitness-tracker-spec.md
```

---

## Implementation Order

### Phase 1 — Foundation
1. `icons/` placeholder PNGs + `manifest.json`
2. `modules/uuid.js` — 5-line UUID v4 using `crypto.getRandomValues`
3. `modules/store.js` — full localStorage layer (getState/setState, all mutators, PALETTE, nextColor)
4. `index.html` shell — view containers, bottom nav, overlay divs, `type="module"` script tag
5. `style.css` base — custom properties (all tokens), reset, layout scaffolding, `.hidden`

### Phase 2 — Core Data Logic
6. `modules/streak.js` — `calcStreakStats`; test in isolation with hardcoded logs before wiring to UI
7. `modules/accomplishments.js` — `recalculate(state)`, preserve `target_achieved`, derive all others

### Phase 3 — UI Primitives
8. `modules/ui.js` + CSS — toasts, confirm sheets, generic modals, sheet open/close
9. `modules/numberPad.js` + CSS — digit grid, display div (not input), backspace, Save callback
10. `modules/thumbnail.js` — center-crop canvas resize, fallback avatar canvas renderer

### Phase 4 — Views
11. `modules/views/home.js` + tile CSS — tiles, quick-log → number pad → store → recalculate → refresh
12. `app.js` — tab switching, Create Activity form modal, central `refresh()` pipeline
13. `modules/views/activityDetail.js` + panel CSS — slide-over from right, 3-segment switcher
14. `modules/views/calendar.js` + grid CSS — monthly grid, colored dots, day-tap modal
15. `modules/views/accomplishments.js` — four sections derived fresh on each render
16. `modules/views/rawLog.js` — table, activity filter chips, edit-log modal

### Phase 5 — Celebration + Sync
17. `modules/confetti.js` — lazy CDN import, celebrate(color), hook into log-save flow
18. `modules/sync.js` + Settings modal — POST full JSON, update lastSyncedAt, toast result

### Phase 6 — Polish
19. Visual polish — typography hierarchy, dark mode, empty states, sheet/panel animations
20. Edge cases pass — confirm dialogs, deleted-activity logic, haptics, timezone stamps, iPhone PWA test
21. `README.md` — GitHub Pages setup, Google Sheets Apps Script snippet, Home Screen instructions

---

## Data Flow

```
User action → view callback → store.mutator() → accomplishments.recalculate(state)
  → store.setState(newState)  ← single atomic localStorage write
    → app.refresh() → currentView.render(container, state, callbacks)
```

Every write goes through this pipeline. No partial updates, no stale renders.

---

## Critical Implementation Notes

### Streak calculation (`modules/streak.js`)
- Group logs by **local** calendar date, not UTC: `${d.getFullYear()}-${...getMonth()+1}-${...getDate()}`
- "Frequency of exactly N-day runs" = bucket each run by its exact length; stop display loop when a bucket is 0 (do not skip zeros and continue)
- Current streak: walk backward from today; 0 if neither today nor yesterday qualifies

### Number pad (`modules/numberPad.js`)
- Display is a `<div>`, never an `<input>` — no iOS system keyboard ever appears
- Guard leading zeros: replace "0" rather than appending another digit
- Cap input at 99999

### Thumbnail resize (`modules/thumbnail.js`)
- Center-crop to square before scaling: `sx = (w-h)/2, sy=0, sSize=h` if landscape; swap for portrait
- `canvas.toDataURL('image/jpeg', 0.8)` — if result >30KB, retry at quality 0.6

### Confetti trigger (`modules/confetti.js`)
- Fire only when `totalDone >= targetCount && commitment.completedAt === null`
- Guard idempotency: check no `target_achieved` accomplishment already exists for this `commitment.startedAt`
- Lazy CDN: `await import('https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.module.mjs')`, cache in module scope

### ISO timestamps with local timezone
```js
function nowISO() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const h = String(Math.floor(Math.abs(off)/60)).padStart(2,'0');
  const m = String(Math.abs(off)%60).padStart(2,'0');
  return d.toISOString().slice(0,-1) + sign + h + ':' + m;
}
```

### Activity color cycling (`modules/store.js` → `nextColor`)
- Count only non-deleted activities when checking which palette slots are taken
- Deleted activity frees its color slot for reuse

### Commitment progress sums
- Filter logs: `new Date(log.timestamp) >= new Date(commitment.startedAt)` and `log.activityId === id`
- `y_days`: count distinct local calendar days, not log count

### Bottom sheet on iOS
- `backdrop-filter: blur` only on the overlay backdrop div, not the sheet itself (avoids Safari perf issues)
- `touch-action: none` + `touchmove preventDefault` on backdrop to prevent scroll bleed

### ES modules on GitHub Pages
- All imports must be relative with explicit `.js` extension: `import { uuid } from './modules/uuid.js'`

---

## Dev Seed Data

During dev, expose `window.__test` in `app.js` (gated behind `?debug=1`) that seeds 5 activities, ~60 days of logs, mixed commitment types, some completed, some deleted. Remove before deploy.

---

## Verification Checklist

1. Create activity with each of 4 commitment types — verify correct progress display
2. Log entry: home → tap tile → number pad → Save — confirm ≤3 taps, entry persists after page reload
3. Calendar view: dots appear on correct days, day-tap modal lists correct entries
4. Accomplishments: Longest Streak, Daily Max, Overall Max match manual calculation from known seed data
5. Streak frequencies: verify with a known dataset (e.g., 7 consecutive days = one 7-day run, frequency[7]=1, frequency[2..6]=0)
6. Hit commitment target → confetti fires, `target_achieved` accomplishment created, second log does not re-fire
7. Reset commitment → old commitment in `archivedCommitments` with `completedAt` set, new state visible on tile
8. Delete activity → hidden in View 1, still visible in Calendar + Raw Log (italic)
9. Google Sheets sync: paste a valid Apps Script URL, tap Sync, check Sheet receives `activities` + `logs` tabs
10. Add to iPhone Home Screen → launches in standalone mode, no Safari chrome
11. Reload page → all data intact
12. All destructive actions (delete activity, delete log, reset) show confirm before proceeding
13. Upload a landscape and portrait photo — both crop to square, ≤30KB, render cleanly; no-thumbnail activity shows colored initial circle
14. Dark mode: toggle `prefers-color-scheme` in Safari dev tools — all views render with correct dark palette
