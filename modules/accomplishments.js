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

  // 1. keep durable event-based records as-is (both are wins, not recomputed from logs)
  const durable = (state.accomplishments || []).filter(
    a => a.type === 'target_achieved' || a.type === 'spotlight_target_achieved');

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
    // round per-day sums before comparing — decimal accumulation (e.g. 5.7 + 2.3) can land on
    // 8.000000000000002, which would spuriously edge out a genuine equal-value day.
    const round2 = n => Math.round(n * 100) / 100;
    const dailyMax = Math.max(...[...perDay.values()].map(round2));
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
  if (c.targetCount == null) return false;
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

/**
 * Should a Spotlight entry's sub-target fire a win right now?
 * Mirrors shouldFireTarget: an 'open' target has no measurable goal and never
 * fires; a 'y_days' target is met by distinct logged days, everything else by
 * summed count. Guarded against duplicates by entry.id (stable per spotlight run).
 */
export function shouldFireSpotlightTarget(state, entry) {
  const t = entry.target;
  if (t.type === 'open') return false;
  const logs = state.logs.filter(l => l.activityId === entry.activityId && new Date(l.timestamp) >= new Date(entry.addedAt));
  const met = t.type === 'y_days'
    ? (t.targetDays != null && new Set(logs.map(l => localDayKey(l.timestamp))).size >= t.targetDays)
    : (t.targetCount != null && logs.reduce((sum, l) => sum + Number(l.count), 0) >= t.targetCount);
  if (!met) return false;
  const already = (state.accomplishments || []).some(
    a => a.type === 'spotlight_target_achieved' && a.meta && a.meta.spotlightEntryId === entry.id
  );
  return !already;
}
