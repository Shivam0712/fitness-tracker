// modules/views/rawLog.js
import { esc, fmtNum, showModal, showToast } from '../ui.js';

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
          <td class="rl-count">${fmtNum(l.count)}</td>
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
    <label class="field"><span class="field-label">Count (${esc(a?.unit||'')})</span><input class="field-input" id="r-count" inputmode="decimal" value="${l.count}"></label>
    <label class="field"><span class="field-label">Date</span><input class="field-input" id="r-date" type="date" value="${dateVal}"></label>
    <label class="field"><span class="field-label">Time</span><input class="field-input" id="r-time" type="time" value="${timeVal}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--danger" id="r-del">Delete</button>
      <button class="btn btn--primary" id="r-save">Save</button>
    </div>`;
  const { close } = showModal(node, { title: 'Edit entry' });
  node.querySelector('#r-save').onclick = () => {
    const count = Number(node.querySelector('#r-count').value);
    if (!(count > 0)) { showToast('Count must be greater than 0', {type:'error'}); return; }
    const dv = node.querySelector('#r-date').value, tv = node.querySelector('#r-time').value;
    const nd = new Date(`${dv}T${tv||'00:00'}`);
    const off = -nd.getTimezoneOffset(); const sign = off>=0?'+':'-';
    const oh = String(Math.floor(Math.abs(off)/60)).padStart(2,'0'); const om = String(Math.abs(off)%60).padStart(2,'0');
    const ts = nd.toISOString().slice(0,-1) + sign + oh + ':' + om;
    callbacks.onEditLog(logId, { count, timestamp: ts }); close();
  };
  node.querySelector('#r-del').onclick = async () => { close(); await callbacks.onDeleteLog(logId); };
}
