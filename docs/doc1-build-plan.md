# Fitness Tracker PWA — Build Plan (Doc1: Spoon-Fed, Code-Complete)
> **What this is.** The complete, code-complete build plan: shared context plus 18 self-contained tasks, each with full source and verification steps.
>
> **How it is meant to be used.** This file is large by design — too large for a small subagent's context. Do **not** hand it to a builder whole. Instead, run the splitter described in **Doc2 (orchestrator-plan.md)** to carve this file into `build-tasks/_common.md` + `build-tasks/task-01..18-*.md`, then dispatch one task per subagent. The fences below (`<!-- @@... -->`) are the machine-readable cut points the splitter relies on; **do not edit or remove them.**
>
> **Fence contract.** Every block is delimited by a BEGIN/END pair carrying JSON metadata:
> `<!-- @@BEGIN id="common" -->` … `<!-- @@END id="common" -->`
> `<!-- @@BEGIN id="task-03" slug="streak" deps="2" -->` … `<!-- @@END id="task-03" -->`
> Anything outside a fenced block (this preamble, the appendices) is not emitted as a build file.

---

<!-- @@BEGIN id="common" -->
# 1. PROJECT FACTS (read once, applies everywhere)

- **Root:** `/Users/skpkuma/wd/discipline-page/`
- **Storage key:** `fitness_tracker_v1` (single JSON blob in `localStorage`).
- **No build step.** Plain ES modules served statically. Every import is relative with explicit `.js`.
- **Target:** iPhone Safari, 375–430px wide, add-to-home-screen PWA. Must work fully offline except the manual Google Sheets sync.
- **No frameworks.** Vanilla JS + CSS only.
- **Schema version** is baked into the storage key. If you ever change the shape, bump to `fitness_tracker_v2` and write a migration in `store.js`.

## 1.1 Final file tree (what you will have at the end)

```
discipline-page/
├── index.html
├── style.css
├── manifest.json
├── app.js
├── README.md
├── PROGRESS.md
├── modules/
│   ├── uuid.js
│   ├── store.js
│   ├── streak.js
│   ├── accomplishments.js
│   ├── ui.js
│   ├── numberPad.js
│   ├── thumbnail.js
│   ├── confetti.js
│   ├── sync.js
│   └── views/
│       ├── home.js
│       ├── calendar.js
│       ├── accomplishments.js
│       ├── rawLog.js
│       └── activityDetail.js
├── icons/
│   ├── icon-180.png
│   ├── icon-192.png
│   └── icon-512.png
└── docs/
    ├── fitness-tracker-spec.md
    └── build-plan.md   ← this file
```

---

# 2. DATA MODEL (authoritative — every module conforms to this)

Single object stored at `localStorage["fitness_tracker_v1"]`:

```jsonc
{
  "schemaVersion": 1,
  "activities": [
    {
      "id": "uuid",
      "name": "Pullups",
      "unit": "reps",
      "color": "#E07856",          // assigned from PALETTE on create
      "thumbnail": null,            // null OR "data:image/jpeg;base64,..."
      "createdAt": "2025-01-01T08:00:00+05:30",
      "deleted": false,
      "streakMinimum": 0,           // day total must be >= this to count for streaks; 0 = any entry
      "commitment": {               // may be null after a reset with no new commitment
        "type": "x_in_y",           // "x_in_y" | "x_only" | "y_days" | "open"
        "targetCount": 200,         // present for x_in_y, x_only; null otherwise
        "targetDays": 20,           // present for x_in_y, y_days; null otherwise
        "startedAt": "2025-01-01T08:00:00+05:30",
        "completedAt": null         // set when archived
      },
      "archivedCommitments": [ /* commitment objects with completedAt set */ ]
    }
  ],
  "logs": [
    {
      "id": "uuid",
      "activityId": "uuid",
      "count": 5,                   // integer 1..99999
      "timestamp": "2025-01-01T08:30:00+05:30"
    }
  ],
  "accomplishments": [
    {
      "id": "uuid",
      "type": "target_achieved",    // ONLY target_achieved is persisted; others derived on render
      "activityId": "uuid",
      "value": 200,
      "achievedAt": "2025-01-10T19:00:00+05:30",
      "meta": { "commitmentStartedAt": "2025-01-01T08:00:00+05:30", "targetDays": 20 }
    }
  ],
  "settings": {
    "googleSheetWebhookUrl": "",
    "lastSyncedAt": null,
    "darkModeOverride": null        // null = follow system; true/false = force
  }
}
```

## 2.1 Invariants

- **Deleted activities** keep `deleted:true`; their logs are never removed.
- **Only `target_achieved`** accomplishments are persisted. `longest_streak`, `daily_max`, `overall_max` are derived fresh on every render and never stored.
- **`commitment` can be `null`** after reset until a new one is set. Views must handle null.
- **All timestamps** are ISO-8601 with a local timezone offset (see `nowISO()` in store.js).
- **Counts** are integers, 1..99999. The number pad enforces the cap.

## 2.2 Commitment type → required fields

| type      | targetCount | targetDays | Progress display |
|-----------|-------------|------------|------------------|
| `x_in_y`  | ✅ required  | ✅ required | bar `done/target` + days remaining |
| `x_only`  | ✅ required  | ❌ null     | bar `done/target` |
| `y_days`  | ❌ null      | ✅ required | days elapsed/target + total count |
| `open`    | ❌ null      | ❌ null     | cumulative count only |

---

# 3. SHARED CONVENTIONS

- **Module pattern:** each module exports named functions. No default exports. No globals except the debug hook `window.__test`.
- **Callbacks down, data up:** views receive `(container, state, callbacks)` and never touch `store` directly except through callbacks passed by `app.js`.
- **Rendering:** views fully re-render their container (`container.innerHTML = ...`) then wire events. Simpler than diffing and fast enough for this data size.
- **Dates:** "a day" always means the **local** calendar day derived from the timestamp, computed via `localDayKey(ts)` (defined in streak.js, re-exported where needed).
- **IDs:** always `uuid()` from `modules/uuid.js`.
- **Money/units:** `unit` is free text shown after counts (e.g., "reps", "min", "km").
<!-- @@END id="common" -->

---
<!-- @@BEGIN id="task-01" slug="scaffold" deps="" -->
## TASK 1 — Scaffold (icons, manifest, index.html, base CSS)

**Depends on:** nothing.
**Produces:** `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png`, `manifest.json`, `index.html`, `style.css` (base only).

### 1.1 Icons

Generate three solid placeholder PNGs with the app's accent. Run from repo root:

```bash
mkdir -p icons
# Requires ImageMagick. If unavailable, create any solid-color PNGs of these exact sizes.
magick -size 180x180 xc:'#E07856' icons/icon-180.png
magick -size 192x192 xc:'#E07856' icons/icon-192.png
magick -size 512x512 xc:'#E07856' icons/icon-512.png
```

If ImageMagick is not installed, generate them with Node + a 1x1 upscale, or hand-place any square PNGs of sizes 180, 192, 512. They only need to exist and be square; replace with a real icon later.

### 1.2 `manifest.json`

```json
{
  "name": "Fitness Tracker",
  "short_name": "Fitness",
  "description": "Personal fitness tracker — activities, streaks, commitments.",
  "start_url": "./index.html",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FAFAF7",
  "theme_color": "#FAFAF7",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 1.3 `index.html`

The shell: meta tags for PWA, view containers (one per tab, all but home start `.hidden`), bottom nav, and overlay host divs for sheets/modals/toasts. The single module script tag at the bottom bootstraps everything.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  <meta name="theme-color" content="#FAFAF7" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0E0E0C" media="(prefers-color-scheme: dark)" />

  <!-- iOS PWA -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Fitness" />
  <link rel="apple-touch-icon" href="icons/icon-180.png" />
  <link rel="manifest" href="manifest.json" />

  <title>Fitness Tracker</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <!-- ===== App root ===== -->
  <div id="app">
    <!-- View containers. Home visible by default; others hidden. -->
    <main id="view-root">
      <section id="view-home"            class="view"></section>
      <section id="view-calendar"        class="view hidden"></section>
      <section id="view-accomplishments" class="view hidden"></section>
      <section id="view-rawlog"          class="view hidden"></section>
    </main>

    <!-- ===== Bottom navigation ===== -->
    <nav id="bottom-nav" aria-label="Primary">
      <button class="nav-btn is-active" data-view="home" aria-label="Home">
        <span class="nav-icon">⌂</span><span class="nav-label">Home</span>
      </button>
      <button class="nav-btn" data-view="calendar" aria-label="Calendar">
        <span class="nav-icon">▦</span><span class="nav-label">Calendar</span>
      </button>
      <button class="nav-btn" data-view="accomplishments" aria-label="Wins">
        <span class="nav-icon">★</span><span class="nav-label">Wins</span>
      </button>
      <button class="nav-btn" data-view="rawlog" aria-label="Log">
        <span class="nav-icon">≣</span><span class="nav-label">Log</span>
      </button>
    </nav>
  </div>

  <!-- ===== Overlay hosts (filled by ui.js / numberPad.js) ===== -->
  <div id="sheet-host"   class="overlay-host" aria-hidden="true"></div>
  <div id="modal-host"   class="overlay-host" aria-hidden="true"></div>
  <div id="toast-host"   aria-live="polite"></div>
  <canvas id="confetti-canvas" aria-hidden="true"></canvas>

  <script type="module" src="app.js"></script>
</body>
</html>
```

### 1.4 `style.css` — base only

This task writes ONLY the design tokens, reset, layout scaffolding, nav, and `.hidden`. Component CSS is appended by later tasks (each component task says exactly what CSS to add). Put a clear marker comment so later tasks know where to append.

```css
/* =========================================================
   FITNESS TRACKER — style.css
   Section 1: TOKENS  (TASK 1)
   ========================================================= */
:root {
  /* chrome colors — light */
  --bg:            #FAFAF7;
  --surface:       #FFFFFF;
  --text:          #1A1A1A;
  --text-2:        #6B6B68;
  --border:        rgba(0,0,0,0.06);
  --hairline:      rgba(0,0,0,0.10);
  --shadow-float:  0 4px 24px rgba(0,0,0,0.08);
  --nav-blur-bg:   rgba(250,250,247,0.72);

  /* spacing scale — use ONLY these */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-6: 24px; --sp-8: 32px; --sp-12: 48px; --sp-16: 64px;

  /* radii */
  --r-card: 16px; --r-btn: 12px; --r-pill: 999px;

  /* type scale */
  --fs-13: 13px; --fs-15: 15px; --fs-17: 17px; --fs-22: 22px; --fs-34: 34px;

  /* motion */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --dur:  240ms;

  /* safe areas */
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);

  --nav-height: 60px;

  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:           #0E0E0C;
    --surface:      #1A1A18;
    --text:         #F5F5F2;
    --text-2:       #9B9B98;
    --border:       rgba(255,255,255,0.08);
    --hairline:     rgba(255,255,255,0.12);
    --shadow-float: 0 4px 24px rgba(0,0,0,0.40);
    --nav-blur-bg:  rgba(14,14,12,0.72);
  }
}
/* Manual override hooks (set on <html> by app.js when settings.darkModeOverride != null) */
html[data-theme="light"] { color-scheme: light; }
html[data-theme="dark"]  { color-scheme: dark; }

/* =========================================================
   Section 2: RESET + LAYOUT  (TASK 1)
   ========================================================= */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-size: var(--fs-17);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
}
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
img { display: block; max-width: 100%; }

#app { min-height: 100%; display: flex; flex-direction: column; }

#view-root {
  flex: 1;
  padding-top: var(--safe-top);
  padding-bottom: calc(var(--nav-height) + var(--safe-bottom) + var(--sp-4));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.view { padding: var(--sp-4); max-width: 480px; margin: 0 auto; }
.hidden { display: none !important; }

/* =========================================================
   Section 3: BOTTOM NAV  (TASK 1)
   ========================================================= */
#bottom-nav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  height: calc(var(--nav-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  display: grid; grid-template-columns: repeat(4, 1fr);
  background: var(--nav-blur-bg);
  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
  border-top: 1px solid var(--hairline);
}
.nav-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; min-height: 44px; color: var(--text-2);
  transition: color var(--dur) var(--ease);
}
.nav-btn.is-active { color: var(--text); }
.nav-icon  { font-size: 20px; line-height: 1; }
.nav-label { font-size: 11px; font-weight: 500; }

/* component CSS appended below by later tasks ↓↓↓ */
/* === APPEND-POINT === */
```

> **Note for later tasks:** append your component CSS *after* the `=== APPEND-POINT ===` marker. Never edit the tokens block except in TASK 16 if a token is genuinely missing.

### 1.5 Verification — TASK 1

1. Serve the folder: `python3 -m http.server 8000` then open `http://localhost:8000`.
2. Page loads with **zero console errors** (the module script will 404 on `app.js` until TASK 11 — temporarily create an empty `app.js` containing `// placeholder` to keep the console clean, or accept the single 404 and note it). Recommended: create `app.js` with `console.log('boot');` placeholder now; TASK 11 overwrites it.
3. Bottom nav shows 4 items; Home highlighted; tapping does nothing yet (wired in TASK 11).
4. Toggle dark mode in browser dev tools (Rendering → emulate prefers-color-scheme) — background flips warm-white ↔ near-black.
5. `manifest.json` validates (DevTools → Application → Manifest shows name + icons, no errors).
<!-- @@END id="task-01" -->

---
<!-- @@BEGIN id="task-02" slug="uuid-store" deps="1" -->
## TASK 2 — uuid.js + store.js

**Depends on:** TASK 1.
**Produces:** `modules/uuid.js`, `modules/store.js`.

### 2.1 `modules/uuid.js`

```js
// modules/uuid.js
// RFC-4122 v4 UUID using crypto.getRandomValues. Works in Safari/Chrome.
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = [...b].map(x => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
```

### 2.2 `modules/store.js`

The entire persistence layer. Owns the localStorage read/write, the color palette, and **all mutators**. Mutators return a NEW state object (they never write); `app.js` is responsible for calling `recalculate` then `setState`. Exception: convenience mutators below DO call setState internally and return the new state, because the spec's pipeline (Section "Data Flow") wants a single atomic write per user action — so each mutator performs that write itself after the caller has prepared the change. To keep it simple and consistent: **every exported mutator performs the write and returns the new state.** `recalculate` is invoked *inside* mutators that change logs/commitments.

> Design decision (locked): mutators are self-contained. They (a) clone state, (b) apply change, (c) for log/commitment changes call `recalculate`, (d) `setState`, (e) return new state. `app.js` then just calls `refresh()`. This guarantees the "single atomic write" invariant.

