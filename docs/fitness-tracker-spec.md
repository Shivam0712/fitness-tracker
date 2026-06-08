# Fitness Tracker — Build Spec v1

A personal fitness tracking webpage hosted on GitHub Pages. Tracks activities, commitments, streaks, and accomplishments. Optimised for iPhone Safari with "Add to Home Screen" support.

---

## 1. Tech Stack

- **Frontend:** Single-page HTML + vanilla JavaScript + CSS (no frameworks required; use one if it stays lightweight and the bundle is committed).
- **Storage:** `localStorage` (primary) + Google Sheets sync (manual backup).
- **Hosting:** GitHub Pages (static).
- **Target device:** iPhone Safari (must be mobile-first, touch-friendly, add-to-home-screen compatible — include a web app manifest and Apple touch icons).

---

## 2. Data Model

Store the following in `localStorage` as a single JSON object under key `fitness_tracker_v1`:

```json
{
  "activities": [
    {
      "id": "uuid",
      "name": "Pullups",
      "unit": "reps",
      "color": "#hex",
      "thumbnail": "data:image/jpeg;base64,...", 
      "createdAt": "ISO timestamp",
      "deleted": false,
      "streakMinimum": 0,
      "commitment": {
        "type": "x_in_y" | "x_only" | "y_days" | "open",
        "targetCount": 200,
        "targetDays": 20,
        "startedAt": "ISO timestamp",
        "completedAt": null
      },
      "archivedCommitments": [ /* same shape, with completedAt set */ ]
    }
  ],
  "logs": [
    {
      "id": "uuid",
      "activityId": "uuid",
      "count": 5,
      "timestamp": "ISO timestamp"
    }
  ],
  "accomplishments": [
    {
      "id": "uuid",
      "type": "longest_streak" | "daily_max" | "target_achieved" | "overall_max",
      "activityId": "uuid",
      "value": 200,
      "achievedAt": "ISO timestamp",
      "meta": { /* type-specific extras, e.g. days streak length */ }
    }
  ],
  "settings": {
    "googleSheetWebhookUrl": "",
    "lastSyncedAt": null
  }
}
```

**Important:**
- Deleted activities have `deleted: true` but logs are preserved.
- Logs reference `activityId` regardless of deletion state.
- Use UUIDs (any standard generator) for IDs.

---

## 3. Color Auto-Assignment

Maintain a fixed palette of ~12 distinct colors. On activity creation, assign the next unused color. If all are used, cycle back. Colors must remain visually distinct on white background and on calendar dots.

---

## 4. Core Features

### 4.1 Create Activity
Inputs: name, unit (text), commitment type, streak minimum (optional, default 0), **thumbnail (optional)**.

**Thumbnail upload:**
- Tap "Add image" → opens iPhone photo library / camera (`<input type="file" accept="image/*">`).
- Client-side resize to max 256×256 px, compress to JPEG ~80% quality (use `canvas` API).
- Store as base64 data URI in `thumbnail` field. Target size ≤30KB per image.
- If no thumbnail uploaded, fall back to a colored circle with the activity's first letter (using assigned color).
- User can replace or remove thumbnail later via Edit Activity.

Commitment types — show/hide fields accordingly:
- **X reps in Y days** — `targetCount` + `targetDays`
- **X reps** — `targetCount` only
- **Y days** — `targetDays` only
- **Open** — neither

`startedAt` = creation time.

### 4.2 Log Entry (low-friction, primary action)
Flow:
1. Tap activity tile (View 1) → number pad opens.
2. Enter count → tap Save.
3. `timestamp` = now. Entry saved.

Must take ≤3 taps and ≤2 seconds.

### 4.3 Edit Log Entry
From Raw Log (View 4) or Activity Detail Log sub-view:
- Editable: date, time, count.
- Delete entry allowed.

### 4.4 Delete Activity
From View 1, swipe / long-press / kebab menu → confirm.
- Marks `deleted: true`.
- Logs remain in Raw Log (View 4) and Calendar (View 2).
- No longer appears in View 1 or Accomplishments target tracking.

### 4.5 Reset Commitment (target achieved)
When user taps "Reset" on a completed commitment:
- Move current `commitment` into `archivedCommitments`, set `completedAt`.
- Auto-generate "Target Achieved" accomplishment.
- Activity remains in View 1 with the new state (no active commitment) until a new commitment is set or it's deleted.

### 4.6 Celebrate
When current commitment's `targetCount` is reached:
- Confetti animation (use a small lib like `canvas-confetti` via CDN).
- Popup: "🎉 Target hit! Reset to start over."
- Auto-create accomplishment (`type: "target_achieved"`).

---

## 5. Main Views (4 tabs)

