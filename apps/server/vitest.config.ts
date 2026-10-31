// apps/server/vitest.config.ts
import { defineConfig } from 'vitest/config';

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
      '@runalive/shared': '../../packages/shared/src/index.ts',
    },
  },
});
