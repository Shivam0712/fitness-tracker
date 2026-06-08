// modules/confetti.js
import { haptic } from './ui.js';

let _confetti = null;
let _loading = null;

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
  if (!confetti) return;
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
