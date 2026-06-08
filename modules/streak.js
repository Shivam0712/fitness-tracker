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
 */
export function calcStreakStats(activityId, streakMinimum, logs) {
  const min = Number(streakMinimum) || 0;

  // 1. sum counts per local day for this activity
  const perDay = new Map();
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

  // 4. frequency: dense 2..longest
  const frequency = {};
  for (let n = 2; n <= longest; n++) frequency[n] = 0;
  for (const r of runs) if (r >= 2) frequency[r] = (frequency[r] || 0) + 1;

  // 5. current streak — walk backward from today
  const tKey = todayKey();
  const qualSet = new Set(qualifyingDays);
  let current = 0;
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