```js
// modules/store.js
import { uuid } from './uuid.js';
import { recalculate } from './accomplishments.js';

const KEY = 'fitness_tracker_v1';

/* ---------- Activity color palette (12 muted-vivid hues) ---------- */
export const PALETTE = [
  '#E07856', '#D4A373', '#A4B494', '#7CA982',
  '#6B9080', '#5C8D89', '#7B8FA1', '#8E7CC3',
  '#B47AB0', '#C77DA0', '#D88C9A', '#A38B7A',
];

/* ---------- ISO timestamp with local timezone offset ---------- */
export function nowISO() {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const m = String(Math.abs(off) % 60).padStart(2, '0');
  return d.toISOString().slice(0, -1) + sign + h + ':' + m;
}

/* ---------- Empty / default state ---------- */
function emptyState() {
  return {
    schemaVersion: 1,
    activities: [],
    logs: [],
    accomplishments: [],
    settings: { googleSheetWebhookUrl: '', lastSyncedAt: null, darkModeOverride: null },
  };
}

/* ---------- Read / write ---------- */
export function getState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    // shallow defensive defaults (migration hook lives here)
    return { ...emptyState(), ...parsed,
      settings: { ...emptyState().settings, ...(parsed.settings || {}) } };
  } catch (e) {
    console.error('getState parse error, returning empty', e);
    return emptyState();
  }
}

export function setState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  return state;
}

/* ---------- Helpers ---------- */
function clone(s) { return JSON.parse(JSON.stringify(s)); }

export function getActivity(state, id) {
  return state.activities.find(a => a.id === id) || null;
}

/** Next unused palette color. Counts only non-deleted activities; deleted frees its slot. */
export function nextColor(state) {
  const used = new Set(state.activities.filter(a => !a.deleted).map(a => a.color));
  for (const c of PALETTE) if (!used.has(c)) return c;
  // all used → cycle by count
  const n = state.activities.filter(a => !a.deleted).length;
  return PALETTE[n % PALETTE.length];
}

/* ---------- Commitment factory ---------- */
function makeCommitment(type, targetCount, targetDays) {
  return {
    type,
    targetCount: (type === 'x_in_y' || type === 'x_only') ? Number(targetCount) : null,
    targetDays:  (type === 'x_in_y' || type === 'y_days')  ? Number(targetDays)  : null,
    startedAt: nowISO(),
    completedAt: null,
  };
}

/* ============================================================
   MUTATORS — each clones, mutates, (recalcs), writes, returns
   ============================================================ */

export function createActivity(state, { name, unit, type, targetCount, targetDays, streakMinimum, thumbnail }) {
  const s = clone(state);
  const activity = {
    id: uuid(),
    name: String(name).trim(),
    unit: String(unit || '').trim(),
    color: nextColor(s),
    thumbnail: thumbnail || null,
    createdAt: nowISO(),
    deleted: false,
    streakMinimum: Number(streakMinimum) || 0,
    commitment: type === 'open'
      ? makeCommitment('open', null, null)
      : makeCommitment(type, targetCount, targetDays),
    archivedCommitments: [],
  };
  s.activities.push(activity);
  return setState(recalculate(s));
}

export function editActivity(state, id, patch) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a) return state;
  if (patch.name !== undefined) a.name = String(patch.name).trim();
  if (patch.unit !== undefined) a.unit = String(patch.unit).trim();
  if (patch.streakMinimum !== undefined) a.streakMinimum = Number(patch.streakMinimum) || 0;
  if (patch.thumbnail !== undefined) a.thumbnail = patch.thumbnail; // null clears
  return setState(recalculate(s));
}

export function deleteActivity(state, id) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a) return state;
  a.deleted = true; // logs preserved
  return setState(recalculate(s));
}

export function setCommitment(state, id, { type, targetCount, targetDays }) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a) return state;
  a.commitment = type === 'open'
    ? makeCommitment('open', null, null)
    : makeCommitment(type, targetCount, targetDays);
  return setState(recalculate(s));
}

/** Reset = archive current commitment with completedAt, leave commitment null. */
export function resetCommitment(state, id) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a || !a.commitment) return state;
  const archived = { ...a.commitment, completedAt: nowISO() };
  a.archivedCommitments = a.archivedCommitments || [];
  a.archivedCommitments.push(archived);
  a.commitment = null;
  return setState(recalculate(s));
}

export function addLog(state, activityId, count) {
  const s = clone(state);
  s.logs.push({ id: uuid(), activityId, count: Number(count), timestamp: nowISO() });
  return setState(recalculate(s));
}

export function editLog(state, logId, { count, timestamp }) {
  const s = clone(state);
  const l = s.logs.find(x => x.id === logId);
  if (!l) return state;
  if (count !== undefined) l.count = Number(count);
  if (timestamp !== undefined) l.timestamp = timestamp;
  return setState(recalculate(s));
}

export function deleteLog(state, logId) {
  const s = clone(state);
  s.logs = s.logs.filter(x => x.id !== logId);
  return setState(recalculate(s));
}

/** Persist a target_achieved accomplishment (called by confetti flow / app). Idempotent guard lives in caller. */
export function addTargetAchieved(state, activityId, value, meta) {
  const s = clone(state);
  s.accomplishments.push({
    id: uuid(), type: 'target_achieved', activityId,
    value, achievedAt: nowISO(), meta: meta || {},
  });
  return setState(s); // no recalc needed; this IS the persisted record
}

export function updateSettings(state, patch) {
  const s = clone(state);
  s.settings = { ...s.settings, ...patch };
  return setState(s);
}
```

### 2.3 Verification — TASK 2

Open the served page, then in the browser console:

```js
const store = await import('./modules/store.js');
let st = store.getState();
st = store.createActivity(st, { name:'Pushups', unit:'reps', type:'x_in_y', targetCount:100, targetDays:10, streakMinimum:0 });
console.assert(st.activities.length === 1, 'activity created');
console.assert(st.activities[0].color === '#E07856', 'first color assigned');
st = store.addLog(st, st.activities[0].id, 20);
console.assert(st.logs.length === 1 && st.logs[0].count === 20, 'log added');
console.assert(store.getState().logs.length === 1, 'persisted to localStorage');
// timezone offset present:
console.assert(/[+-]\d{2}:\d{2}$/.test(st.logs[0].timestamp), 'tz offset present');
console.log('TASK 2 OK');
// cleanup: localStorage.removeItem('fitness_tracker_v1');
```

> NOTE: store.js imports `recalculate` from accomplishments.js. Until TASK 4 exists, either build TASK 4 first (allowed — see graph) or temporarily stub `accomplishments.js` with `export function recalculate(s){return s;}`. The dependency graph lists 4 after 3 after 2, so the clean path is: build 2 with the stub, then 3, then 4 replaces the stub. Mark this in PROGRESS Notes.
<!-- @@END id="task-02" -->

---
<!-- @@BEGIN id="task-03" slug="streak" deps="2" -->
## TASK 3 — streak.js

**Depends on:** TASK 2 (no hard import, but conceptually after).
**Produces:** `modules/streak.js`.

Pure, testable, no DOM. Group logs by **local** calendar day. Build the verification dataset first and confirm before wiring into any UI.

### 3.1 Definitions (locked)

- **Local day key:** `localDayKey(ts)` → `"YYYY-M-D"` using local getFullYear/getMonth+1/getDate (NOT UTC, NOT zero-padded — keys only need to be unique & comparable as a set; for sorting use the Date).
- **Qualifying day:** a local day whose summed count `>= streakMinimum` (min 0 means any entry qualifies).
- **Run:** a maximal set of consecutive calendar days all qualifying.
- **frequency[N]:** number of runs whose length is *exactly* N.
- **Current streak:** walk backward from today; if neither today nor yesterday qualifies → 0. (Yesterday allowed so a streak isn't "broken" before you log today.)

### 3.2 `modules/streak.js`

```js
// modules/streak.js
// Pure streak math. No DOM, no storage.

/** Local calendar-day key "YYYY-M-D" (NOT padded, NOT UTC). */
export function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Parse a day key back into a Date at local midnight. */
function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Today's key in the same format. */
function todayKey() {
  return localDayKey(new Date().toISOString());
}

/** Difference in whole days between two day keys (b - a). */
function dayDiff(aKey, bKey) {
  const a = keyToDate(aKey), b = keyToDate(bKey);
  return Math.round((b - a) / 86400000);
}

/**
 * calcStreakStats(activityId, streakMinimum, logs)
 * Returns:
 *  {
 *    qualifyingDays: ["2025-1-1", ...] (sorted asc),
 *    lastPerformed:  "YYYY-M-D" | null,
 *    longest:        number,
 *    current:        number,
 *    runs:           [lengths...],
 *    frequency:      { 2: n, 3: n, ... } only lengths >= 2 with count > 0... see note
 *  }
 * NOTE on frequency: we return a dense object for lengths 2..maxRun so the UI can
 * "stop displaying when a bucket is 0" by walking 2,3,4,... and breaking on first 0.
 */
export function calcStreakStats(activityId, streakMinimum, logs) {
  const min = Number(streakMinimum) || 0;

  // 1. sum counts per local day for this activity
  const perDay = new Map(); // key -> total count
  for (const l of logs) {
    if (l.activityId !== activityId) continue;
    const k = localDayKey(l.timestamp);
    perDay.set(k, (perDay.get(k) || 0) + Number(l.count));
  }

  // 2. qualifying days (>= min), sorted ascending by actual date
  const qualifyingDays = [...perDay.entries()]
    .filter(([, total]) => total >= min)
    .map(([k]) => k)
    .sort((a, b) => keyToDate(a) - keyToDate(b));

  if (qualifyingDays.length === 0) {
    return { qualifyingDays: [], lastPerformed: null, longest: 0, current: 0, runs: [], frequency: {} };
  }

  // 3. build runs of consecutive days
  const runs = [];
  let runLen = 1;
  for (let i = 1; i < qualifyingDays.length; i++) {
    if (dayDiff(qualifyingDays[i - 1], qualifyingDays[i]) === 1) {
      runLen++;
    } else {
      runs.push(runLen);
      runLen = 1;
    }
  }
  runs.push(runLen);

  const longest = Math.max(...runs);

  // 4. frequency: dense 2..longest (length-1 runs are not "streaks" of interest but kept derivable)
  const frequency = {};
  for (let n = 2; n <= longest; n++) frequency[n] = 0;
  for (const r of runs) if (r >= 2) frequency[r] = (frequency[r] || 0) + 1;

  // 5. current streak — walk backward from today
  const tKey = todayKey();
  const qualSet = new Set(qualifyingDays);
  let current = 0;
  // anchor: today if qualifies, else yesterday if qualifies, else 0
  let anchor = null;
  if (qualSet.has(tKey)) anchor = tKey;
  else {
    const yk = localDayKey(new Date(Date.now() - 86400000).toISOString());
    if (qualSet.has(yk)) anchor = yk;
  }
  if (anchor) {
    let cursor = anchor;
    while (qualSet.has(cursor)) {
      current++;
      const prev = keyToDate(cursor);
      prev.setDate(prev.getDate() - 1);
      cursor = `${prev.getFullYear()}-${prev.getMonth() + 1}-${prev.getDate()}`;
    }
  }

  const lastPerformed = qualifyingDays[qualifyingDays.length - 1];
  return { qualifyingDays, lastPerformed, longest, current, runs, frequency };
}
```

### 3.3 Verification — TASK 3 (run in console BEFORE any UI uses it)

```js
const { calcStreakStats } = await import('./modules/streak.js');
const A = 'act1';
const mk = (y,m,d,count=1) => ({ activityId:A, count, timestamp:new Date(y,m-1,d,12,0).toISOString() });

// 7 consecutive days → one 7-run
let logs = [1,2,3,4,5,6,7].map(d => mk(2025,1,d));
let r = calcStreakStats(A, 0, logs);
console.assert(r.longest === 7, 'longest 7');
console.assert(r.frequency[7] === 1, 'freq[7]=1');
console.assert(r.frequency[2] === 0 && r.frequency[6] === 0, 'freq 2..6 = 0');

// two separate 3-runs (gap) → frequency[3] === 2
logs = [1,2,3, 5,6,7].map(d => mk(2025,2,d));
r = calcStreakStats(A, 0, logs);
console.assert(r.frequency[3] === 2, 'two 3-runs');

// streakMinimum filters days below threshold
logs = [mk(2025,3,1,4), mk(2025,3,2,1), mk(2025,3,3,5)]; // day2 total=1 < 3
r = calcStreakStats(A, 3, logs);
console.assert(r.longest === 1, 'min breaks the run');  // 3/1 and 3/3 are isolated
console.log('TASK 3 OK');
```
<!-- @@END id="task-03" -->

---
<!-- @@BEGIN id="task-04" slug="accomplishments" deps="2,3" -->
## TASK 4 — accomplishments.js

**Depends on:** TASK 3 (uses `calcStreakStats`), TASK 2 (state shape).
**Produces:** `modules/accomplishments.js`. **Replaces** the temporary stub from TASK 2.

`recalculate(state)` returns a NEW state where the `accomplishments` array contains: ALL existing `target_achieved` records (preserved untouched) PLUS freshly derived `longest_streak`, `daily_max`, `overall_max` (one per activity, only when meaningful). Derived ones get deterministic ids so re-renders don't thrash, but since they're recomputed each time it doesn't matter functionally.

> Important: per spec, derived accomplishments are NOT meant to be persisted as static records — but the data model keeps a single `accomplishments` array. Resolution: we persist only `target_achieved`; we *also* place derived entries into the array on each recalc so the Accomplishments view can read them uniformly. On the next recalc the derived ones are rebuilt from scratch. Net effect: `target_achieved` is durable; the rest are ephemeral but always present & correct.

### 4.1 `modules/accomplishments.js`

```js
// modules/accomplishments.js
import { calcStreakStats, localDayKey } from './streak.js';

/**
 * recalculate(state) -> new state with state.accomplishments rebuilt:
 *   - keeps every existing target_achieved (durable, event-based)
 *   - regenerates longest_streak / daily_max / overall_max per activity
 */
export function recalculate(state) {
  const next = { ...state };
  const logs = state.logs || [];

  // 1. keep durable target_achieved records as-is
  const durable = (state.accomplishments || []).filter(a => a.type === 'target_achieved');

  const derived = [];

  for (const act of state.activities) {
    const actLogs = logs.filter(l => l.activityId === act.id);
    if (actLogs.length === 0) continue;

    // --- overall_max: single highest entry count ---
    const overallMax = Math.max(...actLogs.map(l => Number(l.count)));
    derived.push({
      id: `derived_overallmax_${act.id}`, type: 'overall_max',
      activityId: act.id, value: overallMax, achievedAt: null, meta: {},
    });

    // --- daily_max: highest single-day sum ---
    const perDay = new Map();
    for (const l of actLogs) {
      const k = localDayKey(l.timestamp);
      perDay.set(k, (perDay.get(k) || 0) + Number(l.count));
    }
    const dailyMax = Math.max(...perDay.values());
    derived.push({
      id: `derived_dailymax_${act.id}`, type: 'daily_max',
      activityId: act.id, value: dailyMax, achievedAt: null, meta: {},
    });

    // --- longest_streak ---
    const ss = calcStreakStats(act.id, act.streakMinimum || 0, actLogs);
    if (ss.longest > 0) {
      derived.push({
        id: `derived_longest_${act.id}`, type: 'longest_streak',
        activityId: act.id, value: ss.longest, achievedAt: null,
        meta: { lastPerformed: ss.lastPerformed },
      });
    }
  }

  next.accomplishments = [...durable, ...derived];
  return next;
}

/**
 * Helper for the confetti/target flow: should we fire & persist a target_achieved?
 * Fires only when:
 *   - commitment exists, is x_in_y or x_only (has targetCount)
 *   - totalDone >= targetCount
 *   - commitment.completedAt === null
 *   - no existing target_achieved already references this commitment.startedAt
 */
export function shouldFireTarget(state, activity) {
  const c = activity.commitment;
  if (!c || c.completedAt !== null) return false;
  if (c.targetCount == null) return false; // y_days / open never auto-fire on count
  const totalDone = state.logs
    .filter(l => l.activityId === activity.id && new Date(l.timestamp) >= new Date(c.startedAt))
    .reduce((sum, l) => sum + Number(l.count), 0);
  if (totalDone < c.targetCount) return false;
  const already = (state.accomplishments || []).some(
    a => a.type === 'target_achieved' &&
         a.activityId === activity.id &&
         a.meta && a.meta.commitmentStartedAt === c.startedAt
  );
  return !already;
}
```

### 4.2 Verification — TASK 4

```js
const store = await import('./modules/store.js');
const { recalculate, shouldFireTarget } = await import('./modules/accomplishments.js');
localStorage.removeItem('fitness_tracker_v1');
let st = store.getState();
st = store.createActivity(st, { name:'Pull', unit:'reps', type:'x_only', targetCount:50, streakMinimum:0 });
const id = st.activities[0].id;
st = store.addLog(st, id, 30);
st = store.addLog(st, id, 25);  // total 55 >= 50
const act = store.getActivity(st, id);
console.assert(shouldFireTarget(st, act) === true, 'target should fire at 55/50');
console.assert(st.accomplishments.some(a=>a.type==='overall_max' && a.value===30), 'overall max 30');
console.assert(st.accomplishments.some(a=>a.type==='daily_max'), 'daily max present');
console.log('TASK 4 OK');
localStorage.removeItem('fitness_tracker_v1');
```
<!-- @@END id="task-04" -->

---
<!-- @@BEGIN id="task-05" slug="ui" deps="1" -->
## TASK 5 — ui.js (toasts, confirm, modal, sheet) + CSS

**Depends on:** TASK 1.
**Produces:** `modules/ui.js`, appended CSS in `style.css`.

Generic overlay primitives used everywhere. All Promise-based where they collect a result.

### 5.1 `modules/ui.js`

```js
// modules/ui.js
const sheetHost = () => document.getElementById('sheet-host');
const modalHost = () => document.getElementById('modal-host');
const toastHost = () => document.getElementById('toast-host');

/* ---------- haptics (no-op where unsupported) ---------- */
export function haptic(kind = 'light') {
  if (!('vibrate' in navigator)) return;
  const map = { light: 10, medium: 20, heavy: [30], success: [10, 40, 10], error: [40, 30, 40] };
  try { navigator.vibrate(map[kind] || 10); } catch {}
}

/* ---------- toast ---------- */
export function showToast(message, { type = 'info', ms = 2200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  toastHost().appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, ms);
}

/* ---------- bottom sheet (generic) ----------
 * openSheet(contentNode) -> { close }
 * Renders a backdrop + sheet that slides up. Tap backdrop or call close() to dismiss.
 */
export function openSheet(contentNode, { onClose } = {}) {
  const host = sheetHost();
  host.innerHTML = '';
  host.setAttribute('aria-hidden', 'false');

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.appendChild(contentNode);
  host.appendChild(backdrop);
  host.appendChild(sheet);

  requestAnimationFrame(() => {
    backdrop.classList.add('is-in');
    sheet.classList.add('is-in');
  });

  // prevent scroll bleed
  const stop = e => e.preventDefault();
  backdrop.addEventListener('touchmove', stop, { passive: false });

  function close() {
    backdrop.classList.remove('is-in');
    sheet.classList.remove('is-in');
    sheet.addEventListener('transitionend', () => {
      host.innerHTML = '';
      host.setAttribute('aria-hidden', 'true');
      onClose && onClose();
    }, { once: true });
  }
  backdrop.addEventListener('click', close);
  return { close, sheet };
}

/* ---------- confirm (destructive) ----------
 * showConfirm({title, message, confirmLabel, danger}) -> Promise<boolean>
 */
export function showConfirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise(resolve => {
    const node = document.createElement('div');
    node.className = 'confirm';
    node.innerHTML = `
      <div class="confirm-body">
        ${title ? `<h3 class="confirm-title">${esc(title)}</h3>` : ''}
        ${message ? `<p class="confirm-msg">${esc(message)}</p>` : ''}
      </div>
      <div class="confirm-actions">
        <button class="btn btn--ghost" data-act="cancel">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">${esc(confirmLabel)}</button>
      </div>`;
    const { close } = openSheet(node, { onClose: () => resolve(false) });
    node.querySelector('[data-act="cancel"]').onclick = () => { close(); };
    node.querySelector('[data-act="ok"]').onclick = () => { haptic('medium'); resolve(true); close(); };
  });
}

/* ---------- generic centered modal ----------
 * showModal(contentNode, {title}) -> { close }
 */
export function showModal(contentNode, { title } = {}) {
  const host = modalHost();
  host.innerHTML = '';
  host.setAttribute('aria-hidden', 'false');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const card = document.createElement('div');
  card.className = 'modal-card';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'modal-title';
    h.textContent = title;
    card.appendChild(h);
  }
  card.appendChild(contentNode);
  host.appendChild(backdrop);
  host.appendChild(card);
  requestAnimationFrame(() => { backdrop.classList.add('is-in'); card.classList.add('is-in'); });

  function close() {
    backdrop.classList.remove('is-in');
    card.classList.remove('is-in');
    card.addEventListener('transitionend', () => {
      host.innerHTML = '';
      host.setAttribute('aria-hidden', 'true');
    }, { once: true });
  }
  backdrop.addEventListener('click', close);
  return { close, card };
}

/* ---------- tiny HTML escaper (use for any user text in innerHTML) ---------- */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

### 5.2 CSS — append after `=== APPEND-POINT ===`

```css
/* ===== UI PRIMITIVES (TASK 5) ===== */
.overlay-host { position: fixed; inset: 0; z-index: 100; pointer-events: none; }
.overlay-host[aria-hidden="false"] { pointer-events: auto; }

/* toasts */
#toast-host {
  position: fixed; left: 0; right: 0; bottom: calc(var(--nav-height) + var(--safe-bottom) + 12px);
  z-index: 200; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none;
}
.toast {
  pointer-events: auto; max-width: 90%; padding: 12px 18px; border-radius: var(--r-pill);
  background: var(--text); color: var(--bg); font-size: var(--fs-15); font-weight: 500;
  box-shadow: var(--shadow-float); opacity: 0; transform: translateY(8px);
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.toast.is-in { opacity: 1; transform: translateY(0); }
.toast--error { background: #B3261E; color: #fff; }
.toast--success { background: #2E7D5B; color: #fff; }

/* sheet */
.sheet-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,0.32);
  -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  opacity: 0; transition: opacity var(--dur) var(--ease);
}
.sheet-backdrop.is-in { opacity: 1; }
.sheet {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: var(--surface); border-radius: 20px 20px 0 0;
  padding: var(--sp-6) var(--sp-4) calc(var(--sp-6) + var(--safe-bottom));
  box-shadow: var(--shadow-float);
  transform: translateY(100%); transition: transform var(--dur) var(--ease);
  max-height: 90vh; overflow-y: auto;
}
.sheet.is-in { transform: translateY(0); }

/* confirm */
.confirm-title { font-size: var(--fs-22); font-weight: 600; margin-bottom: var(--sp-2); }
.confirm-msg   { color: var(--text-2); font-size: var(--fs-15); margin-bottom: var(--sp-6); }
.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }

