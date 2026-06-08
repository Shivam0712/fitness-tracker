<!-- build-task
{
  "id": "task-03",
  "num": 3,
  "slug": "streak",
  "deps": [
    2
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-02-*`

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
