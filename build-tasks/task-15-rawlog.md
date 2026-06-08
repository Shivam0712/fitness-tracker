<!-- build-task
{
  "id": "task-15",
  "num": 15,
  "slug": "rawlog",
  "deps": [
    11,
    12
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-11-*`, `task-12-*`

## TASK 15 — views/rawLog.js + CSS

**Depends on:** TASK 11, TASK 12 (reuses edit-log modal pattern — but rawLog implements its own edit via callbacks to avoid importing the panel).
**Produces:** `modules/views/rawLog.js`, appended CSS.

Table: Date, Time, Activity (color dot, italic if deleted), Count, Unit. Newest first. Multi-select activity filter chips. Tap row → edit modal (count/date/time + delete).

### 15.1 `modules/views/rawLog.js`

```js
// modules/views/rawLog.js
import { esc, showModal, showToast } from '../ui.js';

let _filter = new Set(); // empty = show all

export function render(container, state, callbacks) {
  const activities = state.activities; // include deleted for filter chips
  const chips = activities.map(a => `
    <button class="chip ${_filter.has(a.id)?'is-on':''}" data-chip="${a.id}" style="--accent:${a.color}">
      <span class="cal-dot" style="background:${a.color}"></span>${esc(a.name)}${a.deleted?' (del)':''}
    </button>`).join('');

  let logs = [...state.logs].sort((x,y) => new Date(y.timestamp) - new Date(x.timestamp));
  if (_filter.size > 0) logs = logs.filter(l => _filter.has(l.activityId));

  const rowsHtml = logs.length === 0
    ? `<tr><td colspan="4" class="rl-empty">No entries.</td></tr>`
    : logs.map(l => {
        const a = activities.find(x => x.id === l.activityId);
        const d = new Date(l.timestamp);
        return `<tr class="rl-row" data-log="${l.id}">
          <td>${d.toLocaleDateString()}<br><span class="rl-time">${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></td>
          <td><span class="cal-dot" style="background:${a?.color||'#999'}"></span>
              <span class="${a?.deleted?'is-deleted':''}">${esc(a?.name||'Unknown')}</span></td>
          <td class="rl-count">${l.count}</td>
          <td class="rl-unit">${esc(a?.unit||'')}</td>
        </tr>`;
      }).join('');

  container.innerHTML = `
    <header class="view-head"><h1 class="view-title">Log</h1></header>
    <div class="chips">${chips || '<span class="acc-empty">No activities.</span>'}</div>
    <table class="rl-table">
      <thead><tr><th>Date</th><th>Activity</th><th>Count</th><th>Unit</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  container.querySelectorAll('[data-chip]').forEach(c => c.onclick = () => {
    const id = c.dataset.chip;
    if (_filter.has(id)) _filter.delete(id); else _filter.add(id);
    render(container, state, callbacks);
  });
  container.querySelectorAll('.rl-row').forEach(r => r.onclick = () => openEdit(r.dataset.log, state, callbacks));
}

function openEdit(logId, state, callbacks) {
  const l = state.logs.find(x => x.id === logId); if (!l) return;
  const a = state.activities.find(x => x.id === l.activityId);
  const d = new Date(l.timestamp);
  const dateVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const timeVal = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Count (${esc(a?.unit||'')})</span><input class="field-input" id="r-count" inputmode="numeric" value="${l.count}"></label>
    <label class="field"><span class="field-label">Date</span><input class="field-input" id="r-date" type="date" value="${dateVal}"></label>
    <label class="field"><span class="field-label">Time</span><input class="field-input" id="r-time" type="time" value="${timeVal}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--danger" id="r-del">Delete</button>
      <button class="btn btn--primary" id="r-save">Save</button>
    </div>`;
  const { close } = showModal(node, { title: 'Edit entry' });
  node.querySelector('#r-save').onclick = () => {
    const count = Number(node.querySelector('#r-count').value);
    if (!(count >= 1)) { showToast('Count must be ≥ 1', {type:'error'}); return; }
    const dv = node.querySelector('#r-date').value, tv = node.querySelector('#r-time').value;
    const nd = new Date(`${dv}T${tv||'00:00'}`);
    const off = -nd.getTimezoneOffset(); const sign = off>=0?'+':'-';
    const oh = String(Math.floor(Math.abs(off)/60)).padStart(2,'0'); const om = String(Math.abs(off)%60).padStart(2,'0');
    const ts = nd.toISOString().slice(0,-1) + sign + oh + ':' + om;
    callbacks.onEditLog(logId, { count, timestamp: ts }); close();
  };
  node.querySelector('#r-del').onclick = async () => { close(); await callbacks.onDeleteLog(logId); };
}
```

### 15.2 CSS — append

```css
/* ===== RAW LOG (TASK 15) ===== */
.chips { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-4); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--r-pill);
  background: var(--border); color: var(--text-2); font-size: var(--fs-13); font-weight: 500; min-height: 36px; }
.chip.is-on { background: var(--text); color: var(--bg); }
.chip.is-on .cal-dot { box-shadow: 0 0 0 2px var(--bg); }
.rl-table { width: 100%; border-collapse: collapse; font-size: var(--fs-15); }
.rl-table th { text-align: left; font-size: var(--fs-13); color: var(--text-2); font-weight: 500; padding: var(--sp-2); border-bottom: 1px solid var(--hairline); }
.rl-row td { padding: var(--sp-3) var(--sp-2); border-bottom: 1px solid var(--hairline); vertical-align: top; }
.rl-time { color: var(--text-2); font-size: var(--fs-13); }
.rl-count { font-weight: 600; }
.rl-unit { color: var(--text-2); }
.rl-row td .is-deleted { font-style: italic; color: var(--text-2); }
.rl-empty { text-align: center; color: var(--text-2); padding: var(--sp-8) 0; }
.rl-row .cal-dot { margin-right: 6px; vertical-align: middle; }
```

### 15.3 Verification — TASK 15

1. Table lists all logs newest-first with date/time/activity/count/unit.
2. Filter chips toggle (multi-select); list narrows to selected activities; deselect all → shows everything.
3. Deleted activities' rows appear with italic name and "(del)" chip.
4. Tap row → edit modal; save updates count/date/time; delete (confirm via callback) removes the row. Editing the date is reflected in Calendar and Streak after refresh.