/* buttons */
.btn { min-height: 48px; border-radius: var(--r-btn); font-size: var(--fs-17); font-weight: 600; padding: 0 var(--sp-4); }
.btn--primary { background: var(--text); color: var(--bg); }
.btn--ghost   { background: var(--border); color: var(--text); }
.btn--danger  { background: #B3261E; color: #fff; }
.btn--pill    { border-radius: var(--r-pill); }

/* modal */
.modal-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,0.32);
  opacity: 0; transition: opacity var(--dur) var(--ease);
}
.modal-backdrop.is-in { opacity: 1; }
.modal-card {
  position: absolute; left: 50%; top: 50%;
  width: min(92%, 420px); max-height: 86vh; overflow-y: auto;
  background: var(--surface); border-radius: var(--r-card); padding: var(--sp-6);
  box-shadow: var(--shadow-float);
  transform: translate(-50%, -48%) scale(0.96); opacity: 0;
  transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease);
}
.modal-card.is-in { transform: translate(-50%, -50%) scale(1); opacity: 1; }
.modal-title { font-size: var(--fs-22); font-weight: 600; margin-bottom: var(--sp-4); }
```

### 5.3 Verification — TASK 5

In console:
```js
const ui = await import('./modules/ui.js');
ui.showToast('Hello'); // appears above nav, fades after ~2.2s
const ok = await ui.showConfirm({ title:'Delete?', message:'Cannot undo.', confirmLabel:'Delete' });
console.log('confirm result:', ok); // tap a button to resolve
```
Visual checks: sheet slides up smoothly, backdrop blurs, tap backdrop dismisses (resolves false), toast auto-dismisses.
<!-- @@END id="task-05" -->

---
<!-- @@BEGIN id="task-06" slug="numberpad" deps="5" -->
## TASK 6 — numberPad.js + CSS

**Depends on:** TASK 5 (uses `openSheet`, `haptic`).
**Produces:** `modules/numberPad.js`, appended CSS.

Custom digit grid in a bottom sheet. **The display is a `<div>`, never an `<input>`** — no iOS system keyboard ever appears.

### 6.1 `modules/numberPad.js`

```js
// modules/numberPad.js
import { openSheet, haptic } from './ui.js';

const MAX = 99999;

/**
 * openNumberPad({ title, unit, initial, onSave })
 * onSave(value:number) called when Save tapped (value >= 1).
 * Returns the openSheet handle.
 */
export function openNumberPad({ title = 'Log entry', unit = '', initial = 0, onSave }) {
  let value = String(initial && initial > 0 ? initial : '');

  const node = document.createElement('div');
  node.className = 'numpad';
  node.innerHTML = `
    <div class="numpad-head">
      <span class="numpad-title">${escText(title)}</span>
    </div>
    <div class="numpad-display">
      <span class="numpad-value">0</span>
      <span class="numpad-unit">${escText(unit)}</span>
    </div>
    <div class="numpad-grid">
      ${[1,2,3,4,5,6,7,8,9].map(d => `<button class="numpad-key" data-d="${d}">${d}</button>`).join('')}
      <button class="numpad-key numpad-key--ghost" data-act="clear">C</button>
      <button class="numpad-key" data-d="0">0</button>
      <button class="numpad-key numpad-key--ghost" data-act="back">⌫</button>
    </div>
    <button class="btn btn--primary numpad-save">Save</button>
  `;

  const valueEl = node.querySelector('.numpad-value');
  const saveBtn = node.querySelector('.numpad-save');

  function render() {
    const n = value === '' ? 0 : Number(value);
    valueEl.textContent = String(n);
    saveBtn.disabled = n < 1;
    saveBtn.classList.toggle('is-disabled', n < 1);
  }

  function pushDigit(d) {
    haptic('light');
    if (value === '' && d === '0') return;        // guard leading zero
    if (value === '0') value = d;                  // replace a lone zero
    else value = value + d;
    if (Number(value) > MAX) value = String(MAX);  // cap
    render();
  }

  node.querySelectorAll('[data-d]').forEach(btn =>
    btn.addEventListener('click', () => pushDigit(btn.dataset.d)));
  node.querySelector('[data-act="back"]').addEventListener('click', () => {
    haptic('light'); value = value.slice(0, -1); render();
  });
  node.querySelector('[data-act="clear"]').addEventListener('click', () => {
    haptic('light'); value = ''; render();
  });

  const handle = openSheet(node);
  saveBtn.addEventListener('click', () => {
    const n = Number(value);
    if (n < 1) return;
    haptic('success');
    handle.close();
    onSave && onSave(n);
  });

  render();
  return handle;
}

function escText(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
```

### 6.2 CSS — append

```css
/* ===== NUMBER PAD (TASK 6) ===== */
.numpad-head { text-align: center; margin-bottom: var(--sp-3); }
.numpad-title { font-size: var(--fs-15); font-weight: 500; color: var(--text-2); }
.numpad-display {
  text-align: center; margin-bottom: var(--sp-6);
  display: flex; align-items: baseline; justify-content: center; gap: var(--sp-2);
}
.numpad-value { font-size: var(--fs-34); font-weight: 700; line-height: 1; }
.numpad-unit  { font-size: var(--fs-17); color: var(--text-2); }
.numpad-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-6);
}
.numpad-key {
  height: 64px; border-radius: var(--r-btn); background: var(--border);
  font-size: var(--fs-22); font-weight: 600;
  transition: transform 80ms var(--ease), background 120ms var(--ease);
}
.numpad-key:active { transform: scale(0.94); background: var(--hairline); }
.numpad-key--ghost { background: transparent; color: var(--text-2); }
.numpad-save { width: 100%; }
.numpad-save.is-disabled { opacity: 0.4; pointer-events: none; }
```

### 6.3 Verification — TASK 6

```js
const { openNumberPad } = await import('./modules/numberPad.js');
openNumberPad({ title:'Pushups', unit:'reps', onSave:(v)=>console.log('saved', v) });
```
Checks: tapping digits updates the big number; leading zero ignored; "0" replaced by next digit; ⌫ deletes; C clears; cap at 99999; Save disabled at 0; **no iOS keyboard ever appears**; Save logs the number and closes the sheet.
<!-- @@END id="task-06" -->

---
<!-- @@BEGIN id="task-07" slug="thumbnail" deps="2" -->
## TASK 7 — thumbnail.js

**Depends on:** TASK 2 (PALETTE concept only).
**Produces:** `modules/thumbnail.js`.

Center-crop to square, scale to 256, JPEG compress; fallback colored-initial avatar.

### 7.1 `modules/thumbnail.js`

```js
// modules/thumbnail.js

const MAX_DIM = 256;
const TARGET_KB = 30;

/**
 * resizeImage(file) -> Promise<string dataURI>
 * Center-crops to square, scales to <=256, JPEG q0.8; retries at 0.6 if > ~30KB.
 */
export function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      // center-crop to square
      let sx, sy, sSize;
      if (w >= h) { sSize = h; sx = (w - h) / 2; sy = 0; }     // landscape
      else        { sSize = w; sx = 0; sy = (h - w) / 2; }     // portrait

      const canvas = document.createElement('canvas');
      canvas.width = MAX_DIM; canvas.height = MAX_DIM;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, MAX_DIM, MAX_DIM);

      let q = 0.8;
      let data = canvas.toDataURL('image/jpeg', q);
      if (approxKB(data) > TARGET_KB) {
        q = 0.6;
        data = canvas.toDataURL('image/jpeg', q);
      }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

