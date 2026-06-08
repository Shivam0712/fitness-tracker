<!-- build-task
{
  "id": "task-05",
  "num": 5,
  "slug": "ui",
  "deps": [
    1
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-01-*`

## TASK 5 — ui.js (toasts, confirm, modal, sheet) + CSS

**Depends on:** TASK 1.
**Produces:** `modules/ui.js`, appended CSS in `style.css`.

Generic overlay primitives used everywhere. All Promise-based where they collect a result.

### 5.1 `modules/ui.js`

```js
// modules/ui.js
const sheetHost = () => document.getElementById('sheet-host');
const modalHost = () => document.getElementById('modal-host');
const toastHost = () => document.getElementById('toast-host');

/* ---------- haptics (no-op where unsupported) ---------- */
export function haptic(kind = 'light') {
  if (!('vibrate' in navigator)) return;
  const map = { light: 10, medium: 20, heavy: [30], success: [10, 40, 10], error: [40, 30, 40] };
  try { navigator.vibrate(map[kind] || 10); } catch {}
}

/* ---------- toast ---------- */
export function showToast(message, { type = 'info', ms = 2200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  toastHost().appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, ms);
}

/* ---------- bottom sheet (generic) ----------
 * openSheet(contentNode) -> { close }
 * Renders a backdrop + sheet that slides up. Tap backdrop or call close() to dismiss.
 */
export function openSheet(contentNode, { onClose } = {}) {
  const host = sheetHost();
  host.innerHTML = '';
  host.setAttribute('aria-hidden', 'false');

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.appendChild(contentNode);
  host.appendChild(backdrop);
  host.appendChild(sheet);

  requestAnimationFrame(() => {
    backdrop.classList.add('is-in');
    sheet.classList.add('is-in');
  });

  // prevent scroll bleed
  const stop = e => e.preventDefault();
  backdrop.addEventListener('touchmove', stop, { passive: false });

  function close() {
    backdrop.classList.remove('is-in');
    sheet.classList.remove('is-in');
    sheet.addEventListener('transitionend', () => {
      host.innerHTML = '';
      host.setAttribute('aria-hidden', 'true');
      onClose && onClose();
    }, { once: true });
  }
  backdrop.addEventListener('click', close);
  return { close, sheet };
}

/* ---------- confirm (destructive) ----------
 * showConfirm({title, message, confirmLabel, danger}) -> Promise<boolean>
 */
export function showConfirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise(resolve => {
    const node = document.createElement('div');
    node.className = 'confirm';
    node.innerHTML = `
      <div class="confirm-body">
        ${title ? `<h3 class="confirm-title">${esc(title)}</h3>` : ''}
        ${message ? `<p class="confirm-msg">${esc(message)}</p>` : ''}
      </div>
      <div class="confirm-actions">
        <button class="btn btn--ghost" data-act="cancel">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">${esc(confirmLabel)}</button>
      </div>`;
    const { close } = openSheet(node, { onClose: () => resolve(false) });
    node.querySelector('[data-act="cancel"]').onclick = () => { close(); };
    node.querySelector('[data-act="ok"]').onclick = () => { haptic('medium'); resolve(true); close(); };
  });
}

/* ---------- generic centered modal ----------
 * showModal(contentNode, {title}) -> { close }
 */
export function showModal(contentNode, { title } = {}) {
  const host = modalHost();
  host.innerHTML = '';
  host.setAttribute('aria-hidden', 'false');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const card = document.createElement('div');
  card.className = 'modal-card';
  if (title) {
    const h = document.createElement('h3');
    h.className = 'modal-title';
    h.textContent = title;
    card.appendChild(h);
  }
  card.appendChild(contentNode);
  host.appendChild(backdrop);
  host.appendChild(card);
  requestAnimationFrame(() => { backdrop.classList.add('is-in'); card.classList.add('is-in'); });

  function close() {
    backdrop.classList.remove('is-in');
    card.classList.remove('is-in');
    card.addEventListener('transitionend', () => {
      host.innerHTML = '';
      host.setAttribute('aria-hidden', 'true');
    }, { once: true });
  }
  backdrop.addEventListener('click', close);
  return { close, card };
}

/* ---------- tiny HTML escaper (use for any user text in innerHTML) ---------- */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

### 5.2 CSS — append after `=== APPEND-POINT ===`

```css
/* ===== UI PRIMITIVES (TASK 5) ===== */
.overlay-host { position: fixed; inset: 0; z-index: 100; pointer-events: none; }
.overlay-host[aria-hidden="false"] { pointer-events: auto; }

/* toasts */
#toast-host {
  position: fixed; left: 0; right: 0; bottom: calc(var(--nav-height) + var(--safe-bottom) + 12px);
  z-index: 200; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none;
}
.toast {
  pointer-events: auto; max-width: 90%; padding: 12px 18px; border-radius: var(--r-pill);
  background: var(--text); color: var(--bg); font-size: var(--fs-15); font-weight: 500;
  box-shadow: var(--shadow-float); opacity: 0; transform: translateY(8px);
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.toast.is-in { opacity: 1; transform: translateY(0); }
.toast--error { background: #B3261E; color: #fff; }
.toast--success { background: #2E7D5B; color: #fff; }

/* sheet */
.sheet-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,0.32);
  -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  opacity: 0; transition: opacity var(--dur) var(--ease);
}
.sheet-backdrop.is-in { opacity: 1; }
.sheet {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: var(--surface); border-radius: 20px 20px 0 0;
  padding: var(--sp-6) var(--sp-4) calc(var(--sp-6) + var(--safe-bottom));
  box-shadow: var(--shadow-float);
  transform: translateY(100%); transition: transform var(--dur) var(--ease);
  max-height: 90vh; overflow-y: auto;
}
.sheet.is-in { transform: translateY(0); }

/* confirm */
.confirm-title { font-size: var(--fs-22); font-weight: 600; margin-bottom: var(--sp-2); }
.confirm-msg   { color: var(--text-2); font-size: var(--fs-15); margin-bottom: var(--sp-6); }
.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }

/* buttons */
.btn { min-height: 48px; border-radius: var(--r-btn); font-size: var(--fs-17); font-weight: 600; padding: 0 var(--sp-4); }
.btn--primary { background: var(--text); color: var(--bg); }
.btn--ghost   { background: var(--border); color: var(--text); }
.btn--danger  { background: #B3261E; color: #fff; }
.btn--pill    { border-radius: var(--r-pill); }

/* modal */
.modal-backdrop {
  position: absolute; inset: 0; background: rgba(0,0,0,0.32);
  opacity: 0; transition: opacity var(--dur) var(--ease);
}
.modal-backdrop.is-in { opacity: 1; }
.modal-card {
  position: absolute; left: 50%; top: 50%;
  width: min(92%, 420px); max-height: 86vh; overflow-y: auto;
  background: var(--surface); border-radius: var(--r-card); padding: var(--sp-6);
  box-shadow: var(--shadow-float);
  transform: translate(-50%, -48%) scale(0.96); opacity: 0;
  transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease);
}
.modal-card.is-in { transform: translate(-50%, -50%) scale(1); opacity: 1; }
.modal-title { font-size: var(--fs-22); font-weight: 600; margin-bottom: var(--sp-4); }
```

### 5.3 Verification — TASK 5

In console:
```js
const ui = await import('./modules/ui.js');
ui.showToast('Hello'); // appears above nav, fades after ~2.2s
const ok = await ui.showConfirm({ title:'Delete?', message:'Cannot undo.', confirmLabel:'Delete' });
console.log('confirm result:', ok); // tap a button to resolve
```
Visual checks: sheet slides up smoothly, backdrop blurs, tap backdrop dismisses (resolves false), toast auto-dismisses.
