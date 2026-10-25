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
  let pageSignals: PageSignals | null = null;
  try {
    pageSignals = extractPageSignals(document);
  } catch {
    // Signals are optional context; never fail the scan over them.
  }
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
    pageSignals,
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

// Same strings as the backend PaymentMethod enum. Kept dependency-free so the content script stays small.
export const paymentMethods = [
  'credit-card',
  'debit-card',
  'paypal',
  'apple-pay',
  'google-pay',
  'shop-pay',
  'amazon-pay',
  'klarna',
  'afterpay',
  'affirm',
  'crypto',
  'zelle',
  'wire-transfer',
  'bank-transfer',
  'gift-card',
  'cash-app',
  'venmo',
  'western-union',
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export type PageSignals = {
  paymentMethods: PaymentMethod[];
  hasReturnPolicy: boolean | null;
  hasContactPage: boolean | null;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  price: number | null;
  compareAtPrice: number | null;
  currency: string | null;
};

// `strict` methods are common words or common footer links ("Discover our range", "Gift cards"),
// so they only count inside an explicit payment context.
const paymentRules: {
  method: PaymentMethod;
  pattern: RegExp;
  strict?: true;
}[] = [
  {
    method: 'credit-card',
    pattern:
      /\b(visa|master ?card|amex|american express|diners club|jcb|credit cards?)\b/i,
  },
  { method: 'credit-card', pattern: /\bdiscover\b/i, strict: true },
  { method: 'debit-card', pattern: /\b(debit cards?|maestro)\b/i },
  { method: 'paypal', pattern: /\bpay ?pal\b/i },
  { method: 'apple-pay', pattern: /\bapple ?pay\b/i },
  { method: 'google-pay', pattern: /\b(google ?pay|g ?pay)\b/i },
  { method: 'shop-pay', pattern: /\bshop ?pay\b/i },
  { method: 'amazon-pay', pattern: /\bamazon ?pay\b/i },
  { method: 'klarna', pattern: /\bklarna\b/i },
  { method: 'afterpay', pattern: /\bafter ?pay\b/i },
  { method: 'affirm', pattern: /\baffirm\b/i, strict: true },
  {
    method: 'crypto',
    pattern:
      /\b(bitcoin|btc|usdt|tether|ethereum|crypto(currency|currencies)?)\b/i,
  },
  { method: 'zelle', pattern: /\bzelle\b/i },
  { method: 'wire-transfer', pattern: /\bwire transfers?\b/i },
  { method: 'bank-transfer', pattern: /\bbank transfers?\b/i },
  { method: 'gift-card', pattern: /\bgift ?cards?\b/i, strict: true },
  { method: 'cash-app', pattern: /\bcash ?app\b/i },
  { method: 'venmo', pattern: /\bvenmo\b/i },
  { method: 'western-union', pattern: /\bwestern union\b/i },
];
const paymentPhrase =
  /\b(we accept|accepted payments?|payment (methods?|options)|pay (with|via|by|using)|payments? accepted)\b/i;
const negation =
  /\b(not|no longer|never|cannot|can't|don't|doesn't|won't|except)\b/i;
const paymentContainer =
  '[class*="payment" i], [id*="payment" i], [aria-label*="payment" i], [class*="pay-icon" i], [class*="accepted" i]';

/** Rendered layout check that, unlike `visible`, keeps aria-hidden icons (their labels sit nearby). */
function rendered(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
function textNodes(element: Element) {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement?.tagName.toLowerCase();
    const text = node.textContent?.replace(/\s+/g, ' ').trim();
    if (text && parent !== 'script' && parent !== 'style') parts.push(text);
  }
  return parts;
}
/** Separate text nodes with spaces so "<li>Visa</li><li>Amex</li>" never reads "VisaAmex". */
function textOf(element: Element) {
  return textNodes(element).join(' ');
}
/** "payment-icon--apple_pay" / "applePay.svg" -> "payment icon apple pay" / "apple Pay svg". */
function words(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_./:]+/g, ' ')
    .trim();
}
function fileName(src: string) {
  const path = src.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.[a-z0-9]+$/i, '');
}