/** Approx KB of a base64 data URI. */
function approxKB(dataURI) {
  const b64 = dataURI.split(',')[1] || '';
  return (b64.length * 3 / 4) / 1024;
}

/**
 * renderFallbackAvatar(name, color, size=128) -> dataURI
 * Colored circle with the activity's first letter. Used when thumbnail is null.
 * (Can also be rendered live in CSS, but a dataURI keeps tile rendering uniform.)
 */
export function renderFallbackAvatar(name, color, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color || '#888';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(size * 0.46)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  ctx.fillText(letter, size / 2, size / 2 + size * 0.02);
  return canvas.toDataURL('image/png');
}
```

### 7.2 Verification — TASK 7

```js
const t = await import('./modules/thumbnail.js');
document.body.insertAdjacentHTML('beforeend',
  `<img src="${t.renderFallbackAvatar('Pullups','#E07856',96)}" style="position:fixed;top:10px;left:10px;z-index:9999;border-radius:50%">`);
// To test resizeImage, wire a temporary <input type="file"> and log the returned dataURI length.
```
Checks: fallback shows a colored circle with white "P". Upload a landscape AND a portrait photo via a temp file input → both come back square, render cleanly, and `approxKB` (log it) is ≤ ~30.
<!-- @@END id="task-07" -->

---
<!-- @@BEGIN id="task-08" slug="confetti" deps="5" -->
## TASK 8 — confetti.js

**Depends on:** TASK 5 (haptic). Lazy-loads canvas-confetti from CDN (the ONLY runtime network dependency besides sync; degrade gracefully offline).
**Produces:** `modules/confetti.js`.

### 8.1 `modules/confetti.js`

```js
// modules/confetti.js
import { haptic } from './ui.js';

let _confetti = null;     // cached module-scope instance
let _loading = null;      // in-flight import promise

const CDN = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.module.mjs';

async function load() {
  if (_confetti) return _confetti;
  if (_loading) return _loading;
  _loading = import(CDN)
    .then(m => { _confetti = m.default || m.create ? (m.default || m) : null; return _confetti; })
    .catch(err => { console.warn('confetti CDN failed (offline?)', err); return null; });
  return _loading;
}

/**
 * celebrate(color) — fire a burst tinted toward the activity color.
 * Safe offline: if the CDN can't load, it just no-ops after the haptic.
 */
export async function celebrate(color = '#E07856') {
  haptic('success');
  const confetti = await load();
  if (!confetti) return; // offline / blocked — silent
  const shots = [
    { particleCount: 60, spread: 55, origin: { y: 0.6 } },
    { particleCount: 40, spread: 80, startVelocity: 45, origin: { y: 0.65 } },
  ];
  const colors = [color, lighten(color, 0.25), '#FFFFFF'];
  shots.forEach((s, i) => setTimeout(() => confetti({ ...s, colors }), i * 120));
}

/** crude hex lighten */
function lighten(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = i => Math.min(255, Math.round(parseInt(m[i], 16) + 255 * amt));
  return `#${[ch(1),ch(2),ch(3)].map(x=>x.toString(16).padStart(2,'0')).join('')}`;
}
```

> The `#confetti-canvas` element exists in index.html but canvas-confetti creates its own canvas by default; the element is a reserved hook if you later switch to `confetti.create(canvasEl,...)`. Default global mode is fine for v1.

### 8.2 Verification — TASK 8

```js
const { celebrate } = await import('./modules/confetti.js');
celebrate('#7CA982'); // burst appears (online). Offline: no error, just the haptic.
```
<!-- @@END id="task-08" -->

---
<!-- @@BEGIN id="task-09" slug="sync" deps="2" -->
## TASK 9 — sync.js

**Depends on:** TASK 2 (state shape). Network call only to the user's Apps Script URL.
**Produces:** `modules/sync.js`.

### 9.1 `modules/sync.js`

```js
// modules/sync.js

/**
 * syncNow(state, url) -> Promise<{ ok:boolean, error?:string }>
 * POSTs the full payload (activities + logs) as JSON to the Apps Script web app.
 * Apps Script writes two tabs: activities, logs. We use no-cors-safe simple request:
 *   - Content-Type text/plain to avoid CORS preflight (Apps Script accepts e.postData.contents).
 * On the client we cannot read the response body under no-cors; instead we POST with cors
 * and let Apps Script return JSON. If CORS blocks reading, we treat a network-level success
 * as success. Simplest robust approach: use mode 'cors' and catch.
 */
export async function syncNow(state, url) {
  if (!url) return { ok: false, error: 'No sync URL set' };
  const payload = {
    activities: state.activities,
    logs: state.logs,
    exportedAt: new Date().toISOString(),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      // text/plain avoids a CORS preflight; Apps Script reads e.postData.contents
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    // Apps Script often 302-redirects to script.googleusercontent.com; redirect:follow handles it.
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    // body may or may not be readable depending on CORS; don't require it
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}
```

### 9.2 Verification — TASK 9

Without a real URL: `syncNow(state, '')` → `{ok:false,error:'No sync URL set'}`. Full end-to-end is verified in TASK 18 after the Apps Script is deployed (Acceptance #9).
<!-- @@END id="task-09" -->

---
<!-- @@BEGIN id="task-10" slug="home" deps="2,4,6,7,8" -->
## TASK 10 — views/home.js + tile CSS

**Depends on:** TASK 2, 4, 6 (number pad), 7 (thumbnail), 8 (confetti).
**Produces:** `modules/views/home.js`, appended CSS.

View 1: a tile per non-deleted activity with type-specific progress, plus a quick-log `+` and a floating create button.

### 10.1 Progress computation helper (lives in home.js, exported for reuse by detail view)

```js
// modules/views/home.js
import { openNumberPad } from '../numberPad.js';
import { renderFallbackAvatar } from '../thumbnail.js';
import { esc } from '../ui.js';

/** Sum of counts for the active commitment window (or all-time if no commitment). */
export function commitmentProgress(activity, logs) {
  const c = activity.commitment;
  const actLogs = logs.filter(l => l.activityId === activity.id);
  if (!c) {
    const total = actLogs.reduce((s, l) => s + Number(l.count), 0);
    return { total, distinctDays: distinctDays(actLogs), commitment: null };
  }
  const since = new Date(c.startedAt);
  const windowed = actLogs.filter(l => new Date(l.timestamp) >= since);
  const total = windowed.reduce((s, l) => s + Number(l.count), 0);
  return { total, distinctDays: distinctDays(windowed), commitment: c };
}

function distinctDays(logs) {
  const set = new Set(logs.map(l => {
    const d = new Date(l.timestamp);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }));
  return set.size;
}

/** Days elapsed since startedAt (inclusive of today), min 1 if any time has passed. */
function daysElapsed(startedAt) {
  const start = new Date(startedAt); start.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.max(0, Math.round((today - start) / 86400000)) + 1;
}

/** Build the progress sub-DOM string for a tile, by commitment type. */
function progressMarkup(activity, logs) {
  const { total, distinctDays: dd, commitment: c } = commitmentProgress(activity, logs);
  const unit = esc(activity.unit);
  if (!c) {
    return `<div class="tile-progress-line"><span class="tile-big">${total}</span> <span class="tile-unit">${unit}</span>
            <span class="tile-sub">no active commitment</span></div>`;
  }
  if (c.type === 'open') {
    return `<div class="tile-progress-line"><span class="tile-big">${total}</span> <span class="tile-unit">${unit}</span></div>`;
  }
  if (c.type === 'x_only') {
    const pct = Math.min(100, Math.round(total / c.targetCount * 100));
    return bar(activity.color, pct, `${total} / ${c.targetCount} ${unit}`);
  }
  if (c.type === 'x_in_y') {
    const pct = Math.min(100, Math.round(total / c.targetCount * 100));
    const remaining = Math.max(0, c.targetDays - daysElapsed(c.startedAt) + 1);
    return bar(activity.color, pct, `${total} / ${c.targetCount} ${unit} · ${remaining}d left`);
  }
  if (c.type === 'y_days') {
    const el = Math.min(c.targetDays, daysElapsed(c.startedAt));
    const pct = Math.min(100, Math.round(dd / c.targetDays * 100));
    return bar(activity.color, pct, `${dd} / ${c.targetDays} days · ${total} ${unit} total`);
  }
  return '';
}

function bar(color, pct, label) {
  return `
    <div class="tile-bar"><div class="tile-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <div class="tile-sub">${esc(label)}</div>`;
}

/**
 * render(container, state, callbacks)
 * callbacks: { onLog(activityId, count), onOpenActivity(activityId), onCreate() }
 */
