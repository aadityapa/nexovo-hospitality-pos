/**
 * fetch-assets — bring every photograph in `assets.manifest.json` into `public/img/`.
 *
 * (No shebang line, deliberately: `vite.config.ts` imports this module, and Vite's config bundler
 * prepends injected variables to each file it bundles — a `#!` that is no longer at byte 0 is a
 * syntax error, and the config would fail to load for dev, build and vitest alike.)
 *
 * The running application never loads an image from the internet: every `<img>` points at
 * `/img/...`, which Vite serves from `public/`. This script is what puts the files there. It is
 * idempotent (an existing file is left alone), needs nothing but Node 18+ (global `fetch`), and
 * runs three ways:
 *
 *   · automatically, from the Vite plugin in `vite.config.ts`, at the start of `npm run dev` and
 *     `npm run build` — so a fresh checkout fills the folder the first time it is served;
 *   · from `start.bat`, `verify.bat` and `capture-screenshots.bat`;
 *   · by hand: `npm run assets` (`--force` re-downloads, `--check` reports and exits 1 if any
 *     file is missing).
 *
 * Set NEXOVO_SKIP_ASSETS=1 to make the automatic run a no-op (an air-gapped build).
 *
 * Why not just commit the JPEGs? They can be — a release ZIP made after this has run carries
 * them. The manifest is the record of where each came from and under which licence, so the
 * folder can always be rebuilt and every picture traced to its source.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'public', 'img');

const exists = async (p) => stat(p).then((s) => s.isFile() && s.size > 0).catch(() => false);

/**
 * @param {{ force?: boolean; check?: boolean; log?: (line: string) => void }} [opts]
 * @returns {Promise<{ declared: number; present: number; fetched: number; failed: number; missing: number; failures: string[] }>}
 */
export async function fetchAssets(opts = {}) {
  const { force = false, check = false, log = console.log } = opts;
  const manifest = JSON.parse(await readFile(resolve(root, 'assets.manifest.json'), 'utf8'));

  let present = 0, fetched = 0, failed = 0, missing = 0;
  const failures = [];

  for (const img of manifest.images) {
    const target = resolve(outDir, img.file);
    if (!force && await exists(target)) { present += 1; continue; }
    if (check) { missing += 1; log(`missing  ${img.file}`); continue; }

    await mkdir(dirname(target), { recursive: true });
    try {
      /* 15 s per file: the dev server waits for this in `buildStart`, so a stalled CDN
         connection must fail fast rather than hold `npm run dev` with nothing on screen. */
      const res = await fetch(img.source, { headers: { 'user-agent': 'nexovo-pos-fetch-assets/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'no content-type'})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 4096) throw new Error(`suspiciously small (${buf.length} bytes)`);
      await writeFile(target, buf);
      fetched += 1;
      log(`fetched  ${img.file}  (${(buf.length / 1024).toFixed(0)} KB)  ← ${img.licence}`);
    } catch (e) {
      failed += 1;
      const why = e instanceof Error ? e.message : String(e);
      failures.push(`${img.file}: ${why}`);
      log(`FAILED   ${img.file}  ${why}`);
    }
  }

  const declared = manifest.images.length;
  if (fetched || failed || missing || check) {
    log(`assets: ${declared} declared · ${present} already present · ${fetched} fetched · ${failed} failed${check ? ` · ${missing} missing` : ''}`);
  }
  if (failures.length) {
    log('The application still runs without these — each slot falls back to its drawn artwork — but the record it illustrates will not show a photograph:');
    for (const f of failures) log(`  - ${f}`);
  }
  return { declared, present, fetched, failed, missing, failures };
}

/* Run directly (`node scripts/fetch-assets.mjs`), not when imported by vite.config.ts. */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const force = process.argv.includes('--force');
  const check = process.argv.includes('--check');
  const r = await fetchAssets({ force, check });
  if (!r.fetched && !r.failed && !check) console.log(`assets: all ${r.declared} photographs already present`);
  process.exit(check ? (r.missing ? 1 : 0) : (r.failed ? 2 : 0));
}
