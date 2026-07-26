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
export function emptyState() {
  return {
    schemaVersion: 2,
    activities: [],
    logs: [],
    accomplishments: [],
    spotlight: { active: [], history: [] },
    settings: { googleSheetWebhookUrl: '', lastSyncedAt: null, darkModeOverride: null },
  };
}

/** Per-category slot caps for Spotlight. */
export const SPOTLIGHT_CAPS = { mental: 2, physical: 3 };

/* ---------- Read / write ---------- */
export function getState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return migrate({ ...emptyState(), ...parsed,
      settings: { ...emptyState().settings, ...(parsed.settings || {}) } });
  } catch (e) {
    console.error('getState parse error, returning empty', e);
    return emptyState();
  }
}

/** v1 -> v2: backfill activity.category and the spotlight container. */
function migrate(state) {
  if ((state.schemaVersion || 1) >= 2) return state;
  const s = { ...state, schemaVersion: 2 };
  s.activities = s.activities.map(a => ({ category: null, ...a }));
  s.spotlight = s.spotlight || { active: [], history: [] };
  return s;
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

/** Next unused palette color. Counts only active (non-deleted, non-archived) activities; deleted/archived frees its slot. */
export function nextColor(state) {
  const active = state.activities.filter(a => !a.deleted && !a.archived);
  const used = new Set(active.map(a => a.color));
  for (const c of PALETTE) if (!used.has(c)) return c;
  return PALETTE[active.length % PALETTE.length];
}

/* ---------- Commitment factory ---------- */
function targetShape(type, targetCount, targetDays, targetDate) {
  return {
    type,
    targetCount: (type === 'x_in_y' || type === 'x_only' || type === 'x_before_z') ? Number(targetCount) : null,
    targetDays:  (type === 'x_in_y' || type === 'y_days') ? Number(targetDays) : null,
    targetDate:  type === 'x_before_z' ? (targetDate || null) : null,
  };
}

function makeCommitment(type, targetCount, targetDays, targetDate) {
  return { ...targetShape(type, targetCount, targetDays, targetDate), startedAt: nowISO(), completedAt: null };
}

/* ============================================================
   MUTATORS — each clones, mutates, (recalcs), writes, returns
   ============================================================ */

export function createActivity(state, { name, unit, type, targetCount, targetDays, targetDate, streakMinimum, thumbnail, category }) {
  const s = clone(state);
  const activity = {
    id: uuid(),
    name: String(name).trim(),
    unit: String(unit || '').trim(),
    color: nextColor(s),
    thumbnail: thumbnail || null,
    category: category === 'mental' || category === 'physical' ? category : null,
    createdAt: nowISO(),
    deleted: false,
    archived: false,
    streakMinimum: Number(streakMinimum) || 0,
    commitment: type === 'open'
      ? makeCommitment('open', null, null, null)
      : makeCommitment(type, targetCount, targetDays, targetDate),
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
  if (patch.thumbnail !== undefined) a.thumbnail = patch.thumbnail;
  if (patch.category !== undefined) a.category = (patch.category === 'mental' || patch.category === 'physical') ? patch.category : null;
  return setState(recalculate(s));
}

export function deleteActivity(state, id) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a) return state;
  a.deleted = true;
  return setState(recalculate(s));
}

export function setCommitment(state, id, { type, targetCount, targetDays, targetDate }) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a) return state;
  a.commitment = type === 'open'
    ? makeCommitment('open', null, null, null)
    : makeCommitment(type, targetCount, targetDays, targetDate);
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

/**
 * Archive current progress: snapshot the commitment run (with the achieved total)
 * into archivedCommitments, then clear commitment to null so the counter resets.
 */
export function archiveProgress(state, id) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a || !a.commitment) return state;
  const c = a.commitment;
  const since = new Date(c.startedAt);
  const achievedTotal = s.logs
    .filter(l => l.activityId === id && new Date(l.timestamp) >= since)
    .reduce((sum, l) => sum + Number(l.count), 0);
  const now = nowISO();
  a.archivedCommitments = a.archivedCommitments || [];
  a.archivedCommitments.push({ ...c, completedAt: now, achievedTotal, archivedAt: now });
  a.commitment = null;
  return setState(recalculate(s));
}

/** Archive an activity: hides it from Home, keeps it (and its history) intact and reversible. */
export function archiveActivity(state, id) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a) return state;
  a.archived = true;
  return setState(recalculate(s));
}

/** Restore a previously archived activity so it shows on Home again. */
export function unarchiveActivity(state, id) {
  const s = clone(state);
  const a = s.activities.find(x => x.id === id);
  if (!a) return state;
  a.archived = false;
  return setState(recalculate(s));
}

/* ============================================================
   SPOTLIGHT
   A spotlight entry stores only {activityId, category, target, addedAt}.
   Progress is always derived from state.logs (see spotlightProgress) so
   logging never needs to know Spotlight exists. Progress is frozen into
   a history row only at the moment an entry leaves `active`.
   ============================================================ */

