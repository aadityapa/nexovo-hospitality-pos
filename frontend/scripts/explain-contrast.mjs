/**
 * EXPLAIN A CONTRAST FAILURE.
 *
 * `verify-themes.mjs` tells you a string failed and by how much. It cannot tell you WHICH element
 * that string is, which is the thing you need in order to fix it — a bare "1" at 2.62:1 could be
 * a table number, a badge count or an SVG label, and guessing wastes more time than looking.
 *
 * This walks one route in one theme as one role, finds every leaf text node whose colour matches
 * the one you are chasing, and prints its tag, classes, ancestors and the background each
 * ancestor paints. That is enough to name the component and the rung in one pass.
 *
 *   node scripts/explain-contrast.mjs <role> <theme> <route> <"rgb(r, g, b)"> [textPattern]
 *
 * e.g. node scripts/explain-contrast.mjs waiter1 light /waiter/tables "rgb(18, 183, 106)" '^[0-9]$'
 */
import { chromium } from 'playwright';

const [role, theme, route, colour, pattern] = process.argv.slice(2);
if (!role || !theme || !route || !colour) {
  console.error('usage: explain-contrast.mjs <role> <theme> <route> "rgb(r, g, b)" [textPattern]');
  process.exit(1);
}

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const PW = {
  admin: 'Admin@123', manager: 'Manager@123', waiter1: 'Waiter@123',
  cashier: 'Cashier@123', kitchen: 'Kitchen@123', bar: 'Bar@123', host: 'Host@123',
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((t) => { try { localStorage.setItem('nexovo.theme', t); } catch { /* private mode */ } }, theme);
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[name="username"]', role);
await page.fill('input[type="password"]', PW[role] ?? 'Admin@123');
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 });
await page.goto(BASE + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// A single argument, because `page.evaluate` takes exactly one.
const hits = await page.evaluate(({ colour: want, pattern: re }) => {
  const rx = re ? new RegExp(re) : null;
  const cls = (n) => (typeof n.className === 'string' ? n.className : n.className?.baseVal || '');
  const out = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (el.children.length) return;
    const text = (el.textContent || '').trim();
    if (!text || (rx && !rx.test(text))) return;
    const s = getComputedStyle(el);
    if (s.color !== want) return;
    const chain = [];
    for (let n = el.parentElement; n && n !== document.body && chain.length < 5; n = n.parentElement) {
      chain.push(`${n.tagName.toLowerCase()}[${cls(n).slice(0, 60)}] bg=${getComputedStyle(n).backgroundColor}`);
    }
    out.push({ text, tag: el.tagName.toLowerCase(), cls: cls(el), font: `${s.fontSize}/${s.fontWeight}`, chain });
  });
  return out.slice(0, 6);
}, { colour, pattern });

console.log(hits.length ? JSON.stringify(hits, null, 1) : `no element on ${route} has colour ${colour}${pattern ? ` matching /${pattern}/` : ''}`);
await browser.close();
