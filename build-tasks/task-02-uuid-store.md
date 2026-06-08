<!-- build-task
{
  "id": "task-02",
  "num": 2,
  "slug": "uuid-store",
  "deps": [
    1
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-01-*`

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
