// app.js — entry point
import * as store from './modules/store.js';
import { recalculate, shouldFireTarget, shouldFireSpotlightTarget } from './modules/accomplishments.js';
import { celebrate } from './modules/confetti.js';
import { showToast, showModal, showConfirm, esc, haptic } from './modules/ui.js';
import { resizeImage } from './modules/thumbnail.js';
import { syncNow } from './modules/sync.js';
import { commitmentFieldsMarkup, wireCommitmentFields, validateCommitmentFields } from './modules/commitmentFields.js';

/* view modules (lazy) */
import * as homeView from './modules/views/home.js';
let spotlightView, calendarView, historyView, activityDetailView; // loaded on demand

/* ---------- canonical in-memory state ---------- */
let state = store.getState();
state = store.expireSpotlight(state);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const next = store.expireSpotlight(state);
  if (next !== state) { state = next; refresh(); }
});

/* ---------- routing ---------- */
const VIEWS = ['spotlight', 'home', 'calendar', 'history'];
let currentView = 'spotlight';

const viewEls = {
  spotlight: document.getElementById('view-spotlight'),
  home:      document.getElementById('view-home'),
  calendar:  document.getElementById('view-calendar'),
  history:   document.getElementById('view-history'),
};

function setView(name) {
  currentView = name;
  for (const v of VIEWS) viewEls[v].classList.toggle('hidden', v !== name);
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('is-active', b.dataset.view === name));
  refresh();
}

document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => { haptic('light'); setView(btn.dataset.view); }));

/* ---------- callbacks passed down to views ---------- */
const callbacks = {
  onLog: (activityId, count) => {
    state = store.addLog(state, activityId, count);
    const act = store.getActivity(state, activityId);

    // spotlight sub-targets check first — independent of, and can coexist with, the parent commitment target
    let spotlightHit = false;
    for (const entry of state.spotlight.active.filter(e => e.activityId === activityId)) {
      if (!shouldFireSpotlightTarget(state, entry)) continue;
      const { achieved } = store.spotlightProgress(state, entry);
      state = store.addSpotlightTargetAchieved(state, activityId, achieved, { spotlightEntryId: entry.id, category: entry.category });
      spotlightHit = true;
    }

    if (act && shouldFireTarget(state, act)) {
      const c = act.commitment;
      state = store.addTargetAchieved(state, activityId, c.targetCount, {
        commitmentStartedAt: c.startedAt, targetDays: c.targetDays,
      });
      celebrate(act.color);
      showTargetModal(act); // the bigger milestone wins the modal when both fire on the same log
    } else if (spotlightHit) {
      celebrate(act.color);
      showToast('Spotlight target hit ✓', { type: 'success' });
    } else {
      haptic('success');
      showToast('Logged ✓', { type: 'success' });
    }
    refresh();
  },
  onOpenActivity: (activityId) => openActivityDetail(activityId),
  onCreate: () => openCreateActivity(),
  onEditLog: (logId, patch) => { state = store.editLog(state, logId, patch); refresh(); },
  onDeleteLog: async (logId) => {
    if (await showConfirm({ title: 'Delete entry?', confirmLabel: 'Delete' })) {
      state = store.deleteLog(state, logId); refresh(); showToast('Entry deleted');
    }
  },
  onDeleteActivity: async (activityId) => {
    if (await showConfirm({ title: 'Delete activity?', message: 'Logs stay in your history.', confirmLabel: 'Delete' })) {
      state = store.deleteActivity(state, activityId); setView('home'); showToast('Activity deleted');
      return true;
    }
    return false;
  },
  onArchiveProgress: async (activityId) => {
    if (await showConfirm({ title: 'Archive progress?', message: 'Saves this run to Past runs and resets the counter.', confirmLabel: 'Archive', danger: false })) {
      const act = store.getActivity(state, activityId);
      // only record a Win if the target was actually met (spec: not every archive is a win)
      if (act && act.commitment) {
        const c = act.commitment;
        const done = state.logs.filter(l => l.activityId === activityId && new Date(l.timestamp) >= new Date(c.startedAt))
                               .reduce((s,l)=>s+Number(l.count),0);
        const targetMet = c.targetCount != null && done >= c.targetCount;
        const exists = state.accomplishments.some(a => a.type==='target_achieved' && a.activityId===activityId && a.meta?.commitmentStartedAt===c.startedAt);
        if (targetMet && !exists) state = store.addTargetAchieved(state, activityId, done, { commitmentStartedAt: c.startedAt, targetDays: c.targetDays });
      }
      state = store.archiveProgress(state, activityId);
      refresh(); showToast('Progress archived ✓', { type:'success' });
    }
  },
  onArchiveActivity: async (activityId) => {
    if (await showConfirm({ title: 'Archive activity?', message: 'Hides it from Home. You can restore it anytime from the archived list.', confirmLabel: 'Archive', danger: false })) {
      state = store.archiveActivity(state, activityId); setView('home'); showToast('Activity archived ✓', { type: 'success' });
      return true;
    }
    return false;
  },
  onUnarchiveActivity: (activityId) => {
    state = store.unarchiveActivity(state, activityId); refresh(); showToast('Activity restored ✓', { type: 'success' });
  },
  onSetCommitment: (activityId, cfg) => { state = store.setCommitment(state, activityId, cfg); refresh(); },
  onEditActivity: (activityId, patch) => { state = store.editActivity(state, activityId, patch); refresh(); },
  onAddToSpotlight: (activityId, category, target) => {
    const act = store.getActivity(state, activityId);
    if (act && !act.category) state = store.editActivity(state, activityId, { category });
    const before = state;
    state = store.addToSpotlight(state, activityId, category, target);
    if (state === before) {
      const label = category === 'mental' ? 'Mental' : 'Physical';
      showToast(`${label} spotlight is full (${store.SPOTLIGHT_CAPS[category]} max)`, { type: 'error' });
      return;
    }
    refresh(); showToast('Added to spotlight ✓', { type: 'success' });
  },
  onRemoveFromSpotlight: (entryId) => {
    state = store.removeFromSpotlight(state, entryId); refresh(); showToast('Removed from spotlight');
  },
  getState: () => state,
};

