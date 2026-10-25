// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRecent, loadRecent, recordCheck } from '../lib/recent';

const check = (domain: string, minute = 0) => ({
  domain,
  verdict: 'protect' as const,
  risk: 40,
  checkedAt: `2026-10-24T12:0${minute}:00Z`,
});
afterEach(async () => {
  vi.restoreAllMocks();
  await clearRecent();
  localStorage.clear();
});
describe('recent checks outside Chrome', () => {
  it('falls back to localStorage, keeps the last five and dedupes domains', async () => {
    for (let i = 0; i < 7; i++) await recordCheck(check(`shop${i}.example`, i));
    await recordCheck(check('shop4.example', 9));
    const items = await loadRecent();
    expect(items.map((i) => i.domain)).toEqual([
      'shop4.example',
      'shop6.example',
      'shop5.example',
      'shop3.example',
      'shop2.example',
    ]);
    expect(localStorage.getItem('checkoutguard:recentChecks')).toContain(
      'shop4.example',
    );
  });
  it('drops anything beyond the minimal shape', async () => {
    await recordCheck({
      ...check('shop.example'),
      reviews: ['private text'],
    } as ReturnType<typeof check>);
    expect(localStorage.getItem('checkoutguard:recentChecks')).not.toContain(
      'private text',
    );
  });
  it('keeps working in memory when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    await expect(recordCheck(check('shop.example'))).resolves.toHaveLength(1);
    expect((await loadRecent())[0].domain).toBe('shop.example');
    await clearRecent();
    expect(await loadRecent()).toEqual([]);
  });
});
