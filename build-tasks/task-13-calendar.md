<!-- build-task
{
  "id": "task-13",
  "num": 13,
  "slug": "calendar",
  "deps": [
    5,
    11
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-05-*`, `task-11-*`

## TASK 13 — views/calendar.js + grid CSS

**Depends on:** TASK 11 (render signature/callbacks), TASK 5 (modal).
**Produces:** `modules/views/calendar.js`, appended CSS.

Monthly grid; each day shows up to 4 colored dots (one per distinct activity performed that day, including deleted activities' logs), "+N" if more; tap a day → modal listing that day's entries; prev/next month nav.

### 13.1 `modules/views/calendar.js`

```js
// modules/views/calendar.js
import { esc, showModal } from '../ui.js';

let _month = null; // Date anchored to first of displayed month

export function render(container, state, callbacks) {
  if (!_month) { const n = new Date(); _month = new Date(n.getFullYear(), n.getMonth(), 1); }
  const y = _month.getFullYear(), m = _month.getMonth();

  // map dayKey -> [{activityId, color, count, name, deleted}]
  const byDay = new Map();
  for (const l of state.logs) {
    const d = new Date(l.timestamp);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    const key = d.getDate();
    const act = state.activities.find(a => a.id === l.activityId);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ activityId: l.activityId, color: act?.color || '#999', count: l.count, name: act?.name || 'Unknown', deleted: act?.deleted });
  }

  const startDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const todayD = new Date(); const isThisMonth = todayD.getFullYear() === y && todayD.getMonth() === m;

  let cells = '';
  const dow = ['S','M','T','W','T','F','S'];
  const dowRow = dow.map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-day cal-day--empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const entries = byDay.get(d) || [];
    const distinct = [...new Map(entries.map(e => [e.activityId, e])).values()];
    const dots = distinct.slice(0, 4).map(e => `<span class="cal-dot" style="background:${e.color}"></span>`).join('');
    const more = distinct.length > 4 ? `<span class="cal-more">+${distinct.length - 4}</span>` : '';
    const today = isThisMonth && d === todayD.getDate();
    cells += `<button class="cal-day ${today?'cal-day--today':''}" data-day="${d}" ${entries.length?'':'disabled'}>
        <span class="cal-num">${d}</span><span class="cal-dots">${dots}${more}</span></button>`;
  }

  container.innerHTML = `
    <header class="view-head cal-head">
      <button class="cal-nav" data-nav="-1" aria-label="Previous month">‹</button>
      <h1 class="cal-title">${_month.toLocaleString(undefined,{month:'long',year:'numeric'})}</h1>
      <button class="cal-nav" data-nav="1" aria-label="Next month">›</button>
    </header>
    <div class="cal-grid cal-dow-row">${dowRow}</div>
    <div class="cal-grid">${cells}</div>`;

  container.querySelectorAll('.cal-nav').forEach(b => b.onclick = () => {
    _month = new Date(y, m + Number(b.dataset.nav), 1); render(container, state, callbacks);
  });
  container.querySelectorAll('.cal-day[data-day]').forEach(b => b.onclick = () => {
    const entries = byDay.get(Number(b.dataset.day)) || [];
    openDayModal(y, m, Number(b.dataset.day), entries);
  });
}

function openDayModal(y, m, d, entries) {
  const node = document.createElement('div');
  const date = new Date(y, m, d);
  node.innerHTML = entries.length === 0
    ? `<p class="detail-empty">No entries.</p>`
    : `<div class="day-list">${entries.map(e => `
        <div class="day-row">
          <span class="cal-dot" style="background:${e.color}"></span>
          <span class="day-name ${e.deleted?'is-deleted':''}">${esc(e.name)}</span>
          <span class="day-count">${e.count}</span>
        </div>`).join('')}</div>`;
  showModal(node, { title: date.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'}) });
}
```

### 13.2 CSS — append

```css
/* ===== CALENDAR (TASK 13) ===== */
.cal-head { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; }
.cal-title { font-size: var(--fs-22); font-weight: 600; text-align: center; }
.cal-nav { font-size: 24px; min-height: 44px; color: var(--text-2); }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-dow-row { margin-bottom: var(--sp-2); }
.cal-dow { text-align: center; font-size: 11px; color: var(--text-2); font-weight: 500; }
.cal-day {
  aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
  gap: 4px; padding-top: 6px; border-radius: 10px; background: transparent;
}
.cal-day--empty { visibility: hidden; }
.cal-day[disabled] { opacity: 0.5; }
.cal-num { font-size: var(--fs-13); }
.cal-day--today .cal-num { background: var(--text); color: var(--bg); width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; }
.cal-dots { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; justify-content: center; }
.cal-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.cal-more { font-size: 9px; color: var(--text-2); }
.day-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.day-row { display: grid; grid-template-columns: 12px 1fr auto; gap: var(--sp-3); align-items: center; padding: var(--sp-2) 0; }
.day-name.is-deleted { font-style: italic; color: var(--text-2); }
.day-count { font-weight: 600; }
```

### 13.3 Verification — TASK 13

1. Calendar shows current month; prev/next navigation works.
2. Days with logs show colored dots (max 4 + "+N"); today has the filled circle.
3. Logs from **deleted** activities still appear (their dot uses the stored color; in the day modal the name is italic).
4. Tap a day with entries → modal lists each entry (activity name + count).
