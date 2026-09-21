/**
 * PER-ROUTE SURFACE VARIANTS
 * ==========================
 *
 * The product is charcoal-and-gold, and a set of named screens are warm ivory workspaces inside
 * it. That is not a theme and it is not decoration: it is a property of the screen, declared here
 * once, and read by the layout. No feature file contains a colour decision about its own shell.
 *
 * TWO INDEPENDENT AXES, because the reference boards use them independently:
 *
 *   `shell`    the navigation rail
 *   `content`  the header and the content region
 *
 * Most ivory screens keep the dark rail — the rail is the product's spine and it does not change
 * as you move around it. Two purchasing DOCUMENT screens (a supplier's account, a purchase order)
 * take the full paper shell, rail included, which is how the boards draw them: those two are the
 * screens you print, post and file, and the whole window becomes the document.
 *
 * WHAT THE THEME TOGGLE DOES TO THIS
 * ----------------------------------
 * These declarations describe the DARK theme, which is the product's default and the one the
 * boards depict. In the light theme the whole application is light and the distinction collapses,
 * which is correct: someone who has asked for a light interface has not asked for two thirds of
 * it to stay black. So `surfaceClassFor` returns no island at all under the light theme.
 *
 * PHONES
 * ------
 * The boards draw the phone application as ivory — dashboard, orders and More are the three
 * screens shown, and all three are this shell. The ivory is applied to the WHOLE management shell
 * below `lg` rather than to those three routes, because the header and the bottom navigation are
 * shared chrome: a rail that turned from cream to charcoal as you moved between tabs would read
 * as a fault, not as a design. The in-service tools keep their charcoal at every width — the
 * waiter and cashier shells and the kitchen and bar boards are used in a dim room and are not
 * management screens.
 */

import type { Workspace } from './workspace';

export type Surface = 'dark' | 'light';

export interface RouteSurface {
  /** The navigation rail. */
  shell: Surface;
  /** The header and the content region. */
  content: Surface;
}

export const DARK_SURFACE: RouteSurface = { shell: 'dark', content: 'dark' };
/** Ivory workspace, charcoal rail — the common reference treatment. */
export const PAPER_CONTENT: RouteSurface = { shell: 'dark', content: 'light' };
/** The whole window becomes the document. */
export const PAPER_SHELL: RouteSurface = { shell: 'light', content: 'light' };
/** Phones: the management shell is ivory end to end. */
export const PHONE_SURFACE: RouteSurface = PAPER_SHELL;

/**
 * Screens the reference boards paint as warm ivory. Anything not listed is charcoal.
 *
 * `:param` matches exactly one segment. The most specific rule wins: more segments first, and a
 * literal segment beats a parameter at the same depth — so `/admin/purchases/new` and
 * `/admin/purchases/:id` can both be declared and the literal one is chosen for `/new`.
 */
const RULES: ReadonlyArray<readonly [string, RouteSurface]> = [
  // ---- Service & operations ------------------------------------------------
  ['/admin/qr', PAPER_CONTENT],
  ['/admin/orders/:id', PAPER_CONTENT],

  // ---- Menu & inventory ----------------------------------------------------
  ['/admin/menu/categories', PAPER_CONTENT],
  ['/admin/inventory/items', PAPER_CONTENT],
  ['/admin/inventory/items/:id', PAPER_SHELL],

  // ---- Purchasing & guests -------------------------------------------------
  ['/admin/purchases', PAPER_CONTENT],
  ['/admin/purchases/new', PAPER_SHELL],
  ['/admin/purchases/:id', PAPER_SHELL],
  ['/admin/suppliers/:id', PAPER_SHELL],
  ['/admin/loyalty', PAPER_CONTENT],
  ['/admin/customers/:id', PAPER_SHELL],

  // ---- Hospitality & insights ----------------------------------------------
  ['/admin/bottle-service', PAPER_CONTENT],
  ['/admin/room-charges', PAPER_CONTENT],
  ['/admin/reports/advanced', PAPER_CONTENT],
];

/**
 * THE MANAGER OVERLAY.
 *
 * The manager reference boards paint a number of shared screens the other way round from the
 * admin boards: the manager's menu grid is ivory and their category list is charcoal, while the
 * admin's are the reverse; the manager's document screens (an order, a supplier, a purchase
 * order, an inventory item) are charcoal where the admin's are paper.
 *
 * That is not an inconsistency to be reconciled — it is the point of §4 of the brief. The admin
 * design is signed off. So the table above is **frozen** as the admin's, and every manager
 * difference is declared here instead, as an overlay consulted only when the signed-in role
 * resolves to the manager workspace. Nothing an admin sees can be changed by editing this list.
 *
 * Only DIFFERENCES belong here. A route the manager sees exactly as the admin does is absent, and
 * falls through to the table above.
 */