export function render(container, state, callbacks) {
  const activities = state.activities.filter(a => !a.deleted);

  if (activities.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">＋</div>
        <p class="empty-copy">No activities yet.<br>Tap + to start.</p>
        <button class="btn btn--primary btn--pill" id="empty-create">Create activity</button>
      </div>
      <button class="fab" id="fab-create" aria-label="Create activity">＋</button>`;
    container.querySelector('#empty-create').onclick = callbacks.onCreate;
    container.querySelector('#fab-create').onclick = callbacks.onCreate;
    return;
  }

  container.innerHTML = `
    <header class="view-head"><h1 class="view-title">Today</h1></header>
    <div class="tiles">
      ${activities.map(a => tileMarkup(a, state.logs)).join('')}
    </div>
    <button class="fab" id="fab-create" aria-label="Create activity">＋</button>`;

  container.querySelector('#fab-create').onclick = callbacks.onCreate;

  activities.forEach(a => {
    const tile = container.querySelector(`[data-tile="${a.id}"]`);
    tile.querySelector('.tile-main').onclick = () => callbacks.onOpenActivity(a.id);
    tile.querySelector('.tile-log').onclick = (e) => {
      e.stopPropagation();
      openNumberPad({
        title: a.name, unit: a.unit,
        onSave: (count) => callbacks.onLog(a.id, count),
      });
    };
  });
}

function tileMarkup(a, logs) {
  const avatar = a.thumbnail
    ? `<img class="tile-avatar" src="${a.thumbnail}" alt="">`
    : `<img class="tile-avatar" src="${renderFallbackAvatar(a.name, a.color, 96)}" alt="">`;
  return `
    <article class="tile" data-tile="${a.id}" style="--accent:${a.color}">
      <div class="tile-main">
        ${avatar}
        <div class="tile-info">
          <h2 class="tile-name">${esc(a.name)}</h2>
          ${progressMarkup(a, logs)}
        </div>
      </div>
      <button class="tile-log" aria-label="Log ${esc(a.name)}">＋</button>
    </article>`;
}
```

### 10.2 CSS — append

```css
/* ===== VIEW HEAD / EMPTY / FAB (shared) (TASK 10) ===== */
.view-head { margin-bottom: var(--sp-4); }
.view-title { font-size: var(--fs-34); font-weight: 700; letter-spacing: -0.02em; }

.empty { text-align: center; padding: var(--sp-16) var(--sp-4); display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); }
.empty-icon { font-size: 48px; color: var(--text-2); }
.empty-copy { color: var(--text-2); font-size: var(--fs-17); }

.fab {
  position: fixed; right: var(--sp-4); z-index: 40;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + var(--sp-4));
  width: 56px; height: 56px; border-radius: var(--r-pill);
  background: var(--text); color: var(--bg); font-size: 28px; line-height: 1;
  box-shadow: var(--shadow-float);
  transition: transform 120ms var(--ease);
}
.fab:active { transform: scale(0.92); }

/* ===== TILES (TASK 10) ===== */
.tiles { display: flex; flex-direction: column; gap: var(--sp-3); }
.tile {
  position: relative; background: var(--surface); border: 1px solid var(--hairline);
  border-radius: var(--r-card); padding: var(--sp-4);
  border-left: 4px solid var(--accent);
}
.tile-main { display: flex; gap: var(--sp-4); align-items: center; }
.tile-avatar { width: 56px; height: 56px; border-radius: var(--r-btn); object-fit: cover; flex: 0 0 auto; }
.tile-info { flex: 1; min-width: 0; }
.tile-name { font-size: var(--fs-17); font-weight: 600; margin-bottom: var(--sp-2); }
.tile-progress-line { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; }
.tile-big { font-size: var(--fs-22); font-weight: 700; }
.tile-unit { font-size: var(--fs-13); color: var(--text-2); }
.tile-sub { font-size: var(--fs-13); color: var(--text-2); margin-top: var(--sp-1); }
.tile-bar { height: 6px; border-radius: var(--r-pill); background: var(--border); overflow: hidden; margin-top: var(--sp-2); }
.tile-bar-fill { height: 100%; border-radius: var(--r-pill); transition: width var(--dur) var(--ease); }
.tile-log {
  position: absolute; right: var(--sp-4); bottom: var(--sp-4);
  width: 44px; height: 44px; border-radius: var(--r-pill);
  background: var(--accent); color: #fff; font-size: 24px; line-height: 1;
  display: grid; place-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: transform 120ms var(--ease);
}
.tile-log:active { transform: scale(0.9); }
```

### 10.3 Verification — TASK 10

Cannot fully test until app.js (TASK 11) wires callbacks, but you can smoke-test the renderer:
```js
const home = await import('./modules/views/home.js');
const store = await import('./modules/store.js');
let st = store.getState();
home.render(document.getElementById('view-home'), st, {
  onLog:(id,c)=>console.log('log',id,c), onOpenActivity:(id)=>console.log('open',id), onCreate:()=>console.log('create'),
});
```
Checks: empty state shows when no activities; with seeded activities, tiles render with correct progress markup per type; quick-log opens the number pad; FAB present.
<!-- @@END id="task-10" -->

---
<!-- @@BEGIN id="task-11" slug="app" deps="1,2,3,4,5,6,7,8,9,10" -->
## TASK 11 — app.js (entry point, routing, refresh pipeline, create-activity form)

**Depends on:** TASK 1–10. Wires everything; later view tasks (12–15) plug into the same router and refresh pipeline.
**Produces:** `app.js` (replaces the placeholder).

### 11.1 Responsibilities

1. Hold the canonical `state` in a module variable (read once from store on boot).
2. `refresh()` — re-read nothing; re-render the *current* view from in-memory `state`, update nav.
3. Central callbacks that call store mutators, reassign `state`, run the target/confetti check, then `refresh()`.
4. Tab routing via the bottom nav.
5. The Create Activity modal (a form with dynamic fields per commitment type + thumbnail upload).
6. Lazily import the view modules (keeps initial parse small and matches the split-doc philosophy).

### 11.2 `app.js`

```js
// app.js — entry point
import * as store from './modules/store.js';
import { recalculate, shouldFireTarget } from './modules/accomplishments.js';
import { celebrate } from './modules/confetti.js';
import { showToast, showModal, showConfirm, esc, haptic } from './modules/ui.js';
import { resizeImage } from './modules/thumbnail.js';
import { syncNow } from './modules/sync.js';

/* view modules (lazy) */
import * as homeView from './modules/views/home.js';
let calendarView, accomplishmentsView, rawLogView, activityDetailView; // loaded on demand

/* ---------- canonical in-memory state ---------- */
let state = store.getState();

/* ---------- routing ---------- */
const VIEWS = ['home', 'calendar', 'accomplishments', 'rawlog'];
let currentView = 'home';

const viewEls = {
  home:            document.getElementById('view-home'),
  calendar:        document.getElementById('view-calendar'),
  accomplishments: document.getElementById('view-accomplishments'),
  rawlog:          document.getElementById('view-rawlog'),
};

function setView(name) {
  currentView = name;
  for (const v of VIEWS) viewEls[v].classList.toggle('hidden', v !== name);
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.view === name));
  refresh();
}

document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => { haptic('light'); setView(btn.dataset.view); }));

/* ---------- callbacks passed down to views ---------- */
const callbacks = {
  onLog: (activityId, count) => {
    state = store.addLog(state, activityId, count);
    // target check (x_in_y / x_only)
    const act = store.getActivity(state, activityId);
    if (act && shouldFireTarget(state, act)) {
      const c = act.commitment;
      state = store.addTargetAchieved(state, activityId, c.targetCount, {
        commitmentStartedAt: c.startedAt, targetDays: c.targetDays,
      });
      celebrate(act.color);
      showTargetModal(act);
    } else {
      haptic('success');
      showToast('Logged ✓', { type: 'success' });
    }
    refresh();
  },
  onOpenActivity: (activityId) => openActivityDetail(activityId),
  onCreate: () => openCreateActivity(),
  onEditLog: (logId, patch) => { state = store.editLog(state, logId, patch); refresh(); },
  onDeleteLog: async (logId) => {
    if (await showConfirm({ title: 'Delete entry?', confirmLabel: 'Delete' })) {
      state = store.deleteLog(state, logId); refresh(); showToast('Entry deleted');
    }
  },
  onDeleteActivity: async (activityId) => {
    if (await showConfirm({ title: 'Delete activity?', message: 'Logs stay in your history.', confirmLabel: 'Delete' })) {
      state = store.deleteActivity(state, activityId); setView('home'); showToast('Activity deleted');
    }
  },
  onResetCommitment: async (activityId) => {
    if (await showConfirm({ title: 'Reset commitment?', message: 'Archives the current commitment.', confirmLabel: 'Reset', danger: false })) {
      const act = store.getActivity(state, activityId);
      // ensure a target_achieved exists for the run being archived (spec 4.5)
      if (act && act.commitment) {
        const c = act.commitment;
        const done = state.logs.filter(l => l.activityId === activityId && new Date(l.timestamp) >= new Date(c.startedAt))
                               .reduce((s,l)=>s+Number(l.count),0);
        const exists = state.accomplishments.some(a => a.type==='target_achieved' && a.activityId===activityId && a.meta?.commitmentStartedAt===c.startedAt);
        if (!exists) state = store.addTargetAchieved(state, activityId, done, { commitmentStartedAt: c.startedAt, targetDays: c.targetDays });
      }
      state = store.resetCommitment(state, activityId);
      refresh(); showToast('Commitment reset ✓', { type:'success' });
    }
  },
  onSetCommitment: (activityId, cfg) => { state = store.setCommitment(state, activityId, cfg); refresh(); },
  onEditActivity: (activityId, patch) => { state = store.editActivity(state, activityId, patch); refresh(); },
  getState: () => state,
};

/* ---------- central refresh ---------- */
async function refresh() {
  applyTheme();
  if (currentView === 'home') {
    homeView.render(viewEls.home, state, callbacks);
  } else if (currentView === 'calendar') {
    calendarView = calendarView || await import('./modules/views/calendar.js');
    calendarView.render(viewEls.calendar, state, callbacks);
  } else if (currentView === 'accomplishments') {
    accomplishmentsView = accomplishmentsView || await import('./modules/views/accomplishments.js');
    accomplishmentsView.render(viewEls.accomplishments, state, callbacks);
  } else if (currentView === 'rawlog') {
    rawLogView = rawLogView || await import('./modules/views/rawLog.js');
    rawLogView.render(viewEls.rawlog, state, callbacks);
  }
}

/* ---------- theme (dark mode override) ---------- */
function applyTheme() {
  const o = state.settings.darkModeOverride;
  if (o === null || o === undefined) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', o ? 'dark' : 'light');
}

/* ---------- activity detail (lazy) ---------- */
async function openActivityDetail(activityId) {
  activityDetailView = activityDetailView || await import('./modules/views/activityDetail.js');
  activityDetailView.open(activityId, () => callbacks.getState(), callbacks);
}

/* ---------- target-hit modal ---------- */
function showTargetModal(activity) {
  const node = document.createElement('div');
  node.innerHTML = `
    <p style="font-size:34px;text-align:center">🎯</p>
    <p style="text-align:center;font-size:17px;color:var(--text-2);margin-bottom:24px">
      Target hit! ${activity.commitment.targetCount} ${esc(activity.unit)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--ghost" data-act="later">Later</button>
      <button class="btn btn--primary" data-act="reset">Reset</button>
    </div>`;
  const { close } = showModal(node, { title: 'Nice work' });
  node.querySelector('[data-act="later"]').onclick = close;
  node.querySelector('[data-act="reset"]').onclick = () => { close(); callbacks.onResetCommitment(activity.id); };
}

/* ---------- create activity modal ---------- */
function openCreateActivity() {
  let thumbnail = null;
  const node = document.createElement('div');
  node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Name</span>
      <input class="field-input" id="f-name" placeholder="e.g. Pushups" autocomplete="off"></label>
    <label class="field"><span class="field-label">Unit</span>
      <input class="field-input" id="f-unit" placeholder="reps, min, km" autocomplete="off"></label>
    <div class="field"><span class="field-label">Commitment type</span>
      <div class="seg" id="f-type">
        <button type="button" data-t="x_in_y" class="seg-btn is-active">X in Y days</button>
        <button type="button" data-t="x_only" class="seg-btn">X reps</button>
        <button type="button" data-t="y_days" class="seg-btn">Y days</button>
        <button type="button" data-t="open"   class="seg-btn">Open</button>
      </div>
    </div>
    <label class="field" id="wrap-count"><span class="field-label">Target count</span>
      <input class="field-input" id="f-count" inputmode="numeric" placeholder="200"></label>
    <label class="field" id="wrap-days"><span class="field-label">Target days</span>
      <input class="field-input" id="f-days" inputmode="numeric" placeholder="20"></label>
    <label class="field"><span class="field-label">Streak minimum (optional)</span>
      <input class="field-input" id="f-min" inputmode="numeric" placeholder="0"></label>
    <div class="field"><span class="field-label">Thumbnail (optional)</span>
      <input type="file" accept="image/*" id="f-img" class="field-file">
      <img id="f-preview" class="form-preview hidden" alt=""></div>
    <button class="btn btn--primary" id="f-save">Create</button>`;

  const { close } = showModal(node, { title: 'New activity' });

  let type = 'x_in_y';
  const wrapCount = node.querySelector('#wrap-count');
  const wrapDays  = node.querySelector('#wrap-days');
  function syncFields() {
    wrapCount.classList.toggle('hidden', !(type === 'x_in_y' || type === 'x_only'));
    wrapDays.classList.toggle('hidden',  !(type === 'x_in_y' || type === 'y_days'));
  }
  node.querySelectorAll('#f-type .seg-btn').forEach(b => b.onclick = () => {
    node.querySelectorAll('#f-type .seg-btn').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active'); type = b.dataset.t; syncFields();
  });
  syncFields();

  node.querySelector('#f-img').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      thumbnail = await resizeImage(file);
      const prev = node.querySelector('#f-preview');
      prev.src = thumbnail; prev.classList.remove('hidden');
    } catch { showToast('Could not process image', { type: 'error' }); }
  };

  node.querySelector('#f-save').onclick = () => {
    const name = node.querySelector('#f-name').value.trim();
    if (!name) { showToast('Name required', { type: 'error' }); return; }
    const cfg = {
      name, unit: node.querySelector('#f-unit').value.trim(), type,
      targetCount: node.querySelector('#f-count').value,
      targetDays: node.querySelector('#f-days').value,
      streakMinimum: node.querySelector('#f-min').value,
      thumbnail,
    };
    if ((type === 'x_in_y' || type === 'x_only') && !(Number(cfg.targetCount) > 0)) { showToast('Target count required', { type:'error' }); return; }
    if ((type === 'x_in_y' || type === 'y_days') && !(Number(cfg.targetDays) > 0)) { showToast('Target days required', { type:'error' }); return; }
    state = store.createActivity(state, cfg);
    close(); setView('home'); showToast('Activity created ✓', { type: 'success' });
  };
}

/* ---------- expose for views that open Settings/sync (used in TASK 14/16) ---------- */
window.__app = { syncNow: () => doSync(), openSettings, getState: () => state, setState: (s) => { state = s; refresh(); } };

async function doSync() {
  const url = state.settings.googleSheetWebhookUrl;
  showToast('Syncing…');
  const res = await syncNow(state, url);
  if (res.ok) { state = store.updateSettings(state, { lastSyncedAt: store.nowISO() }); showToast('Synced ✓', { type: 'success' }); refresh(); }
  else showToast(`Sync failed: ${res.error}`, { type: 'error' });
}

function openSettings() {
  const node = document.createElement('div');
  node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Google Sheets webhook URL</span>
      <input class="field-input" id="s-url" value="${esc(state.settings.googleSheetWebhookUrl)}" placeholder="https://script.google.com/..."></label>
    <label class="field"><span class="field-label">Appearance</span>
      <div class="seg" id="s-theme">
        <button type="button" data-v="system" class="seg-btn">System</button>
        <button type="button" data-v="light"  class="seg-btn">Light</button>
        <button type="button" data-v="dark"   class="seg-btn">Dark</button>
      </div></label>
    <p class="field-label" id="s-last"></p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--ghost" id="s-save">Save</button>
      <button class="btn btn--primary" id="s-sync">Sync now</button>
    </div>`;
  const { close } = showModal(node, { title: 'Settings' });
  const o = state.settings.darkModeOverride;
  const cur = o === null ? 'system' : (o ? 'dark' : 'light');
  node.querySelectorAll('#s-theme .seg-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.v === cur);
    b.onclick = () => {
      node.querySelectorAll('#s-theme .seg-btn').forEach(x=>x.classList.remove('is-active'));
      b.classList.add('is-active');
    };
  });
  const last = state.settings.lastSyncedAt;
  node.querySelector('#s-last').textContent = last ? `Last synced: ${new Date(last).toLocaleString()}` : 'Never synced';
  node.querySelector('#s-save').onclick = () => {
    const url = node.querySelector('#s-url').value.trim();
    const v = node.querySelector('#s-theme .seg-btn.is-active').dataset.v;
    const override = v === 'system' ? null : (v === 'dark');
    state = store.updateSettings(state, { googleSheetWebhookUrl: url, darkModeOverride: override });
    close(); applyTheme(); showToast('Settings saved ✓', { type:'success' });
  };
  node.querySelector('#s-sync').onclick = () => { close(); doSync(); };
}

/* ---------- boot ---------- */
applyTheme();
setView('home');

/* dev seed hook (TASK 17 fills this) */
if (new URLSearchParams(location.search).get('debug') === '1') {
  import('./modules/seed.js').then(m => { window.__test = m.makeTestApi(store, () => state, (s)=>{ state=s; refresh(); }); })
    .catch(()=>{ /* seed module optional */ });
}
```

### 11.3 Form / segmented-control CSS — append

```css
/* ===== FORMS (TASK 11) ===== */
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.field { display: flex; flex-direction: column; gap: var(--sp-2); }
.field-label { font-size: var(--fs-13); font-weight: 500; color: var(--text-2); }
.field-input {
  height: 48px; border-radius: var(--r-btn); border: 1px solid var(--hairline);
  background: var(--bg); color: var(--text); padding: 0 var(--sp-3); font-size: var(--fs-17);
}
.field-input:focus { outline: none; border-color: var(--text-2); }
.field-file { font-size: var(--fs-15); }
.form-preview { width: 72px; height: 72px; border-radius: var(--r-btn); object-fit: cover; margin-top: var(--sp-2); }

.seg { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.seg-btn {
  flex: 1 1 auto; min-height: 40px; padding: 0 var(--sp-3); border-radius: var(--r-btn);
  background: var(--border); color: var(--text-2); font-size: var(--fs-13); font-weight: 600;
  transition: background 120ms var(--ease), color 120ms var(--ease);
}
.seg-btn.is-active { background: var(--text); color: var(--bg); }
```

### 11.4 Verification — TASK 11

1. Reload app. No console errors.
2. Tap FAB → Create modal opens. Switch commitment type → count/days fields show/hide correctly.
3. Create an `x_in_y` activity → appears as a tile on Home with a progress bar.
4. Quick-log via tile `+` → number pad → Save → toast "Logged ✓", progress updates, **persists after reload**.
5. Log enough to exceed target → confetti + 🎯 modal; logging again does NOT re-fire (idempotent).
6. Bottom nav switches views (other views may be empty until TASKs 12–15).
7. Settings (opened via Accomplishments view in TASK 14, or temporarily call `window.__app.openSettings()`) saves URL + theme; theme override flips immediately.
<!-- @@END id="task-11" -->

---
<!-- @@BEGIN id="task-12" slug="activity-detail" deps="3,5,6,10,11" -->
## TASK 12 — views/activityDetail.js + panel CSS

**Depends on:** TASK 11 (callbacks), TASK 3 (streak), TASK 10 (commitmentProgress), TASK 6 (number pad), TASK 5 (modal).
**Produces:** `modules/views/activityDetail.js`, appended CSS.

A slide-over panel from the right with a 3-segment switcher: **Progress / Streak / Log**. Opened via `open(activityId, getState, callbacks)` (not the standard `render` signature, because it's an overlay, not a tab).

### 12.1 `modules/views/activityDetail.js`

```js
// modules/views/activityDetail.js
import { esc, showConfirm, showModal, showToast } from '../ui.js';
import { calcStreakStats, localDayKey } from '../streak.js';
import { commitmentProgress } from './home.js';
import { openNumberPad } from '../numberPad.js';

let panelEl = null;
let backdropEl = null;
let _activityId = null;
let _getState = null;
let _cb = null;
let _seg = 'progress';

export function open(activityId, getState, callbacks) {
  _activityId = activityId; _getState = getState; _cb = callbacks; _seg = 'progress';
  ensureDom();
  rerender();
  requestAnimationFrame(() => { backdropEl.classList.add('is-in'); panelEl.classList.add('is-in'); });
}

function close() {
  panelEl.classList.remove('is-in'); backdropEl.classList.remove('is-in');
  panelEl.addEventListener('transitionend', () => {
    backdropEl.remove(); panelEl.remove(); backdropEl = panelEl = null;
  }, { once: true });
}

function ensureDom() {
  backdropEl = document.createElement('div');
  backdropEl.className = 'panel-backdrop';
  backdropEl.onclick = close;
  panelEl = document.createElement('aside');
  panelEl.className = 'detail-panel';
  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
}

/** call after any state change so the panel reflects latest data */
function rerender() {
  const state = _getState();
  const a = state.activities.find(x => x.id === _activityId);
  if (!a) { close(); return; }

  panelEl.innerHTML = `
    <header class="panel-head">
      <button class="panel-close" aria-label="Close">‹</button>
      <h2 class="panel-title">${esc(a.name)}</h2>
      <button class="panel-kebab" aria-label="More">⋯</button>
    </header>
    <div class="seg panel-seg">
      <button class="seg-btn ${_seg==='progress'?'is-active':''}" data-s="progress">Progress</button>
      <button class="seg-btn ${_seg==='streak'?'is-active':''}" data-s="streak">Streak</button>
      <button class="seg-btn ${_seg==='log'?'is-active':''}" data-s="log">Log</button>
    </div>
    <div class="panel-body">${renderSeg(a, state)}</div>
    <button class="fab detail-log-fab" aria-label="Log">＋</button>`;

  panelEl.querySelector('.panel-close').onclick = close;
  panelEl.querySelector('.panel-kebab').onclick = () => openKebab(a);
  panelEl.querySelectorAll('.panel-seg .seg-btn').forEach(b =>
    b.onclick = () => { _seg = b.dataset.s; rerender(); });
  panelEl.querySelector('.detail-log-fab').onclick = () =>
    openNumberPad({ title: a.name, unit: a.unit, onSave: (c) => { _cb.onLog(a.id, c); rerender(); } });

  // wire log rows (edit) if on log seg
  if (_seg === 'log') wireLogRows(a, state);
}

function renderSeg(a, state) {
  if (_seg === 'progress') return renderProgress(a, state);
  if (_seg === 'streak')   return renderStreak(a, state);
  return renderLog(a, state);
}

/* ---------- Progress sub-view ---------- */
function renderProgress(a, state) {
  const { total, distinctDays, commitment: c } = commitmentProgress(a, state.logs);
  const unit = esc(a.unit);
  if (!c) return `<div class="detail-empty">No active commitment.</div>`;
  if (c.type === 'open')
    return `<div class="detail-hero"><span class="detail-hero-num">${total}</span><span class="detail-hero-unit">${unit}</span></div>
            <p class="detail-sub">Open commitment — keep going.</p>`;

  const start = new Date(c.startedAt); start.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const elapsed = Math.round((today - start)/86400000) + 1;

  let pct, line, rem = '';
  if (c.type === 'x_only') { pct = Math.min(100, Math.round(total/c.targetCount*100)); line = `${total} / ${c.targetCount} ${unit}`; }
  else if (c.type === 'x_in_y') { pct = Math.min(100, Math.round(total/c.targetCount*100)); line = `${total} / ${c.targetCount} ${unit}`; rem = `${Math.max(0,c.targetDays-elapsed+1)} days remaining`; }
  else /* y_days */ { pct = Math.min(100, Math.round(distinctDays/c.targetDays*100)); line = `${distinctDays} / ${c.targetDays} days · ${total} ${unit} total`; rem = `${Math.max(0,c.targetDays-elapsed+1)} days remaining`; }

  return `
    <div class="detail-hero"><span class="detail-hero-num">${pct}</span><span class="detail-hero-unit">%</span></div>
    <div class="tile-bar" style="margin:16px 0"><div class="tile-bar-fill" style="width:${pct}%;background:${a.color}"></div></div>
    <p class="detail-line">${esc(line)}</p>
    <p class="detail-sub">Day ${elapsed}${rem?` · ${esc(rem)}`:''}</p>
    <button class="btn btn--ghost" id="reset-btn" style="margin-top:24px;width:100%">Reset commitment</button>`;
}

/* ---------- Streak sub-view ---------- */
function renderStreak(a, state) {
  const ss = calcStreakStats(a.id, a.streakMinimum || 0, state.logs);
  const freqRows = [];
  for (let n = 2; ; n++) {
    const f = ss.frequency[n] || 0;
    if (n > ss.longest) break;          // stop once beyond longest run
    freqRows.push(`<div class="stat-row"><span>Frequency of ${n}-day streaks</span><b>${f}</b></div>`);
    if (f === 0 && n >= 2) { /* spec: stop when bucket is 0 — but only after showing it; break here */ break; }
  }
  const last = ss.lastPerformed ? new Date(ss.lastPerformed.split('-').map((x,i)=>i===1?x-1:x)).toLocaleDateString() : '—';
  return `
    <div class="detail-hero"><span class="detail-hero-num">${ss.current}</span><span class="detail-hero-unit">day streak</span></div>
    ${renderStreakCalendar(a, state)}
    <div class="stat-list">
      <div class="stat-row"><span>Last performed</span><b>${ss.lastPerformed ? esc(ss.lastPerformed) : '—'}</b></div>
      <div class="stat-row"><span>Longest streak</span><b>${ss.longest} days</b></div>
      ${freqRows.join('')}
    </div>`;
}

/** Mini month calendar for THIS activity: ticks on qualifying days. */
function renderStreakCalendar(a, state) {
  const ss = calcStreakStats(a.id, a.streakMinimum || 0, state.logs);
  const qual = new Set(ss.qualifyingDays);
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1); const startDow = first.getDay();
  const days = new Date(y, m+1, 0).getDate();
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell cal-empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${m+1}-${d}`;
    const on = qual.has(key);
    cells += `<div class="cal-cell ${on?'cal-on':''}" style="${on?`--accent:${a.color}`:''}">${d}</div>`;
  }
  return `<div class="mini-cal-label">${first.toLocaleString(undefined,{month:'long',year:'numeric'})}</div>
          <div class="mini-cal">${cells}</div>`;
}

