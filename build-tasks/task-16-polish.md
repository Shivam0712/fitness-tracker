<!-- build-task
{
  "id": "task-16",
  "num": 16,
  "slug": "polish",
  "deps": [
    11,
    12,
    13,
    14,
    15
  ],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on (must already be ✅ in PROGRESS.md):** `task-11-*`, `task-12-*`, `task-13-*`, `task-14-*`, `task-15-*`

## TASK 16 — Polish (dark mode, motion, empty states, edge cases)

**Depends on:** TASK 11–15 complete.
**Produces:** edits across `style.css` and small guards in modules. No new files.

This is a pass, not new features. Work the checklist; each item is a small, verifiable change.

### 16.1 Dark mode audit
- Toggle `prefers-color-scheme` in Safari/Chrome dev tools. Every view must render with the dark tokens. Look specifically at: tile borders, hairlines, number-pad keys, modal/sheet backgrounds, calendar dots (activity colors must stay vivid on dark).
- Verify the Settings override (System/Light/Dark) wins over system and persists across reload (`darkModeOverride` in settings).

### 16.2 Motion
- Confirm sheet/panel/modal transitions are 200–300ms with `--ease`. No janky jumps.
- Add `@media (prefers-reduced-motion: reduce)` to disable transforms/opacity transitions:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```
(Append after the APPEND-POINT.)

### 16.3 Empty states (every view)
- Home: "No activities yet. Tap + to start." (done in TASK 10).
- Calendar: a month with no logs simply shows no dots — acceptable; optionally show a subtle hint under the grid: `No entries this month.`
- Accomplishments: each section shows "Nothing yet." (done).
- Raw Log: "No entries." (done). With a filter that excludes everything, also "No entries."

### 16.4 Edge cases (verify each)
1. **Two entries same day** → daily total sums; calendar shows one dot per activity; streak counts the day once.
2. **Edit a log's date across a month boundary** → it moves in Calendar and recomputes streaks (because every edit runs `recalculate`).
3. **Deleted activity** → hidden in Home + not auto-tracked, but logs remain in Calendar + Raw Log (italic) and still feed derived accomplishments.
4. **Color reuse** → delete an activity, create a new one; the freed palette slot is reused (verify via `nextColor`).
5. **Commitment null after reset** → Home tile shows "no active commitment"; Progress segment shows the empty message + can set a new commitment via kebab.
6. **Haptics** on log save, target hit, delete (no-op where unsupported — never throws).
7. **Timezone** → all stored timestamps end with `+HH:MM`/`-HH:MM`; editing preserves offset.
8. **localStorage corruption** → manually set an invalid JSON string at the key; `getState()` returns empty state without throwing.
9. **Number pad cap** at 99999; leading zero guard.
10. **Confirm dialogs** precede every destructive action (delete activity, delete log, reset).

### 16.5 iPhone PWA test
- Add to Home Screen; launch → standalone, no Safari chrome; status bar style correct; safe-area insets respected (nothing under the home indicator or notch).
- Offline: turn on Airplane mode → app works fully; confetti silently no-ops; sync shows an error toast but keeps data.

### 16.6 Verification — TASK 16
Run the entire Verification Checklist in Section "FINAL ACCEPTANCE" below. All must pass.
