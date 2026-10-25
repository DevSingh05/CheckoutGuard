import { useCallback, useEffect, useRef, useState } from 'react';
import { browser, inExtension } from '../../lib/browser';
import {
  ArrowRight,
  ShieldCheck,
  Search,
  ExternalLink,
  ChevronDown,
  CircleHelp,
  LockKeyhole,
  RefreshCw,
  Radio,
  MessageCircle,
  Instagram,
  ScanText,
  Check,
  AlertTriangle,
  Store,
} from 'lucide-react';
import {
  responseSchema,
  type Analysis,
  type Scenario,
} from '../../lib/contracts';
import type { collectPage } from '../../lib/extract';
import {
  clearRecent,
  loadRecent,
  recordCheck,
  type RecentCheck,
} from '../../lib/recent';
import { DecisionBanner, verdictCopy } from './components/DecisionBanner';
import { PaymentCard } from './components/PaymentCard';
import { BriefCard } from './components/BriefCard';
import { RecentChecks } from './components/RecentChecks';

const API = import.meta.env.WXT_API_URL || 'http://localhost:8000';
const names = {
  reddit: 'Reddit experiences',
  instagram: 'Instagram comments',
  store: 'Store basics',
  reviews: 'Review text signal',
};
const icons = {
  reddit: MessageCircle,
  instagram: Instagram,
  store: Store,
  reviews: ScanText,
};
const scenarioNames = {
  warning: 'Warning signals',
  positive: 'Positive experiences',
  limited: 'Limited evidence',
  outage: 'Partial outage',
};
const merchantNames = {
  warning: 'lunar-outlet.example',
  positive: 'cedar-trail.example',
  limited: 'little-orbit.example',
  outage: 'lunar-outlet.example',
};
type Tab = { id?: number; url?: string; title?: string };
function allowed(url?: string) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      /^https?:$/.test(u.protocol) &&
      !/\/(checkout|cart|account|login|payment)(\/|$)/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>({});
  const [demo, setDemo] = useState(!inExtension);
  const [scenario, setScenario] = useState<Scenario>('warning');
  const [result, setResult] = useState<Analysis | null>(null);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [needsAccess, setNeedsAccess] = useState(false);
  const [recent, setRecent] = useState<RecentCheck[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    setResult(null);
    setPhase('');
    setError('');
    setNeedsAccess(false);
    setAnnouncement('');
  }, []);
  useEffect(() => {
    let disposed = false;
    void loadRecent().then((items) => {
      if (!disposed) setRecent(items);
    });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    // Move keyboard and screen-reader focus to the new result.
    if (result) resultHeading.current?.focus();
  }, [result]);
  useEffect(() => {
    let disposed = false;
    const sync = async () => {
      invalidate();
      const version = generation.current;
      try {
        const [active] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!disposed && version === generation.current) setTab(active || {});
      } catch {
        if (!disposed && version === generation.current) setTab({});
      }
    };
    const changed = (
      _id: number,
      change: { url?: string; status?: string },
    ) => {
      if (change.url || change.status === 'loading') void sync();
    };
    // Clicking the toolbar icon grants access without a tab event, so re-read when the panel regains focus.
    const refocus = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    void sync();
    window.addEventListener('focus', refocus);
    document.addEventListener('visibilitychange', refocus);
    const granted = (message: { type?: string }) => {
      if (message?.type === 'checkoutguard:granted') void sync();
    };
    browser.tabs.onActivated.addListener(sync);
    browser.tabs.onUpdated.addListener(changed);
    browser.runtime?.onMessage.addListener(granted);
    return () => {
      disposed = true;
      controller.current?.abort();
      window.removeEventListener('focus', refocus);
      document.removeEventListener('visibilitychange', refocus);
      browser.tabs.onActivated.removeListener(sync);
      browser.tabs.onUpdated.removeListener(changed);
      browser.runtime?.onMessage.removeListener(granted);
    };
  }, [invalidate]);

  async function allowStores() {
    try {
      // Must run straight from the click so Chrome shows its permission prompt.
      const ok = await browser.permissions!.request({
        origins: ['https://*/*', 'http://*/*'],
      });
      if (!ok) return;
      const [active] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      setTab(active || {});
      await scan(false, active);
    } catch (e) {
      setError(
        `Chrome did not grant access (${e instanceof Error ? e.message : String(e)}). Open chrome://extensions, CheckoutGuard, Details, and set Site access to On all sites.`,
      );
    }
  }

  async function scan(refresh = false, current: Tab = tab) {
    invalidate();
    const version = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 60000);
    try {
      let page: Awaited<ReturnType<typeof collectPage>>;
      if (demo) {
        page = {
          url: `https://${merchantNames[scenario]}/products/travel-pack`,
          productTitle: 'Everyday travel pack',
          instagramLinks: [],
          reviews: [],
          pageSignals: null,
          extractionLimitations: [],
        };
      } else {
        // Without the toolbar-click grant Chrome hides the URL, so let injection decide.
        if (!current.id || (current.url !== undefined && !allowed(current.url)))
          throw new Error(
            'Open a public product page and click the CheckoutGuard toolbar icon.',
          );
        setPhase('Reading public product-page content…');
        try {
          await browser.scripting.executeScript({
            target: { tabId: current.id },
            files: ['/content-scripts/extractor.js'],
          });
        } catch (e) {
          setNeedsAccess(true);
          throw new Error(
            `Chrome blocked reading this page (${e instanceof Error ? e.message : String(e)}). Reload the tab and retry; if it persists, allow CheckoutGuard on store pages below.`,
          );
        }
        page = await browser.tabs.sendMessage(current.id, {
          type: 'checkoutguard:extract',
        });
        if (!allowed(page.url))
          throw new Error(
            'CheckoutGuard does not read checkout, cart, account or login pages.',
          );
        setTab((t) => ({ ...t, url: page.url }));
      }
      if (version !== generation.current) return;
      setPhase(
        demo
          ? 'Loading fictional evidence from the backend…'
          : 'Checking Reddit, Instagram, store basics and review text…',
      );
      const response = await fetch(`${API}/analyze`, {
        method: 'POST',
        signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...page,
          refresh,
          demo: demo ? scenario : null,
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 422
            ? 'This page data is unsupported. Open a public store product page and retry.'
            : 'The backend could not complete the scan. Please retry.',
        );
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new Error(
          'The backend returned an incomplete result. Please retry.',
        );
      const data = parsed.data;
      if (version !== generation.current) return;
      setResult(data);
      setAnnouncement(
        `Result ready for ${data.domain}. ${
          data.decision
            ? `${verdictCopy[data.decision.verdict].label}: ${data.decision.headline}.`
            : ''
        } Risk index ${data.overallRisk ?? 'unavailable'}, coverage ${data.coverage}%.`,
      );
      void recordCheck({
        domain: data.domain,
        verdict: data.decision?.verdict ?? null,
        risk: data.overallRisk,
        checkedAt: new Date().toISOString(),
      }).then((items) => {
        if (version === generation.current) setRecent(items);
      });
    } catch (e) {
      if (version === generation.current)
        setError(
          e instanceof Error && e.name === 'AbortError'
            ? 'The scan took too long. Check that the backend is running and retry.'
            : e instanceof TypeError
              ? 'Cannot reach CheckoutGuard. Start the backend at localhost:8000, then retry.'
              : e instanceof Error
                ? e.message
                : 'The scan failed. Please retry.',
        );
    } finally {
      clearTimeout(timeout);
      if (version === generation.current) setPhase('');
    }
  }
  // A tab without a URL means Chrome has not granted this tab to the extension yet.
  const hidden = !demo && tab.id !== undefined && tab.url === undefined;
  const domain = demo
    ? merchantNames[scenario]
    : allowed(tab.url)
      ? new URL(tab.url!).hostname
      : hidden
        ? 'This tab'
        : 'No store selected';
  const high = result?.overallRisk != null && result.overallRisk >= 60;
  const label = result?.limitedEvidence
    ? 'Limited evidence'
    : high
      ? 'Reasons to pause'
      : 'Fewer concerning signals';
  return (
    <div className="shell">
      <header>
        <div className="brand-mark">
          <ShieldCheck size={22} />
        </div>
        <span className="brand">CheckoutGuard</span>
        <span className="beta">EARLY ACCESS</span>
      </header>
      <main>
        <div className="eyebrow">A LITTLE CLARITY BEFORE CHECKOUT</div>
        <h1>
          Good finds.
          <br />
          <span>Better-informed decisions.</span>
        </h1>
        <div className="mode-switch" aria-label="Scan mode">
          <button
            className={!demo ? 'selected' : ''}
            onClick={() => {
              invalidate();
              setDemo(false);
            }}
          >
            <Radio size={14} /> Live check
          </button>
          <button
            className={demo ? 'selected' : ''}
            onClick={() => {
              invalidate();
              setDemo(true);
            }}
          >
            Try a fictional demo
          </button>
        </div>
        {demo && (
          <div className="demo-box">
            <label htmlFor="scenario">
              DEMO · FICTIONAL MERCHANTS & EVIDENCE
            </label>
            <select
              id="scenario"
              value={scenario}
              onChange={(e) => {
                invalidate();
                setScenario(e.target.value as Scenario);
              }}
            >
              {Object.entries(scenarioNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        <section className="store-card" aria-label="Selected store">
          <div className="store-avatar">{domain[0].toUpperCase()}</div>
          <div>
            <strong>{domain}</strong>
            <p>
              {demo
                ? 'Everyday travel pack · Fictional store'
                : hidden
                  ? 'Reload this tab, or click Check this store.'
                  : tab.title || 'Open a public product page to begin'}
            </p>
          </div>
          <span className="store-dot" />
        </section>
        <button
          className="primary"
          disabled={!!phase || (!demo && !hidden && !allowed(tab.url))}
          onClick={() => void scan()}
        >
          <Search size={18} />
          {phase
            ? 'Checking this store…'
            : result
              ? 'Check again'
              : 'Check this store'}
          {!phase && <ArrowRight size={17} />}
        </button>
        <p className="privacy">
          <LockKeyhole size={12} /> Public page content only. Never payment or
          account details.
        </p>
        {!demo && (
          <p className="disclosure">
            On click, review text goes to GPTZero, the store domain to Backboard
            and a public domain registry (RDAP), and linked Instagram profiles
            to Apify through your backend. Payment badges, policy links and the
            listed price are read from the page. If configured, the backend
            sends the findings, not the page’s review text, to Anthropic to
            write a short summary.
          </p>
        )}
        {phase && (
          <section className="loading" role="status">
            <div className="spinner" />
            <strong>{phase}</strong>
            <p>Checks run independently. Some sources may be unavailable.</p>
          </section>
        )}
        {error && (
          <div className="notice" role="alert">
            <AlertTriangle size={18} />
            <p>{error}</p>
            {needsAccess && browser.permissions && (
              <button type="button" onClick={() => void allowStores()}>
                Allow on store pages
              </button>
            )}
          </div>
        )}
        {!result && !phase && (
          <section className="intro">
            <div className="intro-symbol">
              <ShieldCheck size={34} />
            </div>
            <h2>Look beyond the storefront.</h2>
            <p>
              See what buyers are saying, which patterns deserve attention, and
              what we couldn’t verify.
            </p>
            <div className="source-pills">
              <span>
                <MessageCircle size={13} /> Reddit
              </span>
              <span>
                <Instagram size={13} /> Instagram
              </span>
              <span>
                <Store size={13} /> Store
              </span>
              <span>
                <ScanText size={13} /> Reviews
              </span>
            </div>
            <div className="quiet-note">
              <CircleHelp size={16} />
              <span>
                Evidence helps you decide. No score can guarantee a store is
                safe.
              </span>
            </div>
          </section>
        )}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
        {result && (
          <div className="results">
            <h2 className="sr-only" tabIndex={-1} ref={resultHeading}>
              Result for {result.domain}
            </h2>
            {result.demo && (
              <div className="fixture-label">
                FICTIONAL DEMO RESULT · NOT LIVE RESEARCH
              </div>
            )}
            {result.decision && <DecisionBanner decision={result.decision} />}
            {(result.payment || result.amountAtStake) && (
              <PaymentCard
                payment={result.payment}
                amount={result.amountAtStake}
              />
            )}
            <section
              className={`risk-card ${result.limitedEvidence ? 'limited' : high ? 'concerning' : 'lower'}`}
            >
              <div className="result-heading">
                <span>{label}</span>
                {result.limitedEvidence || high ? (
                  <AlertTriangle size={19} />
                ) : (
                  <ShieldCheck size={19} />
                )}
              </div>
              <div className="risk-number">
                {result.overallRisk ?? '—'}
                <span>/ 100</span>
              </div>
              <div className="risk-caption">
                Heuristic risk index{' '}
                <span>Higher = more concerning evidence</span>
              </div>
              <div className="risk-track">
                <i style={{ width: `${result.overallRisk ?? 0}%` }} />
              </div>
              <p className="risk-footnote">
                {result.overallRisk === null
                  ? 'No sources had enough evidence to score.'
                  : 'An evidence-based heuristic, not a scam probability.'}
              </p>
            </section>
            <section className="coverage">
              <div>
                <strong>Evidence coverage</strong>
                <span>{result.coverage}%</span>
              </div>
              <div className="coverage-track">
                <i style={{ width: `${result.coverage}%` }} />
              </div>
              <p>Weighted source availability, not statistical confidence.</p>
            </section>
            <section className="why">
              <h2>Why this result?</h2>
              <p>{result.summary}</p>
            </section>
            <div className="section-heading">
              <h2>The evidence</h2>
              <span>
                {result.sources.filter((s) => s.status === 'available').length}{' '}
                of {result.sources.length} available
              </span>
            </div>
            <div className="evidence-list">
              {result.sources.map((source) => {
                const Icon = icons[source.source];
                return (
                  <details
                    className="source-card"
                    key={source.source}
                    open={
                      source.source === 'reddit' || source.source === 'store'
                    }
                  >
                    <summary>
                      <div className={`source-icon ${source.source}`}>
                        <Icon size={18} />
                      </div>
                      <div className="source-title">
                        <strong>{names[source.source]}</strong>
                        <span>
                          {source.status === 'available'
                            ? `${source.findings.length} findings`
                            : source.status.replaceAll('-', ' ')}
                          {source.cached ? ' · Cached' : ''}
                        </span>
                      </div>
                      <ChevronDown size={16} />
                    </summary>
                    <div className="source-body">
                      {source.findings.map((finding, i) => (
                        <article key={i} className="finding">
                          <div className="tags">
                            <span>{finding.kind.replaceAll('-', ' ')}</span>
                            <span>
                              {finding.verification !== 'verified'
                                ? finding.verification
                                : finding.kind === 'verified-fact'
                                  ? 'Public record checked'
                                  : source.source === 'store'
                                    ? 'Seen on this page'
                                    : 'Source text checked'}
                            </span>
                          </div>
                          <h3>{finding.title}</h3>
                          <blockquote>{finding.excerpt}</blockquote>
                          {finding.url && (
                            <a
                              href={finding.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {finding.verification === 'fictional'
                                ? 'Fictional source (.example)'
                                : 'Read source'}
                              <ExternalLink size={12} />
                            </a>
                          )}
                          {finding.date && <time>{finding.date}</time>}
                        </article>
                      ))}
                      <div className="limitations">
                        {source.limitations.map((text, i) => (
                          <p key={i}>{text}</p>
                        ))}
                      </div>
                      <p className="source-time">
                        Checked {new Date(source.checkedAt).toLocaleString()}
                        {source.expiresAt &&
                          ` · Cache expires ${new Date(source.expiresAt).toLocaleTimeString()}`}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
            {result.brief && <BriefCard brief={result.brief} />}
            <section className="next-steps">
              <h2>Your next move</h2>
              {result.nextSteps.map((step, i) => (
                <div key={step}>
                  <span>{i + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </section>
            <div className="freshness">
              <Check size={13} />
              <span>
                Scan {new Date(result.scannedAt).toLocaleTimeString()} ·{' '}
                {result.sources.some((s) => s.cached)
                  ? 'Includes cached research'
                  : result.demo
                    ? 'Fixture data'
                    : 'Fresh checks'}
              </span>
              <button
                aria-label="Bypass cache and refresh"
                title="Bypass cache and refresh"
                onClick={() => void scan(true)}
                disabled={!!phase}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        )}
        <RecentChecks
          items={recent}
          onClear={() => {
            setRecent([]);
            void clearRecent();
          }}
        />
        <footer>
          <ShieldCheck size={12} /> A pause for perspective.
          <span>Evidence, not a verdict</span>
        </footer>
      </main>
    </div>
  );
}