/* ---------- Log sub-view ---------- */
function renderLog(a, state) {
  // logs for this activity, newest first, with cumulative within current commitment window
  const logs = state.logs.filter(l => l.activityId === a.id)
    .sort((x,y) => new Date(y.timestamp) - new Date(x.timestamp));
  if (logs.length === 0) return `<div class="detail-empty">No entries yet.</div>`;

  // cumulative resets at current commitment start
  const startTs = a.commitment ? new Date(a.commitment.startedAt) : new Date(0);
  const asc = [...logs].reverse();
  let cum = 0; const cumMap = new Map();
  for (const l of asc) {
    if (new Date(l.timestamp) >= startTs) { cum += Number(l.count); cumMap.set(l.id, cum); }
    else cumMap.set(l.id, null);
  }
  const rows = logs.map(l => {
    const d = new Date(l.timestamp);
    const cumv = cumMap.get(l.id);
    return `<button class="log-row" data-log="${l.id}">
      <span class="log-date">${d.toLocaleDateString()}</span>
      <span class="log-time">${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      <span class="log-count">${l.count} ${esc(a.unit)}</span>
      <span class="log-cum">${cumv==null?'—':`Σ ${cumv}`}</span>
    </button>`;
  }).join('');
  return `<div class="log-table">${rows}</div>`;
}

function wireLogRows(a, state) {
  panelEl.querySelectorAll('.log-row').forEach(row =>
    row.onclick = () => openEditLog(row.dataset.log, a));
  const resetBtn = panelEl.querySelector('#reset-btn');
  if (resetBtn) resetBtn.onclick = () => { _cb.onResetCommitment(a.id); setTimeout(rerender, 50); };
}

/* ---------- edit-log modal ---------- */
function openEditLog(logId, a) {
  const state = _getState();
  const l = state.logs.find(x => x.id === logId); if (!l) return;
  const d = new Date(l.timestamp);
  const dateVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const timeVal = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Count (${esc(a.unit)})</span>
      <input class="field-input" id="e-count" inputmode="numeric" value="${l.count}"></label>
    <label class="field"><span class="field-label">Date</span>
      <input class="field-input" id="e-date" type="date" value="${dateVal}"></label>
    <label class="field"><span class="field-label">Time</span>
      <input class="field-input" id="e-time" type="time" value="${timeVal}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--danger" id="e-del">Delete</button>
      <button class="btn btn--primary" id="e-save">Save</button>
    </div>`;
  const { close } = showModal(node, { title: 'Edit entry' });
  node.querySelector('#e-save').onclick = () => {
    const count = Number(node.querySelector('#e-count').value);
    const dv = node.querySelector('#e-date').value, tv = node.querySelector('#e-time').value;
    if (!(count >= 1)) { showToast('Count must be ≥ 1', {type:'error'}); return; }
    const nd = new Date(`${dv}T${tv||'00:00'}`);
    // preserve local tz offset
    const off = -nd.getTimezoneOffset(); const sign = off>=0?'+':'-';
    const oh = String(Math.floor(Math.abs(off)/60)).padStart(2,'0'); const om = String(Math.abs(off)%60).padStart(2,'0');
    const ts = nd.toISOString().slice(0,-1) + sign + oh + ':' + om;
    _cb.onEditLog(logId, { count, timestamp: ts });
    close(); rerender();
  };
  node.querySelector('#e-del').onclick = async () => {
    close(); await _cb.onDeleteLog(logId); rerender();
  };
}

/* ---------- kebab (edit / delete activity / set commitment) ---------- */
function openKebab(a) {
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <button class="btn btn--ghost" id="k-edit">Edit activity</button>
    ${a.commitment ? '' : `<button class="btn btn--ghost" id="k-commit">Set new commitment</button>`}
    <button class="btn btn--danger" id="k-del">Delete activity</button>`;
  const { close } = showModal(node, { title: a.name });
  node.querySelector('#k-edit').onclick = () => { close(); openEditActivity(a); };
  const kc = node.querySelector('#k-commit'); if (kc) kc.onclick = () => { close(); openSetCommitment(a); };
  node.querySelector('#k-del').onclick = async () => { close(); await _cb.onDeleteActivity(a.id); close(); };
}

function openEditActivity(a) {
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Name</span><input class="field-input" id="ea-name" value="${esc(a.name)}"></label>
    <label class="field"><span class="field-label">Unit</span><input class="field-input" id="ea-unit" value="${esc(a.unit)}"></label>
    <label class="field"><span class="field-label">Streak minimum</span><input class="field-input" id="ea-min" inputmode="numeric" value="${a.streakMinimum||0}"></label>
    <button class="btn btn--primary" id="ea-save">Save</button>`;
  const { close } = showModal(node, { title: 'Edit activity' });
  node.querySelector('#ea-save').onclick = () => {
    _cb.onEditActivity(a.id, {
      name: node.querySelector('#ea-name').value.trim(),
      unit: node.querySelector('#ea-unit').value.trim(),
      streakMinimum: node.querySelector('#ea-min').value,
    });
    close(); rerender();
  };
}

function openSetCommitment(a) {
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <div class="seg" id="sc-type">
      <button type="button" data-t="x_in_y" class="seg-btn is-active">X in Y</button>
      <button type="button" data-t="x_only" class="seg-btn">X reps</button>
      <button type="button" data-t="y_days" class="seg-btn">Y days</button>
      <button type="button" data-t="open"   class="seg-btn">Open</button>
    </div>
    <label class="field" id="sc-wc"><span class="field-label">Target count</span><input class="field-input" id="sc-count" inputmode="numeric"></label>
    <label class="field" id="sc-wd"><span class="field-label">Target days</span><input class="field-input" id="sc-days" inputmode="numeric"></label>
    <button class="btn btn--primary" id="sc-save">Set commitment</button>`;
  const { close } = showModal(node, { title: 'New commitment' });
  let type = 'x_in_y';
  const wc = node.querySelector('#sc-wc'), wd = node.querySelector('#sc-wd');
  const sync = () => { wc.classList.toggle('hidden', !(type==='x_in_y'||type==='x_only')); wd.classList.toggle('hidden', !(type==='x_in_y'||type==='y_days')); };
  node.querySelectorAll('#sc-type .seg-btn').forEach(b => b.onclick = () => {
    node.querySelectorAll('#sc-type .seg-btn').forEach(x=>x.classList.remove('is-active')); b.classList.add('is-active'); type=b.dataset.t; sync();
  });
  sync();
  node.querySelector('#sc-save').onclick = () => {
    _cb.onSetCommitment(a.id, { type, targetCount: node.querySelector('#sc-count').value, targetDays: node.querySelector('#sc-days').value });
    close(); rerender();
  };
}
```

### 12.2 CSS — append

```css
/* ===== ACTIVITY DETAIL PANEL (TASK 12) ===== */
.panel-backdrop { position: fixed; inset: 0; z-index: 90; background: rgba(0,0,0,0.32); opacity: 0; transition: opacity var(--dur) var(--ease); }
.panel-backdrop.is-in { opacity: 1; }
.detail-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 91;
  width: min(100%, 480px); background: var(--bg);
  padding: calc(var(--safe-top) + var(--sp-4)) var(--sp-4) calc(var(--safe-bottom) + var(--sp-4));
  overflow-y: auto; transform: translateX(100%); transition: transform var(--dur) var(--ease);
  box-shadow: var(--shadow-float);
}
.detail-panel.is-in { transform: translateX(0); }
.panel-head { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; margin-bottom: var(--sp-4); }
.panel-close { font-size: 28px; text-align: left; }
.panel-kebab { font-size: 24px; text-align: right; }
.panel-title { font-size: var(--fs-22); font-weight: 600; text-align: center; }
.panel-seg { margin-bottom: var(--sp-6); }
.panel-body { min-height: 200px; }

