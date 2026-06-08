<!-- build-task
{
  "id": "task-01",
  "num": 1,
  "slug": "scaffold",
  "deps": [],
  "common": "_common.md"
}
-->

> **Before you start:** read `_common.md` in this folder. It is the shared data model and conventions for the whole app.
>
> **Depends on:** nothing — this is a root task.

## TASK 1 — Scaffold (icons, manifest, index.html, base CSS)

**Depends on:** nothing.
**Produces:** `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png`, `manifest.json`, `index.html`, `style.css` (base only).

### 1.1 Icons

Generate three solid placeholder PNGs with the app's accent. Run from repo root:

```bash
mkdir -p icons
# Requires ImageMagick. If unavailable, create any solid-color PNGs of these exact sizes.
magick -size 180x180 xc:'#E07856' icons/icon-180.png
magick -size 192x192 xc:'#E07856' icons/icon-192.png
magick -size 512x512 xc:'#E07856' icons/icon-512.png
```

If ImageMagick is not installed, generate them with Node + a 1x1 upscale, or hand-place any square PNGs of sizes 180, 192, 512. They only need to exist and be square; replace with a real icon later.

### 1.2 `manifest.json`

```json
{
  "name": "Fitness Tracker",
  "short_name": "Fitness",
  "description": "Personal fitness tracker — activities, streaks, commitments.",
  "start_url": "./index.html",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FAFAF7",
  "theme_color": "#FAFAF7",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 1.3 `index.html`

The shell: meta tags for PWA, view containers (one per tab, all but home start `.hidden`), bottom nav, and overlay host divs for sheets/modals/toasts. The single module script tag at the bottom bootstraps everything.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
  <meta name="theme-color" content="#FAFAF7" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0E0E0C" media="(prefers-color-scheme: dark)" />

  <!-- iOS PWA -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Fitness" />
  <link rel="apple-touch-icon" href="icons/icon-180.png" />
  <link rel="manifest" href="manifest.json" />

  <title>Fitness Tracker</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <!-- ===== App root ===== -->
  <div id="app">
    <!-- View containers. Home visible by default; others hidden. -->
    <main id="view-root">
      <section id="view-home"            class="view"></section>
      <section id="view-calendar"        class="view hidden"></section>
      <section id="view-accomplishments" class="view hidden"></section>
      <section id="view-rawlog"          class="view hidden"></section>
    </main>

    <!-- ===== Bottom navigation ===== -->
    <nav id="bottom-nav" aria-label="Primary">
      <button class="nav-btn is-active" data-view="home" aria-label="Home">
        <span class="nav-icon">⌂</span><span class="nav-label">Home</span>
      </button>
      <button class="nav-btn" data-view="calendar" aria-label="Calendar">
        <span class="nav-icon">▦</span><span class="nav-label">Calendar</span>
      </button>
      <button class="nav-btn" data-view="accomplishments" aria-label="Wins">
        <span class="nav-icon">★</span><span class="nav-label">Wins</span>
      </button>
      <button class="nav-btn" data-view="rawlog" aria-label="Log">
        <span class="nav-icon">≣</span><span class="nav-label">Log</span>
      </button>
    </nav>
  </div>

  <!-- ===== Overlay hosts (filled by ui.js / numberPad.js) ===== -->
  <div id="sheet-host"   class="overlay-host" aria-hidden="true"></div>
  <div id="modal-host"   class="overlay-host" aria-hidden="true"></div>
  <div id="toast-host"   aria-live="polite"></div>
  <canvas id="confetti-canvas" aria-hidden="true"></canvas>

  <script type="module" src="app.js"></script>
</body>
</html>
```

### 1.4 `style.css` — base only

This task writes ONLY the design tokens, reset, layout scaffolding, nav, and `.hidden`. Component CSS is appended by later tasks (each component task says exactly what CSS to add). Put a clear marker comment so later tasks know where to append.

