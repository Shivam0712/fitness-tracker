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
      <button class="numpad-key numpad-key--ghost" data-act="clear">C</button>
      <button class="numpad-key" data-d="0">0</button>
      <button class="numpad-key numpad-key--ghost" data-act="back">⌫</button>
    </div>
    <button class="btn btn--primary numpad-save">Save</button>
  `;

  const valueEl = node.querySelector('.numpad-value');
  const saveBtn = node.querySelector('.numpad-save');

  function render() {
    const n = value === '' ? 0 : Number(value);
    valueEl.textContent = String(n);
    saveBtn.disabled = n < 1;
    saveBtn.classList.toggle('is-disabled', n < 1);
  }

  function pushDigit(d) {
    haptic('light');
    if (value === '' && d === '0') return;
    if (value === '0') value = d;
    else value = value + d;
    if (Number(value) > MAX) value = String(MAX);
    render();
  }

  node.querySelectorAll('[data-d]').forEach(btn =>
    btn.addEventListener('click', () => pushDigit(btn.dataset.d)));
  node.querySelector('[data-act="back"]').addEventListener('click', () => {
    haptic('light'); value = value.slice(0, -1); render();
  });
  node.querySelector('[data-act="clear"]').addEventListener('click', () => {
    haptic('light'); value = ''; render();
  });

  const handle = openSheet(node);
  saveBtn.addEventListener('click', () => {
    const n = Number(value);
    if (n < 1) return;
    haptic('success');
    handle.close();
    onSave && onSave(n);
  });

  render();
  return handle;
}

function escText(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
