<!-- build-task
{
  "id": "task-11",
  "num": 11,
  "slug": "app",
  "deps": [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-01-*`, `task-02-*`, `task-03-*`, `task-04-*`, `task-05-*`, `task-06-*`, `task-07-*`, `task-08-*`, `task-09-*`, `task-10-*`

## TASK 11 — app.js (entry point, routing, refresh pipeline, create-activity form)

**Depends on:** TASK 1–10. Wires everything; later view tasks (12–15) plug into the same router and refresh pipeline.
**Produces:** `app.js` (replaces the placeholder).

### 11.1 Responsibilities

1. Hold the canonical `state` in a module variable (read once from store on boot).
2. `refresh()` — re-read nothing; re-render the *current* view from in-memory `state`, update nav.
3. Central callbacks that call store mutators, reassign `state`, run the target/confetti check, then `refresh()`.
4. Tab routing via the bottom nav.
5. The Create Activity modal (a form with dynamic fields per commitment type + thumbnail upload).
6. Lazily import the view modules (keeps initial parse small and matches the split-doc philosophy).

### 11.2 `app.js`

```js
// app.js — entry point
import * as store from './modules/store.js';
import { recalculate, shouldFireTarget } from './modules/accomplishments.js';
import { celebrate } from './modules/confetti.js';
import { showToast, showModal, showConfirm, esc, haptic } from './modules/ui.js';
import { resizeImage } from './modules/thumbnail.js';
import { syncNow } from './modules/sync.js';

/* view modules (lazy) */
import * as homeView from './modules/views/home.js';
let calendarView, accomplishmentsView, rawLogView, activityDetailView; // loaded on demand

/* ---------- canonical in-memory state ---------- */
let state = store.getState();

/* ---------- routing ---------- */
const VIEWS = ['home', 'calendar', 'accomplishments', 'rawlog'];
let currentView = 'home';

const viewEls = {
  home:            document.getElementById('view-home'),
  calendar:        document.getElementById('view-calendar'),
  accomplishments: document.getElementById('view-accomplishments'),
  rawlog:          document.getElementById('view-rawlog'),
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
    // target check (x_in_y / x_only)
    const act = store.getActivity(state, activityId);
    if (act && shouldFireTarget(state, act)) {
      const c = act.commitment;
      state = store.addTargetAchieved(state, activityId, c.targetCount, {
        commitmentStartedAt: c.startedAt, targetDays: c.targetDays,
      });
      celebrate(act.color);
      showTargetModal(act);
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
    }
  },
  onResetCommitment: async (activityId) => {
    if (await showConfirm({ title: 'Reset commitment?', message: 'Archives the current commitment.', confirmLabel: 'Reset', danger: false })) {
      const act = store.getActivity(state, activityId);
      // ensure a target_achieved exists for the run being archived (spec 4.5)
      if (act && act.commitment) {
        const c = act.commitment;
        const done = state.logs.filter(l => l.activityId === activityId && new Date(l.timestamp) >= new Date(c.startedAt))
                               .reduce((s,l)=>s+Number(l.count),0);
        const exists = state.accomplishments.some(a => a.type==='target_achieved' && a.activityId===activityId && a.meta?.commitmentStartedAt===c.startedAt);
        if (!exists) state = store.addTargetAchieved(state, activityId, done, { commitmentStartedAt: c.startedAt, targetDays: c.targetDays });
      }
      state = store.resetCommitment(state, activityId);
      refresh(); showToast('Commitment reset ✓', { type:'success' });
    }
  },
  onSetCommitment: (activityId, cfg) => { state = store.setCommitment(state, activityId, cfg); refresh(); },
  onEditActivity: (activityId, patch) => { state = store.editActivity(state, activityId, patch); refresh(); },
  getState: () => state,
};

/* ---------- central refresh ---------- */
async function refresh() {
  applyTheme();
  if (currentView === 'home') {
    homeView.render(viewEls.home, state, callbacks);
  } else if (currentView === 'calendar') {
    calendarView = calendarView || await import('./modules/views/calendar.js');
    calendarView.render(viewEls.calendar, state, callbacks);
  } else if (currentView === 'accomplishments') {
    accomplishmentsView = accomplishmentsView || await import('./modules/views/accomplishments.js');
    accomplishmentsView.render(viewEls.accomplishments, state, callbacks);
  } else if (currentView === 'rawlog') {
    rawLogView = rawLogView || await import('./modules/views/rawLog.js');
    rawLogView.render(viewEls.rawlog, state, callbacks);
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
      <button class="btn btn--primary" data-act="reset">Reset</button>
    </div>`;
  const { close } = showModal(node, { title: 'Nice work' });
  node.querySelector('[data-act="later"]').onclick = close;
  node.querySelector('[data-act="reset"]').onclick = () => { close(); callbacks.onResetCommitment(activity.id); };
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
    <div class="field"><span class="field-label">Commitment type</span>
      <div class="seg" id="f-type">
        <button type="button" data-t="x_in_y" class="seg-btn is-active">X in Y days</button>
        <button type="button" data-t="x_only" class="seg-btn">X reps</button>
        <button type="button" data-t="y_days" class="seg-btn">Y days</button>
        <button type="button" data-t="open"   class="seg-btn">Open</button>
      </div>
    </div>
    <label class="field" id="wrap-count"><span class="field-label">Target count</span>
      <input class="field-input" id="f-count" inputmode="numeric" placeholder="200"></label>
    <label class="field" id="wrap-days"><span class="field-label">Target days</span>
      <input class="field-input" id="f-days" inputmode="numeric" placeholder="20"></label>
    <label class="field"><span class="field-label">Streak minimum (optional)</span>
      <input class="field-input" id="f-min" inputmode="numeric" placeholder="0"></label>
    <div class="field"><span class="field-label">Thumbnail (optional)</span>
      <input type="file" accept="image/*" id="f-img" class="field-file">
      <img id="f-preview" class="form-preview hidden" alt=""></div>
    <button class="btn btn--primary" id="f-save">Create</button>`;

  const { close } = showModal(node, { title: 'New activity' });

  let type = 'x_in_y';
  const wrapCount = node.querySelector('#wrap-count');
  const wrapDays  = node.querySelector('#wrap-days');
  function syncFields() {
    wrapCount.classList.toggle('hidden', !(type === 'x_in_y' || type === 'x_only'));
    wrapDays.classList.toggle('hidden',  !(type === 'x_in_y' || type === 'y_days'));
  }
  node.querySelectorAll('#f-type .seg-btn').forEach(b => b.onclick = () => {
    node.querySelectorAll('#f-type .seg-btn').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active'); type = b.dataset.t; syncFields();
  });
  syncFields();

  node.querySelector('#f-img').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      thumbnail = await resizeImage(file);
      const prev = node.querySelector('#f-preview');
      prev.src = thumbnail; prev.classList.remove('hidden');
    } catch { showToast('Could not process image', { type: 'error' }); }
  };

  node.querySelector('#f-save').onclick = () => {
    const name = node.querySelector('#f-name').value.trim();
    if (!name) { showToast('Name required', { type: 'error' }); return; }
    const cfg = {
      name, unit: node.querySelector('#f-unit').value.trim(), type,
      targetCount: node.querySelector('#f-count').value,
      targetDays: node.querySelector('#f-days').value,
      streakMinimum: node.querySelector('#f-min').value,
      thumbnail,
    };
    if ((type === 'x_in_y' || type === 'x_only') && !(Number(cfg.targetCount) > 0)) { showToast('Target count required', { type:'error' }); return; }
    if ((type === 'x_in_y' || type === 'y_days') && !(Number(cfg.targetDays) > 0)) { showToast('Target days required', { type:'error' }); return; }
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
}

/* ---------- boot ---------- */
applyTheme();
setView('home');

/* dev seed hook (TASK 17 fills this) */
if (new URLSearchParams(location.search).get('debug') === '1') {
  import('./modules/seed.js').then(m => { window.__test = m.makeTestApi(store, () => state, (s)=>{ state=s; refresh(); }); })
    .catch(()=>{ /* seed module optional */ });
}
```

### 11.3 Form / segmented-control CSS — append

```css
/* ===== FORMS (TASK 11) ===== */
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.field { display: flex; flex-direction: column; gap: var(--sp-2); }
.field-label { font-size: var(--fs-13); font-weight: 500; color: var(--text-2); }
.field-input {
  height: 48px; border-radius: var(--r-btn); border: 1px solid var(--hairline);
  background: var(--bg); color: var(--text); padding: 0 var(--sp-3); font-size: var(--fs-17);
}
.field-input:focus { outline: none; border-color: var(--text-2); }
.field-file { font-size: var(--fs-15); }
.form-preview { width: 72px; height: 72px; border-radius: var(--r-btn); object-fit: cover; margin-top: var(--sp-2); }

.seg { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.seg-btn {
  flex: 1 1 auto; min-height: 40px; padding: 0 var(--sp-3); border-radius: var(--r-btn);
  background: var(--border); color: var(--text-2); font-size: var(--fs-13); font-weight: 600;
  transition: background 120ms var(--ease), color 120ms var(--ease);
}
.seg-btn.is-active { background: var(--text); color: var(--bg); }
```

### 11.4 Verification — TASK 11

1. Reload app. No console errors.
2. Tap FAB → Create modal opens. Switch commitment type → count/days fields show/hide correctly.
3. Create an `x_in_y` activity → appears as a tile on Home with a progress bar.
4. Quick-log via tile `+` → number pad → Save → toast "Logged ✓", progress updates, **persists after reload**.
5. Log enough to exceed target → confetti + 🎯 modal; logging again does NOT re-fire (idempotent).
6. Bottom nav switches views (other views may be empty until TASKs 12–15).
7. Settings (opened via Accomplishments view in TASK 14, or temporarily call `window.__app.openSettings()`) saves URL + theme; theme override flips immediately.
