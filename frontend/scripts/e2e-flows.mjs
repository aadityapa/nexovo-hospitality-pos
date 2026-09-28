/**
 * e2e-flows — drive the real UI through the service loop, as the people who do it.
 *
 * Against a running build (`npx vite preview --port 4173`), in ONE browser context so every role
 * shares the in-browser demo database, exactly as tabs on one venue's devices would:
 *
 *   1. sign-in        every demo role lands on its own home
 *   2. denied         a waiter opening /admin/users gets the permission wall, not the page
 *   3. order entry    waiter1 adds two dishes and a drink to Table 2 and sends them
 *   4. preparation    kitchen starts and readies the kitchen ticket for Table 2
 *   5. billing        cashier generates and finalises the bill, takes full payment in cash,
 *                     and sees the confirmation only after the server has recorded it
 *   6. reservation    host books a table for tonight and it appears in the list
 *   7. purchasing     admin approves the sent purchase order and receives it in full
 *
 * Each step asserts on the DATABASE the app wrote (localStorage `nexovo.mockdb`), not only on
 * text, so a screen that merely looks right does not pass. Screenshots of each step land in
 * `OUT` (default ./e2e-shots). Exit code is the number of failed steps.
 *
 * Usage:  node scripts/e2e-flows.mjs            (BASE=http://127.0.0.1:4173 by default)
 * Needs:  npm i -D playwright && npx playwright install chromium
 *
 * This proves the flows against the MOCK backend only. It says nothing about Oracle/ORDS.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || './e2e-shots';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const PW = { admin: 'Admin@123', manager: 'Manager@123', waiter1: 'Waiter@123', cashier: 'Cashier@123', kitchen: 'Kitchen@123', bar: 'Bar@123', host: 'Host@123' };
const HOME = { admin: '/admin', manager: '/manager', waiter1: '/waiter', cashier: '/cashier', kitchen: '/kitchen', bar: '/bar', host: '/host' };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(12000);

const results = [];
const log = (...a) => console.log(...a);
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('nexovo.mockdb') || 'null'));
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const settle = async () => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(500); };
const btn = (re) => page.getByRole('button', { name: re });
async function buttonsOnScreen() {
  return page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 60));
}

async function signIn(role) {
  await page.goto(`${BASE}/login?expired=1`); await settle();
  await page.locator('input:not([type="password"]):not([type="checkbox"])').first().fill(role);
  await page.locator('input[type="password"]').first().fill(PW[role]);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  await settle();
}

async function step(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note || '' });
    log(`PASS  ${name.padEnd(12)} ${note || ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push({ name, ok: false, note: e.message.split('\n')[0] });
    log(`FAIL  ${name.padEnd(12)} ${e.message.split('\n')[0]}`);
    log(`      at ${page.url()}`);
    log(`      buttons: ${JSON.stringify(await buttonsOnScreen().catch(() => []))}`);
    await shot(`FAIL-${name}`).catch(() => {});
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ------------------------------------------------------------------ 1. sign-in */
await step('sign-in', async () => {
  const landed = [];
  for (const role of Object.keys(PW)) {
    await signIn(role);
    const p = new URL(page.url()).pathname;
    expect(p.startsWith(HOME[role]), `${role} landed on ${p}, expected ${HOME[role]}`);
    landed.push(`${role}→${p}`);
  }
  await shot('01-signed-in-last');
  return landed.join(' ');
});

/* ------------------------------------------------------------------ 2. permission wall */
await step('denied', async () => {
  await signIn('waiter1');
  await page.goto(`${BASE}/admin/users`); await settle();
  await page.getByText(/access denied/i).first().waitFor();
  const users = await page.getByText(/add user/i).count();
  expect(users === 0, 'the Users page rendered its "Add user" control for a waiter');
  await shot('02-denied');
  return 'waiter1 on /admin/users → "Access denied", no Users controls';
});

/* ------------------------------------------------------------------ 3. order entry */
let orderId = null;
await step('order-entry', async () => {
  await signIn('waiter1');
  const before = await db();
  const t2 = before.tables.find((t) => t.name === 'Table 2');
  expect(t2, 'seed has no "Table 2"');
  await page.goto(`${BASE}/waiter/tables/${t2.id}`); await settle();
  await btn(/^All\b/).first().click().catch(() => {});
  for (const dish of [/^Add Paneer Tikka,/, /^Add Butter Chicken,/, /^Add Mojito,/]) {
    await page.getByRole('button', { name: dish }).first().click();
    await page.waitForTimeout(200);
  }
  await shot('03a-order-built');
  await btn(/^Send/).first().click();
  // A confirm dialog, if the build asks for one.
  await page.getByRole('dialog').getByRole('button', { name: /^Send|^Confirm/ }).first().click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(1200); await settle();
  const after = await db();
  const o = after.orders.find((x) => x.tableId === t2.id && x.status !== 'DRAFT' && x.status !== 'CLOSED' && x.status !== 'CANCELLED');
  expect(o, 'no sent order for Table 2 in the database');
  const names = o.items.map((i) => i.itemName || i.name).join(', ');
  expect(o.items.length >= 3, `order has ${o.items.length} lines (${names})`);
  orderId = o.id;
  await shot('03b-order-sent');
  return `${o.orderNumber} · ${o.status} · ${names}`;
});