/* ---------- central refresh ---------- */
async function refresh() {
  applyTheme();
  if (currentView === 'spotlight') {
    spotlightView = spotlightView || await import('./modules/views/spotlight.js');
    spotlightView.render(viewEls.spotlight, state, callbacks);
  } else if (currentView === 'home') {
    homeView.render(viewEls.home, state, callbacks);
  } else if (currentView === 'calendar') {
    calendarView = calendarView || await import('./modules/views/calendar.js');
    calendarView.render(viewEls.calendar, state, callbacks);
  } else if (currentView === 'history') {
    historyView = historyView || await import('./modules/views/history.js');
    historyView.render(viewEls.history, state, callbacks);
  }
}

/* ---------- theme (dark mode override) ---------- */
function applyTheme() {
  const o = state.settings.darkModeOverride;
  if (o === null || o === undefined) document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', o ? 'dark' : 'light');
}

/* ---------- activity detail (lazy) ---------- */
async function openActivityDetail(activityId) {
  activityDetailView = activityDetailView || await import('./modules/views/activityDetail.js');
  activityDetailView.open(activityId, () => callbacks.getState(), callbacks);
}

/* ---------- target-hit modal ---------- */
function showTargetModal(activity) {
  const node = document.createElement('div');
  node.innerHTML = `
    <p style="font-size:34px;text-align:center">🎯</p>
    <p style="text-align:center;font-size:17px;color:var(--text-2);margin-bottom:24px">
      Target hit! ${activity.commitment.targetCount} ${esc(activity.unit)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--ghost" data-act="later">Later</button>
      <button class="btn btn--primary" data-act="archive">Archive</button>
    </div>`;
  const { close } = showModal(node, { title: 'Nice work' });
  node.querySelector('[data-act="later"]').onclick = close;
  node.querySelector('[data-act="archive"]').onclick = () => { close(); callbacks.onArchiveProgress(activity.id); };
}

