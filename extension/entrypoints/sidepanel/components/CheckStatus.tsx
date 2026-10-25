import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { z } from 'zod';
import type { Analysis } from '../../../lib/contracts';

const labels = {
  reddit: 'Reddit',
  instagram: 'Instagram',
  store: 'Store basics',
  reviews: 'Review text',
};
const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('CheckoutGuard'),
  version: z.string(),
  reviewMode: z.enum(['local', 'gptzero']).optional(),
  providers: z.object({
    reddit: z.boolean(),
    instagram: z.boolean(),
    reviews: z.boolean(),
    store: z.boolean(),
  }),
});

export function ServiceSetup({ api }: { api: string }) {
  const [state, setState] = useState<z.infer<typeof healthSchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  async function check() {
    const version = ++request.current;
    setBusy(true);
    setError('');
    setState(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${api}/health`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Service unavailable');
      const health = healthSchema.safeParse(await response.json());
      if (!health.success)
        throw new Error(
          'Restart the backend to load the latest CheckoutGuard version.',
        );
      if (version === request.current) setState(health.data);
    } catch (e) {
      if (version === request.current)
        setError(
          e instanceof Error && e.message.startsWith('Restart')
            ? e.message
            : 'Cannot reach the backend. Start it with “make backend”, then check again.',
        );
    } finally {
      clearTimeout(timer);
      if (version === request.current) setBusy(false);
    }
  }
  return (
    <details className="service-setup">
      <summary>
        <Settings2 size={13} aria-hidden="true" /> Service connection & setup
      </summary>
      <div>
        <p>
          Check which research sources are enabled. This does not run a paid
          scan.
        </p>
        <button type="button" disabled={busy} onClick={() => void check()}>
          {busy ? 'Checking service…' : 'Check service setup'}
        </button>
        {error && <p role="alert">{error}</p>}
        {state && (
          <div role="status">
            <p>
              <strong>Connected · v{state.version}</strong>
            </p>
            <ul>
              {Object.entries(state.providers).map(([source, configured]) => (
                <li key={source}>
                  {configured ? (
                    <CheckCircle2 size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )}{' '}
                  {labels[source as keyof typeof labels]}:{' '}
                  {source === 'reviews' && state.reviewMode === 'local'
                    ? 'local check · no API key'
                    : source === 'store'
                      ? 'enabled'
                      : configured
                        ? 'key configured'
                        : 'API key missing'}
                </li>
              ))}
            </ul>
            <p>
              Configured keys still need working provider access. Missing keys
              reduce coverage.
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

export function CoverageDetails({ result }: { result: Analysis }) {
  const incomplete = result.sources.filter((s) => s.status !== 'available');
  if (!incomplete.length) return null;
  return (
    <section className="coverage-explainer" aria-labelledby="coverage-reasons">
      <h2 id="coverage-reasons">
        {result.limitedEvidence
          ? 'Why evidence is limited'
          : 'What we couldn’t verify'}
      </h2>
      <p>
        The index uses{' '}
        {result.sources
          .filter((s) => s.status === 'available')
          .map((s) => labels[s.source])
          .join(', ') || 'no scored sources'}
        . Other sources did not contribute:
      </p>
      <ul>
        {incomplete.map((s) => (
          <li key={s.source}>
            <strong>{labels[s.source]}</strong>
            <span>
              {s.diagnostic?.message ||
                s.limitations[0] ||
                s.status.replaceAll('-', ' ')}
            </span>
          </li>
        ))}
      </ul>
      <p>
        Missing information is not a warning about the store. Read the evidence
        and check any unresolved sources before buying.
      </p>
    </section>
  );
}
