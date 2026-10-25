import { History, Trash2 } from 'lucide-react';
import type { RecentCheck } from '../../../lib/recent';
import { verdictCopy } from './DecisionBanner';

export function RecentChecks({
  items,
  onClear,
}: {
  items: RecentCheck[];
  onClear: () => void;
}) {
  if (!items.length) return null;
  return (
    <section className="recent" aria-labelledby="recent-heading">
      <div className="recent-heading">
        <History size={14} aria-hidden="true" />
        <h2 id="recent-heading">Recent checks</h2>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear recent checks"
        >
          <Trash2 size={12} aria-hidden="true" /> Clear
        </button>
      </div>
      <ul>
        {items.map((item) => {
          const copy = item.verdict ? verdictCopy[item.verdict] : null;
          return (
            <li key={item.domain}>
              <strong>{item.domain}</strong>
              <span
                className={`recent-verdict${item.verdict ? ` verdict-${item.verdict}` : ''}`}
              >
                {copy ? (
                  <>
                    <copy.Icon size={11} aria-hidden="true" /> {copy.short}
                  </>
                ) : (
                  'No verdict'
                )}
              </span>
              <span className="recent-risk">Risk {item.risk ?? '—'}</span>
              <time dateTime={item.checkedAt}>
                {new Date(item.checkedAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </li>
          );
        })}
      </ul>
      <p className="recent-note">
        Stored only on this device: domain, verdict, risk and time.
      </p>
    </section>
  );
}
