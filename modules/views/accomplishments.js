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
