# Portfolio audit — 17 Aug 2026

Findings from a full read of `src/`, `public/`, the `gh-pages` branch, and the
deployed `/recollection` copy. Ordered by severity. ✅ = fixed in this pass.

Context: the site is a CRA app on `master`, built to `build/`, deployed to the
`gh-pages` branch via `npm run deploy`. **`gh-pages` also hosted `recollection/`**
— a hand-copied snapshot of `best/faith/journal-app/` — which was *not* part of
the CRA build.

---

## A. Deployment — would have lost data

| # | Finding | Status |
|---|---|---|
| A1 | **`npm run deploy` would have deleted `/recollection` from the live site.** `gh-pages@6` defaults to `add: false, remove: '.'` — it wipes the branch and copies `build/` in. `recollection/` existed only on `gh-pages`, so the next deploy would have silently removed it and the URL would 404. Verified in `node_modules/gh-pages/lib/index.js:39,46`. | ✅ `scripts/sync-recollection.mjs` builds it into `public/recollection/`, which CRA copies into `build/`. It is now part of every deploy and cannot be orphaned. |
| A2 | No `.nojekyll` on `gh-pages`. GitHub Pages runs Jekyll, which ignores paths starting with `_`. Nothing broke yet; latent trap. | ✅ `public/.nojekyll` added, and `deploy` now passes `--dotfiles` so gh-pages actually publishes it. |
| A3 | Deployed `recollection/saints-data.js` was **stale** — saints added in `best/` since the 15 Aug deploy never reached the site. Sync was a manual `cp`. | ✅ `npm run build` re-syncs from source every time (`prebuild` hook). |

## B. Correctness bugs

| # | Finding | Status |
|---|---|---|
| B1 | **Header overlapped the page.** `Header.js` commented out `position="static"`, so MUI `AppBar` fell back to `position: fixed` and sat on top of the first ~64px of every page. | ✅ |
| B2 | **The Google Fonts `@import` was dead.** `App1.css:243` placed `@import url(…Space+Mono…)` *after* other rules; CSS requires `@import` first, so browsers dropped it and `font-family: 'Space Mono', monospace` fell back to generic monospace site-wide. A large part of why it looked unstyled. | ✅ Rule and the whole webfont dependency removed; typography is theme-driven. |
| B3 | **Two conflicting `body` rules in one file.** `App1.css:78` set an Ubuntu Mono stack; `App1.css:245` overrode it and added `display:flex`, `padding:32px`, `margin:60px auto`, `border`, `box-shadow` — wrapping the entire app in an unintended bordered card and undoing `index.css`'s `margin: 0`. | ✅ |
| B4 | `Layout.js` — `classname="card"` (lowercase `n`). Class never applied; React logged a warning. | ✅ |
| B5 | `Layout.js` — `lexGrow: 1`, a typo for `flexGrow`. Silently ignored. | ✅ |
| B6 | `App1.css` — `position: center` is not valid CSS. | ✅ |
| B7 | `Header.js` — `<Typography variant="body">`; no such MUI variant (only `body1`/`body2`). | ✅ |
| B8 | `Header.js` — `cornerRadius: '0.5px'` is not a CSS property. | ✅ |
| B9 | `extracurricularItems.js` had **no `export`**, but `pages/extracurricular.js` default-imported it. Latent crash, masked only because the page had no route. | ✅ Named export; the content is now rendered on the Achievements page. |
| B10 | `Layout.js` — two `Box`es with `width: '10%'` and a grey background, siblings of a non-flex `div`. Rendered as full-width grey strips above and below the content, not gutters. | ✅ Removed. |
| B11 | `about.js` — `<Grid item xs={12} md={4}>` with 4 items = 16 columns, so the row wrapped 3 + 1. | ✅ `md={3}`. |
| B12 | `Header.js` — `handleClose` reached into `menu2.children[2]` to find MUI's popover paper. Hard-coded index into library internals. Plus three `console.log`s shipping to production. | ✅ Rewritten with `onMouseLeave` on the menu paper. |
| B13 | `Header.js` — a `<Menu>` was mounted for every nav item, including the four with no submenu. | ✅ |
| B14 | **Home was always marked as the current page.** The active check was `location.pathname.includes(item.url)`, and `item.url` for Home was `'/'` — a substring of every path. | ✅ Exact/prefix match. |
| B15 | **Submenu links were relative.** `menuItems.js` used `url: 'p/achievements'` (no leading slash); react-router v6 resolves relative `to` against the *current* route, so from `/cv` it pointed at `/cv/p/achievements`. | ✅ Absolute paths. |
| B16 | `TicTacToe.js` — if Pyodide failed to load, the promise rejected unhandled and the demo sat on "Loading Pyodide..." forever with no explanation. Also 8 `console.log`s per move. | ✅ Error state + logs removed. |
| B17 | `TicTacToe.js` — board squares were `color: 'black'` on a `contained primary` button. Unreadable once primary became deep navy. | ✅ |

