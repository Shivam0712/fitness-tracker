// modules/views/activityDetail.js
import { esc, fmtNum, showConfirm, showModal, showToast } from '../ui.js';
import { calcStreakStats, localDayKey } from '../streak.js';
import { commitmentProgress, daysUntil } from './home.js';
import { openNumberPad } from '../numberPad.js';
import { resizeImage } from '../thumbnail.js';

let panelEl = null;
let backdropEl = null;
let _activityId = null;
let _getState = null;
let _cb = null;
let _seg = 'progress';

export function open(activityId, getState, callbacks) {
  _activityId = activityId; _getState = getState; _cb = callbacks; _seg = 'progress';
  ensureDom();
  rerender();
  requestAnimationFrame(() => { backdropEl.classList.add('is-in'); panelEl.classList.add('is-in'); });
}

function close() {
  panelEl.classList.remove('is-in'); backdropEl.classList.remove('is-in');
  panelEl.addEventListener('transitionend', () => {
    backdropEl.remove(); panelEl.remove(); backdropEl = panelEl = null;
  }, { once: true });
}

function ensureDom() {
  backdropEl = document.createElement('div');
  backdropEl.className = 'panel-backdrop';
  backdropEl.onclick = close;
  panelEl = document.createElement('aside');
  panelEl.className = 'detail-panel';
  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
}

/** call after any state change so the panel reflects latest data */
function rerender() {
  const state = _getState();
  const a = state.activities.find(x => x.id === _activityId);
  if (!a) { close(); return; }

  panelEl.innerHTML = `
    <header class="panel-head">
      <button class="panel-close" aria-label="Close">‹</button>
      <h2 class="panel-title">${esc(a.name)}</h2>
      <button class="panel-kebab" aria-label="More">⋯</button>
    </header>
    <div class="seg panel-seg">
      <button class="seg-btn ${_seg==='progress'?'is-active':''}" data-s="progress">Progress</button>
      <button class="seg-btn ${_seg==='streak'?'is-active':''}" data-s="streak">Streak</button>
      <button class="seg-btn ${_seg==='log'?'is-active':''}" data-s="log">Log</button>
    </div>
    <div class="panel-body">${renderSeg(a, state)}</div>
    <button class="fab detail-log-fab" aria-label="Log">＋</button>`;

  panelEl.querySelector('.panel-close').onclick = close;
  panelEl.querySelector('.panel-kebab').onclick = () => openKebab(a);
  panelEl.querySelectorAll('.panel-seg .seg-btn').forEach(b =>
    b.onclick = () => { _seg = b.dataset.s; rerender(); });
  panelEl.querySelector('.detail-log-fab').onclick = () =>
    openNumberPad({ title: a.name, unit: a.unit, onSave: (c) => { _cb.onLog(a.id, c); rerender(); } });

  // wire log rows (edit) if on log seg
  if (_seg === 'log') wireLogRows(a, state);
  // wire archive-progress button (lives on progress seg) regardless
  const archiveBtn = panelEl.querySelector('#reset-btn');
  if (archiveBtn) archiveBtn.onclick = async () => { await _cb.onArchiveProgress(a.id); rerender(); };
}

function renderSeg(a, state) {
  if (_seg === 'progress') return renderProgress(a, state);
  if (_seg === 'streak')   return renderStreak(a, state);
  return renderLog(a, state);
}

