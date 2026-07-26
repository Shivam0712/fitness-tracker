// modules/views/spotlight.js
import { esc, fmtNum, showModal, showConfirm, showToast } from '../ui.js';
import { openNumberPad } from '../numberPad.js';
import { renderFallbackAvatar } from '../thumbnail.js';
import { commitmentFieldsMarkup, wireCommitmentFields, validateCommitmentFields } from '../commitmentFields.js';
import { spotlightProgress, SPOTLIGHT_CAPS } from '../store.js';

const BLOCKS = [
  { key: 'mental',   label: 'Mental' },
  { key: 'physical', label: 'Physical' },
];

/** Whole days left until an entry's expiresAt (never negative). */
function daysLeft(entry) {
  return Math.max(0, Math.ceil((new Date(entry.expiresAt) - new Date()) / 86400000));
}

function progressBar(color, pct, label) {
  return `
    <div class="tile-bar"><div class="tile-bar-fill" style="width:${pct}%;background:${color}"></div></div>
    <div class="spotlight-progress-label">${esc(label)}</div>`;
}

function progressMarkup(entry, achieved, unit) {
  const t = entry.target;
  if (t.type === 'open') return `<div class="spotlight-progress-label">${fmtNum(achieved)} ${esc(unit)}</div>`;
  if (t.type === 'y_days') {
    const pct = t.targetDays ? Math.min(100, Math.round(achieved / t.targetDays * 100)) : 0;
    return progressBar('var(--accent)', pct, `${achieved} / ${t.targetDays} days`);
  }
  const pct = t.targetCount ? Math.min(100, Math.round(achieved / t.targetCount * 100)) : 0;
  return progressBar('var(--accent)', pct, `${fmtNum(achieved)} / ${fmtNum(t.targetCount)} ${unit}`);
}

export function render(container, state, callbacks) {
  const active = state.spotlight?.active || [];
  const history = state.spotlight?.history || [];

  container.innerHTML = `
    <header class="view-head"><h1 class="view-title">Spotlight</h1></header>
    ${active.length === 0 ? emptyHintMarkup() : ''}
    ${BLOCKS.map(({ key, label }) => blockMarkup(key, label, active, state)).join('')}
    ${pastSpotlightsMarkup(history, state)}`;

  wire(container, state, callbacks);
}

function emptyHintMarkup() {
  return `<p class="spotlight-hint">Pick a few activities to focus on this week — up to
    ${SPOTLIGHT_CAPS.mental} mental and ${SPOTLIGHT_CAPS.physical} physical.</p>`;
}

function blockMarkup(category, label, active, state) {
  const cap = SPOTLIGHT_CAPS[category];
  const entries = active.filter(e => e.category === category);
  const slots = [];
  for (let i = 0; i < cap; i++) {
    slots.push(entries[i] ? cardMarkup(entries[i], state) : emptySlotMarkup(category));
  }
  return `
    <section class="spotlight-block">
      <h2 class="spotlight-block-h">${esc(label)} <span class="spotlight-block-count">${entries.length}/${cap}</span></h2>
      <div class="spotlight-slots">${slots.join('')}</div>
    </section>`;
}

function emptySlotMarkup(category) {
  return `<button class="spotlight-slot spotlight-slot--empty" data-add="${category}">
    <span class="spotlight-slot-plus">＋</span>
    <span class="spotlight-slot-label">Add focus</span>
  </button>`;
}

function cardMarkup(entry, state) {
  const a = state.activities.find(x => x.id === entry.activityId);
  if (!a) return ''; // the expiry sweep clears entries whose activity is gone; this is just a defensive fallback
  const { achieved, met } = spotlightProgress(state, entry);
  const remaining = daysLeft(entry);
  const avatar = a.thumbnail
    ? `<img class="spotlight-avatar" src="${a.thumbnail}" alt="">`
    : `<img class="spotlight-avatar" src="${renderFallbackAvatar(a.name, a.color, 56)}" alt="">`;

  return `
    <article class="spotlight-card ${met ? 'is-done' : ''}" data-entry="${entry.id}" style="--accent:${a.color}">
      <div class="spotlight-card-main" data-open="${a.id}">
        ${avatar}
        <div class="spotlight-card-info">
          <h3 class="spotlight-card-name">${esc(a.name)}${met ? ' ✓' : ''}</h3>
          ${progressMarkup(entry, achieved, a.unit)}
          <div class="spotlight-card-sub">${remaining === 0 ? 'Last day' : `${remaining}d left`}</div>
        </div>
      </div>
      <div class="spotlight-card-actions">
        <button class="spotlight-log" data-log="${a.id}" aria-label="Log ${esc(a.name)}">＋</button>
        <button class="spotlight-remove" data-remove="${entry.id}" aria-label="Remove from spotlight">✕</button>
      </div>
    </article>`;
}

function pastSpotlightsMarkup(history, state) {
  if (history.length === 0) return '';
  const rows = [...history].reverse().map(h => pastRowMarkup(h, state)).join('');
  return `
    <section class="spotlight-past">
      <h2 class="spotlight-past-h">Past spotlights</h2>
      <div class="spotlight-past-list">${rows}</div>
    </section>`;
}

