<!-- build-task
{
  "id": "task-14",
  "num": 14,
  "slug": "accomplishments-view",
  "deps": [
    4,
    11
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-04-*`, `task-11-*`

## TASK 14 — views/accomplishments.js + CSS

**Depends on:** TASK 11, TASK 4 (derived accomplishments already in state).
**Produces:** `modules/views/accomplishments.js`, appended CSS. Also adds the Settings entry point (gear icon).

Four sections, all derived fresh each render from `state.accomplishments` (which `recalculate` keeps current): **Longest Streak**, **Daily Max**, **Targets Achieved**, **Overall Max**.

### 14.1 `modules/views/accomplishments.js`

```js
// modules/views/accomplishments.js
import { esc } from '../ui.js';

export function render(container, state, callbacks) {
  const actName = id => {
    const a = state.activities.find(x => x.id === id);
    return { name: a?.name || 'Unknown', color: a?.color || '#999', deleted: a?.deleted, unit: a?.unit || '' };
  };

  const acc = state.accomplishments || [];
  const longest = acc.filter(a => a.type === 'longest_streak').sort((x,y) => y.value - x.value);
  const daily   = acc.filter(a => a.type === 'daily_max').sort((x,y) => y.value - x.value);
  const targets = acc.filter(a => a.type === 'target_achieved').sort((x,y) => new Date(y.achievedAt) - new Date(x.achievedAt));
  const overall = acc.filter(a => a.type === 'overall_max').sort((x,y) => y.value - x.value);

  const section = (title, items, fmt) => `
    <section class="acc-section">
      <h2 class="acc-h">${title}</h2>
      ${items.length === 0 ? `<p class="acc-empty">Nothing yet.</p>`
        : `<div class="acc-list">${items.map(fmt).join('')}</div>`}
    </section>`;

  const row = (a, valueText) => {
    const m = actName(a.activityId);
    return `<div class="acc-row">
      <span class="cal-dot" style="background:${m.color}"></span>
      <span class="acc-name ${m.deleted?'is-deleted':''}">${esc(m.name)}</span>
      <span class="acc-val">${esc(valueText)}</span>
    </div>`;
  };

  container.innerHTML = `
    <header class="view-head acc-head">
      <h1 class="view-title">Wins</h1>
      <button class="acc-gear" id="acc-settings" aria-label="Settings">⚙</button>
    </header>
    ${section('Longest Streak', longest, a => row(a, `${a.value} days`))}
    ${section('Daily Max', daily, a => row(a, `${a.value} ${actName(a.activityId).unit}`))}
    ${section('Targets Achieved', targets, a => row(a, `${a.value} · ${new Date(a.achievedAt).toLocaleDateString()}`))}
    ${section('Overall Max (per activity)', overall, a => row(a, `${a.value} ${actName(a.activityId).unit}`))}`;

  const gear = container.querySelector('#acc-settings');
  gear.onclick = () => { if (window.__app?.openSettings) window.__app.openSettings(); };
}
```

> The gear calls `window.__app.openSettings()` exposed in app.js (TASK 11). This keeps Settings out of the bottom nav (only 4 tabs) while remaining reachable.

### 14.2 CSS — append

```css
/* ===== ACCOMPLISHMENTS (TASK 14) ===== */
.acc-head { display: flex; align-items: center; justify-content: space-between; }
.acc-gear { font-size: 22px; min-height: 44px; min-width: 44px; }
.acc-section { margin-bottom: var(--sp-6); }
.acc-h { font-size: var(--fs-13); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-2); margin-bottom: var(--sp-3); }
.acc-list { background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--r-card); overflow: hidden; }
.acc-row { display: grid; grid-template-columns: 12px 1fr auto; gap: var(--sp-3); align-items: center; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--hairline); }
.acc-row:last-child { border-bottom: none; }
.acc-name.is-deleted { font-style: italic; color: var(--text-2); }
.acc-val { font-weight: 600; font-size: var(--fs-15); }
.acc-empty { color: var(--text-2); font-size: var(--fs-15); padding: var(--sp-2) 0; }
```

### 14.3 Verification — TASK 14

1. Four sections render; values match a manual calculation from seed data.
2. Longest Streak / Daily Max / Overall Max sorted descending; Targets Achieved sorted newest first.
3. Gear opens Settings; saving URL/theme works; "Sync now" triggers sync flow.
4. Deleted activities still appear in derived sections with italic names (their logs persist).