/* ------------------------------------------------------------------ 4. preparation */
await step('preparation', async () => {
  expect(orderId, 'no order from the previous step');
  await signIn('kitchen');
  const card = page.locator('article', { hasText: 'Table 2' }).first();
  await card.waitFor();
  await card.getByRole('button', { name: /start preparing/i }).first().click();
  await page.waitForTimeout(900);
  await shot('04a-preparing');
  const readyCard = page.locator('article', { hasText: 'Table 2' }).first();
  await readyCard.getByRole('button', { name: /mark ready/i }).first().click();
  await page.waitForTimeout(900);
  await shot('04b-ready');
  const o = (await db()).orders.find((x) => x.id === orderId);
  const kitchen = o.items.filter((i) => i.prepLocation === 'KITCHEN');
  expect(kitchen.every((i) => i.status === 'READY' || i.status === 'SERVED'), `kitchen lines are ${kitchen.map((i) => i.status).join('/')}`);
  return `kitchen lines READY (${kitchen.length}); order ${o.status}`;
});

/* ------------------------------------------------------------------ 5. billing */
await step('billing', async () => {
  expect(orderId, 'no order from the previous step');
  await signIn('cashier');
  await page.goto(`${BASE}/cashier/orders/${orderId}/bill`); await settle();
  // Generate, then finalise, whichever the screen offers.
  for (const re of [/^Generate bill/i, /^Finalize bill/i]) {
    const b = btn(re).first();
    if (await b.count()) {
      await b.click();
      await page.getByRole('dialog').getByRole('button', { name: re }).first().click({ timeout: 2500 }).catch(() => {});
      await page.getByRole('dialog').getByRole('button', { name: /^(Finalize|Confirm|Generate)/i }).first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(900); await settle();
    }
  }
  await shot('05a-bill');
  await btn(/^Take payment/).first().click(); await settle();
  await page.getByRole('button', { name: /^Cash\b/ }).first().click().catch(() => {});
  await btn(/^Full balance/).first().click().catch(() => {});
  await shot('05b-tender');
  const bill0 = (await db()).bills.find((b) => b.orderId === orderId);
  expect(bill0, 'no bill was generated for the order');
  const successBefore = await page.getByText(/fully paid/i).count();
  expect(successBefore === 0, 'the success state was showing before payment was submitted');
  await btn(/^Take payment ·/).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /complete payment|take payment|confirm/i }).first().click({ timeout: 3000 }).catch(() => {});
  /* A completing payment moves the cashier on to the receipt (or shows the settled panel on the
     payment screen). Either way the proof is the database, read after the screen has moved. */
  await Promise.race([
    page.waitForURL(/\/receipt$/, { timeout: 10000 }),
    page.getByText(/fully paid/i).first().waitFor({ timeout: 10000 }),
  ]);
  await settle();
  await shot('05c-paid');
  const bill = (await db()).bills.find((b) => b.orderId === orderId);
  expect(bill.paymentStatus === 'PAID', `bill paymentStatus is ${bill.paymentStatus}`);
  return `${bill.billNumber} ₹${bill.grandTotal} · ${bill.paymentStatus} · landed on ${new URL(page.url()).pathname} (no success shown before submit)`;
});

/* ------------------------------------------------------------------ 6. reservation */
await step('reservation', async () => {
  await signIn('host');
  await page.goto(`${BASE}/admin/reservations`); await settle();
  const before = (await db()).p2?.reservations?.length ?? 0;
  await btn(/new reservation/i).first().click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  await dlg.getByLabel(/guest name|^name/i).first().fill('E2E Verification Guest');
  await dlg.getByLabel(/phone/i).first().fill('+91 98000 11122');
  const party = dlg.getByLabel(/guests|party/i).first();
  if (await party.count()) await party.fill('3');
  await shot('06a-form');
  await dlg.getByRole('button', { name: /^(save|create|book)/i }).first().click();
  await page.waitForTimeout(1200); await settle();
  const list = (await db()).p2?.reservations ?? [];
  const r = list.find((x) => x.guestName === 'E2E Verification Guest');
  expect(r, `reservation not in the database (${before} → ${list.length})`);
  await shot('06b-listed');
  return `${r.resNumber ?? r.id} · ${r.date} ${r.time} · party ${r.guests} · ${r.status}`;
});

/* ------------------------------------------------------------------ 7. purchasing */
await step('purchasing', async () => {
  await signIn('admin');
  const pos0 = (await db()).p2.purchaseOrders;
  const sent = pos0.find((p) => p.status === 'SENT');
  expect(sent, 'seed has no SENT purchase order');
  await page.goto(`${BASE}/admin/purchases/${sent.id}`); await settle();
  await btn(/^Approve/).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /^Approve|^Confirm/ }).first().click({ timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(1000); await settle();
  let po = (await db()).p2.purchaseOrders.find((p) => p.id === sent.id);
  expect(po.status === 'APPROVED' || po.status === 'ORDERED', `after Approve the PO is ${po.status}`);
  await shot('07a-approved');
  // Some flows need "Mark ordered" before goods can be received.
  const ordered = btn(/^Mark (as )?ordered|^Place order|^Send to supplier/i).first();
  if (await ordered.count()) { await ordered.click(); await page.getByRole('dialog').getByRole('button', { name: /confirm|ordered|place/i }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(900); }
  await btn(/^Receive goods/).first().click();
  const dlg = page.getByRole('dialog'); await dlg.waitFor();
  const inv = dlg.getByLabel(/invoice/i).first();
  if (await inv.count()) await inv.fill('E2E-INV-001');
  await shot('07b-receive-form');
  await dlg.getByRole('button', { name: /^(Receive|Confirm|Save)/i }).last().click();
  await page.waitForTimeout(1200); await settle();
  po = (await db()).p2.purchaseOrders.find((p) => p.id === sent.id);
  expect(po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED', `after receiving the PO is ${po.status}`);
  await shot('07c-received');
  return `${po.poNumber} SENT → APPROVED → ${po.status}`;
});

await browser.close();
const failed = results.filter((r) => !r.ok).length;
log(`\n${results.length - failed} passed, ${failed} failed`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed);
