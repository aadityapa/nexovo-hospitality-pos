/**
 * CAPTURE EVERY SCREEN.
 *
 * One command produces the whole screenshot set: the login, the guest QR menu, and every screen
 * each role can actually reach, at whatever widths and themes you ask for.
 *
 *   npx vite preview --port 4173 --host 127.0.0.1 &
 *   node scripts/capture-screens.mjs
 *
 *   node scripts/capture-screens.mjs --widths 1440,390 --themes dark
 *   node scripts/capture-screens.mjs --roles manager --widths 1440
 *   OUT=./shots node scripts/capture-screens.mjs
 *
 * Output is `<OUT>/<theme>-<width>/<role>/<nn-slug>.png`, so a run is browsable and two runs are
 * diffable. Each line printed says whether that route overflowed its viewport, because a
 * screenshot of a sideways-scrolling page looks fine and is not.
 *
 * Playwright is deliberately NOT a dependency of this project — install it when you need it:
 *   npm i -D playwright && npx playwright install chromium
 *
 * PERMISSIONS ARE REAL. Each role is signed in properly and only walks routes it may open, so the
 * manager set has no Users/Roles/Audit/QR in it — the manager role does not hold those grants. To
 * see the permission wall instead, add a route the role cannot reach to its plan.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || './screenshots';

/** The seeded demo accounts. Local demo only — see README. */
const PW = {
  admin: 'Admin@123', manager: 'Manager@123', waiter1: 'Waiter@123',
  cashier: 'Cashier@123', kitchen: 'Kitchen@123', bar: 'Bar@123', host: 'Host@123',
};

/**
 * What each role actually opens. The manager plan is the six reference boards in board order, so
 * the output folder reads as the boards do — see docs/MANAGER_BOARDS.md.
 */
const PLAN = {
  manager: [
    ['command-centre', '/manager'], ['live-operations', '/manager/live'], ['overview', '/admin'],
    ['host-desk', '/host'], ['notifications', '/admin/notifications'], ['orders', '/admin/orders'],
    ['tables', '/admin/tables'], ['floors', '/admin/floors'], ['kitchen-display', '/kitchen'],
    ['bar-display', '/bar'], ['billing', '/cashier'], ['menu-items', '/admin/menu/items'],
    ['categories', '/admin/menu/categories'], ['offers', '/admin/offers'], ['recipes', '/admin/recipes'],
    ['inventory', '/admin/inventory'], ['stock-items', '/admin/inventory/items'],
    ['stock-movements', '/admin/inventory/movements'], ['suppliers', '/admin/suppliers'],
    ['purchase-orders', '/admin/purchases'], ['customers', '/admin/customers'],
    ['loyalty-readonly', '/admin/loyalty'], ['reservations', '/admin/reservations'],
    ['club', '/admin/club'], ['vip-tables', '/admin/vip'], ['bottle-service', '/admin/bottle-service'],
    ['room-charges', '/admin/room-charges'], ['reports', '/admin/reports'],
    ['advanced-reports', '/admin/reports/advanced'], ['branches-readonly', '/admin/branches'],
    ['settings-readonly', '/admin/settings'], ['profile', '/profile'], ['more', '/admin/more'],
    ['order-detail', '/admin/orders/1'], ['inventory-item-detail', '/admin/inventory/items/1'],
    ['recipe-editor', '/admin/recipes/1'], ['supplier-detail', '/admin/suppliers/1'],
    ['purchase-order-detail', '/admin/purchases/1'], ['customer-detail', '/admin/customers/1'],
    // The manager holds no `users:view`, so this one renders the permission wall. That is the point.
    ['permission-wall', '/admin/users'],
  ],
  admin: [
    ['dashboard', '/admin'], ['orders', '/admin/orders'], ['order-detail', '/admin/orders/1'],
    ['tables', '/admin/tables'], ['floors', '/admin/floors'], ['qr-codes', '/admin/qr'],
    ['menu-items', '/admin/menu/items'], ['categories', '/admin/menu/categories'], ['offers', '/admin/offers'],
    ['recipes', '/admin/recipes'], ['recipe-editor', '/admin/recipes/1'],
    ['inventory', '/admin/inventory'], ['stock-items', '/admin/inventory/items'],
    ['inventory-item-detail', '/admin/inventory/items/1'], ['stock-movements', '/admin/inventory/movements'],
    ['suppliers', '/admin/suppliers'], ['supplier-detail', '/admin/suppliers/1'],
    ['purchase-orders', '/admin/purchases'], ['purchase-order-detail', '/admin/purchases/1'],
    ['customers', '/admin/customers'], ['customer-detail', '/admin/customers/1'], ['loyalty', '/admin/loyalty'],
    ['reservations', '/admin/reservations'], ['club', '/admin/club'], ['vip-tables', '/admin/vip'],
    ['bottle-service', '/admin/bottle-service'], ['room-charges', '/admin/room-charges'],
    ['reports', '/admin/reports'], ['advanced-reports', '/admin/reports/advanced'],
    ['branches', '/admin/branches'], ['users', '/admin/users'], ['roles', '/admin/roles'],
    ['audit', '/admin/audit'], ['settings', '/admin/settings'], ['notifications', '/admin/notifications'],
    ['profile', '/profile'], ['more', '/admin/more'],
  ],
  waiter1: [
    ['home', '/waiter'], ['tables', '/waiter/tables'], ['table-order', '/waiter/tables/1'],
    ['orders', '/waiter/orders'], ['order-detail', '/waiter/orders/1'], ['ready', '/waiter/ready'],
    ['more', '/waiter/more'],
  ],
  cashier: [
    ['home', '/cashier'], ['bills', '/cashier/bills'], ['paid', '/cashier/paid'],
    ['tables', '/cashier/tables'], ['bill', '/cashier/bills/1'], ['payment', '/cashier/bills/1/pay'],
    ['receipt', '/cashier/bills/1/receipt'], ['more', '/cashier/more'],
  ],
  kitchen: [['display', '/kitchen']],
  bar: [['display', '/bar']],
  host: [['desk', '/host']],
};

