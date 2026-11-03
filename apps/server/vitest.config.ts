// apps/server/vitest.config.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // DB tests use shared pool
      },
    },
  },
  resolve: {
    alias: {
      '@runalive/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
