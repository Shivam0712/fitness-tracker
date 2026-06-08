<!-- build-task
{
  "id": "task-18",
  "num": 18,
  "slug": "readme",
  "deps": [
    16,
    17
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-16-*`, `task-17-*`

## TASK 18 — README + Google Apps Script + deployment

**Depends on:** everything.
**Produces:** `README.md`. Also the final end-to-end sync test (Acceptance #9).

### 18.1 `README.md` (write this file verbatim, adjusting the repo URL)

````markdown
# Fitness Tracker (PWA)

A personal, offline-first fitness tracker. Vanilla JS + CSS, no build step, hosted on GitHub Pages. Optimised for iPhone Safari with Add-to-Home-Screen.

## Run locally
```bash
python3 -m http.server 8000
# open http://localhost:8000
# debug/seed: http://localhost:8000/?debug=1  then run window.__test.seed() in the console
```

## Deploy to GitHub Pages
1. Fork or push this repo to GitHub.
2. Repo → **Settings → Pages**.
3. **Source:** Deploy from a branch. **Branch:** `main` / root. Save.
4. Wait ~1 min; your app is at `https://<you>.github.io/<repo>/`.

> All module imports are relative with explicit `.js`, so they work under the project subpath GitHub Pages uses.

## Add to iPhone Home Screen
1. Open the Pages URL in **Safari** (not Chrome — only Safari installs PWAs on iOS).
2. Tap **Share → Add to Home Screen → Add**.
3. Launch from the new icon — it opens standalone (no browser chrome).

## Google Sheets sync (optional backup)
1. Create a Google Sheet.
2. **Extensions → Apps Script**, paste the script below, save.
3. **Deploy → New deployment → Web app.** Execute as **Me**; Who has access **Anyone**. Deploy and **copy the Web App URL**.
4. In the app: **Wins tab → ⚙ → paste URL → Save → Sync now**.
5. Two tabs (`activities`, `logs`) are written/overwritten on each sync.

### Apps Script (`Code.gs`)
```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  writeTab(ss, 'activities', data.activities, [
    'id','name','unit','color','createdAt','deleted','streakMinimum',
    'commitmentType','targetCount','targetDays','startedAt','completedAt'
  ], function(a){
    var c = a.commitment || {};
    return [a.id,a.name,a.unit,a.color,a.createdAt,a.deleted,a.streakMinimum,
            c.type||'',c.targetCount||'',c.targetDays||'',c.startedAt||'',c.completedAt||''];
  });
  writeTab(ss, 'logs', data.logs, ['id','activityId','count','timestamp'],
    function(l){ return [l.id,l.activityId,l.count,l.timestamp]; });
  return ContentService.createTextOutput(JSON.stringify({ok:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function writeTab(ss, name, rows, headers, mapFn) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.appendRow(headers);
  (rows || []).forEach(function(r){ sh.appendRow(mapFn(r)); });
}
```

> Note: the app sends the POST with `Content-Type: text/plain` to avoid a CORS preflight; Apps Script reads the body from `e.postData.contents`. Under CORS the browser may not read the response body — the app treats a completed request as success and updates "Last synced".

## Data & privacy
- All data lives in your browser's `localStorage` under `fitness_tracker_v1`.
- Nothing leaves your device except the manual Google Sheets sync you set up.
- Clearing Safari data erases the app's data — sync first if you want a backup.

## Project structure
See `docs/build-plan.md` for the full module map and build order.
````

### 18.2 Verification — TASK 18 (Acceptance #9, end-to-end)
1. Deploy the Apps Script as above; copy the Web App URL.
2. In the app, paste it in Settings, tap **Sync now**.
3. Confirm toast **Synced ✓** and that "Last synced" updates.
4. Open the Google Sheet: `activities` and `logs` tabs are populated and overwrite on a second sync.
5. On failure (bad URL), confirm an error toast and that local data is untouched.
