<!-- build-task
{
  "id": "task-09",
  "num": 9,
  "slug": "sync",
  "deps": [
    2
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-02-*`

## TASK 9 — sync.js

**Depends on:** TASK 2 (state shape). Network call only to the user's Apps Script URL.
**Produces:** `modules/sync.js`.

### 9.1 `modules/sync.js`

```js
// modules/sync.js

/**
 * syncNow(state, url) -> Promise<{ ok:boolean, error?:string }>
 * POSTs the full payload (activities + logs) as JSON to the Apps Script web app.
 * Apps Script writes two tabs: activities, logs. We use no-cors-safe simple request:
 *   - Content-Type text/plain to avoid CORS preflight (Apps Script accepts e.postData.contents).
 * On the client we cannot read the response body under no-cors; instead we POST with cors
 * and let Apps Script return JSON. If CORS blocks reading, we treat a network-level success
 * as success. Simplest robust approach: use mode 'cors' and catch.
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
      // text/plain avoids a CORS preflight; Apps Script reads e.postData.contents
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    // Apps Script often 302-redirects to script.googleusercontent.com; redirect:follow handles it.
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    // body may or may not be readable depending on CORS; don't require it
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}
```

### 9.2 Verification — TASK 9

Without a real URL: `syncNow(state, '')` → `{ok:false,error:'No sync URL set'}`. Full end-to-end is verified in TASK 18 after the Apps Script is deployed (Acceptance #9).
