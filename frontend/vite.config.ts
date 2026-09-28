/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fetchAssets } from './scripts/fetch-assets.mjs';

/**
 * PHOTOGRAPHS ARE LOCAL FILES, and this is what makes sure they are there.
 *
 * Every picture the app shows is served from `public/img/` (see `src/config/imagery.ts` and
 * `assets.manifest.json`). On the first `dev` or `build` of a fresh checkout that folder is
 * empty; this plugin fetches whatever is missing from the licensed sources in the manifest
 * before the server starts serving. It is idempotent and never fatal: offline, the app runs
 * with its drawn artwork in the empty slots and says so in the console. It does not run under
 * vitest, and `NEXOVO_SKIP_ASSETS=1` turns it off for an air-gapped build.
 */
function localPhotographs(): Plugin {
  let done = false;
  return {
    name: 'nexovo:local-photographs',
    apply: () => !process.env.VITEST,
    async buildStart() {
      if (done || process.env.NEXOVO_SKIP_ASSETS) return;
      done = true;
      try {
        const r = await fetchAssets({ log: (line) => console.log(`  [photographs] ${line}`) });
        if (r.fetched) console.log(`  [photographs] ${r.fetched} downloaded into public/img`);
      } catch (e) {
        console.warn(`  [photographs] could not check public/img: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), localPhotographs()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173, host: true },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          charts: ['recharts'],
        },
      },
    },
  },
  test: {
    // Engine, billing and state-machine tests are pure logic and run fastest in node.
    // Component tests (*.test.tsx) need a DOM, so happy-dom is applied to those only —
    // declared as a devDependency so a clean `npm ci` reproduces the suite on any platform.
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'happy-dom']],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
