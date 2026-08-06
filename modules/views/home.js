// modules/views/home.js
import { openNumberPad } from '../numberPad.js';
import { renderFallbackAvatar } from '../thumbnail.js';
import { esc, fmtNum, showToast } from '../ui.js';
import { resolveHomeOrder } from '../store.js';
import { attachDragReorder } from '../dragReorder.js';

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

/** Days remaining until a YYYY-MM-DD date string (local calendar days, min 0). */
export function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00'); target.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.max(0, Math.round((target - today) / 86400000));
}

/** Build the progress sub-DOM string for a tile, by commitment type. */
function progressMarkup(activity, logs) {
  const { total, distinctDays: dd, commitment: c } = commitmentProgress(activity, logs);
  const unit = esc(activity.unit);
  if (!c) {
    return `<div class="tile-progress-line"><span class="tile-big">${fmtNum(total)}</span> <span class="tile-unit">${unit}</span>
            <span class="tile-sub">no active commitment</span></div>`;
  }
  if (c.type === 'open') {
    return `<div class="tile-progress-line"><span class="tile-big">${fmtNum(total)}</span> <span class="tile-unit">${unit}</span></div>`;
  }
  if (c.type === 'x_only') {
    const pct = Math.min(100, Math.round(total / c.targetCount * 100));
    return bar(activity.color, pct, `${fmtNum(total)} / ${fmtNum(c.targetCount)} ${unit}`);
  }
  if (c.type === 'x_in_y') {
    const pct = Math.min(100, Math.round(total / c.targetCount * 100));
    const remaining = Math.max(0, c.targetDays - daysElapsed(c.startedAt) + 1);
    return bar(activity.color, pct, `${fmtNum(total)} / ${fmtNum(c.targetCount)} ${unit} · ${remaining}d left`);
  }
  if (c.type === 'y_days') {
    const el = Math.min(c.targetDays, daysElapsed(c.startedAt));
    const pct = Math.min(100, Math.round(dd / c.targetDays * 100));
    return bar(activity.color, pct, `${dd} / ${c.targetDays} days · ${fmtNum(total)} ${unit} total`);
  }
  if (c.type === 'x_before_z') {
    const pct = Math.min(100, Math.round(total / c.targetCount * 100));
    const remaining = daysUntil(c.targetDate);
    return bar(activity.color, pct, `${fmtNum(total)} / ${fmtNum(c.targetCount)} ${unit} · ${remaining}d left`);
  }
  return '';
}

function bar(color, pct, label) {
  return `
    <div class="tile-bar"><div class="tile-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <div class="tile-sub">${esc(label)}</div>`;
}

let _showArchived = false;

/**
 * render(container, state, callbacks)
 * callbacks: { onLog(activityId, count), onOpenActivity(activityId), onCreate() }
 */
export function render(container, state, callbacks) {
  const activities = resolveHomeOrder(state.activities);
  const archived = state.activities.filter(a => !a.deleted && a.archived);
  const archivedSection = archivedSectionMarkup(archived);

  if (activities.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">＋</div>
        <p class="empty-copy">No activities yet.<br>Tap + to start.</p>
        <button class="btn btn--primary btn--pill" id="empty-create">Create activity</button>
      </div>
      <button class="fab" id="fab-create" aria-label="Create activity">＋</button>
      ${archivedSection}`;
    container.querySelector('#empty-create').onclick = callbacks.onCreate;
    container.querySelector('#fab-create').onclick = callbacks.onCreate;
    wireArchivedSection(container, state, callbacks);
    return;
  }

  container.innerHTML = `
    <header class="view-head"><h1 class="view-title">Today</h1></header>
    <div class="tiles">
      ${activities.map(a => tileMarkup(a, state.logs)).join('')}
    </div>
    ${archivedSection}
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
    tile.querySelector('.tile-pin').onclick = (e) => {
      e.stopPropagation();
      callbacks.onTogglePin(a.id);
    };
  });

  attachDragReorder(container.querySelector('.tiles'), {
    itemSelector: '.tile',
    idAttr: 'data-tile',
    ignoreSelector: '.tile-log, .tile-pin',
    isLocked: (id) => {
      const a = state.activities.find(x => x.id === id);
      return !!(a && a.pinned);
    },
    onLockedAttempt: () => showToast('Unpin to move', { type: 'error' }),
    onDrop: (id, targetSlot) => callbacks.onReorderActivities(id, targetSlot),
  });

  wireArchivedSection(container, state, callbacks);
}

function archivedSectionMarkup(archived) {
  if (archived.length === 0) return '';
  const list = _showArchived
    ? `<div class="archived-list">${archived.map(archivedRowMarkup).join('')}</div>`
    : '';
  return `
    <button class="archived-toggle" id="archived-toggle">
      ${_showArchived ? '▾' : '▸'} Show archived (${archived.length})
    </button>
    ${list}`;
}

function archivedRowMarkup(a) {
  const avatar = a.thumbnail
    ? `<img class="archived-avatar" src="${a.thumbnail}" alt="">`
    : `<img class="archived-avatar" src="${renderFallbackAvatar(a.name, a.color, 64)}" alt="">`;
  return `
    <div class="archived-row" data-archived="${a.id}">
      ${avatar}
      <span class="archived-name">${esc(a.name)}</span>
      <button class="btn btn--ghost archived-restore" data-restore="${a.id}">Restore</button>
    </div>`;
}

function wireArchivedSection(container, state, callbacks) {
  const toggle = container.querySelector('#archived-toggle');
  if (!toggle) return;
  toggle.onclick = () => { _showArchived = !_showArchived; render(container, state, callbacks); };
  container.querySelectorAll('[data-restore]').forEach(btn =>
    btn.onclick = (e) => { e.stopPropagation(); callbacks.onUnarchiveActivity(btn.dataset.restore); });
}

function tileMarkup(a, logs) {
  const avatar = a.thumbnail
    ? `<img class="tile-avatar" src="${a.thumbnail}" alt="">`
    : `<img class="tile-avatar" src="${renderFallbackAvatar(a.name, a.color, 96)}" alt="">`;
  return `
    <article class="tile${a.pinned ? ' is-pinned' : ''}" data-tile="${a.id}" style="--accent:${a.color}">
      <div class="tile-main">
        ${avatar}
        <div class="tile-info">
          <h2 class="tile-name">${esc(a.name)}</h2>
          ${progressMarkup(a, logs)}
        </div>
      </div>
      <button class="tile-pin${a.pinned ? ' is-pinned' : ''}" aria-label="${a.pinned ? 'Unpin' : 'Pin'} ${esc(a.name)}" aria-pressed="${a.pinned ? 'true' : 'false'}">📌</button>
      <button class="tile-log" aria-label="Log ${esc(a.name)}">＋</button>
    </article>`;
}
