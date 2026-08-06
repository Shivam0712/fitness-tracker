// modules/dragReorder.js — long-press drag-to-reorder for a flex-column tile list.
import { haptic } from './ui.js';

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 8;
const EDGE_ZONE_PX = 60;
const EDGE_SCROLL_PX = 14;

/**
 * attachDragReorder(listEl, opts)
 * opts: {
 *   itemSelector,     // e.g. '.tile'
 *   idAttr,           // e.g. 'data-tile'
 *   ignoreSelector,   // pointerdown inside this never starts a drag, e.g. '.tile-log, .tile-pin'
 *   isLocked(id),     // true if this item can't be dragged (pinned)
 *   onLockedAttempt(id, tileEl), // called when a long-press lands on a locked item
 *   onDrop(id, targetSlot),      // called with the row index to move `id` to
 * }
 * Binds only to listEl (delegated) plus document listeners that live only for
 * the duration of an active drag — safe to call fresh on every re-render.
 */
export function attachDragReorder(listEl, { itemSelector, idAttr, ignoreSelector, isLocked, onLockedAttempt, onDrop }) {
  if (!listEl) return;
  listEl.addEventListener('pointerdown', onPointerDown);
  // Registered non-passive from the start of every touch sequence (not just once a drag
  // begins) — iOS only honors a mid-gesture preventDefault() if a cancelable listener was
  // already present when the sequence started. Only actually prevents once `dragging` is true,
  // so a quick swipe that never triggers the long-press still scrolls the page normally.
  listEl.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });

  let pressTimer = null, pressTile = null, pressId = null, pointerId = null;
  let startClientY = 0, startScrollY = 0, startPageY = 0;
  let lastClientY = 0;

  let dragging = false;
  let dragTile = null, dragId = null;
  let items = [];       // [{ id, el, pinned, top(pageY), height, center(pageY) }] captured at drag start, DOM order
  let rowStep = 0;
  let draggedIdx = 0;
  let targetSlot = 0;
  let scrollRAF = null;

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const tile = e.target.closest(itemSelector);
    if (!tile || !listEl.contains(tile)) return;
    if (ignoreSelector && e.target.closest(ignoreSelector)) return;

    pressTile = tile;
    pressId = tile.getAttribute(idAttr);
    pointerId = e.pointerId;
    startClientY = lastClientY = e.clientY;
    const startX = e.clientX;

    const onPreMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > MOVE_CANCEL_PX || Math.abs(ev.clientY - startClientY) > MOVE_CANCEL_PX) cancelPress();
    };
    const onPreUp = () => cancelPress();
    function cancelPress() {
      clearTimeout(pressTimer);
      document.removeEventListener('pointermove', onPreMove);
      document.removeEventListener('pointerup', onPreUp);
      document.removeEventListener('pointercancel', onPreUp);
    }

    document.addEventListener('pointermove', onPreMove);
    document.addEventListener('pointerup', onPreUp);
    document.addEventListener('pointercancel', onPreUp);
    pressTimer = setTimeout(() => { cancelPress(); beginDrag(); }, LONG_PRESS_MS);
  }

  function beginDrag() {
    if (!pressTile || !pressTile.isConnected) return;

    if (isLocked(pressId)) {
      dragTile = pressTile;
      dragTile.classList.add('is-locked-shake');
      dragTile.addEventListener('animationend', () => dragTile.classList.remove('is-locked-shake'), { once: true });
      onLockedAttempt && onLockedAttempt(pressId, pressTile);
      return;
    }

    dragging = true;
    dragTile = pressTile;
    dragId = pressId;
    startScrollY = window.scrollY;
    startPageY = startClientY + startScrollY;
    haptic('medium');

    try { dragTile.setPointerCapture(pointerId); } catch {}

    const tiles = Array.from(listEl.querySelectorAll(itemSelector));
    items = tiles.map(el => {
      const r = el.getBoundingClientRect();
      const top = r.top + startScrollY;
      return { id: el.getAttribute(idAttr), el, pinned: isLocked(el.getAttribute(idAttr)), top, height: r.height, center: top + r.height / 2 };
    });
    draggedIdx = items.findIndex(it => it.id === dragId);
    targetSlot = draggedIdx;
    rowStep = items.length > 1 ? (items[items.length - 1].top - items[0].top) / (items.length - 1) : (items[0]?.height || 0);

    listEl.classList.add('is-reordering');
    dragTile.classList.add('is-dragging');

    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragCancel);
    document.addEventListener('click', suppressClick, true);

    tick();
  }

  function suppressClick(e) {
    e.preventDefault(); e.stopPropagation();
    document.removeEventListener('click', suppressClick, true);
  }

  function onDragMove(e) {
    if (!dragging) return;
    lastClientY = e.clientY;
    tick();
  }

  function tick() {
    const currentPageY = lastClientY + window.scrollY;
    const dy = currentPageY - startPageY;
    dragTile.style.transform = `translateY(${dy}px) scale(1.02)`;

    const draggedCenter = items[draggedIdx].center + dy;
    let idx = 0, best = Infinity;
    items.forEach((it, i) => {
      const d = Math.abs(draggedCenter - it.center);
      if (d < best) { best = d; idx = i; }
    });
    // never land on a pinned row — nudge to the nearest open row in the direction of travel
    while (idx >= 0 && idx < items.length && items[idx].pinned) idx += draggedCenter > items[idx].center ? 1 : -1;
    if (idx < 0 || idx >= items.length || items[idx].pinned) idx = draggedIdx; // no open row that way — snap back
    targetSlot = idx;

    items.forEach((it, i) => {
      if (it.id === dragId) return;
      if (it.pinned) { it.el.style.transform = ''; return; }
      let shift = 0;
      if (draggedIdx < targetSlot && i > draggedIdx && i <= targetSlot) shift = -1;
      else if (draggedIdx > targetSlot && i >= targetSlot && i < draggedIdx) shift = 1;
      it.el.style.transform = shift ? `translateY(${shift * rowStep}px)` : '';
    });

    maybeAutoScroll();
  }

  function maybeAutoScroll() {
    const nearTop = lastClientY < EDGE_ZONE_PX;
    const nearBottom = lastClientY > window.innerHeight - EDGE_ZONE_PX;
    if (!nearTop && !nearBottom) { cancelAutoScroll(); return; }
    if (scrollRAF) return;
    const step = () => {
      if (!dragging) { cancelAutoScroll(); return; }
      const stillNearTop = lastClientY < EDGE_ZONE_PX;
      const stillNearBottom = lastClientY > window.innerHeight - EDGE_ZONE_PX;
      if (!stillNearTop && !stillNearBottom) { cancelAutoScroll(); return; }
      window.scrollBy(0, stillNearTop ? -EDGE_SCROLL_PX : EDGE_SCROLL_PX);
      tick();
      scrollRAF = requestAnimationFrame(step);
    };
    scrollRAF = requestAnimationFrame(step);
  }

  function cancelAutoScroll() {
    if (scrollRAF) cancelAnimationFrame(scrollRAF);
    scrollRAF = null;
  }

  function onDragCancel() { finishDrag(false); }
  function onDragEnd() { finishDrag(true); }

  function finishDrag(commit) {
    if (!dragging) return;
    dragging = false;
    cancelAutoScroll();

    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragCancel);

    items.forEach(it => { it.el.style.transform = ''; });
    listEl.classList.remove('is-reordering');
    dragTile.classList.remove('is-dragging');
    try { dragTile.releasePointerCapture(pointerId); } catch {}

    // The trailing click (if the browser fires one at all for this gesture) arrives
    // shortly after pointerup/pointercancel — not always, so don't wait forever for it.
    setTimeout(() => document.removeEventListener('click', suppressClick, true), 400);

    const movedId = dragId, slot = targetSlot;
    dragTile = null; dragId = null; items = [];
    if (commit && slot !== draggedIdx) onDrop(movedId, slot);
  }
}