/* ---------- create activity modal ---------- */
function openCreateActivity() {
  let thumbnail = null;
  const node = document.createElement('div');
  node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Name</span>
      <input class="field-input" id="f-name" placeholder="e.g. Pushups" autocomplete="off"></label>
    <label class="field"><span class="field-label">Unit</span>
      <input class="field-input" id="f-unit" placeholder="reps, min, km" autocomplete="off"></label>
    <div class="field"><span class="field-label">Category</span>
      <div class="seg" id="f-category">
        <button type="button" data-c="physical" class="seg-btn is-active">Physical</button>
        <button type="button" data-c="mental"   class="seg-btn">Mental</button>
      </div>
    </div>
    ${commitmentFieldsMarkup('f')}
    <label class="field"><span class="field-label">Streak minimum (optional)</span>
      <input class="field-input" id="f-min" inputmode="numeric" placeholder="0"></label>
    <div class="field"><span class="field-label">Thumbnail (optional)</span>
      <input type="file" accept="image/*" id="f-img" class="field-file">
      <img id="f-preview" class="form-preview hidden" alt=""></div>
    <button class="btn btn--primary" id="f-save">Create</button>`;

  const { close } = showModal(node, { title: 'New activity' });

  const commitmentFields = wireCommitmentFields(node, 'f', { initialType: 'x_in_y' });

  let category = 'physical';
  node.querySelectorAll('#f-category .seg-btn').forEach(b => b.onclick = () => {
    node.querySelectorAll('#f-category .seg-btn').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active'); category = b.dataset.c;
  });

  node.querySelector('#f-img').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      thumbnail = await resizeImage(file);
      const prev = node.querySelector('#f-preview');
      prev.src = thumbnail; prev.classList.remove('hidden');
    } catch { showToast('Could not process image', { type: 'error' }); }
  };

  node.querySelector('#f-save').onclick = async () => {
    const name = node.querySelector('#f-name').value.trim();
    if (!name) { showToast('Name required', { type: 'error' }); return; }
    const target = commitmentFields.getValues();
    const err = validateCommitmentFields(target);
    if (err) { showToast(err, { type: 'error' }); return; }
    const cfg = {
      name, unit: node.querySelector('#f-unit').value.trim(), category,
      ...target,
      streakMinimum: node.querySelector('#f-min').value,
      thumbnail,
    };
    state = store.createActivity(state, cfg);
    close(); setView('home'); showToast('Activity created ✓', { type: 'success' });
  };
}

/* ---------- expose for views that open Settings/sync (used in TASK 14/16) ---------- */
window.__app = { syncNow: () => doSync(), openSettings, getState: () => state, setState: (s) => { state = s; refresh(); } };

async function doSync() {
  const url = state.settings.googleSheetWebhookUrl;
  showToast('Syncing…');
  const res = await syncNow(state, url);
  if (res.ok) { state = store.updateSettings(state, { lastSyncedAt: store.nowISO() }); showToast('Synced ✓', { type: 'success' }); refresh(); }
  else showToast(`Sync failed: ${res.error}`, { type: 'error' });
}

function openSettings() {
  const node = document.createElement('div');
  node.className = 'form';
  node.innerHTML = `
    <label class="field"><span class="field-label">Google Sheets webhook URL</span>
      <input class="field-input" id="s-url" value="${esc(state.settings.googleSheetWebhookUrl)}" placeholder="https://script.google.com/..."></label>
    <label class="field"><span class="field-label">Appearance</span>
      <div class="seg" id="s-theme">
        <button type="button" data-v="system" class="seg-btn">System</button>
        <button type="button" data-v="light"  class="seg-btn">Light</button>
        <button type="button" data-v="dark"   class="seg-btn">Dark</button>
      </div></label>
    <p class="field-label" id="s-last"></p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--ghost" id="s-save">Save</button>
      <button class="btn btn--primary" id="s-sync">Sync now</button>
    </div>
    <p class="field-label" style="margin-top:20px">Data backup</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--ghost" id="s-export">Export / Backup</button>
      <button class="btn btn--ghost" id="s-import">Import / Restore</button>
    </div>`;
  const { close } = showModal(node, { title: 'Settings' });
  const o = state.settings.darkModeOverride;
  const cur = o === null ? 'system' : (o ? 'dark' : 'light');
  node.querySelectorAll('#s-theme .seg-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.v === cur);
    b.onclick = () => {
      node.querySelectorAll('#s-theme .seg-btn').forEach(x=>x.classList.remove('is-active'));
      b.classList.add('is-active');
    };
  });
  const last = state.settings.lastSyncedAt;
  node.querySelector('#s-last').textContent = last ? `Last synced: ${new Date(last).toLocaleString()}` : 'Never synced';
  node.querySelector('#s-save').onclick = () => {
    const url = node.querySelector('#s-url').value.trim();
    const v = node.querySelector('#s-theme .seg-btn.is-active').dataset.v;
    const override = v === 'system' ? null : (v === 'dark');
    state = store.updateSettings(state, { googleSheetWebhookUrl: url, darkModeOverride: override });
    close(); applyTheme(); showToast('Settings saved ✓', { type:'success' });
  };
  node.querySelector('#s-sync').onclick = () => { close(); doSync(); };
  node.querySelector('#s-export').onclick = () => { close(); openExportModal(); };
  node.querySelector('#s-import').onclick = () => { close(); openImportModal(); };
}

/* ---------- export / import (backup) ---------- */
function buildExportEnvelope() {
  return {
    app: 'fitness_tracker',
    formatVersion: 1,
    schemaVersion: state.schemaVersion || 1,
    exportedAt: new Date().toISOString(),
    data: state,
  };
}

function openExportModal() {
  const json = JSON.stringify(buildExportEnvelope(), null, 2);
  const node = document.createElement('div');
  node.className = 'form';
  node.innerHTML = `
    <p class="field-label">Includes all activities, logs, wins and images. Save it somewhere safe.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <button class="btn btn--ghost" id="ex-copy">Copy to clipboard</button>
      <button class="btn btn--primary" id="ex-download">Download</button>
    </div>`;
  showModal(node, { title: 'Export backup' });

  node.querySelector('#ex-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = json; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    showToast('Backup copied ✓', { type: 'success' });
  };
  node.querySelector('#ex-download').onclick = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url; a.download = `fitness-tracker-backup-${d}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded ✓', { type: 'success' });
  };
}