function pastRowMarkup(h, state) {
  const a = state.activities.find(x => x.id === h.activityId);
  const name = a ? a.name : 'Unknown';
  const unit = a ? a.unit : '';
  const t = h.target;
  const achievedLabel = t.type === 'y_days' ? `${h.achieved} days` : `${fmtNum(h.achieved)} ${esc(unit)}`;
  const targetLabel = t.type === 'open' ? '' : t.type === 'y_days' ? ` / ${t.targetDays} days` : ` / ${fmtNum(t.targetCount)} ${esc(unit)}`;
  const dateRange = `${new Date(h.addedAt).toLocaleDateString()} → ${new Date(h.endedAt).toLocaleDateString()}`;
  return `
    <div class="spotlight-past-row ${h.met ? 'is-met' : 'is-unmet'}">
      <span class="cal-dot" style="background:${a?.color || '#999'}"></span>
      <span class="spotlight-past-name ${a?.deleted ? 'is-deleted' : ''}">${esc(name)}</span>
      <span class="spotlight-past-val">${h.met ? '✓ ' : ''}${achievedLabel}${targetLabel}</span>
      <span class="spotlight-past-dates">${dateRange}</span>
    </div>`;
}

function wire(container, state, callbacks) {
  container.querySelectorAll('[data-add]').forEach(btn =>
    btn.onclick = () => openAddPicker(btn.dataset.add, state, callbacks));

  container.querySelectorAll('[data-log]').forEach(btn =>
    btn.onclick = (e) => {
      e.stopPropagation();
      const a = state.activities.find(x => x.id === btn.dataset.log);
      if (!a) return;
      openNumberPad({ title: a.name, unit: a.unit, onSave: (count) => callbacks.onLog(a.id, count) });
    });

  container.querySelectorAll('[data-remove]').forEach(btn =>
    btn.onclick = async (e) => {
      e.stopPropagation();
      const ok = await showConfirm({ title: 'Remove from spotlight?', confirmLabel: 'Remove', danger: false });
      if (ok) callbacks.onRemoveFromSpotlight(btn.dataset.remove);
    });

  container.querySelectorAll('[data-open]').forEach(el =>
    el.onclick = () => callbacks.onOpenActivity(el.dataset.open));
}

/* ---------- add flow: pick activity, then set its sub-target ---------- */

function openAddPicker(category, state, callbacks) {
  const spotlighted = new Set(state.spotlight.active.map(e => e.activityId));
  const eligible = state.activities.filter(a => !a.deleted && !a.archived && (a.category === category || a.category == null));

  if (eligible.length === 0) { showToast('No eligible activities — create one first', { type: 'error' }); return; }

  const groups = [
    { key: category, label: category === 'mental' ? 'Mental' : 'Physical' },
    { key: null, label: 'Uncategorized' },
  ];
  const groupsHtml = groups.map(g => {
    const items = eligible.filter(a => (a.category || null) === g.key);
    if (items.length === 0) return '';
    const itemRows = items.map(a => {
      const disabled = spotlighted.has(a.id);
      return `<button type="button" class="spotlight-pick-row ${disabled ? 'is-disabled' : ''}" data-pick="${a.id}" ${disabled ? 'disabled' : ''}>
        <span class="cal-dot" style="background:${a.color}"></span>
        <span class="spotlight-pick-name">${esc(a.name)}</span>
        ${disabled ? '<span class="spotlight-pick-tag">In Spotlight</span>' : ''}
      </button>`;
    }).join('');
    return `<div class="spotlight-pick-group"><h3 class="spotlight-pick-h">${esc(g.label)}</h3>${itemRows}</div>`;
  }).join('');

  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = groupsHtml;
  const { close } = showModal(node, { title: `Add to ${category === 'mental' ? 'Mental' : 'Physical'} Spotlight` });

  node.querySelectorAll('[data-pick]:not([disabled])').forEach(btn => btn.onclick = () => {
    const activity = state.activities.find(a => a.id === btn.dataset.pick);
    close();
    openTargetForm(activity, category, callbacks);
  });
}

function openTargetForm(activity, category, callbacks) {
  if (!activity) return;
  const parentType = activity.commitment ? activity.commitment.type : 'x_only';
  const node = document.createElement('div'); node.className = 'form';
  node.innerHTML = `
    <p class="field-label">Sub-target for ${esc(activity.name)} this week</p>
    ${commitmentFieldsMarkup('sp', { initialType: parentType })}
    <button class="btn btn--primary" id="sp-save">Add to Spotlight</button>`;
  const { close } = showModal(node, { title: 'Spotlight target' });
  const fields = wireCommitmentFields(node, 'sp', { initialType: parentType });

  node.querySelector('#sp-save').onclick = () => {
    const target = fields.getValues();
    const err = validateCommitmentFields(target);
    if (err) { showToast(err, { type: 'error' }); return; }

    // A spotlight run only ever lasts 7 days — a duration/date target beyond
    // that window could never be met, so it's clamped rather than rejected.
    let clamped = false;
    if (target.type === 'y_days' && Number(target.targetDays) > 7) {
      target.targetDays = 7; clamped = true;
    }
    if (target.type === 'x_before_z') {
      const maxDate = new Date(Date.now() + 7 * 86400000);
      if (new Date(target.targetDate + 'T00:00:00') > maxDate) {
        target.targetDate = maxDate.toISOString().slice(0, 10); clamped = true;
      }
    }

    close();
    if (clamped) showToast('Adjusted to fit the 7-day spotlight window', { type: 'info' });
    callbacks.onAddToSpotlight(activity.id, category, target);
  };
}
