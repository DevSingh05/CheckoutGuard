import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { collectPage } from '../lib/extract';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  main() {
    type Listener = Parameters<typeof browser.runtime.onMessage.addListener>[0];
    const marker = '__checkoutguard_listener__';
    const scope = globalThis as typeof globalThis & Record<string, unknown>;
    const previous = scope[marker];
    if (typeof previous === 'function')
      browser.runtime.onMessage.removeListener(previous as Listener);
    // Replace the listener on injection so a reloaded extension never keeps an old extractor.
    const listener: Listener = (message, _sender, sendResponse) => {
      if (
        typeof message !== 'object' ||
        message === null ||
        message.type !== 'checkoutguard:extract'
      )
        return false;
      void collectPage()
        .then(sendResponse)
        .catch(() =>
          sendResponse({
            error:
              'This page could not be read. Open a public product page, reload it, and retry.',
          }),
        );
      // Callback messaging works on Chrome versions that do not support async listeners.
      return true;
    };
    scope[marker] = listener;
    browser.runtime.onMessage.addListener(listener);
  },
});
