// modules/sync.js

/**
 * syncNow(state, url) -> Promise<{ ok:boolean, error?:string }>
 * POSTs the full payload (activities + logs) as JSON to the Apps Script web app.
 */
export async function syncNow(state, url) {
  if (!url) return { ok: false, error: 'No sync URL set' };
  const payload = {
    activities: state.activities,
    logs: state.logs,
    exportedAt: new Date().toISOString(),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}
