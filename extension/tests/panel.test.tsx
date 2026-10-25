// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../entrypoints/sidepanel/App';
import samples from './fixtures/analysis.json';

const mocks = vi.hoisted(() => ({
  changed: [] as (() => void)[],
  updated: [] as ((
    id: number,
    change: { url?: string; status?: string },
  ) => void)[],
  stored: new Map<string, unknown>(),
  tab: {} as { id?: number; url?: string },
  requested: [] as string[][],
  scriptOK: false,
}));
vi.mock('../lib/browser', () => ({
  inExtension: false,
  storage: {
    get: async (key: string) =>
      mocks.stored.has(key) ? { [key]: mocks.stored.get(key) } : {},
    set: async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items))
        mocks.stored.set(key, structuredClone(value));
    },
    remove: async (key: string) => {
      mocks.stored.delete(key);
    },
  },
  browser: {
    tabs: {
      query: async () => [mocks.tab],
      sendMessage: async () => ({
        url: 'https://shop.example/products/bag',
        productTitle: 'Travel bag',
        reviews: [],
        instagramLinks: [],
        extractionLimitations: [],
        pageSignals: null,
      }),
      onActivated: {
        addListener: (fn: () => void) => mocks.changed.push(fn),
        removeListener: () => {},
      },
      onUpdated: {
        addListener: (
          fn: (id: number, change: { url?: string; status?: string }) => void,
        ) => mocks.updated.push(fn),
        removeListener: () => {},
      },
    },
    permissions: {
      request: async ({ origins }: { origins: string[] }) => {
        mocks.requested.push(origins);
        return true;
      },
    },
    scripting: {
      executeScript: async () => {
        if (!mocks.scriptOK)
          throw new Error('Cannot access contents of the page.');
      },
    },
  },
}));
let root: Root;
let container: HTMLDivElement;
const mount = async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
};
beforeEach(async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.changed.length = 0;
  mocks.updated.length = 0;
  mocks.stored.clear();
  mocks.requested.length = 0;
  mocks.scriptOK = false;
  mocks.tab = { id: 1, url: 'https://shop.example/products/bag' };
  await mount();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const scan = () => container.querySelector<HTMLButtonElement>('.primary')!;
const respond = async (body: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
  );
  await act(async () => {
    scan().click();
  });
};
const text = (selector: string) =>
  Array.from(container.querySelectorAll(selector), (n) =>
    (n.textContent || '').trim(),
  );

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
      if (samples[scenario].limitedEvidence)
        expect(
          container.querySelector('.result-heading')?.textContent,
        ).toContain('Limited evidence');
      expect(container.querySelector('.decision')?.className).toContain(
        `decision--${samples[scenario].decision.verdict}`,
      );
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