## C. Content / copy

| # | Finding | Status |
|---|---|---|
| C1 | `public/index.html` — `<title>React App</title>`. The browser tab title and the Google result title for the whole site. | ✅ |
| C2 | `public/index.html` — `<meta name="description" content="Web site created using create-react-app">`. The search-result snippet. | ✅ Real description + Open Graph tags. |
| C3 | `achievements.js` — **"Achievemic Achievements"**, rendered as the page `<h1>`. | ✅ |
| C4 | `cv.js` — the CV page (a top-level nav item, and the first thing a recruiter clicks) said "I'll upload my CV soon" and linked to Contact. Dead end. | ✅ Now summarises the dissertation, links to the PDF that was already sitting in `public/documents/`, and to projects/achievements. A real CV PDF still needs adding. |
| C5 | `pages/skills.js` — unrouted placeholder reading *"Holla!, esto seems to ser the Case Tab?!"*, still in the bundle. | ✅ Deleted. |
| C6 | `home.js` — "Welcome to My Portfolio!" over a stock background. No name, no what-I-do, no next action. | ✅ |
| C7 | `public/manifest.json` — CRA defaults (`short_name: "React App"`). | ✅ |
| C8 | Favicon and `logo192/512.png` are still the stock React logo. | ☐ **Not fixed** — needs an actual image from you. |
| C9 | No 404 route: an unknown hash path rendered a blank page under the header. | ✅ `pages/notFound.js`. |

## D. Performance / security

| # | Finding | Status |
|---|---|---|
| D1 | **Pyodide was loaded on every page.** `public/index.html` pulled the full CPython-in-WASM runtime from jsDelivr in `<head>`, blocking, on the home page — for a tic-tac-toe demo on one project page. | ✅ `TicTacToe.js` injects it on mount, once. |
| D2 | `projectItems.js` — two `target="_blank"` links without `rel="noopener noreferrer"` (reverse tabnabbing). | ✅ |
| D3 | `projectItems.js` — `<iframe>` with no `title`. | ✅ |
| D4 | `menuItems.js` — unused `SvgIconProps` import (a TS type in a JS file). | ✅ |
| D5 | `index.js` imported three `.ttf` files and a `.png` purely as side effects; nothing referenced them, but they were bundled. | ✅ |
| D6 | `react-scripts@^3.0.1` (2019) forces `--openssl-legacy-provider`. Builds fine today, four majors behind. | — Out of scope, deliberately. |

The production build now compiles with **zero warnings** (was 4).

## E. Theme

