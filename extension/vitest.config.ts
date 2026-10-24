import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environmentOptions: {
      jsdom: { url: 'https://store.example/products/bag' },
    },
  },
});