/* ---------- Progress sub-view ---------- */
function renderProgress(a, state) {
  const { total, distinctDays, commitment: c } = commitmentProgress(a, state.logs);
  const unit = esc(a.unit);
  const pastRuns = renderPastRuns(a);
  if (!c) return `<div class="detail-empty">No active commitment.</div>${pastRuns}`;
  if (c.type === 'open')
    return `<div class="detail-hero"><span class="detail-hero-num">${fmtNum(total)}</span><span class="detail-hero-unit">${unit}</span></div>
            <p class="detail-sub">Open commitment — keep going.</p>
            <button class="btn btn--ghost" id="reset-btn" style="margin-top:24px;width:100%">Archive progress</button>${pastRuns}`;

  const start = new Date(c.startedAt); start.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const elapsed = Math.round((today - start)/86400000) + 1;

  let pct, line, rem = '';
  if (c.type === 'x_only') { pct = Math.min(100, Math.round(total/c.targetCount*100)); line = `${fmtNum(total)} / ${fmtNum(c.targetCount)} ${unit}`; }
  else if (c.type === 'x_in_y') { pct = Math.min(100, Math.round(total/c.targetCount*100)); line = `${fmtNum(total)} / ${fmtNum(c.targetCount)} ${unit}`; rem = `${Math.max(0,c.targetDays-elapsed+1)} days remaining`; }
  else if (c.type === 'x_before_z') {
    pct = Math.min(100, Math.round(total/c.targetCount*100)); line = `${fmtNum(total)} / ${fmtNum(c.targetCount)} ${unit}`;
    const due = new Date(c.targetDate + 'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    rem = `due ${due} · ${daysUntil(c.targetDate)}d left`;
  }
  else /* y_days */ { pct = Math.min(100, Math.round(distinctDays/c.targetDays*100)); line = `${distinctDays} / ${c.targetDays} days · ${fmtNum(total)} ${unit} total`; rem = `${Math.max(0,c.targetDays-elapsed+1)} days remaining`; }

  return `
    <div class="detail-hero"><span class="detail-hero-num">${pct}</span><span class="detail-hero-unit">%</span></div>
    <div class="tile-bar" style="margin:16px 0"><div class="tile-bar-fill" style="width:${pct}%;background:${a.color}"></div></div>
    <p class="detail-line">${esc(line)}</p>
    <p class="detail-sub">Day ${elapsed}${rem?` · ${esc(rem)}`:''}</p>
    <button class="btn btn--ghost" id="reset-btn" style="margin-top:24px;width:100%">Archive progress</button>${pastRuns}`;
}

/** Browsable history of archived commitment runs for this activity, most recent first. */
function renderPastRuns(a) {
  const runs = a.archivedCommitments || [];
  if (runs.length === 0) return '';
  const rows = [...runs].reverse().map(r => {
    const target = r.targetCount != null ? ` / ${fmtNum(r.targetCount)}` : '';
    const valueLine = r.achievedTotal != null
      ? `${fmtNum(r.achievedTotal)}${target} ${esc(a.unit)}`
      : (r.type ? esc(r.type) : 'Archived run');
    const startDate = r.startedAt ? new Date(r.startedAt).toLocaleDateString() : '—';
    const endTs = r.archivedAt || r.completedAt;
    const endDate = endTs ? new Date(endTs).toLocaleDateString() : '—';
    return `<div class="past-run-row">
      <span class="past-run-value">${valueLine}</span>
      <span class="past-run-dates">${startDate} → ${endDate}</span>
    </div>`;
  }).join('');
  return `
    <div class="past-runs">
      <h3 class="past-runs-h">Past runs</h3>
      <div class="past-runs-list">${rows}</div>
    </div>`;
}

/* ---------- Streak sub-view ---------- */
function renderStreak(a, state) {
  const ss = calcStreakStats(a.id, a.streakMinimum || 0, state.logs);
  const freqRows = [];
  for (let n = 2; ; n++) {
    const f = ss.frequency[n] || 0;
    if (n > ss.longest) break;
    freqRows.push(`<div class="stat-row"><span>Frequency of ${n}-day streaks</span><b>${f}</b></div>`);
    if (f === 0 && n >= 2) { break; }
  }
  const last = ss.lastPerformed ? new Date(ss.lastPerformed.split('-').map((x,i)=>i===1?x-1:x)).toLocaleDateString() : '—';
  return `
    <div class="detail-hero"><span class="detail-hero-num">${ss.current}</span><span class="detail-hero-unit">day streak</span></div>
    ${renderStreakCalendar(a, state)}
    <div class="stat-list">
      <div class="stat-row"><span>Last performed</span><b>${ss.lastPerformed ? esc(ss.lastPerformed) : '—'}</b></div>
      <div class="stat-row"><span>Longest streak</span><b>${ss.longest} days</b></div>
      ${freqRows.join('')}
    </div>`;
}

/** Mini month calendar for THIS activity: ticks on qualifying days. */
function renderStreakCalendar(a, state) {
  const ss = calcStreakStats(a.id, a.streakMinimum || 0, state.logs);
  const qual = new Set(ss.qualifyingDays);
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1); const startDow = first.getDay();
  const days = new Date(y, m+1, 0).getDate();
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell cal-empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${m+1}-${d}`;
    const on = qual.has(key);
    cells += `<div class="cal-cell ${on?'cal-on':''}" style="${on?`--accent:${a.color}`:''}">${d}</div>`;
  }
  return `<div class="mini-cal-label">${first.toLocaleString(undefined,{month:'long',year:'numeric'})}</div>
          <div class="mini-cal">${cells}</div>`;
}

/* ---------- Log sub-view ---------- */
function renderLog(a, state) {
  const logs = state.logs.filter(l => l.activityId === a.id)
    .sort((x,y) => new Date(y.timestamp) - new Date(x.timestamp));
  if (logs.length === 0) return `<div class="detail-empty">No entries yet.</div>`;

  const startTs = a.commitment ? new Date(a.commitment.startedAt) : new Date(0);
  const asc = [...logs].reverse();
  let cum = 0; const cumMap = new Map();
  for (const l of asc) {
    if (new Date(l.timestamp) >= startTs) { cum += Number(l.count); cumMap.set(l.id, cum); }
    else cumMap.set(l.id, null);
  }
  const rows = logs.map(l => {
    const d = new Date(l.timestamp);
    const cumv = cumMap.get(l.id);
    return `<button class="log-row" data-log="${l.id}">
      <span class="log-date">${d.toLocaleDateString()}</span>
      <span class="log-time">${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      <span class="log-count">${fmtNum(l.count)} ${esc(a.unit)}</span>
      <span class="log-cum">${cumv==null?'—':`Σ ${fmtNum(cumv)}`}</span>
    </button>`;
  }).join('');
  return `<div class="log-table">${rows}</div>`;
}

function wireLogRows(a, state) {
  panelEl.querySelectorAll('.log-row').forEach(row =>
    row.onclick = () => openEditLog(row.dataset.log, a));
}

/* ---------- edit-log modal ---------- */
function openEditLog(logId, a) {
  const state = _getState();
  const l = state.logs.find(x => x.id === logId); if (!l) return;
  const d = new Date(l.timestamp);
  const dateVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const timeVal = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Count (${esc(a.unit)})</span>
      <input class="field-input" id="e-count" inputmode="decimal" value="${l.count}"></label>
    <label class="field"><span class="field-label">Date</span>
      <input class="field-input" id="e-date" type="date" value="${dateVal}"></label>
    <label class="field"><span class="field-label">Time</span>
      <input class="field-input" id="e-time" type="time" value="${timeVal}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--danger" id="e-del">Delete</button>
      <button class="btn btn--primary" id="e-save">Save</button>
    </div>`;
  const { close } = showModal(node, { title: 'Edit entry' });
  node.querySelector('#e-save').onclick = () => {
    const count = Number(node.querySelector('#e-count').value);
    const dv = node.querySelector('#e-date').value, tv = node.querySelector('#e-time').value;
    if (!(count > 0)) { showToast('Count must be greater than 0', {type:'error'}); return; }
    const nd = new Date(`${dv}T${tv||'00:00'}`);
    const off = -nd.getTimezoneOffset(); const sign = off>=0?'+':'-';
    const oh = String(Math.floor(Math.abs(off)/60)).padStart(2,'0'); const om = String(Math.abs(off)%60).padStart(2,'0');
    const ts = nd.toISOString().slice(0,-1) + sign + oh + ':' + om;
    _cb.onEditLog(logId, { count, timestamp: ts });
    close(); rerender();
  };
  node.querySelector('#e-del').onclick = async () => {
    close(); await _cb.onDeleteLog(logId); rerender();
  };
}

/* ---------- kebab (edit / delete activity / set commitment) ---------- */
function openKebab(a) {
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <button class="btn btn--ghost" id="k-edit">Edit activity</button>
    ${a.commitment ? '' : `<button class="btn btn--ghost" id="k-commit">Set new commitment</button>`}
    <button class="btn btn--ghost" id="k-archive">Archive activity</button>
    <button class="btn btn--danger" id="k-del">Delete activity</button>`;
  const { close: closeKebab } = showModal(node, { title: a.name });
  node.querySelector('#k-edit').onclick = () => { closeKebab(); openEditActivity(a); };
  const kc = node.querySelector('#k-commit'); if (kc) kc.onclick = () => { closeKebab(); openSetCommitment(a); };
  // close() here (no args) is the outer detail-panel close — only dismiss the panel if the action was actually confirmed.
  node.querySelector('#k-archive').onclick = async () => { closeKebab(); if (await _cb.onArchiveActivity(a.id)) close(); };
  node.querySelector('#k-del').onclick = async () => { closeKebab(); if (await _cb.onDeleteActivity(a.id)) close(); };
}

function openEditActivity(a) {
  let newThumbnail = null;
  const node = document.createElement('div'); node.className = 'form';
  const hasThumb = !!a.thumbnail;
  node.innerHTML = `
    <label class="field"><span class="field-label">Name</span><input class="field-input" id="ea-name" value="${esc(a.name)}"></label>
    <label class="field"><span class="field-label">Unit</span><input class="field-input" id="ea-unit" value="${esc(a.unit)}"></label>
    <label class="field"><span class="field-label">Streak minimum</span><input class="field-input" id="ea-min" inputmode="numeric" value="${a.streakMinimum||0}"></label>
    <div class="field"><span class="field-label">Thumbnail</span>
      <input type="file" accept="image/*" id="ea-img" class="field-file">
      <img id="ea-preview" class="form-preview ${hasThumb?'':'hidden'}" src="${hasThumb?esc(a.thumbnail):''}" alt="" referrerpolicy="no-referrer"></div>
    <button class="btn btn--primary" id="ea-save">Save</button>`;
  const { close } = showModal(node, { title: 'Edit activity' });
  node.querySelector('#ea-img').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      newThumbnail = await resizeImage(file);
      const prev = node.querySelector('#ea-preview');
      prev.src = newThumbnail; prev.classList.remove('hidden');
    } catch { showToast('Could not process image', { type: 'error' }); }
  };
  node.querySelector('#ea-save').onclick = async () => {
    const patch = {
      name: node.querySelector('#ea-name').value.trim(),
      unit: node.querySelector('#ea-unit').value.trim(),
      streakMinimum: node.querySelector('#ea-min').value,
    };
    if (newThumbnail) patch.thumbnail = newThumbnail;
    _cb.onEditActivity(a.id, patch);
    close(); rerender();
  };
}

function openSetCommitment(a) {
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <div class="seg" id="sc-type">
      <button type="button" data-t="x_in_y"     class="seg-btn is-active">X in Y</button>
      <button type="button" data-t="x_only"     class="seg-btn">X reps</button>
      <button type="button" data-t="x_before_z" class="seg-btn">X by Date</button>
      <button type="button" data-t="y_days"     class="seg-btn">Y days</button>
      <button type="button" data-t="open"       class="seg-btn">Open</button>
    </div>
    <label class="field" id="sc-wc"><span class="field-label">Target count</span><input class="field-input" id="sc-count" inputmode="decimal"></label>
    <label class="field" id="sc-wd"><span class="field-label">Target days</span><input class="field-input" id="sc-days" inputmode="numeric"></label>
    <label class="field" id="sc-wz"><span class="field-label">Target date</span><input class="field-input" id="sc-date" type="date"></label>
    <button class="btn btn--primary" id="sc-save">Set commitment</button>`;
  const { close } = showModal(node, { title: 'New commitment' });
  let type = 'x_in_y';
  const wc = node.querySelector('#sc-wc'), wd = node.querySelector('#sc-wd'), wz = node.querySelector('#sc-wz');
  const sync = () => {
    wc.classList.toggle('hidden', !(type==='x_in_y'||type==='x_only'||type==='x_before_z'));
    wd.classList.toggle('hidden', !(type==='x_in_y'||type==='y_days'));
    wz.classList.toggle('hidden', type !== 'x_before_z');
  };
  node.querySelectorAll('#sc-type .seg-btn').forEach(b => b.onclick = () => {
    node.querySelectorAll('#sc-type .seg-btn').forEach(x=>x.classList.remove('is-active')); b.classList.add('is-active'); type=b.dataset.t; sync();
  });
  sync();
  node.querySelector('#sc-save').onclick = () => {
    const targetDate = node.querySelector('#sc-date').value || null;
    if (type === 'x_before_z' && !targetDate) { showToast('Target date required', {type:'error'}); return; }
    _cb.onSetCommitment(a.id, { type, targetCount: node.querySelector('#sc-count').value, targetDays: node.querySelector('#sc-days').value, targetDate });
    close(); rerender();
  };
}
