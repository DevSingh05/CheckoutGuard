// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { extractReviews, collectPage } from '../lib/extract';
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
