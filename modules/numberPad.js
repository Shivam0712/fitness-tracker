// modules/numberPad.js
import { openSheet, haptic } from './ui.js';

const MAX = 99999;

/**
 * openNumberPad({ title, unit, initial, onSave })
 * onSave(value:number) called when Save tapped (value >= 1).
 */
export function openNumberPad({ title = 'Log entry', unit = '', initial = 0, onSave }) {
  let value = String(initial && initial > 0 ? initial : '');

  const node = document.createElement('div');
  node.className = 'numpad';
  node.innerHTML = `
    <div class="numpad-head">
      <span class="numpad-title">${escText(title)}</span>
    </div>
    <div class="numpad-display">
      <span class="numpad-value">0</span>
      <span class="numpad-unit">${escText(unit)}</span>
    </div>
    <div class="numpad-grid">
      ${[1,2,3,4,5,6,7,8,9].map(d => `<button class="numpad-key" data-d="${d}">${d}</button>`).join('')}
      <button class="numpad-key numpad-key--ghost" data-d=".">.</button>
      <button class="numpad-key" data-d="0">0</button>
      <button class="numpad-key numpad-key--ghost" data-act="back">⌫</button>
    </div>
    <button class="btn btn--primary numpad-save">Save</button>
  `;

  const valueEl = node.querySelector('.numpad-value');
  const saveBtn = node.querySelector('.numpad-save');

  function render() {
    valueEl.textContent = value === '' ? '0' : value;
    const n = value === '' ? 0 : Number(value);
    const disabled = !(n > 0);
    saveBtn.disabled = disabled;
    saveBtn.classList.toggle('is-disabled', disabled);
  }

  function pushDigit(d) {
    haptic('light');
    if (d === '.') {
      if (value.includes('.')) return; // only one separator
      value = value === '' ? '0.' : value + '.';
      render();
      return;
    }
    if (value.includes('.') && value.split('.')[1].length >= 2) return; // cap at 2 decimal places
    if (value === '' && d === '0') return;
    if (value === '0') value = d;
    else value = value + d;
    if (!value.includes('.') && Number(value) > MAX) value = String(MAX);
    render();
  }

  node.querySelectorAll('[data-d]').forEach(btn =>
    btn.addEventListener('click', () => pushDigit(btn.dataset.d)));

  // ⌫ = backspace on tap, clear on long-press (dedicated Clear key was replaced by the decimal point)
  const backBtn = node.querySelector('[data-act="back"]');
  let longPressTimer = null;
  let longPressFired = false;
  function startLongPress() {
    longPressFired = false;
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      haptic('medium');
      value = '';
      render();
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }
  backBtn.addEventListener('pointerdown', startLongPress);
  backBtn.addEventListener('pointerup', cancelLongPress);
  backBtn.addEventListener('pointerleave', cancelLongPress);
  backBtn.addEventListener('click', () => {
    if (longPressFired) { longPressFired = false; return; }
    haptic('light'); value = value.slice(0, -1); render();
  });

  const handle = openSheet(node);
  saveBtn.addEventListener('click', () => {
    const n = Number(value);
    if (!(n > 0)) return;
    haptic('success');
    handle.close();
    onSave && onSave(n);
  });

  render();
  return handle;
}

function escText(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
