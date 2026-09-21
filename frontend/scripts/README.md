# UI verification scripts

Four Playwright scripts that check the built application in a real browser. They are how the
responsive, contrast and reachability claims in `docs/` were produced — not by reading source.

## Setup (once)

```bash
cd frontend
npm i -D playwright          # not a runtime dependency; install only when you want to verify
npx playwright install chromium
```

## Run

Every script drives a **production build**, so build and serve first:

```bash
cd frontend
npm run build
npx vite preview --port 4173 --strictPort &
```

Then:

| Command | What it checks |
|---|---|
| `node scripts/verify-overflow.mjs 390 844` | Walks all 39 routes as admin / waiter / cashier / kitchen at the given viewport and reports any page-level horizontal overflow (ignoring intentional scroll regions) and any interactive control without an accessible name. Run it once per width: 360 780 · 390 844 · 768 1024 · 1024 768 · 1440 900. |
| `node scripts/verify-contrast.mjs` | Computes the real WCAG 2.1 contrast of every visible text node against its actual painted background and reports anything below its AA threshold (4.5:1, or 3:1 for large text). |
| `node scripts/verify-reachability.mjs` | At 390 px, scrolls 13 representative screens to the very end and asserts the last interactive control clears both the bottom navigation and any sticky save bar. This is the check a screenshot of the initial viewport cannot make. |
| `node scripts/verify-themes.mjs light 390 844` | **The one to run after any shared-component or token change.** Walks 41 routes as admin / manager / waiter / cashier / host / kitchen in the named theme at the named viewport, and reports page-level overflow, every text node below its WCAG AA contrast threshold (measured against its actually-painted background), and unnamed interactive controls. Run it for both themes at 360 · 390 · 768 · 1024 · 1440. |
| `OUT=./screenshots node scripts/capture-screens.mjs 1440` | Captures every listed route at the given width (2× device scale). Repeat per width. |

All of them sign in with the seeded demo accounts, so they only work against `VITE_API_MODE=mock`.

## Expected results

```
verify-themes      light + dark × 360/390/768/1024/1440
                   → 47 routes each: overflow=0, contrast=0, unnamed=0   (10 combinations)
verify-overflow    360/390/768/1024/1440 → overflow=0, unnamed controls=0
verify-contrast    → "No text below its WCAG AA threshold on any checked route"
verify-reachability → 13/13 pass
```

`verify-themes.mjs` now walks 47 routes rather than 41: the six document screens added to the plan
(`/admin/suppliers/:id`, `/admin/purchases/:id`, `/admin/customers/:id`,
`/admin/inventory/items/:id`, `/admin/recipes/:id`, `/admin/more`) are the ones that carry the
warm-ivory paper shell, so they are exactly the routes where a surface mistake would show.

### What this build has actually been measured at

`dark 1440` only: **47 routes · overflow 0 · unnamed 0 · contrast 4**. All four were on
`/admin/reports/advanced` and their cause has been fixed (`useChartTheme()` now resolves against
the route's surface rather than the global theme). **That fix has not been re-measured**, and the
other nine combinations have not been run against this build — the sandbox that hosts the browser
failed partway through the sweep. Run all ten before calling this build clean.

`verify-themes.mjs` forces the theme by seeding `localStorage['nexovo.theme']` before the first
paint, which is the same path the application's own bootstrap reads.

If you change a shared component or a token, re-run `verify-themes.mjs` in BOTH themes before calling the change done.