export function detectPaymentMethods(doc: Document = document) {
  const found = new Set<PaymentMethod>();
  const scan = (value: string | null | undefined, inContext: boolean) => {
    if (!value || value.length > 600) return;
    for (const rule of paymentRules)
      if ((inContext || !rule.strict) && rule.pattern.test(value))
        found.add(rule.method);
  };
  const isContext = (element: Element) =>
    Boolean(element.closest(paymentContainer));
  // Badge-like attributes: image alt/title/filename, aria labels, svg titles, class names.
  const badges = doc.querySelectorAll(
    'img, svg, [aria-label], [title], [class*="pay" i], [class*="card" i], [class*="visa" i], [class*="crypto" i], [class*="bitcoin" i], [class*="zelle" i], [class*="venmo" i], [class*="klarna" i], [class*="afterpay" i], [class*="affirm" i], [class*="amex" i], [class*="discover" i], [class*="gift" i]',
  );
  let budget = 3000;
  for (const element of badges) {
    if (--budget < 0) break;
    if (!rendered(element)) continue;
    const context = isContext(element);
    scan(element.getAttribute('alt'), context);
    scan(element.getAttribute('title'), context);
    scan(element.getAttribute('aria-label'), context);
    if (element.tagName.toLowerCase() === 'img')
      scan(words(fileName(element.getAttribute('src') || '')), context);
    if (element.tagName.toLowerCase() === 'svg')
      scan(element.querySelector('title')?.textContent, context);
    const className = element.getAttribute('class');
    if (className) scan(words(className), context);
  }
  // Visible text, only where a store lists how it takes payment.
  for (const element of doc.querySelectorAll(
    `footer, [role="contentinfo"], ${paymentContainer}`,
  )) {
    if (!rendered(element)) continue;
    const context = isContext(element);
    for (const line of textNodes(element)) scan(line, context);
  }
  for (const element of doc.querySelectorAll('p, li, dd, td, span, div')) {
    if (element.children.length > 6) continue;
    const text = textOf(element);
    if (
      text.length > 400 ||
      !paymentPhrase.test(text) ||
      negation.test(text) ||
      !rendered(element)
    )
      continue;
    scan(text, true);
  }
  return paymentMethods.filter((method) => found.has(method)).slice(0, 16);
}

function parseAmount(raw: string): number | null {
  const digits = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return null;
  let normal = digits;
  const comma = digits.lastIndexOf(',');
  const dot = digits.lastIndexOf('.');
  if (comma > -1 && dot > -1)
    normal =
      comma > dot
        ? digits.replace(/\./g, '').replace(',', '.')
        : digits.replace(/,/g, '');
  else if (comma > -1)
    normal = /,\d{2}$/.test(digits)
      ? digits.replace(/,(?=\d{3}\b)/g, '').replace(',', '.')
      : digits.replace(/,/g, '');
  else if ((digits.match(/\./g) || []).length > 1)
    normal = digits.replace(/\.(?=\d{3})/g, '');
  const value = Number(normal);
  return Number.isFinite(value) && value > 0 && value <= 1_000_000
    ? Math.round(value * 100) / 100
    : null;
}
const symbolCurrency: [RegExp, string][] = [
  [/US\$|\bUSD\b/i, 'USD'],
  [/CA\$|C\$|\bCAD\b/i, 'CAD'],
  [/AU?\$|\bAUD\b/i, 'AUD'],
  [/€|\bEUR\b/i, 'EUR'],
  [/£|\bGBP\b/i, 'GBP'],
  [/₹|\bINR\b/i, 'INR'],
];
// A plain "$" is ambiguous (USD, CAD, AUD...), so it stays unknown.
function currencyOf(text: string) {
  return symbolCurrency.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
const money =
  /(?:US\$|CA\$|AU?\$|C\$|[$€£₹]|\b(?:USD|CAD|AUD|EUR|GBP|INR)\b)\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|\b(?:USD|CAD|AUD|EUR|GBP|INR)\b)/i;
function moneyIn(text: string) {
  const match = money.exec(text);
  return match ? { amount: parseAmount(match[0]), text: match[0] } : null;
}
function validCurrency(value: unknown) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value.trim())
    ? value.trim()
    : null;
}

type Offer = { price?: unknown; lowPrice?: unknown; priceCurrency?: unknown };
function structuredPrice(doc: Document) {
  const products: Record<string, unknown>[] = [];
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    const record = node as Record<string, unknown>;
    const type = record['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product')))
      products.push(record);
    walk(record['@graph'], depth + 1);
  };
  for (const script of doc.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      walk(JSON.parse(script.textContent || ''), 0);
    } catch {
      // Malformed JSON-LD is common; ignore it.
    }
  }
  for (const product of products) {
    const offers = ([] as unknown[]).concat(product.offers ?? []);
    for (const raw of offers) {
      if (!raw || typeof raw !== 'object') continue;
      const offer = raw as Offer & { priceSpecification?: unknown };
      const price = parseAmount(String(offer.price ?? offer.lowPrice ?? ''));
      if (price === null) continue;
      let compareAtPrice: number | null = null;
      for (const spec of ([] as unknown[]).concat(
        offer.priceSpecification ?? [],
      )) {
        const s = spec as { priceType?: unknown; price?: unknown };
        if (/StrikethroughPrice|ListPrice/.test(String(s?.priceType ?? '')))
          compareAtPrice = parseAmount(String(s.price ?? ''));
      }
      return {
        price,
        compareAtPrice,
        currency: validCurrency(offer.priceCurrency),
      };
    }
  }
  return null;
}
function metaContent(doc: Document, selector: string) {
  return doc.querySelector(selector)?.getAttribute('content') ?? null;
}

