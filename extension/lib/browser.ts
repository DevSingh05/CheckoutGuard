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
  runtime?: {
    onMessage: Event<(message: { type?: string }) => void>;
  };
  permissions?: {
    request(permissions: { origins: string[] }): Promise<boolean>;
  };
  scripting: {
    executeScript(options: {
      target: { tabId: number };
      files: string[];
    }): Promise<unknown>;
  };
}
export interface KeyValueStore {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}
const native = (
  globalThis as typeof globalThis & {
    chrome?: PanelBrowser & { storage?: { local?: KeyValueStore } };
  }
).chrome;
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

// chrome.storage.local inside the extension; localStorage (or memory when that is blocked) in browser preview.
const memory = new Map<string, unknown>();
const prefix = 'checkoutguard:';
const fallbackStore: KeyValueStore = {
  async get(key) {
    try {
      const raw = globalThis.localStorage?.getItem(prefix + key);
      if (raw != null) return { [key]: JSON.parse(raw) };
    } catch {
      // Storage blocked or corrupt: fall through to memory.
    }
    return memory.has(key) ? { [key]: memory.get(key) } : {};
  },
  async set(items) {
    for (const [key, value] of Object.entries(items)) {
      memory.set(key, value);
      try {
        globalThis.localStorage?.setItem(prefix + key, JSON.stringify(value));
      } catch {
        // Memory copy still serves this session.
      }
    }
  },
  async remove(key) {
    memory.delete(key);
    try {
      globalThis.localStorage?.removeItem(prefix + key);
    } catch {
      // Nothing persisted to remove.
    }
  },
};
export const storage: KeyValueStore = native?.storage?.local ?? fallbackStore;
