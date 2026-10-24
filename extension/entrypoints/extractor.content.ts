import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { collectPage } from '../lib/extract';
export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  main() {
    const marker = '__checkoutguard_listener__';
    const scope = globalThis as typeof globalThis & Record<string, unknown>;
    if (scope[marker]) return;
    scope[marker] = true;
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'checkoutguard:extract'
      )
        return collectPage();
    });
  },
});
