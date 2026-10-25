// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  extractReviews,
  collectPage,
  extractPageSignals,
  extractPrice,
  detectPaymentMethods,
} from '../lib/extract';
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});
describe('rendered review adapters', () => {
  it.each([
    ['judgeme', 'Judge.me', ['My order never arrived. Still waiting!']],
    [
      'loox',
      'Loox',
      ['Lovely bag — arrived on time.', 'The seam tore after a week.'],
    ],
    [
      'yotpo',
      'Yotpo',
      [
        'I received my refund. Thank you for following up.',
        'Beautiful fabric, exactly as described.',
      ],
    ],
    [
      'generic',
      'Generic structured review',
      ['Useful pockets; delivery took 3 days.'],
    ],
  ])('extracts %s without paraphrasing', (fixture, platform, expected) => {
    document.body.innerHTML = readFileSync(
      `tests/fixtures/${fixture}.html`,
      'utf8',
    );
    expect(extractReviews().reviews).toEqual(expected);
    expect(extractReviews().platforms).toEqual([platform]);
  });
  it('omits oversized reviews rather than truncating wording', () => {
    document.body.innerHTML = `<div class="jdgm-rev__body">${'a'.repeat(2001)}</div>`;
    expect(extractReviews()).toMatchObject({ reviews: [], skipped: true });
  });
  it('preserves internal whitespace and only deduplicates exact text', () => {
    document.body.innerHTML =
      '<div class="jdgm-rev__body">Good  bag</div><div class="jdgm-rev__body">Good bag</div>';
    expect(extractReviews().reviews).toEqual(['Good  bag', 'Good bag']);
  });
  it('caps total text and number of reviews', () => {
    document.body.innerHTML = Array.from(
      { length: 30 },
      (_, i) => `<p class="jdgm-rev__body">${i}${'a'.repeat(999)}</p>`,
    ).join('');
    const result = extractReviews();
    expect(result.reviews.length).toBeLessThanOrEqual(20);
    expect(result.reviews.join('').length).toBeLessThanOrEqual(12000);
  });
  it('waits for a delayed widget and strips URL parameters', async () => {
    history.replaceState({}, '', '/products/bag?session=private#fragment');
    const pending = collectPage();
    document.body.innerHTML =
      '<h1>Travel bag</h1><div class="jdgm-rev__body">Arrived on time.</div><a href="https://www.instagram.com/cedartrail/">Instagram</a>';
    const result = await pending;
    expect(result.reviews).toEqual(['Arrived on time.']);
    expect(result.url).not.toContain('session');
    expect(result.instagramLinks).toEqual([
      'https://www.instagram.com/cedartrail/',
    ]);
  });
  it('returns an honest limitation when reviews never arrive', async () => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/products/bag');
    const pending = collectPage();
    await vi.advanceTimersByTimeAsync(1801);
    expect((await pending).extractionLimitations[0]).toContain('No accessible');
  });
  it('refuses checkout pages', async () => {
    history.replaceState({}, '', '/checkout');
    await expect(collectPage()).rejects.toThrow('public product page');
  });
});

const load = (fixture: string) => {
  document.body.innerHTML = readFileSync(
    `tests/fixtures/${fixture}.html`,
    'utf8',
  );
};
describe('page signals', () => {
  it('flags irreversible methods, a steep discount and a missing policy', () => {
    load('store-scam');
    expect(extractPageSignals(document)).toEqual({
      paymentMethods: ['credit-card', 'crypto', 'zelle'],
      hasReturnPolicy: false,
      hasContactPage: false,
      hasEmail: false,
      hasPhone: false,
      price: 35.99,
      compareAtPrice: 129,
      currency: null,
    });
  });
  it('reads badges, policy, contact and structured price on a typical store', () => {
    load('store-legit');
    expect(extractPageSignals(document)).toEqual({
      paymentMethods: [
        'credit-card',
        'paypal',
        'apple-pay',
        'shop-pay',
        'klarna',
      ],
      hasReturnPolicy: true,
      hasContactPage: true,
      hasEmail: true,
      hasPhone: true,
      price: 89,
      compareAtPrice: 110,
      currency: 'USD',
    });
  });
  it('avoids common-word false positives', () => {
    document.body.innerHTML = `
      <p>Discover our new arrivals and affirm your style.</p>
      <p>We do not accept PayPal or Venmo.</p>
      <a href="/gift-cards">Gift cards</a>
      <img alt="Visual merchandising" src="/img/visualize.png" />
      <div class="display-grid cardigan">Cardigans</div>`;
    expect(detectPaymentMethods(document)).toEqual([]);
  });
  it('counts strict methods only in a payment context', () => {
    document.body.innerHTML = `
      <div id="payment-methods"><span>Discover</span><span>Gift card</span></div>
      <p>Pay with Venmo or Cash App at checkout.</p>`;
    expect(detectPaymentMethods(document)).toEqual([
      'credit-card',
      'gift-card',
      'cash-app',
      'venmo',
    ]);
  });
  it('says unknown rather than missing on a barely rendered page', () => {
    document.body.innerHTML = '<h1>Loading…</h1>';
    expect(extractPageSignals(document)).toMatchObject({
      paymentMethods: [],
      hasReturnPolicy: null,
      hasContactPage: null,
      hasEmail: null,
      hasPhone: null,
      price: null,
    });
  });
  it.each([
    [
      '<meta property="product:price:amount" content="1299.50"><meta property="product:price:currency" content="EUR">',
      1299.5,
      null,
      'EUR',
    ],
    [
      '<div class="price"><span>€1.299,00</span><span class="compare-at-price">€1.499,00</span></div>',
      1299,
      1499,
      'EUR',
    ],
    ['<div class="price"><del>£20.00</del> £25.00</div>', 25, null, 'GBP'],
    ['<div class="price">Sold out</div>', null, null, null],
    ['<script type="application/ld+json">{not json</script>', null, null, null],
  ])(
    'parses price markup conservatively: %s',
    (html, price, compareAtPrice, currency) => {
      document.body.innerHTML = html;
      expect(extractPrice(document)).toEqual({
        price,
        compareAtPrice,
        currency,
      });
    },
  );
  it('sends signals with the collected page', async () => {
    history.replaceState({}, '', '/products/bag');
    document.body.innerHTML =
      '<h1>Bag</h1><div class="jdgm-rev__body">Fine.</div><footer><a href="/pages/contact">Contact</a><p>We accept Visa and PayPal.</p></footer>';
    const result = await collectPage();
    expect(result.pageSignals).toMatchObject({
      paymentMethods: ['credit-card', 'paypal'],
      hasContactPage: true,
      hasReturnPolicy: false,
    });
  });
});
