<!-- build-task
{
  "id": "task-04",
  "num": 4,
  "slug": "accomplishments",
  "deps": [
    2,
    3
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-02-*`, `task-03-*`

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