### View 1 — Active Commitments (home)
- List of all non-deleted activities, one tile each.
- Each tile shows:
  - Activity name + color accent (dot or left border).
  - **Progress display by commitment type:**
    - `x_in_y` → progress bar with `done/target` + days remaining.
    - `x_only` → progress bar with `done/target`.
    - `y_days` → days elapsed / target days + total count so far.
    - `open` → just the cumulative count.
  - Quick log button (primary CTA on the tile).
- Tap tile → opens Activity Detail.
- "+" button → Create Activity.

### View 2 — Calendar
- Monthly calendar grid.
- Each day shows colored dots — one per activity performed that day.
- Tap a day → modal listing entries (activity, count) for that day.
- Month navigation (prev/next).

### View 3 — Accomplishments
Grouped sections:
- **Longest Streak** — top streak per activity (descending).
- **Daily Max** — highest single-day total per activity.
- **Targets Achieved** — list of all completed commitments.
- **Overall Max** — single best entry per activity (note: cross-activity comparison isn't meaningful because units differ; show per-activity max instead).

### View 4 — Raw Log
- Table: Date, Time, Activity (with color dot), Count, Unit.
- Sortable by date (default: newest first).
- Filterable by activity (multi-select).
- Includes logs from deleted activities (marked subtly, e.g., italic name).
- Tap row → edit modal.

---

## 6. Activity Detail (3 sub-views, toggle at top)

### 6.1 Progress
- Big progress visualization based on commitment type.
- Show `done / total`, % complete, days elapsed, days remaining.

### 6.2 Streak
- Calendar view (this activity only) — ticks on days the activity was performed (and met `streakMinimum` if set).
- Stats below:
  0. Last performed on (date)
  1. Longest streak (days)
  2. Frequency of 2-day streaks
  3. Frequency of 3-day streaks
  4. Frequency of 4-day streaks
  - …continue descending until 0 occurrences.

**Streak definition:** consecutive calendar days where the day's total count ≥ `streakMinimum` (default 0 means any entry counts). A "frequency of N-day streak" = number of distinct streak runs of *exactly* length N.

### 6.3 Log (detailed entries for this activity)
- Columns: Date, Time, Count, Cumulative Count.
- Cumulative resets on each new commitment (archived commitments shown in collapsed sections).
- Tap row → edit.

---

## 7. Accomplishments Logic

Recalculate accomplishments on every log write/edit/delete. Keep computation client-side and idempotent.

- **Longest Streak** — per activity, max consecutive-day run.
- **Daily Max** — per activity, max sum of counts in a single day.
- **Target Achieved** — created on reset.
- **Overall Max** — per activity, max single-entry count.

Don't persist as static records — derive from logs on render, except `target_achieved` which is event-based.

---

## 8. Google Sheets Sync

### Setup (one-time, documented in README)
1. User creates Google Sheet.
2. User adds Apps Script with `doPost(e)` that appends rows.
3. User deploys as Web App → gets URL.
4. User pastes URL into Settings inside the app.

### Sync behavior
- Manual only: "Sync now" button in Settings.
- Sends full payload (activities + logs) as JSON.
- Apps Script writes/overwrites two tabs: `activities` and `logs`.
- On success: update `settings.lastSyncedAt`, show toast "Synced ✓".
- On failure: show error toast, keep local data intact.

### Sample Apps Script (include in README)
Provide a copy-paste-ready Apps Script snippet so user can set this up in ~10 min.

---

## 9. UI/UX Requirements

### 9.1 Design Philosophy
**Minimalist but a treat for the eye.** Calm, confident, restrained. The interface should feel like a premium iOS app — not a generic web form.

- **White space is a feature.** Generous padding, no clutter.
- **Typography does the heavy lifting.** Strong hierarchy with size + weight, not borders.
- **Color is meaningful, not decorative.** Activity colors are the only saturated hues. Everything else is neutral.
- **Motion is subtle.** Smooth transitions (200–300ms ease), spring physics on key interactions, never flashy.
- **No skeuomorphism, no heavy shadows, no gradients in chrome.** Flat with depth created via whitespace and subtle layering.

### 9.2 Visual System

**Typography**
- System font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui`.
- Scale: 13 / 15 / 17 / 22 / 34 px.
- Weights: 400 (body), 500 (labels), 600 (titles), 700 (hero numbers).
- Big numbers (counts, progress) at 34px/700 — make them the hero.

**Color palette (chrome)**
- Background: `#FAFAF7` (light) / `#0E0E0C` (dark) — warm off-white / near-black, not pure.
- Surface: `#FFFFFF` (light) / `#1A1A18` (dark).
- Text primary: `#1A1A1A` / `#F5F5F2`.
- Text secondary: `#6B6B68` / `#9B9B98`.
- Border: `rgba(0,0,0,0.06)` / `rgba(255,255,255,0.08)` — barely-there hairlines.

**Activity color palette (12 distinct, muted-vivid)**
Use tasteful, slightly desaturated hues — not crayon colors. Examples:
`#E07856` `#D4A373` `#A4B494` `#7CA982` `#6B9080` `#5C8D89` `#7B8FA1` `#8E7CC3` `#B47AB0` `#C77DA0` `#D88C9A` `#A38B7A`.
(Final palette to be tuned in build — these are direction-setting.)

**Spacing scale**
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 — stick to these only.

**Corners**
- Cards / tiles: 16px.
- Buttons: 12px (or full-pill for primary CTAs).
- Thumbnails: 12px (square) or full-circle (avatar style).

**Elevation**
- No drop shadows by default. Use a 1px hairline border instead.
- Floating elements (modals, FAB) get a single soft shadow: `0 4px 24px rgba(0,0,0,0.08)`.

### 9.3 Component Style Notes

**Activity tile (View 1)**
- Square or wide card with thumbnail at top (or left for compact rows).
- Big name below, secondary text muted, activity color as a thin accent bar or progress bar fill.
- Progress bar: 6px tall, rounded, subtle track, colored fill.
- Quick-log button: a circular `+` in the bottom-right of the tile, primary CTA styling.

**Bottom nav**
- 4 icons + label, 60px tall, hairline top border, blurred translucent background (`backdrop-filter: blur(20px)`).
- Active state: filled icon + activity color (use a neutral accent like `#1A1A1A` for chrome consistency).

**Calendar**
- Clean grid, no heavy lines. Days as numbers only.
- Activity dots: 6px circles, max 4 visible per day, "+N" if more.
- Today: subtle filled circle behind the number.

**Number pad (log entry)**
- Full-width sheet that slides up from bottom.
- Big display showing the count being typed.
- Custom on-screen number pad — feels native, not a system keyboard.
- Single primary "Save" button at bottom.

**Empty states**
- Centered, soft illustration or single icon + one-line copy + a CTA. No walls of text.

**Confetti celebration**
- Trigger `canvas-confetti` with the activity's color in the burst.
- Modal overlay: blurred backdrop, single-line "🎯 Target hit", count, "Reset" + "Later" buttons.

### 9.4 Mobile & PWA

- **Mobile-first.** Designed for iPhone Safari, 375–430px wide.
- **Bottom nav bar** for the 4 main views (icons + label).
- **Touch targets ≥44px.**
- **Number pad** for count input (custom UI, not system keyboard).
- **Dark mode** auto via `prefers-color-scheme`. Both modes must feel equally polished.
- **No external fonts required** — use system fonts.
- **Haptic feedback** on key actions (log save, target hit, delete) where supported.
- **iOS PWA-ready:**
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
  - Apple touch icon (180×180).
  - `manifest.json` with name, short_name, theme_color, icons.

---

## 10. Edge Cases & Rules

- Two entries same day → counted as 2 separate logs; daily total = sum.
- Editing a log's date can change which day a streak day belongs to — recalculate streaks on every edit.
- Deleted activity → its logs stay in Raw Log + Calendar; excluded from View 1 + active accomplishment targets.
- Empty state on every view (e.g., "No activities yet. Tap + to start.").
- Confirm destructive actions (delete activity, delete log, reset).
- All timestamps stored in ISO 8601 (local timezone offset preserved).
- App must work fully offline (no network calls except Google Sheets sync).
- localStorage quota ~5MB — sufficient for years of data.

---

## 11. Repo & Deployment

- Single repo with `index.html`, `style.css`, `app.js`, `manifest.json`, `icons/`.
- Optional: split JS into modules if it improves readability.
- README must cover:
  - How to fork and enable GitHub Pages.
  - How to set up Google Sheets sync (with Apps Script snippet).
  - How to add to iPhone Home Screen.

---

## 12. Acceptance Criteria

The build is complete when:

1. User can create an activity with any of the 4 commitment types.
2. Logging an entry takes ≤3 taps from the home view.
3. All 4 main views render correctly with sample data.
4. Activity Detail toggles between Progress / Streak / Log.
5. Streak frequencies compute correctly (verify with a known dataset).
6. Target hit triggers confetti + accomplishment creation.
7. Reset archives commitment, preserves history, lets user set a new commitment.
8. Delete activity hides it from View 1 but logs persist in Raw Log + Calendar.
9. Manual sync to Google Sheets works end-to-end given a valid Apps Script URL.
10. App is installable to iPhone Home Screen and launches in standalone mode.
11. Data persists across browser restarts.
12. All destructive actions require confirmation.
13. Activity thumbnails upload, resize, and persist correctly; fallback (colored initial) renders cleanly when no thumbnail.
14. Visual polish: typography hierarchy, spacing scale, and color system match spec §9. App feels native to iOS, not webby.

---

## 13. Out of Scope (v1)

- Multi-device sync without manual button press.
- Notifications / reminders.
- Multiple active commitments per activity.
- Logging into past dates (only edit-after-the-fact).
- Social / sharing.
- Charts beyond progress bars and the calendar.

---

**End of spec.** Hand this to the build agent.