function openImportModal() {
  const node = document.createElement('div');
  node.className = 'form';
  node.innerHTML = `
    <p class="field-label">Choose a backup JSON file. This replaces all current data on this device.</p>
    <input type="file" accept="application/json,.json" id="im-file" class="field-file">
    <button class="btn btn--danger" id="im-restore" disabled>Restore</button>`;
  const { close } = showModal(node, { title: 'Import backup' });

  let pickedText = null;
  node.querySelector('#im-file').onchange = async (e) => {
    const file = e.target.files[0];
    pickedText = file ? await file.text() : null;
    node.querySelector('#im-restore').disabled = !pickedText;
  };

  node.querySelector('#im-restore').onclick = async () => {
    if (!pickedText) return;
    // close the import modal first — sheet (confirm) and modal hosts share a z-index,
    // so a modal left open paints over a confirm sheet triggered from within it
    // (same convention as the kebab menu's archive/delete handlers).
    close();

    let parsed;
    try { parsed = JSON.parse(pickedText); }
    catch { showToast('Not valid JSON', { type: 'error' }); return; }

    if (parsed.app && parsed.app !== 'fitness_tracker') {
      showToast('This file is not a Fitness Tracker backup', { type: 'error' }); return;
    }
    const data = parsed.data ?? parsed;
    if (!data || !Array.isArray(data.activities) || !Array.isArray(data.logs)) {
      showToast('Backup is missing or malformed', { type: 'error' }); return;
    }

    const ok = await showConfirm({
      title: 'Replace all data?',
      message: 'This overwrites your current activities, logs and wins with the backup.',
      confirmLabel: 'Replace', danger: true,
    });
    if (!ok) return;

    const clean = store.sanitizeState(data);
    try {
      state = store.importState(clean);
    } catch {
      showToast('Backup too large to store on this device', { type: 'error' });
      return;
    }
    setView('home'); showToast('Backup restored ✓', { type: 'success' });
  };
}

/* ---------- boot ---------- */
applyTheme();
setView('spotlight');

/* dev seed hook (TASK 17 fills this) */
if (new URLSearchParams(location.search).get('debug') === '1') {
  import('./modules/seed.js').then(m => { window.__test = m.makeTestApi(store, () => state, (s)=>{ state=s; refresh(); }); })
    .catch(()=>{ /* seed module optional */ });
}
