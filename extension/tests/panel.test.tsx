// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../entrypoints/sidepanel/App';
import samples from './fixtures/analysis.json';

const mocks = vi.hoisted(() => ({ changed: [] as (() => void)[] }));
vi.mock('../lib/browser', () => ({
  inExtension: false,
  browser: {
    tabs: {
      query: async () => [{ id: 1, url: 'https://shop.example/products/bag' }],
      onActivated: {
        addListener: (fn: () => void) => mocks.changed.push(fn),
        removeListener: () => {},
      },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.changed.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const scan = () => container.querySelector<HTMLButtonElement>('.primary')!;

describe('side panel state', () => {
  it.each(['warning', 'positive', 'limited', 'outage'] as const)(
    'renders the backend %s fixture with risk separate from coverage',
    async (scenario) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue({ ok: true, json: async () => samples[scenario] }),
      );
      await act(async () => {
        scan().click();
      });
      expect(container.textContent).toContain('FICTIONAL DEMO RESULT');
      expect(container.querySelector('.coverage')?.textContent).toContain(
        `${samples[scenario].coverage}%`,
      );
      expect(container.querySelector('.risk-number')?.textContent).toContain(
        String(samples[scenario].overallRisk ?? '—'),
      );
      if (['limited', 'outage'].includes(scenario))
        expect(
          container.querySelector('.result-heading')?.textContent,
        ).toContain('Limited evidence');
    },
  );
  it('handles backend downtime without inventing evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('network error')),
    );
    await act(async () => {
      scan().click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Cannot reach CheckoutGuard',
    );
    expect(container.querySelector('.results')).toBeNull();
  });
  it('ignores a response that finishes after the active tab changes', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
    );
    await act(async () => {
      scan().click();
    });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      for (const changed of mocks.changed) changed();
    });
    await act(async () => {
      resolve({ ok: true, json: async () => samples.warning });
    });
    expect(container.querySelector('.results')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
  it('rejects malformed API data rather than displaying a verdict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ overallRisk: -20 }),
      }),
    );
    await act(async () => {
      scan().click();
    });
    expect(container.querySelector('.results')).toBeNull();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