.detail-hero { display: flex; align-items: baseline; justify-content: center; gap: var(--sp-2); margin: var(--sp-6) 0 var(--sp-2); }
.detail-hero-num { font-size: 64px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
.detail-hero-unit { font-size: var(--fs-17); color: var(--text-2); }
.detail-line { text-align: center; font-size: var(--fs-17); font-weight: 600; }
.detail-sub { text-align: center; color: var(--text-2); font-size: var(--fs-15); margin-top: var(--sp-1); }
.detail-empty { text-align: center; color: var(--text-2); padding: var(--sp-12) 0; }

.stat-list { margin-top: var(--sp-6); display: flex; flex-direction: column; }
.stat-row { display: flex; justify-content: space-between; padding: var(--sp-3) 0; border-bottom: 1px solid var(--hairline); font-size: var(--fs-15); }
.stat-row b { font-weight: 600; }

.mini-cal-label { text-align: center; font-size: var(--fs-13); color: var(--text-2); margin: var(--sp-4) 0 var(--sp-2); }
.mini-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-cell { aspect-ratio: 1; display: grid; place-items: center; font-size: var(--fs-13); color: var(--text-2); border-radius: 8px; }
.cal-empty { visibility: hidden; }
.cal-on { background: var(--accent); color: #fff; font-weight: 600; }

.log-table { display: flex; flex-direction: column; }
.log-row { display: grid; grid-template-columns: 1.2fr 0.8fr 1fr 0.8fr; gap: var(--sp-2); text-align: left;
  padding: var(--sp-3) 0; border-bottom: 1px solid var(--hairline); font-size: var(--fs-13); align-items: center; }
.log-count { font-weight: 600; font-size: var(--fs-15); }
.log-cum { color: var(--text-2); text-align: right; }
.detail-log-fab { position: fixed; }
```

### 12.3 Verification — TASK 12

1. Tap a tile → panel slides in from the right; tap backdrop or ‹ closes it.
2. Progress segment shows correct hero %/count, bar, day count, days remaining for each commitment type.
3. Streak segment: current streak number, mini-calendar ticks on performed days, stat rows including frequencies that stop after the first 0 beyond length 2.
4. Log segment: rows newest-first with cumulative; tap a row → edit modal; changing the date moves the entry (verify streak/calendar update). Delete works with confirm.
5. Kebab → edit activity, delete activity (confirm), and (when no active commitment) set new commitment.
<!-- @@END id="task-12" -->

---
<!-- @@BEGIN id="task-13" slug="calendar" deps="5,11" -->
## TASK 13 — views/calendar.js + grid CSS

**Depends on:** TASK 11 (render signature/callbacks), TASK 5 (modal).
**Produces:** `modules/views/calendar.js`, appended CSS.

Monthly grid; each day shows up to 4 colored dots (one per distinct activity performed that day, including deleted activities' logs), "+N" if more; tap a day → modal listing that day's entries; prev/next month nav.

### 13.1 `modules/views/calendar.js`

```js
// modules/views/calendar.js
import { esc, showModal } from '../ui.js';

let _month = null; // Date anchored to first of displayed month

export function render(container, state, callbacks) {
  if (!_month) { const n = new Date(); _month = new Date(n.getFullYear(), n.getMonth(), 1); }
  const y = _month.getFullYear(), m = _month.getMonth();

  // map dayKey -> [{activityId, color, count, name, deleted}]
  const byDay = new Map();
  for (const l of state.logs) {
    const d = new Date(l.timestamp);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    const key = d.getDate();
    const act = state.activities.find(a => a.id === l.activityId);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ activityId: l.activityId, color: act?.color || '#999', count: l.count, name: act?.name || 'Unknown', deleted: act?.deleted });
  }

  const startDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const todayD = new Date(); const isThisMonth = todayD.getFullYear() === y && todayD.getMonth() === m;

  let cells = '';
  const dow = ['S','M','T','W','T','F','S'];
  const dowRow = dow.map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-day cal-day--empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const entries = byDay.get(d) || [];
    const distinct = [...new Map(entries.map(e => [e.activityId, e])).values()];
    const dots = distinct.slice(0, 4).map(e => `<span class="cal-dot" style="background:${e.color}"></span>`).join('');
    const more = distinct.length > 4 ? `<span class="cal-more">+${distinct.length - 4}</span>` : '';
    const today = isThisMonth && d === todayD.getDate();
    cells += `<button class="cal-day ${today?'cal-day--today':''}" data-day="${d}" ${entries.length?'':'disabled'}>
        <span class="cal-num">${d}</span><span class="cal-dots">${dots}${more}</span></button>`;
  }

  container.innerHTML = `
    <header class="view-head cal-head">
      <button class="cal-nav" data-nav="-1" aria-label="Previous month">‹</button>
      <h1 class="cal-title">${_month.toLocaleString(undefined,{month:'long',year:'numeric'})}</h1>
      <button class="cal-nav" data-nav="1" aria-label="Next month">›</button>
    </header>
    <div class="cal-grid cal-dow-row">${dowRow}</div>
    <div class="cal-grid">${cells}</div>`;

  container.querySelectorAll('.cal-nav').forEach(b => b.onclick = () => {
    _month = new Date(y, m + Number(b.dataset.nav), 1); render(container, state, callbacks);
  });
  container.querySelectorAll('.cal-day[data-day]').forEach(b => b.onclick = () => {
    const entries = byDay.get(Number(b.dataset.day)) || [];
    openDayModal(y, m, Number(b.dataset.day), entries);
  });
}

function openDayModal(y, m, d, entries) {
  const node = document.createElement('div');
  const date = new Date(y, m, d);
  node.innerHTML = entries.length === 0
    ? `<p class="detail-empty">No entries.</p>`
    : `<div class="day-list">${entries.map(e => `
        <div class="day-row">
          <span class="cal-dot" style="background:${e.color}"></span>
          <span class="day-name ${e.deleted?'is-deleted':''}">${esc(e.name)}</span>
          <span class="day-count">${e.count}</span>
        </div>`).join('')}</div>`;
  showModal(node, { title: date.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'}) });
}
```

### 13.2 CSS — append

```css
/* ===== CALENDAR (TASK 13) ===== */
.cal-head { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; }
.cal-title { font-size: var(--fs-22); font-weight: 600; text-align: center; }
.cal-nav { font-size: 24px; min-height: 44px; color: var(--text-2); }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-dow-row { margin-bottom: var(--sp-2); }
.cal-dow { text-align: center; font-size: 11px; color: var(--text-2); font-weight: 500; }
.cal-day {
  aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
  gap: 4px; padding-top: 6px; border-radius: 10px; background: transparent;
}
.cal-day--empty { visibility: hidden; }
.cal-day[disabled] { opacity: 0.5; }
.cal-num { font-size: var(--fs-13); }
.cal-day--today .cal-num { background: var(--text); color: var(--bg); width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; }
.cal-dots { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; justify-content: center; }
.cal-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.cal-more { font-size: 9px; color: var(--text-2); }
.day-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.day-row { display: grid; grid-template-columns: 12px 1fr auto; gap: var(--sp-3); align-items: center; padding: var(--sp-2) 0; }
.day-name.is-deleted { font-style: italic; color: var(--text-2); }
.day-count { font-weight: 600; }
```

### 13.3 Verification — TASK 13

1. Calendar shows current month; prev/next navigation works.
2. Days with logs show colored dots (max 4 + "+N"); today has the filled circle.
3. Logs from **deleted** activities still appear (their dot uses the stored color; in the day modal the name is italic).
4. Tap a day with entries → modal lists each entry (activity name + count).
<!-- @@END id="task-13" -->

---
<!-- @@BEGIN id="task-14" slug="accomplishments-view" deps="4,11" -->
## TASK 14 — views/accomplishments.js + CSS

**Depends on:** TASK 11, TASK 4 (derived accomplishments already in state).
**Produces:** `modules/views/accomplishments.js`, appended CSS. Also adds the Settings entry point (gear icon).

Four sections, all derived fresh each render from `state.accomplishments` (which `recalculate` keeps current): **Longest Streak**, **Daily Max**, **Targets Achieved**, **Overall Max**.

### 14.1 `modules/views/accomplishments.js`

```js
// modules/views/accomplishments.js
import { esc } from '../ui.js';

export function render(container, state, callbacks) {
  const actName = id => {
    const a = state.activities.find(x => x.id === id);
    return { name: a?.name || 'Unknown', color: a?.color || '#999', deleted: a?.deleted, unit: a?.unit || '' };
  };

  const acc = state.accomplishments || [];
  const longest = acc.filter(a => a.type === 'longest_streak').sort((x,y) => y.value - x.value);
  const daily   = acc.filter(a => a.type === 'daily_max').sort((x,y) => y.value - x.value);
  const targets = acc.filter(a => a.type === 'target_achieved').sort((x,y) => new Date(y.achievedAt) - new Date(x.achievedAt));
  const overall = acc.filter(a => a.type === 'overall_max').sort((x,y) => y.value - x.value);

  const section = (title, items, fmt) => `
    <section class="acc-section">
      <h2 class="acc-h">${title}</h2>
      ${items.length === 0 ? `<p class="acc-empty">Nothing yet.</p>`
        : `<div class="acc-list">${items.map(fmt).join('')}</div>`}
    </section>`;

  const row = (a, valueText) => {
    const m = actName(a.activityId);
    return `<div class="acc-row">
      <span class="cal-dot" style="background:${m.color}"></span>
      <span class="acc-name ${m.deleted?'is-deleted':''}">${esc(m.name)}</span>
      <span class="acc-val">${esc(valueText)}</span>
    </div>`;
  };

  container.innerHTML = `
    <header class="view-head acc-head">
      <h1 class="view-title">Wins</h1>
      <button class="acc-gear" id="acc-settings" aria-label="Settings">⚙</button>
    </header>
    ${section('Longest Streak', longest, a => row(a, `${a.value} days`))}
    ${section('Daily Max', daily, a => row(a, `${a.value} ${actName(a.activityId).unit}`))}
    ${section('Targets Achieved', targets, a => row(a, `${a.value} · ${new Date(a.achievedAt).toLocaleDateString()}`))}
    ${section('Overall Max (per activity)', overall, a => row(a, `${a.value} ${actName(a.activityId).unit}`))}`;

  const gear = container.querySelector('#acc-settings');
  gear.onclick = () => { if (window.__app?.openSettings) window.__app.openSettings(); };
}
```

> The gear calls `window.__app.openSettings()` exposed in app.js (TASK 11). This keeps Settings out of the bottom nav (only 4 tabs) while remaining reachable.

### 14.2 CSS — append

```css
/* ===== ACCOMPLISHMENTS (TASK 14) ===== */
.acc-head { display: flex; align-items: center; justify-content: space-between; }
.acc-gear { font-size: 22px; min-height: 44px; min-width: 44px; }
.acc-section { margin-bottom: var(--sp-6); }
.acc-h { font-size: var(--fs-13); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-2); margin-bottom: var(--sp-3); }
.acc-list { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-card); overflow: hidden; }
.acc-row { display: grid; grid-template-columns: 12px 1fr auto; gap: var(--sp-3); align-items: center; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--hairline); }
.acc-row:last-child { border-bottom: none; }
.acc-name.is-deleted { font-style: italic; color: var(--text-2); }
.acc-val { font-weight: 600; font-size: var(--fs-15); }
.acc-empty { color: var(--text-2); font-size: var(--fs-15); padding: var(--sp-2) 0; }
```

### 14.3 Verification — TASK 14

1. Four sections render; values match a manual calculation from seed data.
2. Longest Streak / Daily Max / Overall Max sorted descending; Targets Achieved sorted newest first.
3. Gear opens Settings; saving URL/theme works; "Sync now" triggers sync flow.
4. Deleted activities still appear in derived sections with italic names (their logs persist).
<!-- @@END id="task-14" -->

---
<!-- @@BEGIN id="task-15" slug="rawlog" deps="11,12" -->
## TASK 15 — views/rawLog.js + CSS

**Depends on:** TASK 11, TASK 12 (reuses edit-log modal pattern — but rawLog implements its own edit via callbacks to avoid importing the panel).
**Produces:** `modules/views/rawLog.js`, appended CSS.

Table: Date, Time, Activity (color dot, italic if deleted), Count, Unit. Newest first. Multi-select activity filter chips. Tap row → edit modal (count/date/time + delete).

### 15.1 `modules/views/rawLog.js`

```js
// modules/views/rawLog.js
import { esc, showModal, showToast } from '../ui.js';

let _filter = new Set(); // empty = show all

export function render(container, state, callbacks) {
  const activities = state.activities; // include deleted for filter chips
  const chips = activities.map(a => `
    <button class="chip ${_filter.has(a.id)?'is-on':''}" data-chip="${a.id}" style="--accent:${a.color}">
      <span class="cal-dot" style="background:${a.color}"></span>${esc(a.name)}${a.deleted?' (del)':''}
    </button>`).join('');

  let logs = [...state.logs].sort((x,y) => new Date(y.timestamp) - new Date(x.timestamp));
  if (_filter.size > 0) logs = logs.filter(l => _filter.has(l.activityId));

  const rowsHtml = logs.length === 0
    ? `<tr><td colspan="4" class="rl-empty">No entries.</td></tr>`
    : logs.map(l => {
        const a = activities.find(x => x.id === l.activityId);
        const d = new Date(l.timestamp);
        return `<tr class="rl-row" data-log="${l.id}">
          <td>${d.toLocaleDateString()}<br><span class="rl-time">${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></td>
          <td><span class="cal-dot" style="background:${a?.color||'#999'}"></span>
              <span class="${a?.deleted?'is-deleted':''}">${esc(a?.name||'Unknown')}</span></td>
          <td class="rl-count">${l.count}</td>
          <td class="rl-unit">${esc(a?.unit||'')}</td>
        </tr>`;
      }).join('');

  container.innerHTML = `
    <header class="view-head"><h1 class="view-title">Log</h1></header>
    <div class="chips">${chips || '<span class="acc-empty">No activities.</span>'}</div>
    <table class="rl-table">
      <thead><tr><th>Date</th><th>Activity</th><th>Count</th><th>Unit</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  container.querySelectorAll('[data-chip]').forEach(c => c.onclick = () => {
    const id = c.dataset.chip;
    if (_filter.has(id)) _filter.delete(id); else _filter.add(id);
    render(container, state, callbacks);
  });
  container.querySelectorAll('.rl-row').forEach(r => r.onclick = () => openEdit(r.dataset.log, state, callbacks));
}

function openEdit(logId, state, callbacks) {
  const l = state.logs.find(x => x.id === logId); if (!l) return;
  const a = state.activities.find(x => x.id === l.activityId);
  const d = new Date(l.timestamp);
  const dateVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const timeVal = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Count (${esc(a?.unit||'')})</span><input class="field-input" id="r-count" inputmode="numeric" value="${l.count}"></label>
    <label class="field"><span class="field-label">Date</span><input class="field-input" id="r-date" type="date" value="${dateVal}"></label>
    <label class="field"><span class="field-label">Time</span><input class="field-input" id="r-time" type="time" value="${timeVal}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--danger" id="r-del">Delete</button>
      <button class="btn btn--primary" id="r-save">Save</button>
    </div>`;
  const { close } = showModal(node, { title: 'Edit entry' });
  node.querySelector('#r-save').onclick = () => {
    const count = Number(node.querySelector('#r-count').value);
    if (!(count >= 1)) { showToast('Count must be ≥ 1', {type:'error'}); return; }
    const dv = node.querySelector('#r-date').value, tv = node.querySelector('#r-time').value;
    const nd = new Date(`${dv}T${tv||'00:00'}`);
    const off = -nd.getTimezoneOffset(); const sign = off>=0?'+':'-';
    const oh = String(Math.floor(Math.abs(off)/60)).padStart(2,'0'); const om = String(Math.abs(off)%60).padStart(2,'0');
    const ts = nd.toISOString().slice(0,-1) + sign + oh + ':' + om;
    callbacks.onEditLog(logId, { count, timestamp: ts }); close();
  };
  node.querySelector('#r-del').onclick = async () => { close(); await callbacks.onDeleteLog(logId); };
}
```

### 15.2 CSS — append

```css
/* ===== RAW LOG (TASK 15) ===== */
.chips { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-4); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--r-pill);
  background: var(--border); color: var(--text-2); font-size: var(--fs-13); font-weight: 500; min-height: 36px; }
