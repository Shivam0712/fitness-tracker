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
  const n = state.activities.filter(a => !a.deleted).length;
  return PALETTE[n % PALETTE.length];
}

/* ---------- Commitment factory ---------- */
function makeCommitment(type, targetCount, targetDays, targetDate) {
  return {
    type,
    targetCount: (type === 'x_in_y' || type === 'x_only' || type === 'x_before_z') ? Number(targetCount) : null,
    targetDays:  (type === 'x_in_y' || type === 'y_days') ? Number(targetDays) : null,
    targetDate:  type === 'x_before_z' ? (targetDate || null) : null,
    startedAt: nowISO(),
    completedAt: null,
  };
}

/* ============================================================
   MUTATORS — each clones, mutates, (recalcs), writes, returns
   ============================================================ */

export function createActivity(state, { name, unit, type, targetCount, targetDays, targetDate, streakMinimum, thumbnail }) {
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

export function updateSettings(state, patch) {
  const s = clone(state);
  s.settings = { ...s.settings, ...patch };
  return setState(s);
}