```css
/* =========================================================
   FITNESS TRACKER — style.css
   Section 1: TOKENS  (TASK 1)
   ========================================================= */
:root {
  /* chrome colors — light */
  --bg:            #FAFAF7;
  --surface:       #FFFFFF;
  --text:          #1A1A1A;
  --text-2:        #6B6B68;
  --border:        rgba(0,0,0,0.06);
  --hairline:      rgba(0,0,0,0.10);
  --shadow-float:  0 4px 24px rgba(0,0,0,0.08);
  --nav-blur-bg:   rgba(250,250,247,0.72);

  /* spacing scale — use ONLY these */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-6: 24px; --sp-8: 32px; --sp-12: 48px; --sp-16: 64px;

  /* radii */
  --r-card: 16px; --r-btn: 12px; --r-pill: 999px;

  /* type scale */
  --fs-13: 13px; --fs-15: 15px; --fs-17: 17px; --fs-22: 22px; --fs-34: 34px;

  /* motion */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --dur:  240ms;

  /* safe areas */
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);

  --nav-height: 60px;

  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:           #0E0E0C;
    --surface:      #1A1A18;
    --text:         #F5F5F2;
    --text-2:       #9B9B98;
    --border:       rgba(255,255,255,0.08);
    --hairline:     rgba(255,255,255,0.12);
    --shadow-float: 0 4px 24px rgba(0,0,0,0.40);
    --nav-blur-bg:  rgba(14,14,12,0.72);
  }
}
/* Manual override hooks (set on <html> by app.js when settings.darkModeOverride != null) */
html[data-theme="light"] { color-scheme: light; }
html[data-theme="dark"]  { color-scheme: dark; }

/* =========================================================
   Section 2: RESET + LAYOUT  (TASK 1)
   ========================================================= */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-size: var(--fs-17);
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
}
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
img { display: block; max-width: 100%; }

#app { min-height: 100%; display: flex; flex-direction: column; }

#view-root {
  flex: 1;
  padding-top: var(--safe-top);
  padding-bottom: calc(var(--nav-height) + var(--safe-bottom) + var(--sp-4));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.view { padding: var(--sp-4); max-width: 480px; margin: 0 auto; }
.hidden { display: none !important; }

/* =========================================================
   Section 3: BOTTOM NAV  (TASK 1)
   ========================================================= */
#bottom-nav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  height: calc(var(--nav-height) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  display: grid; grid-template-columns: repeat(4, 1fr);
  background: var(--nav-blur-bg);
  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
  border-top: 1px solid var(--hairline);
}
.nav-btn {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; min-height: 44px; color: var(--text-2);
  transition: color var(--dur) var(--ease);
}
.nav-btn.is-active { color: var(--text); }
.nav-icon  { font-size: 20px; line-height: 1; }
.nav-label { font-size: 11px; font-weight: 500; }

/* component CSS appended below by later tasks ↓↓↓ */
/* === APPEND-POINT === */
```

> **Note for later tasks:** append your component CSS *after* the `=== APPEND-POINT ===` marker. Never edit the tokens block except in TASK 16 if a token is genuinely missing.

### 1.5 Verification — TASK 1

1. Serve the folder: `python3 -m http.server 8000` then open `http://localhost:8000`.
2. Page loads with **zero console errors** (the module script will 404 on `app.js` until TASK 11 — temporarily create an empty `app.js` containing `// placeholder` to keep the console clean, or accept the single 404 and note it). Recommended: create `app.js` with `console.log('boot');` placeholder now; TASK 11 overwrites it.
3. Bottom nav shows 4 items; Home highlighted; tapping does nothing yet (wired in TASK 11).
4. Toggle dark mode in browser dev tools (Rendering → emulate prefers-color-scheme) — background flips warm-white ↔ near-black.
5. `manifest.json` validates (DevTools → Application → Manifest shows name + icons, no errors).
