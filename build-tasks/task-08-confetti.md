<!-- build-task
{
  "id": "task-08",
  "num": 8,
  "slug": "confetti",
  "deps": [
    5
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-05-*`

## TASK 8 — confetti.js

**Depends on:** TASK 5 (haptic). Lazy-loads canvas-confetti from CDN (the ONLY runtime network dependency besides sync; degrade gracefully offline).
**Produces:** `modules/confetti.js`.

### 8.1 `modules/confetti.js`

```js
// modules/confetti.js
import { haptic } from './ui.js';

let _confetti = null;     // cached module-scope instance
let _loading = null;      // in-flight import promise

const CDN = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.module.mjs';

async function load() {
  if (_confetti) return _confetti;
  if (_loading) return _loading;
  _loading = import(CDN)
    .then(m => { _confetti = m.default || m.create ? (m.default || m) : null; return _confetti; })
    .catch(err => { console.warn('confetti CDN failed (offline?)', err); return null; });
  return _loading;
}

/**
 * celebrate(color) — fire a burst tinted toward the activity color.
 * Safe offline: if the CDN can't load, it just no-ops after the haptic.
 */
export async function celebrate(color = '#E07856') {
  haptic('success');
  const confetti = await load();
  if (!confetti) return; // offline / blocked — silent
  const shots = [
    { particleCount: 60, spread: 55, origin: { y: 0.6 } },
    { particleCount: 40, spread: 80, startVelocity: 45, origin: { y: 0.65 } },
  ];
  const colors = [color, lighten(color, 0.25), '#FFFFFF'];
  shots.forEach((s, i) => setTimeout(() => confetti({ ...s, colors }), i * 120));
}

/** crude hex lighten */
function lighten(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = i => Math.min(255, Math.round(parseInt(m[i], 16) + 255 * amt));
  return `#${[ch(1),ch(2),ch(3)].map(x=>x.toString(16).padStart(2,'0')).join('')}`;
}
```

> The `#confetti-canvas` element exists in index.html but canvas-confetti creates its own canvas by default; the element is a reserved hook if you later switch to `confetti.create(canvasEl,...)`. Default global mode is fine for v1.

### 8.2 Verification — TASK 8

```js
const { celebrate } = await import('./modules/confetti.js');
celebrate('#7CA982'); // burst appears (online). Offline: no error, just the haptic.
```