.chip.is-on { background: var(--text); color: var(--bg); }
.chip.is-on .cal-dot { box-shadow: 0 0 0 2px var(--bg); }
.rl-table { width: 100%; border-collapse: collapse; font-size: var(--fs-15); }
.rl-table th { text-align: left; font-size: var(--fs-13); color: var(--text-2); font-weight: 500; padding: var(--sp-2); border-bottom: 1px solid var(--hairline); }
.rl-row td { padding: var(--sp-3) var(--sp-2); border-bottom: 1px solid var(--hairline); vertical-align: top; }
.rl-time { color: var(--text-2); font-size: var(--fs-13); }
.rl-count { font-weight: 600; }
.rl-unit { color: var(--text-2); }
.rl-row td .is-deleted { font-style: italic; color: var(--text-2); }
.rl-empty { text-align: center; color: var(--text-2); padding: var(--sp-8) 0; }
.rl-row .cal-dot { margin-right: 6px; vertical-align: middle; }
```

### 15.3 Verification — TASK 15

1. Table lists all logs newest-first with date/time/activity/count/unit.
2. Filter chips toggle (multi-select); list narrows to selected activities; deselect all → shows everything.
3. Deleted activities' rows appear with italic name and "(del)" chip.
4. Tap row → edit modal; save updates count/date/time; delete (confirm via callback) removes the row. Editing the date is reflected in Calendar and Streak after refresh.
<!-- @@END id="task-15" -->

---
<!-- @@BEGIN id="task-16" slug="polish" deps="11,12,13,14,15" -->
## TASK 16 — Polish (dark mode, motion, empty states, edge cases)

**Depends on:** TASK 11–15 complete.
**Produces:** edits across `style.css` and small guards in modules. No new files.

This is a pass, not new features. Work the checklist; each item is a small, verifiable change.

### 16.1 Dark mode audit
- Toggle `prefers-color-scheme` in Safari/Chrome dev tools. Every view must render with the dark tokens. Look specifically at: tile borders, hairlines, number-pad keys, modal/sheet backgrounds, calendar dots (activity colors must stay vivid on dark).
- Verify the Settings override (System/Light/Dark) wins over system and persists across reload (`darkModeOverride` in settings).

### 16.2 Motion
- Confirm sheet/panel/modal transitions are 200–300ms with `--ease`. No janky jumps.
- Add `@media (prefers-reduced-motion: reduce)` to disable transforms/opacity transitions:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```
(Append after the APPEND-POINT.)

### 16.3 Empty states (every view)
- Home: "No activities yet. Tap + to start." (done in TASK 10).
- Calendar: a month with no logs simply shows no dots — acceptable; optionally show a subtle hint under the grid: `No entries this month.`
- Accomplishments: each section shows "Nothing yet." (done).
- Raw Log: "No entries." (done). With a filter that excludes everything, also "No entries."

### 16.4 Edge cases (verify each)
1. **Two entries same day** → daily total sums; calendar shows one dot per activity; streak counts the day once.
2. **Edit a log's date across a month boundary** → it moves in Calendar and recomputes streaks (because every edit runs `recalculate`).
3. **Deleted activity** → hidden in Home + not auto-tracked, but logs remain in Calendar + Raw Log (italic) and still feed derived accomplishments.
4. **Color reuse** → delete an activity, create a new one; the freed palette slot is reused (verify via `nextColor`).
5. **Commitment null after reset** → Home tile shows "no active commitment"; Progress segment shows the empty message + can set a new commitment via kebab.
6. **Haptics** on log save, target hit, delete (no-op where unsupported — never throws).
7. **Timezone** → all stored timestamps end with `+HH:MM`/`-HH:MM`; editing preserves offset.
8. **localStorage corruption** → manually set an invalid JSON string at the key; `getState()` returns empty state without throwing.
9. **Number pad cap** at 99999; leading zero guard.
10. **Confirm dialogs** precede every destructive action (delete activity, delete log, reset).

### 16.5 iPhone PWA test
- Add to Home Screen; launch → standalone, no Safari chrome; status bar style correct; safe-area insets respected (nothing under the home indicator or notch).
- Offline: turn on Airplane mode → app works fully; confetti silently no-ops; sync shows an error toast but keeps data.

### 16.6 Verification — TASK 16
Run the entire Verification Checklist in Section "FINAL ACCEPTANCE" below. All must pass.
<!-- @@END id="task-16" -->

---
<!-- @@BEGIN id="task-17" slug="seed" deps="2,11" -->
## TASK 17 — Dev seed data

**Depends on:** TASK 2 (store), TASK 11 (debug hook already wired).
**Produces:** `modules/seed.js`. Loaded only when URL has `?debug=1`. **Remove or keep gated before deploy.**

### 17.1 `modules/seed.js`

```js
// modules/seed.js — dev-only. Gated behind ?debug=1 in app.js.
export function makeTestApi(store, getState, setState) {
  function seed() {
    localStorage.removeItem('fitness_tracker_v1');
    let s = store.getState();
    const defs = [
      { name:'Pushups',  unit:'reps', type:'x_in_y', targetCount:1000, targetDays:30, streakMinimum:0 },
      { name:'Running',  unit:'km',   type:'x_only', targetCount:50,  streakMinimum:0 },
      { name:'Meditate', unit:'min',  type:'y_days', targetDays:21,   streakMinimum:10 },
      { name:'Water',    unit:'glasses', type:'open', streakMinimum:0 },
      { name:'OldHabit', unit:'reps', type:'x_only', targetCount:100, streakMinimum:0 },
    ];
    for (const d of defs) s = store.createActivity(s, d);

    // ~60 days of logs across activities
    const ids = s.activities.map(a => a.id);
    const now = Date.now();
    for (let dayAgo = 60; dayAgo >= 0; dayAgo--) {
      const base = now - dayAgo * 86400000;
      // pushups most days
      if (Math.random() > 0.2) s = pushAt(store, s, ids[0], rand(20,60), base);
      // running every ~3rd day
      if (dayAgo % 3 === 0) s = pushAt(store, s, ids[1], rand(3,8), base);
      // meditate streaky first 25 days
      if (dayAgo <= 25 && Math.random() > 0.15) s = pushAt(store, s, ids[2], rand(8,20), base);
      // water daily
      s = pushAt(store, s, ids[3], rand(4,9), base);
      // old habit only early, then we delete it
      if (dayAgo > 40) s = pushAt(store, s, ids[4], rand(10,30), base);
    }
    // complete one commitment + reset, delete the old habit
    s = store.deleteActivity(s, ids[4]);
    setState(s);
    return s;
  }
  function clear() { localStorage.removeItem('fitness_tracker_v1'); location.reload(); }
  return { seed, clear, dump: () => getState() };
}

function pushAt(store, s, activityId, count, baseMs) {
  // craft a timestamp at a random hour that day, with local offset
  const d = new Date(baseMs); d.setHours(rand(6,21), rand(0,59), 0, 0);
  const off = -d.getTimezoneOffset(); const sign = off>=0?'+':'-';
  const oh = String(Math.floor(Math.abs(off)/60)).padStart(2,'0'); const om = String(Math.abs(off)%60).padStart(2,'0');
  const ts = d.toISOString().slice(0,-1)+sign+oh+':'+om;
  // bypass addLog's "now" by editing after add
  s = store.addLog(s, activityId, count);
  const last = s.logs[s.logs.length-1];
  s = store.editLog(s, last.id, { timestamp: ts });
  return s;
}
function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
```

### 17.2 Usage / Verification — TASK 17
Open `index.html?debug=1`, then in console: `window.__test.seed()`. The app reloads with 5 activities (one deleted), ~60 days of logs, mixed commitment types. Use this dataset to verify all accomplishment math in TASK 14 and streaks in TASK 12. Run `window.__test.clear()` to wipe. **Before deploy: confirm the `?debug=1` gate is present so production users never trigger seeding.**
<!-- @@END id="task-17" -->

---
<!-- @@BEGIN id="task-18" slug="readme" deps="16,17" -->
## TASK 18 — README + Google Apps Script + deployment

**Depends on:** everything.
**Produces:** `README.md`. Also the final end-to-end sync test (Acceptance #9).

### 18.1 `README.md` (write this file verbatim, adjusting the repo URL)

````markdown
# Fitness Tracker (PWA)

A personal, offline-first fitness tracker. Vanilla JS + CSS, no build step, hosted on GitHub Pages. Optimised for iPhone Safari with Add-to-Home-Screen.

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
# debug/seed: http://localhost:8000/?debug=1  then run window.__test.seed() in the console
```

## Deploy to GitHub Pages
1. Fork or push this repo to GitHub.
2. Repo → **Settings → Pages**.
3. **Source:** Deploy from a branch. **Branch:** `main` / root. Save.
4. Wait ~1 min; your app is at `https://<you>.github.io/<repo>/`.

> All module imports are relative with explicit `.js`, so they work under the project subpath GitHub Pages uses.

## Add to iPhone Home Screen
1. Open the Pages URL in **Safari** (not Chrome — only Safari installs PWAs on iOS).
2. Tap **Share → Add to Home Screen → Add**.
3. Launch from the new icon — it opens standalone (no browser chrome).

## Google Sheets sync (optional backup)
1. Create a Google Sheet.
2. **Extensions → Apps Script**, paste the script below, save.
3. **Deploy → New deployment → Web app.** Execute as **Me**; Who has access **Anyone**. Deploy and **copy the Web App URL**.
4. In the app: **Wins tab → ⚙ → paste URL → Save → Sync now**.
5. Two tabs (`activities`, `logs`) are written/overwritten on each sync.

### Apps Script (`Code.gs`)
```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  writeTab(ss, 'activities', data.activities, [
    'id','name','unit','color','createdAt','deleted','streakMinimum',
    'commitmentType','targetCount','targetDays','startedAt','completedAt'
  ], function(a){
    var c = a.commitment || {};
    return [a.id,a.name,a.unit,a.color,a.createdAt,a.deleted,a.streakMinimum,
            c.type||'',c.targetCount||'',c.targetDays||'',c.startedAt||'',c.completedAt||''];
  });
  writeTab(ss, 'logs', data.logs, ['id','activityId','count','timestamp'],
    function(l){ return [l.id,l.activityId,l.count,l.timestamp]; });
  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function writeTab(ss, name, rows, headers, mapFn) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.appendRow(headers);
  (rows || []).forEach(function(r){ sh.appendRow(mapFn(r)); });
}
```

> Note: the app sends the POST with `Content-Type: text/plain` to avoid a CORS preflight; Apps Script reads the body from `e.postData.contents`. Under CORS the browser may not read the response body — the app treats a completed request as success and updates "Last synced".

## Data & privacy
- All data lives in your browser's `localStorage` under `fitness_tracker_v1`.
- Nothing leaves your device except the manual Google Sheets sync you set up.
- Clearing Safari data erases the app's data — sync first if you want a backup.

## Project structure
See `docs/build-plan.md` for the full module map and build order.
````

### 18.2 Verification — TASK 18 (Acceptance #9, end-to-end)
1. Deploy the Apps Script as above; copy the Web App URL.
2. In the app, paste it in Settings, tap **Sync now**.
3. Confirm toast **Synced ✓** and that "Last synced" updates.
4. Open the Google Sheet: `activities` and `logs` tabs are populated and overwrite on a second sync.
5. On failure (bad URL), confirm an error toast and that local data is untouched.
<!-- @@END id="task-18" -->

---
# FINAL ACCEPTANCE — full checklist (run after TASK 18)

Map of acceptance criteria → where verified:

1. Create activity with each of the 4 commitment types → correct progress display. *(TASK 11, 12)*
2. Log entry ≤3 taps from home; persists after reload. *(TASK 11)*
3. All 4 main views render correctly with seed data. *(TASK 10,13,14,15 + seed 17)*
4. Activity Detail toggles Progress/Streak/Log. *(TASK 12)*
5. Streak frequencies correct on a known dataset (7 consecutive = freq[7]=1, freq[2..6]=0). *(TASK 3, 12)*
6. Target hit → confetti + `target_achieved` created; second log doesn't re-fire. *(TASK 4, 8, 11)*
7. Reset → archived commitment with `completedAt`; new state on tile; can set a new commitment. *(TASK 11, 12)*
8. Delete activity → hidden in Home; logs persist in Raw Log + Calendar (italic). *(TASK 11, 13, 15)*
9. Google Sheets sync end-to-end with a valid URL. *(TASK 18)*
10. Installable to iPhone Home Screen; launches standalone. *(TASK 1, 16)*
11. Data persists across browser restarts. *(TASK 2, 11)*
12. All destructive actions require confirmation. *(TASK 11, 12, 15)*
13. Thumbnails upload/resize/persist; fallback colored-initial renders cleanly. *(TASK 7, 10, 11)*
14. Visual polish: typography, spacing, color system match spec §9; feels native. *(TASK 16)*

Additional manual checks:
- Landscape AND portrait photo both crop to square, ≤30KB. *(TASK 7)*
- Dark mode renders all views correctly; manual override persists. *(TASK 16)*
- Offline: full app works; sync errors gracefully. *(TASK 16)*
- Zero console errors on load (desktop Chrome + iPhone Safari).

---

# APPENDIX A — Build order quick card (for the orchestrator)

```
1  scaffold            (icons, manifest, index.html, base CSS, placeholder app.js)
2  uuid + store        (stub recalculate first, real one lands in task 4)
3  streak              (verify in isolation BEFORE any UI)
4  accomplishments     (replaces the stub)
5  ui primitives
6  number pad          (needs 5)
7  thumbnail
8  confetti            (needs 5)
9  sync
10 home view           (needs 2,4,6,7,8)
11 app.js              (wires 1–10; routing + refresh + create form + settings)
12 activity detail     (needs 11,3,10,6,5)
13 calendar            (needs 11,5)
14 accomplishments view(needs 11,4) + settings gear
15 raw log             (needs 11)
16 polish              (dark mode, motion, edge cases, PWA)
17 seed                (dev-only, ?debug=1)
18 readme + apps script+ end-to-end sync
```

# APPENDIX B — Cross-module contract cheat-sheet

| Symbol | Defined in | Used by |
|--------|-----------|---------|
| `uuid()` | uuid.js | store.js |
| `getState/setState`, all mutators, `PALETTE`, `nextColor`, `nowISO` | store.js | app.js |
| `recalculate(state)`, `shouldFireTarget(state, activity)` | accomplishments.js | store.js (recalc), app.js (fire) |
| `calcStreakStats`, `localDayKey` | streak.js | accomplishments.js, activityDetail.js |
| `showToast/showConfirm/showModal/openSheet/haptic/esc` | ui.js | everywhere |
| `openNumberPad` | numberPad.js | home.js, activityDetail.js |
| `resizeImage/renderFallbackAvatar` | thumbnail.js | app.js, home.js |
| `celebrate(color)` | confetti.js | app.js |
| `syncNow(state, url)` | sync.js | app.js |
| `commitmentProgress(activity, logs)` | views/home.js | views/activityDetail.js |
| view `render(container, state, callbacks)` | each view | app.js refresh() |
| `open(activityId, getState, callbacks)` | views/activityDetail.js | app.js |
| `window.__app.openSettings()` | app.js | views/accomplishments.js |

**Callbacks object (app.js → views):** `onLog, onOpenActivity, onCreate, onEditLog, onDeleteLog, onDeleteActivity, onResetCommitment, onSetCommitment, onEditActivity, getState`.

---

**End of build document.** An agent following TASK 1 → TASK 18, updating `PROGRESS.md` after each, will produce a complete, working app that satisfies every acceptance criterion in the spec.