| # | Finding | Status |
|---|---|---|
| E1 | Unedited MUI default palette: `#1976d2` blue + `#ff4081` pink on `#f4f6f8`. No relationship to Recollection; read as a framework demo. | ✅ Navy `#0f1b2d` + gold `#d4a847` on warm ivory `#faf8f3`, sharing Recollection's two anchor colours. |
| E2 | Four competing font stacks — `index.css` (system), `App1.css` (Ubuntu Mono, then Space Mono), `theme.js` (Roboto). Whichever won was accidental. | ✅ One stack: Palatino serif headings, system sans body. |
| E3 | `sx={{mb:4, p:4, borderRadius:2, boxShadow:3}}` copy-pasted onto a Container in six page files. | ✅ One `PageSurface` component. |
| E4 | Hard-coded colours bypassing the theme: `#f9f9f9`, `#ecf2fa`, `#f1f1f1`, inline `#1976d2`. | ✅ |
| E5 | `home.js` — `featuredIndices = [6, 4, 0, 1]`, magic positional indices into `projectItems`; reordering the array silently changed the front page. | ✅ `featured: true` on the items themselves (same four projects). |
| E6 | The centred column was a CSS class (`.card`) that pages then tried to override with `sx`, making the result depend on stylesheet ordering. | ✅ `contentColumn` exported from `theme.js`. |

## F. Recollection (source in `best/faith/journal-app/`)

| # | Finding | Status |
|---|---|---|
| F1 | **`RECOLLECTION_PUBLIC_MODE` was never set on the hosted copy.** `app.js:127` exists specifically to hide the Journal tab on public builds — journal entries go to the *visitor's* `localStorage` and are stranded there. The deployed copy was a straight file copy, so the public site offered strangers a journal that goes nowhere. | ✅ The sync script injects the flag. **See the note below — reversible if you'd rather journal at the live URL.** |
| F2 | ~~The live app calls Google on every load.~~ **Wrong — retracted.** The `gsi/client`, `config.js`, `auth.js` and `drive.js` tags are inside an HTML comment (`index.html:487-492`), parked for a future switch to Drive sync. No request is made. The public build now drops that comment block entirely, since those files aren't deployed. | ✅ (no bug) |
| F3 | `sw.js` `SHELL_FILES` omitted `saints-geo.js` (~135 KB), so the Saints map had no coordinate data offline even though the rest of the shell was cached. | ✅ Fixed in the source app *and* in the public build; `CACHE_NAME` bumped so existing installs refresh. |
| F4 | `sw.js`'s header comment described Drive-API behaviour that `LOCAL_MODE` no longer does. | ✅ |
| F5 | The Recollection gate already linked back (`<a href="../">Back to portfolio</a>`) — but there was **no link forward** from the portfolio. The connection was one-way. | ✅ `RecollectionDoor` — see below. |

---

## The door

`src/components/RecollectionDoor.js`. A discreet **"Are you Catholic?"** trigger
that opens a dialog styled in Recollection's *own* dark navy/gold palette — so
the modal is the transition, and you can see the room before you walk into it.
It explains exactly what's behind the door, then offers "Come in" / "Not for me".

Two placements, both deliberately low-key:

- the site footer, on every page;
- the "Catholic Faith" quick fact on About, as an inline "More on that →".

Not in the nav, not a project card. Openly available, never pushed.

Because both sites are served from the same origin, "Come in" also writes
Recollection's own `recollection.gateAccepted.v1` key, so nobody is asked the
same question twice.

## Decisions worth your attention

1. **The Journal tab is now hidden on the public build (F1).** This follows the
   intent already written into `app.js`. But if you use the *deployed* URL as
   your own journal — e.g. as a PWA on your phone — this removes it. To undo:
   drop the `RECOLLECTION_PUBLIC_MODE` injection from
   `scripts/sync-recollection.mjs`.
2. **The "Catholic feed" idea is not built.** Right now `/recollection` serves
   76 seeded library entries (41 quotes, 29 prayers, 3 hymns, 3 litanies) plus
   the saints knowledge base — all shipped as code. Published *reflections*
   would need the same treatment: a repo-backed `reflections-data.js` that is
   the source of truth, separate from the private journal. That's a real
   feature, not a flag, and worth doing as its own pass.
3. **`public/recollection/` is generated.** Don't edit it; edit the app in
   `best/faith/journal-app/` and run `npm run sync:recollection`. It is
   committed so a build works on a machine without the `best` repo checked out.

## Still open

- C8 — favicon and PWA icons are still the React logo.
- C4 — the CV page needs an actual CV PDF.
- D6 — `react-scripts` 3.x.
