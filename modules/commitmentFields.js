// modules/commitmentFields.js
// Shared target-type form: segmented type control + conditional count/days/date
// fields. Used by activity create, activity edit-commitment, and Spotlight's
// add-target flow — the same {type, targetCount, targetDays, targetDate} shape
// everywhere.
import { esc } from './ui.js';

const TYPES = [
  { t: 'x_in_y',     label: 'X in Y days' },
  { t: 'x_only',     label: 'X reps' },
  { t: 'x_before_z', label: 'X by Date' },
  { t: 'y_days',     label: 'Y days' },
  { t: 'open',       label: 'Open' },
];

/** HTML for the fields. idPrefix keeps element ids unique per form instance (e.g. 'f', 'sc', 'sp'). */
export function commitmentFieldsMarkup(idPrefix, { initialType = 'x_in_y' } = {}) {
  return `
    <div class="field"><span class="field-label">Type</span>
      <div class="seg" id="${idPrefix}-type">
        ${TYPES.map(({ t, label }) =>
          `<button type="button" data-t="${t}" class="seg-btn ${t === initialType ? 'is-active' : ''}">${esc(label)}</button>`
        ).join('')}
      </div>
    </div>
    <label class="field" id="wrap-${idPrefix}-count"><span class="field-label">Target count</span>
      <input class="field-input" id="${idPrefix}-count" inputmode="decimal" placeholder="200"></label>
    <label class="field" id="wrap-${idPrefix}-days"><span class="field-label">Target days</span>
      <input class="field-input" id="${idPrefix}-days" inputmode="numeric" placeholder="20"></label>
    <label class="field" id="wrap-${idPrefix}-date"><span class="field-label">Target date</span>
      <input class="field-input" id="${idPrefix}-date" type="date"></label>`;
}

/**
 * Wires the segmented control + field visibility. Call after the markup is in the DOM.
 * Returns { getType(), getValues(), setType(type) }.
 */
export function wireCommitmentFields(node, idPrefix, { initialType = 'x_in_y', onChange } = {}) {
  let type = initialType;
  const wrapCount = node.querySelector(`#wrap-${idPrefix}-count`);
  const wrapDays  = node.querySelector(`#wrap-${idPrefix}-days`);
  const wrapDate  = node.querySelector(`#wrap-${idPrefix}-date`);
  const segBtns   = () => node.querySelectorAll(`#${idPrefix}-type .seg-btn`);

  function sync() {
    wrapCount.classList.toggle('hidden', !(type === 'x_in_y' || type === 'x_only' || type === 'x_before_z'));
    wrapDays.classList.toggle('hidden',  !(type === 'x_in_y' || type === 'y_days'));
    wrapDate.classList.toggle('hidden',  type !== 'x_before_z');
  }
  segBtns().forEach(b => b.onclick = () => {
    segBtns().forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    type = b.dataset.t;
    sync();
    onChange && onChange(type);
  });
  sync();

  return {
    getType: () => type,
    getValues: () => ({
      type,
      targetCount: node.querySelector(`#${idPrefix}-count`).value,
      targetDays: node.querySelector(`#${idPrefix}-days`).value,
      targetDate: node.querySelector(`#${idPrefix}-date`).value || null,
    }),
    setType(t) {
      segBtns().forEach(x => x.classList.toggle('is-active', x.dataset.t === t));
      type = t; sync();
    },
  };
}

/** Shared validation. Returns an error message string, or null if the config is valid. */
export function validateCommitmentFields({ type, targetCount, targetDays, targetDate }) {
  if ((type === 'x_in_y' || type === 'x_only' || type === 'x_before_z') && !(Number(targetCount) > 0)) return 'Target count required';
  if ((type === 'x_in_y' || type === 'y_days') && !(Number(targetDays) > 0)) return 'Target days required';
  if (type === 'x_before_z' && !targetDate) return 'Target date required';
  return null;
}
