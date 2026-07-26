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

/* ---------- number formatter: round to 2dp, trim trailing zeros (kills float noise like 8.000000000000002) ---------- */
export function fmtNum(n) {
  const r = Math.round(Number(n) * 100) / 100;
  return String(r);
}

/* ---------- tiny HTML escaper (use for any user text in innerHTML) ---------- */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