// ------------------------------------------------------------------ arguments
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1].split(',') : fallback;
};
const WIDTHS = arg('widths', ['1440', '390']).map((w) => {
  const n = Number(w);
  return [n, n <= 430 ? 844 : n <= 800 ? 1024 : 900, w];
});
const THEMES = arg('themes', ['dark', 'light']);
const ROLES = arg('roles', Object.keys(PLAN));

// ------------------------------------------------------------------ run
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });

/** Wait for the network AND for skeletons to clear — a screenshot of a loading state is noise. */
const settle = async (p) => {
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForFunction(() => !document.querySelector('[aria-busy="true"], .skeleton'), null, { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(550);
};

const shoot = async (p, dir, slug, route) => {
  mkdirSync(dir, { recursive: true });
  await p.screenshot({ path: path.join(dir, `${slug}.png`) });
  const d = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  const over = d.sw > d.cw + 1 ? `  ** OVERFLOW ${d.sw}px **` : '';
  console.log(`  ${slug.padEnd(24)} ${route.padEnd(32)}${over}`);
  return over ? 1 : 0;
};

let shots = 0, overflows = 0;

for (const theme of THEMES) {
  for (const [w, h, tag] of WIDTHS) {
    const label = `${theme}-${tag}`;
    console.log(`\n=== ${label} ===`);

    // 1. Signed out: the login, and the guest QR menu. Neither needs an account.
    {
      const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await c.addInitScript((t) => { try { localStorage.setItem('nexovo.theme', t); } catch { /* private mode */ } }, theme);
      const p = await c.newPage();
      await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await settle(p);
      overflows += await shoot(p, path.join(OUT, label, '00-public'), '01-login', '/login'); shots += 1;
      // The seeded demo table. Change the codes if your seed differs.
      await p.goto(`${BASE}/menu/MAIN/T1`, { waitUntil: 'domcontentloaded' }); await settle(p);
      overflows += await shoot(p, path.join(OUT, label, '00-public'), '02-guest-qr-menu', '/menu/MAIN/T1'); shots += 1;
      await c.close();
    }

    // 2. Each role, signed in for real.
    for (const role of ROLES) {
      const routes = PLAN[role];
      if (!routes) { console.log(`  (no plan for role "${role}")`); continue; }
      const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await c.addInitScript((t) => { try { localStorage.setItem('nexovo.theme', t); } catch { /* private mode */ } }, theme);
      const p = await c.newPage();
      await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); await settle(p);
      await p.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(role);
      await p.locator('input[type="password"]').first().fill(PW[role]);
      await p.locator('button[type="submit"]').first().click();
      await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {});
      await settle(p);

      console.log(`  -- ${role}`);
      const dir = path.join(OUT, label, role);
      let i = 0;
      for (const [slug, route] of routes) {
        i += 1;
        await p.goto(BASE + route, { waitUntil: 'domcontentloaded' });
        await settle(p);
        overflows += await shoot(p, dir, `${String(i).padStart(2, '0')}-${slug}`, route);
        shots += 1;
      }
      await c.close();
    }
  }
}

await browser.close();
console.log(`\n${shots} screenshots written to ${OUT}`);
console.log(overflows ? `${overflows} route(s) overflowed — see the ** OVERFLOW ** lines above` : 'no route overflowed its viewport');