const MANAGER_OVERRIDES: ReadonlyArray<readonly [string, RouteSurface]> = [
  // ---- Command centre -------------------------------------------------------
  /* `/manager` is the command centre (charcoal, board 01 panel 01) and `/admin` is the light
     overview a manager also reaches (board 01 panel 03). Two dashboards, both real routes, both
     already permitted by `dashboard:view` — which is why the boards draw two of them. */
  ['/admin', PAPER_CONTENT],

  // ---- Floor, kitchen & billing (board 02) ----------------------------------
  ['/admin/floors', PAPER_CONTENT],          // panel 08 — photographic area cards on ivory
  ['/admin/menu/items', PAPER_CONTENT],      // panel 12 — image-led grid on ivory
  ['/admin/menu/categories', DARK_SURFACE],  // panel 13 — charcoal, inverted from the admin board

  // ---- Stock & purchasing (board 03) ----------------------------------------
  ['/admin/recipes', PAPER_CONTENT],         // panel 15 — costing table on ivory

  // ---- Guests & hospitality (board 04) --------------------------------------
  ['/admin/club', PAPER_CONTENT],            // panel 24 — door and occupancy on ivory
  ['/admin/bottle-service', DARK_SURFACE],   // panel 26 — charcoal, inverted from the admin board

  // ---- Insights & workspace (board 05) --------------------------------------
  ['/admin/settings', PAPER_CONTENT],        // panel 31 — read-only configuration on ivory

  // ---- Detail views (board 06) ----------------------------------------------
  /* Every document screen flips to charcoal for the manager. The admin files these; the manager
     works them mid-service, on the same dark ground as the rest of their shift. */
  ['/admin/orders/:id', DARK_SURFACE],             // panel 34
  ['/admin/inventory/items/:id', DARK_SURFACE],    // panel 35
  ['/admin/recipes/:menuItemId', PAPER_CONTENT],   // panel 36 — the one that stays paper
  ['/admin/suppliers/:id', DARK_SURFACE],          // panel 37
  ['/admin/purchases/:id', DARK_SURFACE],          // panel 38
  ['/admin/purchases/new', DARK_SURFACE],
];

interface Compiled { segs: string[]; surface: RouteSurface; literals: number }

const compile = (rules: ReadonlyArray<readonly [string, RouteSurface]>): Compiled[] =>
  rules.map(([pattern, surface]) => {
    const segs = pattern.split('/').filter(Boolean);
    return { segs, surface, literals: segs.filter((s) => !s.startsWith(':')).length };
  }).sort((a, b) => b.segs.length - a.segs.length || b.literals - a.literals);

const COMPILED = compile(RULES);
const COMPILED_MANAGER = compile(MANAGER_OVERRIDES);

function lookup(table: Compiled[], path: string[]): RouteSurface | undefined {
  for (const rule of table) {
    if (rule.segs.length !== path.length) continue;
    let ok = true;
    for (let i = 0; i < rule.segs.length; i += 1) {
      const s = rule.segs[i];
      if (s.startsWith(':')) { if (!path[i]) { ok = false; break; } continue; }
      if (s !== path[i]) { ok = false; break; }
    }
    if (ok) return rule.surface;
  }
  return undefined;
}

/**
 * The surface a path is painted in, before the theme and the viewport are taken into account.
 *
 * `workspace` defaults to `admin`, so every existing caller and every script keeps the approved
 * admin resolution unless it deliberately asks for another audience.
 *
 * Exported for the coverage script, which asserts every declared route still exists.
 */
export function routeSurface(pathname: string, workspace: Workspace = 'admin'): RouteSurface {
  const path = pathname.split('/').filter(Boolean);
  if (workspace === 'manager') {
    const override = lookup(COMPILED_MANAGER, path);
    if (override) return override;
  }
  return lookup(COMPILED, path) ?? DARK_SURFACE;
}

/**
 * The island class for one region, or `undefined` when the region needs none.
 *
 * **Only ever `chrome-light`, and only under the dark theme.** The declarations in this file
 * describe the DARK theme — the product's default and the one the boards depict. Under the light
 * theme the whole application is light and the distinction collapses, because someone who asked
 * for a light interface has not asked for two thirds of it to stay black.
 *
 * This previously returned `chrome-dark` for a dark-declared route under the light theme, which
 * quietly meant the theme toggle did NOT win: every operational screen stayed charcoal in light
 * mode, and the light-theme tokens then rendered on it — light gold (`#8A6212`) on `#141618` at
 * 3.31:1. A contrast audit at `light@1440` is what found it; it is invisible to a dark-theme
 * sweep, which is the whole reason both themes get walked.
 *
 * The kitchen and bar boards stay dark in both themes, but they do not come through here — their
 * layout applies `.chrome-dark` directly, because that is a property of the screen rather than of
 * the route's place in this table.
 */
export function surfaceClass(want: Surface, theme: Surface): string | undefined {
  return theme === 'dark' && want === 'light' ? 'chrome-light' : undefined;
}

/** Every route named above, for the coverage document and the verification scripts. */
export const DECLARED_PAPER_ROUTES = RULES.map(([p]) => p);
/** Routes the manager sees differently from the admin — the §4 boundary, enumerated. */
export const MANAGER_SURFACE_OVERRIDES = MANAGER_OVERRIDES.map(([p, s]) => ({
  route: p,
  admin: routeSurface(p.replace(/:[^/]+/g, '1'), 'admin'),
  manager: s,
}));