export function extractPrice(doc: Document = document) {
  let price: number | null = null;
  let compareAtPrice: number | null = null;
  let currency: string | null = null;
  const structured = structuredPrice(doc);
  if (structured) ({ price, compareAtPrice, currency } = structured);
  if (price === null) {
    const meta = metaContent(
      doc,
      'meta[property="product:price:amount"], meta[property="og:price:amount"], meta[itemprop="price"]',
    );
    price = meta ? parseAmount(meta) : null;
    currency = validCurrency(
      metaContent(
        doc,
        'meta[property="product:price:currency"], meta[property="og:price:currency"], meta[itemprop="priceCurrency"]',
      ),
    );
  }
  const compareSelectors = [
    '.compare-at-price, [class*="compare-at" i], [class*="compare_at" i], [class*="price--compare" i], [class*="was-price" i]',
    '[class*="price" i] s, [class*="price" i] del',
    's, del',
  ];
  if (compareAtPrice === null)
    search: for (const selector of compareSelectors)
      for (const element of doc.querySelectorAll(selector)) {
        const text = textOf(element);
        // Bare s/del must contain nothing but a price, so struck-out prose is ignored.
        if (
          selector === 's, del' &&
          !/^[^\d]{0,4}\d[\d.,\s]*[^\d]{0,4}$/.test(text)
        )
          continue;
        const found = text.length <= 40 ? moneyIn(text) : null;
        if (found?.amount != null && rendered(element)) {
          compareAtPrice = found.amount;
          currency ??= currencyOf(found.text);
          break search;
        }
      }
  if (price === null)
    for (const element of doc.querySelectorAll(
      '[class*="sale-price" i], [class*="price--sale" i], [class*="price-item--sale" i], .price, [itemprop="price"]',
    )) {
      if (!rendered(element)) continue;
      const copy = element.cloneNode(true) as Element;
      copy
        .querySelectorAll(
          's, del, .compare-at-price, [class*="compare" i], [class*="regular" i], [class*="was" i]',
        )
        .forEach((n) => n.remove());
      const found = moneyIn(textOf(copy));
      if (found?.amount != null) {
        price = found.amount;
        currency ??= currencyOf(found.text);
        break;
      }
    }
  if (price === null || compareAtPrice === null || compareAtPrice <= price)
    compareAtPrice = null;
  return { price, compareAtPrice, currency };
}

// Plural "returns" or "refund" so "Return to top" never counts as a policy.
const policyPattern = /\b(returns|refunds?)\b|\breturn polic(y|ies)\b/i;
const contactPattern =
  /\b(contact( us)?|about( us)?|customer (service|care|support)|support)\b/i;
const emailPattern = /\b[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}\b/i;

export function extractPageSignals(doc: Document = document): PageSignals {
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .slice(0, 1500)
    .filter(rendered);
  // With almost no links the page may not have rendered: say "unknown", not "missing".
  const judged = links.length >= 5 || Boolean(doc.querySelector('footer'));
  const decide = (found: boolean) => (found ? true : judged ? false : null);
  const hrefPath = (a: HTMLAnchorElement) =>
    words(decodeURIComponent((a.getAttribute('href') || '').split(/[?#]/)[0]));
  const footerText = Array.from(
    doc.querySelectorAll('footer, [role="contentinfo"]'),
  )
    .map(textOf)
    .join(' ');
  return {
    paymentMethods: detectPaymentMethods(doc),
    hasReturnPolicy: decide(
      links.some(
        (a) =>
          policyPattern.test(textOf(a)) ||
          /\b(returns|refunds?|return polic(y|ies))\b/i.test(hrefPath(a)),
      ),
    ),
    hasContactPage: decide(
      links.some(
        (a) =>
          contactPattern.test(textOf(a)) ||
          /\b(contact|about|support)\b/i.test(hrefPath(a)),
      ),
    ),
    hasEmail: decide(
      links.some((a) => /^mailto:/i.test(a.getAttribute('href') || '')) ||
        emailPattern.test(footerText),
    ),
    hasPhone: decide(
      links.some((a) => /^tel:/i.test(a.getAttribute('href') || '')),
    ),
    ...extractPrice(doc),
  };
}
