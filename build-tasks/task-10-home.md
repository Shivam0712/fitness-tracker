<!-- build-task
{
  "id": "task-10",
  "num": 10,
  "slug": "home",
  "deps": [
    2,
    4,
    6,
    7,
    8
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-02-*`, `task-04-*`, `task-06-*`, `task-07-*`, `task-08-*`

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
