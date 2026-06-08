// modules/thumbnail.js

const MAX_DIM = 256;
const TARGET_KB = 30;

/**
 * resizeImage(file) -> Promise<string dataURI>
 * Center-crops to square, scales to <=256, JPEG q0.8; retries at 0.6 if > ~30KB.
 */
export function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      // center-crop to square
      let sx, sy, sSize;
      if (w >= h) { sSize = h; sx = (w - h) / 2; sy = 0; }
      else        { sSize = w; sx = 0; sy = (h - w) / 2; }

      const canvas = document.createElement('canvas');
      canvas.width = MAX_DIM; canvas.height = MAX_DIM;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, MAX_DIM, MAX_DIM);

      let q = 0.8;
      let data = canvas.toDataURL('image/jpeg', q);
      if (approxKB(data) > TARGET_KB) {
        q = 0.6;
        data = canvas.toDataURL('image/jpeg', q);
      }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

/** Approx KB of a base64 data URI. */
function approxKB(dataURI) {
  const b64 = dataURI.split(',')[1] || '';
  return (b64.length * 3 / 4) / 1024;
}

/**
 * renderFallbackAvatar(name, color, size=128) -> dataURI
 * Colored circle with the activity's first letter.
 */
export function renderFallbackAvatar(name, color, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color || '#888';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(size * 0.46)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  ctx.fillText(letter, size / 2, size / 2 + size * 0.02);
  return canvas.toDataURL('image/png');
}
