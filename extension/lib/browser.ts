import type { collectPage } from './extract';

// Small typed boundary keeps the UI testable outside Chrome. These are native MV3 APIs.
type Event<T> = {
  addListener(callback: T): void;
  removeListener(callback: T): void;
};
export type ActiveTab = { id?: number; url?: string; title?: string };
interface PanelBrowser {
  tabs: {
    query(query: {
      active: boolean;
      currentWindow: boolean;
    }): Promise<ActiveTab[]>;
    sendMessage(
      id: number,
      message: { type: 'checkoutguard:extract' },
    ): Promise<Awaited<ReturnType<typeof collectPage>>>;
    onActivated: Event<() => void>;
    onUpdated: Event<
      (id: number, change: { url?: string; status?: string }) => void
    >;
  };
  scripting: {
    executeScript(options: {
      target: { tabId: number };
      files: string[];
    }): Promise<unknown>;
  };
}
const native = (globalThis as typeof globalThis & { chrome?: PanelBrowser })
  .chrome;
export const inExtension = Boolean(native?.tabs);
const event = { addListener() {}, removeListener() {} };
export const browser: PanelBrowser = native?.tabs
  ? native
  : {
      tabs: {
        query: async () => [],
        sendMessage: async () => {
          throw new Error(
            'Live page extraction requires the Chrome extension.',
          );
        },
        onActivated: event,
        onUpdated: event,
      },
      scripting: {
        executeScript: async () => {
          throw new Error(
            'Live page extraction requires the Chrome extension.',
          );
        },
      },
    };
