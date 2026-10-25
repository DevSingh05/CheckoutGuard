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
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    setResult(null);
    setPhase('');
    setError('');
  }, []);
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
    void sync();
    browser.tabs.onActivated.addListener(sync);
    browser.tabs.onUpdated.addListener(changed);
    return () => {
      disposed = true;
      controller.current?.abort();
      browser.tabs.onActivated.removeListener(sync);
      browser.tabs.onUpdated.removeListener(changed);
    };
  }, [invalidate]);

  async function scan(refresh = false) {
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
        if (!tab.id || !allowed(tab.url))
          throw new Error(
            'Open a public product page and click the CheckoutGuard toolbar icon.',
          );
        setPhase('Reading public product-page content…');
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['/content-scripts/extractor.js'],
          });
        } catch {
          throw new Error(
            'Click the CheckoutGuard toolbar icon on this tab to grant page access, then retry.',
          );
        }
        page = await browser.tabs.sendMessage(tab.id, {
          type: 'checkoutguard:extract',
        });
      }
      if (version !== generation.current) return;
      setPhase(
        demo
          ? 'Loading fictional evidence from the backend…'
          : 'Checking Reddit, Instagram and review text…',
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
      if (version === generation.current) setResult(data);
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
  const domain = demo
    ? merchantNames[scenario]
    : allowed(tab.url)
      ? new URL(tab.url!).hostname
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
                : tab.title || 'Open a public product page to begin'}
            </p>
          </div>
          <span className="store-dot" />
        </section>
        <button
          className="primary"
          disabled={!!phase || (!demo && !allowed(tab.url))}
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
            On click, review text goes to GPTZero, the store domain to
            Backboard, and linked Instagram profiles to Apify through your
            backend.
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
        {result && (
          <div className="results">
            {result.demo && (
              <div className="fixture-label">
                FICTIONAL DEMO RESULT · NOT LIVE RESEARCH
              </div>
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
                    open={source.source === 'reddit'}
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
                              {finding.verification === 'verified'
                                ? 'Source text checked'
                                : finding.verification}
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
        <footer>
          <ShieldCheck size={12} /> A pause for perspective.
          <span>Built at HackPSU</span>
        </footer>
      </main>
    </div>
  );
}
