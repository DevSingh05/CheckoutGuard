export const adapters = [
  { name: 'Judge.me', selector: '.jdgm-rev__body' },
  { name: 'Loox', selector: '.loox-review-content, .loox-review .review-text' },
  {
    name: 'Yotpo',
    selector: '.yotpo-review .content-review, .yotpo-review-content',
  },
  {
    name: 'Generic structured review',
    selector: '[itemprop="review"] [itemprop="reviewBody"]',
  },
] as const;

export function visible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      node.hasAttribute('hidden') ||
      node.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    )
      return false;
  }
  return true;
}

export function extractReviews(doc: Document = document) {
  const reviews: string[] = [];
  const platforms: string[] = [];
  let size = 0;
  let skipped = false;
  for (const adapter of adapters) {
    let matched = false;
    for (const node of doc.querySelectorAll(adapter.selector)) {
      if (!visible(node)) continue;
      // innerText preserves rendered wording, excluding hidden descendants. textContent is for DOM fixtures.
      const text = (
        (node as HTMLElement).innerText ??
        node.textContent ??
        ''
      ).trim();
      if (!text || reviews.includes(text)) continue;
      if (
        text.length > 2000 ||
        size + text.length > 12000 ||
        reviews.length >= 20
      ) {
        skipped = true;
        continue;
      }
      reviews.push(text);
      size += text.length;
      matched = true;
    }
    if (matched) platforms.push(adapter.name);
    if (reviews.length && adapter.name !== 'Generic structured review') break;
  }
  return { reviews, platforms, skipped };
}

export async function collectPage() {
  if (
    !/^https?:$/.test(location.protocol) ||
    /\/(checkout|cart|account|login|payment)(\/|$)/i.test(location.pathname)
  ) {
    throw new Error(
      'Open a public product page, not a checkout or account page.',
    );
  }
  // Bounded wait for late widgets; do not crawl iframes or closed shadow roots.
  if (!extractReviews().reviews.length)
    await new Promise<void>((resolve) => {
      const finish = () => {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (extractReviews().reviews.length) finish();
      });
      const timer = setTimeout(finish, 1800);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  const { reviews, platforms, skipped } = extractReviews();
  const instagramLinks = [
    ...new Set(
      Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .filter(visible)
        .map((a) => a.href.split(/[?#]/)[0])
        .filter((href) =>
          /^https:\/\/(?:www\.)?instagram\.com\/(?!p\/?$|reels?\/?$|explore\/?$|accounts\/?$|stories\/?$)[A-Za-z0-9_.]{1,30}\/?$/.test(
            href,
          ),
        ),
    ),
  ].slice(0, 3);
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  return {
    url: url.href,
    productTitle: (
      document.querySelector<HTMLElement>('h1')?.innerText || document.title
    )
      .trim()
      .slice(0, 300),
    instagramLinks,
    reviews,
    extractionLimitations: [
      ...(reviews.length
        ? [`Extracted ${reviews.length} reviews using ${platforms.join(', ')}.`]
        : ['No accessible rendered reviews found after a bounded wait.']),
      'Cross-origin iframes and closed shadow roots cannot be read. Scroll to load reviews and retry if needed.',
      ...(skipped
        ? [
            'Some reviews were omitted to preserve complete wording within payload limits.',
          ]
        : []),
    ],
  };
}
