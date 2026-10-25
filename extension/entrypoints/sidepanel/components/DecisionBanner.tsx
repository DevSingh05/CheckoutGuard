import { CircleCheck, OctagonAlert, ShieldAlert } from 'lucide-react';
import type { Analysis, Verdict } from '../../../lib/contracts';

// Each verdict has its own icon shape and words, so colour is never the only cue.
export const verdictCopy = {
  proceed: {
    label: 'Fewer concerns found',
    short: 'Proceed',
    Icon: CircleCheck,
  },
  protect: {
    label: 'Protect your payment',
    short: 'Protect',
    Icon: ShieldAlert,
  },
  pause: { label: 'Pause before paying', short: 'Pause', Icon: OctagonAlert },
} satisfies Record<Verdict, unknown>;

export function DecisionBanner({
  decision,
}: {
  decision: NonNullable<Analysis['decision']>;
}) {
  const { label, Icon } = verdictCopy[decision.verdict];
  return (
    <section
      className={`decision decision--${decision.verdict}`}
      aria-labelledby="decision-label"
    >
      <div className="decision-label" id="decision-label">
        <Icon size={18} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="decision-headline">{decision.headline}</p>
      {decision.reasons.length > 0 && (
        <ul className="decision-reasons" aria-label="Why">
          {decision.reasons.slice(0, 5).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
