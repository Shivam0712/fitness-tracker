# Shared Context (read before any task)

> Every task file references this. It is the authoritative data model, project facts, and conventions. Do not duplicate or fork it.

# 1. PROJECT FACTS (read once, applies everywhere)

- **Root:** `/Users/skpkuma/wd/discipline-page/`
- **Storage key:** `fitness_tracker_v1` (single JSON blob in `localStorage`).
- **No build step.** Plain ES modules served statically. Every import is relative with explicit `.js`.
- **Target:** iPhone Safari, 375–430px wide, add-to-home-screen PWA. Must work fully offline except the manual Google Sheets sync.
- **No frameworks.** Vanilla JS + CSS only.
- **Schema version** is baked into the storage key. If you ever change the shape, bump to `fitness_tracker_v2` and write a migration in `store.js`.

## 1.1 Final file tree (what you will have at the end)

```
discipline-page/
├── index.html
├── style.css
├── manifest.json
├── app.js
├── README.md
├── PROGRESS.md
├── modules/
│   ├── uuid.js
│   ├── store.js
│   ├── streak.js
│   ├── accomplishments.js
│   ├── ui.js
│   ├── numberPad.js
│   ├── thumbnail.js
│   ├── confetti.js
│   ├── sync.js
│   └── views/
│       ├── home.js
│       ├── calendar.js
│       ├── accomplishments.js
│       ├── rawLog.js
│       └── activityDetail.js
├── icons/
│   ├── icon-180.png
│   ├── icon-192.png
│   └── icon-512.png
└── docs/
    ├── fitness-tracker-spec.md
    └── build-plan.md   ← this file
```

---

# 2. DATA MODEL (authoritative — every module conforms to this)

Single object stored at `localStorage["fitness_tracker_v1"]`:

```jsonc
{
  "schemaVersion": 1,
  "activities": [
    {
      "id": "uuid",
      "name": "Pullups",
      "unit": "reps",
      "color": "#E07856",          // assigned from PALETTE on create
      "thumbnail": null,            // null OR "data:image/jpeg;base64,..."
      "createdAt": "2025-01-01T08:00:00+05:30",
      "deleted": false,
      "streakMinimum": 0,           // day total must be >= this to count for streaks; 0 = any entry
      "commitment": {               // may be null after a reset with no new commitment
        "type": "x_in_y",           // "x_in_y" | "x_only" | "y_days" | "open"
        "targetCount": 200,         // present for x_in_y, x_only; null otherwise
        "targetDays": 20,           // present for x_in_y, y_days; null otherwise
        "startedAt": "2025-01-01T08:00:00+05:30",
        "completedAt": null         // set when archived
      },
      "archivedCommitments": [ /* commitment objects with completedAt set */ ]
    }
  ],
  "logs": [
    {
      "id": "uuid",
      "activityId": "uuid",
      "count": 5,                   // integer 1..99999
      "timestamp": "2025-01-01T08:30:00+05:30"
    }
  ],
  "accomplishments": [
    {
      "id": "uuid",
      "type": "target_achieved",    // ONLY target_achieved is persisted; others derived on render
      "activityId": "uuid",
      "value": 200,
      "achievedAt": "2025-01-10T19:00:00+05:30",
      "meta": { "commitmentStartedAt": "2025-01-01T08:00:00+05:30", "targetDays": 20 }
    }
  ],
  "settings": {
    "googleSheetWebhookUrl": "",
    "lastSyncedAt": null,
    "darkModeOverride": null        // null = follow system; true/false = force
  }
}
```

## 2.1 Invariants

- **Deleted activities** keep `deleted:true`; their logs are never removed.
- **Only `target_achieved`** accomplishments are persisted. `longest_streak`, `daily_max`, `overall_max` are derived fresh on every render and never stored.
- **`commitment` can be `null`** after reset until a new one is set. Views must handle null.
- **All timestamps** are ISO-8601 with a local timezone offset (see `nowISO()` in store.js).
- **Counts** are integers, 1..99999. The number pad enforces the cap.

## 2.2 Commitment type → required fields

| type      | targetCount | targetDays | Progress display |
|-----------|-------------|------------|------------------|
| `x_in_y`  | ✅ required  | ✅ required | bar `done/target` + days remaining |
| `x_only`  | ✅ required  | ❌ null     | bar `done/target` |
| `y_days`  | ❌ null      | ✅ required | days elapsed/target + total count |
| `open`    | ❌ null      | ❌ null     | cumulative count only |

---

# 3. SHARED CONVENTIONS

- **Module pattern:** each module exports named functions. No default exports. No globals except the debug hook `window.__test`.
- **Callbacks down, data up:** views receive `(container, state, callbacks)` and never touch `store` directly except through callbacks passed by `app.js`.
- **Rendering:** views fully re-render their container (`container.innerHTML = ...`) then wire events. Simpler than diffing and fast enough for this data size.
- **Dates:** "a day" always means the **local** calendar day derived from the timestamp, computed via `localDayKey(ts)` (defined in streak.js, re-exported where needed).
- **IDs:** always `uuid()` from `modules/uuid.js`.
- **Money/units:** `unit` is free text shown after counts (e.g., "reps", "min", "km").
