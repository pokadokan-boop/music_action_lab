import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/music_action_lab/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        candidates: 'candidates.html',
        measure: 'measure.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.js'],
  },
});
