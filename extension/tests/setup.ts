import { createRequire } from 'node:module';

// Vitest 3 can copy Node 26's optional localStorage getter over JSDOM's getter.
// Use a real isolated JSDOM Storage instance for browser persistence tests.
if (typeof document !== 'undefined') {
  const { JSDOM } = createRequire(import.meta.url)('jsdom');
  const isolated = new JSDOM('', {
    url: 'https://storage.checkoutguard.example',
  });
  Object.defineProperties(globalThis, {
    localStorage: { value: isolated.window.localStorage, configurable: true },
    Storage: { value: isolated.window.Storage, configurable: true },
  });
}
