/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
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
