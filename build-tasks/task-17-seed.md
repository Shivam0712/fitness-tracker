<!-- build-task
{
  "id": "task-17",
  "num": 17,
  "slug": "seed",
  "deps": [
    2,
    11
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-02-*`, `task-11-*`

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