describe('checkout decision', () => {
  it('leads with a verdict that does not rely on colour alone', async () => {
    await respond(samples.warning);
    const banner = container.querySelector('.decision')!;
    expect(banner).toBe(container.querySelector('.results section'));
    expect(banner.querySelector('.decision-label')?.textContent).toBe(
      'Pause before paying',
    );
    expect(banner.querySelector('.decision-label svg')).not.toBeNull();
    expect(banner.textContent).toContain(samples.warning.decision.headline);
    expect(text('.decision-reasons li')).toEqual(
      samples.warning.decision.reasons,
    );
  });
  it.each([
    ['positive', 'Fewer concerns found'],
    ['limited', 'Protect your payment'],
  ] as const)('labels the %s verdict in words', async (scenario, label) => {
    await respond(samples[scenario]);
    expect(text('.decision-label')).toEqual([label]);
  });
  it('ranks payment options with the recommended one highlighted', async () => {
    await respond(samples.warning);
    expect(text('.pay-option .pay-title strong')).toEqual([
      'Credit card',
      'Cryptocurrency',
      'Zelle',
    ]);
    expect(text('.pay-option .badge')).toEqual([
      'Strong protection',
      'No protection',
      'No protection',
    ]);
    const recommended = container.querySelectorAll('.pay-option.recommended');
    expect(recommended).toHaveLength(1);
    expect(recommended[0].textContent).toContain('Credit card');
    expect(recommended[0].textContent).toContain('Recommended');
    expect(container.querySelector('.pay-warning')?.textContent).toBe(
      samples.warning.payment.warning,
    );
  });
  it('shows the amount at stake and flags a steep discount', async () => {
    await respond(samples.warning);
    const stake = container.querySelector('.stake')!.textContent;
    expect(stake).toContain('$35.99');
    expect(stake).toContain('was $129.00');
    expect(stake).toContain('72% off is unusually steep');
    await respond(samples.positive);
    expect(container.querySelector('.stake')?.textContent).toContain('$89.00');
    expect(container.querySelector('.stake-hint')).toBeNull();
  });
  it('keeps dispute steps in a keyboard-operable disclosure', async () => {
    await respond(samples.warning);
    const details = container.querySelector<HTMLDetailsElement>('.dispute')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe(
      'If something goes wrong',
    );
    expect(text('.dispute li')).toEqual(samples.warning.payment.disputeSteps);
  });
  it('renders store basics next to the other sources', async () => {
    await respond(samples.warning);
    const titles = text('.source-title strong');
    expect(titles).toContain('Store basics');
    expect(titles).toHaveLength(4);
    const store = Array.from(container.querySelectorAll('.source-card')).find(
      (card) => card.textContent?.includes('Store basics'),
    )!;
    expect(store.hasAttribute('open')).toBe(true);
    expect(store.textContent).toContain('Domain registered 23 days ago');
    expect(container.querySelector('.section-heading')?.textContent).toContain(
      '4 of 4 available',
    );
  });
  it('labels template and AI-written briefs differently', async () => {
    await respond(samples.warning);
    expect(text('.brief h2')).toEqual(['Summary']);
    await respond({
      ...samples.warning,
      brief: { text: 'Written from the findings.', generated: true },
    });
    expect(text('.brief h2')).toEqual([
      'AI summary · written from the evidence above',
    ]);
    expect(container.querySelector('.brief p')?.textContent).toBe(
      'Written from the findings.',
    );
  });
  it('announces the result and moves focus to it', async () => {
    await respond(samples.warning);
    expect(
      container.querySelector('[aria-live="polite"]')?.textContent,
    ).toContain('Pause before paying');
    expect(document.activeElement?.textContent).toBe(
      'Result for lunar-outlet.example',
    );
  });
  it.each([
    ['missing', undefined],
    ['null', null],
  ])(
    'still renders an older backend response with %s v2 fields',
    async (_label, value) => {
      const legacy: Record<string, unknown> = {
        ...samples.warning,
        sources: samples.warning.sources.filter((s) => s.source !== 'store'),
      };
      for (const key of ['decision', 'payment', 'amountAtStake', 'brief'])
        if (value === undefined) delete legacy[key];
        else legacy[key] = value;
      await respond(legacy);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.querySelector('.risk-number')?.textContent).toContain(
        '72',
      );
      expect(container.querySelector('.decision')).toBeNull();
      expect(container.querySelector('.pay-card')).toBeNull();
      expect(container.querySelector('.brief')).toBeNull();
      expect(container.querySelector('.why')?.textContent).toContain(
        samples.warning.summary,
      );
      expect(
        container.querySelector('.section-heading')?.textContent,
      ).toContain('of 3 available');
    },
  );
});

