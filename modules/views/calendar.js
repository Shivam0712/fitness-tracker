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