function spotlightLogsSince(state, activityId, since) {
  const sinceTs = new Date(since);
  return state.logs.filter(l => l.activityId === activityId && new Date(l.timestamp) >= sinceTs);
}

function distinctDayCount(logs) {
  const set = new Set(logs.map(l => {
    const d = new Date(l.timestamp);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }));
  return set.size;
}

/** Derived, never stored while active: { achieved, met }. */
export function spotlightProgress(state, entry) {
  const logs = spotlightLogsSince(state, entry.activityId, entry.addedAt);
  const t = entry.target;
  if (t.type === 'y_days') {
    const achieved = distinctDayCount(logs);
    return { achieved, met: t.targetDays != null && achieved >= t.targetDays };
  }
  const achieved = logs.reduce((sum, l) => sum + Number(l.count), 0);
  if (t.type === 'open') return { achieved, met: false };
  return { achieved, met: t.targetCount != null && achieved >= t.targetCount };
}

/**
 * addToSpotlight(state, activityId, category, target)
 * target: { type, targetCount, targetDays, targetDate } — same shape as a commitment.
 * Rejects (returns state unchanged) if the activity is already active, or its
 * category block is at its cap (SPOTLIGHT_CAPS).
 */
export function addToSpotlight(state, activityId, category, target) {
  if (category !== 'mental' && category !== 'physical') return state;
  const alreadyActive = state.spotlight.active.some(e => e.activityId === activityId);
  if (alreadyActive) return state;
  const inCategory = state.spotlight.active.filter(e => e.category === category).length;
  if (inCategory >= SPOTLIGHT_CAPS[category]) return state;

  const s = clone(state);
  const addedAt = nowISO();
  const expiresAt = new Date(new Date(addedAt).getTime() + 7 * 86400000).toISOString();
  s.spotlight.active.push({
    id: uuid(), activityId, category,
    target: targetShape(target.type, target.targetCount, target.targetDays, target.targetDate),
    addedAt, expiresAt, completedAt: null,
  });
  return setState(s);
}

/** Manual removal: archived to history only if the entry has any logged progress; else dropped silently. */
export function removeFromSpotlight(state, entryId) {
  const s = clone(state);
  const entry = s.spotlight.active.find(e => e.id === entryId);
  if (!entry) return state;
  s.spotlight.active = s.spotlight.active.filter(e => e.id !== entryId);
  const { achieved, met } = spotlightProgress(s, entry);
  if (achieved > 0) {
    s.spotlight.history.push({ ...entry, achieved, met, endedAt: nowISO(), endedReason: 'removed' });
  }
  return setState(s);
}

/**
 * Lazy sweep: moves any active entry past its expiresAt (or whose activity was
 * deleted/archived) into history, freezing its achieved progress. Call before
 * the first render and again whenever the app resumes from background.
 * No-op (returns the same state reference) if nothing needed to move.
 */
export function expireSpotlight(state) {
  const now = new Date();
  const toMove = state.spotlight.active.filter(entry => {
    const act = state.activities.find(a => a.id === entry.activityId);
    const gone = !act || act.deleted || act.archived;
    return gone || new Date(entry.expiresAt) <= now;
  });
  if (toMove.length === 0) return state;

  const s = clone(state);
  const movingIds = new Set(toMove.map(e => e.id));
  s.spotlight.active = s.spotlight.active.filter(e => !movingIds.has(e.id));
  for (const entry of toMove) {
    const act = state.activities.find(a => a.id === entry.activityId);
    const gone = !act || act.deleted || act.archived;
    const { achieved, met } = spotlightProgress(state, entry);
    s.spotlight.history.push({ ...entry, achieved, met, endedAt: nowISO(), endedReason: gone ? 'activity_gone' : 'expired' });
  }
  return setState(s);
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

/** Persist a target_achieved accomplishment. */
export function addTargetAchieved(state, activityId, value, meta) {
  const s = clone(state);
  s.accomplishments.push({
    id: uuid(), type: 'target_achieved', activityId,
    value, achievedAt: nowISO(), meta: meta || {},
  });
  return setState(s);
}

/** Persist a spotlight_target_achieved accomplishment. */
export function addSpotlightTargetAchieved(state, activityId, value, meta) {
  const s = clone(state);
  s.accomplishments.push({
    id: uuid(), type: 'spotlight_target_achieved', activityId,
    value, achievedAt: nowISO(), meta: meta || {},
  });
  return setState(s);
}

export function updateSettings(state, patch) {
  const s = clone(state);
  s.settings = { ...s.settings, ...patch };
  return setState(s);
}

/* ---------- Export / Import ---------- */

/** Backfill missing top-level keys/settings the same way getState() does, for imported data. */
export function sanitizeState(data) {
  return migrate({ ...emptyState(), ...data,
    settings: { ...emptyState().settings, ...(data.settings || {}) } });
}

/** Replace all app data with an imported (already-sanitized) state and recalculate derived accomplishments. */
export function importState(clean) {
  return setState(recalculate(clean));
}
