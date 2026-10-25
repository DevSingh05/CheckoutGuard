import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    environmentOptions: {
      jsdom: { url: 'https://store.example/products/bag' },
    },
  },
});
