<!-- build-task
{
  "id": "task-06",
  "num": 6,
  "slug": "numberpad",
  "deps": [
    5
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-05-*`

## TASK 6 — numberPad.js + CSS

**Depends on:** TASK 5 (uses `openSheet`, `haptic`).
**Produces:** `modules/numberPad.js`, appended CSS.

Custom digit grid in a bottom sheet. **The display is a `<div>`, never an `<input>`** — no iOS system keyboard ever appears.

### 6.1 `modules/numberPad.js`

```js
// modules/numberPad.js
import { openSheet, haptic } from './ui.js';

const MAX = 99999;

/**
 * openNumberPad({ title, unit, initial, onSave })
 * onSave(value:number) called when Save tapped (value >= 1).
 * Returns the openSheet handle.
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
    if (value === '' && d === '0') return;        // guard leading zero
    if (value === '0') value = d;                  // replace a lone zero
    else value = value + d;
    if (Number(value) > MAX) value = String(MAX);  // cap
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
```

### 6.2 CSS — append

```css
/* ===== NUMBER PAD (TASK 6) ===== */
.numpad-head { text-align: center; margin-bottom: var(--sp-3); }
.numpad-title { font-size: var(--fs-15); font-weight: 500; color: var(--text-2); }
.numpad-display {
  text-align: center; margin-bottom: var(--sp-6);
  display: flex; align-items: baseline; justify-content: center; gap: var(--sp-2);
}
.numpad-value { font-size: var(--fs-34); font-weight: 700; line-height: 1; }
.numpad-unit  { font-size: var(--fs-17); color: var(--text-2); }
.numpad-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-6);
}
.numpad-key {
  height: 64px; border-radius: var(--r-btn); background: var(--border);
  font-size: var(--fs-22); font-weight: 600;
  transition: transform 80ms var(--ease), background 120ms var(--ease);
}
.numpad-key:active { transform: scale(0.94); background: var(--hairline); }
.numpad-key--ghost { background: transparent; color: var(--text-2); }
.numpad-save { width: 100%; }
.numpad-save.is-disabled { opacity: 0.4; pointer-events: none; }
```

### 6.3 Verification — TASK 6

```js
const { openNumberPad } = await import('./modules/numberPad.js');
openNumberPad({ title:'Pushups', unit:'reps', onSave:(v)=>console.log('saved', v) });
```
Checks: tapping digits updates the big number; leading zero ignored; "0" replaced by next digit; ⌫ deletes; C clears; cap at 99999; Save disabled at 0; **no iOS keyboard ever appears**; Save logs the number and closes the sheet.