describe('recent checks', () => {
  it('keeps only domain, verdict, risk and time, and can be cleared', async () => {
    await respond(samples.warning);
    const stored = mocks.stored.get('recentChecks') as Record<
      string,
      unknown
    >[];
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]).sort()).toEqual([
      'checkedAt',
      'domain',
      'risk',
      'verdict',
    ]);
    expect(stored[0]).toMatchObject({
      domain: 'lunar-outlet.example',
      verdict: 'pause',
      risk: 72,
    });
    expect(JSON.stringify(stored)).not.toContain('never arrived');
    expect(text('.recent li strong')).toEqual(['lunar-outlet.example']);
    expect(container.querySelector('.recent li')?.textContent).toContain(
      'Pause',
    );
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Clear recent checks"]')!
        .click();
    });
    expect(container.querySelector('.recent')).toBeNull();
    expect(mocks.stored.has('recentChecks')).toBe(false);
  });
  it('loads saved checks when the panel opens and ignores corrupt data', async () => {
    await act(async () => root.unmount());
    container.remove();
    mocks.stored.set('recentChecks', [
      {
        domain: 'cedar-trail.example',
        verdict: 'proceed',
        risk: 5,
        checkedAt: '2026-10-24T12:00:00Z',
      },
    ]);
    await mount();
    expect(text('.recent li strong')).toEqual(['cedar-trail.example']);
    await act(async () => root.unmount());
    container.remove();
    mocks.stored.set('recentChecks', 'not a list');
    await mount();
    expect(container.querySelector('.recent')).toBeNull();
  });
});

describe('live tab access', () => {
  it('lets a tab Chrome has not granted yet be checked and explains the toolbar click', async () => {
    await act(async () => root.unmount());
    mocks.tab = { id: 7 };
    await mount();
    const live = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Live check'),
    )!;
    await act(async () => {
      live.click();
    });
    expect(container.querySelector('.store-card strong')?.textContent).toBe(
      'This tab',
    );
    expect(scan().disabled).toBe(false);
    await act(async () => {
      scan().click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Chrome blocked reading this page',
    );
  });
});

describe('scan continuity and source diagnostics', () => {
  it('keeps a result when this panel regains focus on the same tab', async () => {
    await respond(samples.warning);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(container.querySelector('.results')).not.toBeNull();
  });
  it('ignores updates in an unrelated background tab', async () => {
    await respond(samples.warning);
    await act(async () => {
      mocks.updated.forEach((fn) => fn(99, { status: 'loading' }));
    });
    expect(container.querySelector('.results')).not.toBeNull();
  });
  it('explains a missing provider key separately from merchant evidence', async () => {
    const result = structuredClone(samples.limited);
    const source = result.sources.find((s) => s.source === 'reviews')!;
    Object.assign(source, {
      diagnostic: {
        code: 'missing-key',
        message: 'Review analysis is not enabled.',
        action: 'Configure GPTZERO_API_KEY on the backend.',
      },
    });
    await respond(result);
    expect(
      container.querySelector('.coverage-explainer')?.textContent,
    ).toContain('Review analysis is not enabled.');
    expect(container.textContent).toContain(
      'Missing information is not a warning about the store.',
    );
  });
});

it('checks backend setup on request and identifies a missing review key', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'ok',
      service: 'CheckoutGuard',
      version: '0.2.0',
      providers: {
        reddit: true,
        instagram: true,
        reviews: false,
        store: true,
      },
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Live check'))!
      .click();
  });
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Check service setup')!
      .click();
  });
  expect(container.querySelector('.service-setup')?.textContent).toContain(
    'Review text: API key missing',
  );
  expect(fetcher.mock.calls[0][0]).toContain('/health');
});

it('does not clear a live result when extraction strips tracking parameters', async () => {
  await act(async () => root.unmount());
  container.remove();
  mocks.tab = {
    id: 1,
    url: 'https://shop.example/products/bag?campaign=public',
  };
  mocks.scriptOK = true;
  await mount();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => samples.warning }),
  );
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Live check'))!
      .click();
  });
  await act(async () => {
    scan().click();
  });
  expect(container.querySelector('.results')).not.toBeNull();
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(container.querySelector('.results')).not.toBeNull();
});
