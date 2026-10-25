import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  CreditCard,
  LifeBuoy,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  ShieldOff,
  Tag,
} from 'lucide-react';
import type { Analysis, Protection } from '../../../lib/contracts';

const protectionCopy = {
  strong: { label: 'Strong protection', Icon: ShieldCheck },
  moderate: { label: 'Moderate protection', Icon: ShieldHalf },
  limited: { label: 'Limited protection', Icon: ShieldAlert },
  none: { label: 'No protection', Icon: ShieldOff },
} satisfies Record<Protection, unknown>;
export const STEEP_DISCOUNT = 70;

export function formatMoney(value: number, currency?: string | null) {
  if (currency && /^[A-Z]{3}$/.test(currency))
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(value);
    } catch {
      // Unknown ISO code: fall back to a plain number below.
    }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function AmountAtStake({
  amount,
}: {
  amount: NonNullable<Analysis['amountAtStake']>;
}) {
  const { price, compareAtPrice, currency } = amount;
  if (price == null) return null;
  const discount =
    amount.discountPercent ??
    (compareAtPrice && compareAtPrice > price
      ? Math.round((1 - price / compareAtPrice) * 100)
      : null);
  return (
    <div className="stake">
      <span className="stake-label">Amount at stake</span>
      <div className="stake-row">
        <strong>{formatMoney(price, currency)}</strong>
        {compareAtPrice != null && compareAtPrice > price && (
          <span className="stake-was">
            was <s>{formatMoney(compareAtPrice, currency)}</s>
          </span>
        )}
        {discount != null && discount > 0 && (
          <span className="stake-discount">
            <Tag size={11} aria-hidden="true" /> {discount}% off
          </span>
        )}
      </div>
      {discount != null && discount >= STEEP_DISCOUNT && (
        <p className="stake-hint">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>
            {discount}% off is unusually steep. Deep discounts are a common
            lure; compare the price elsewhere.
          </span>
        </p>
      )}
    </div>
  );
}

export function PaymentCard({
  payment,
  amount,
}: {
  payment?: Analysis['payment'];
  amount?: Analysis['amountAtStake'];
}) {
  const recommended = payment?.options.find(
    (o) => o.method === payment.recommended,
  );
  return (
    <section className="pay-card" aria-labelledby="pay-heading">
      <div className="pay-heading">
        <CreditCard size={17} aria-hidden="true" />
        <h2 id="pay-heading">How to pay</h2>
      </div>
      {recommended && (
        <p className="pay-summary">
          Best option here: <strong>{recommended.label}</strong>
        </p>
      )}
      {payment?.warning && (
        <div className="pay-warning" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <p>{payment.warning}</p>
        </div>
      )}
      {payment && payment.options.length > 0 && (
        <ol
          className="pay-options"
          aria-label="Payment options, most protected first"
        >
          {payment.options.map((option, i) => {
            const tier = protectionCopy[option.protection];
            const isRecommended = option.method === payment.recommended;
            return (
              <li
                key={option.method}
                className={`pay-option tier-${option.protection}${isRecommended ? ' recommended' : ''}`}
              >
                <span className="pay-rank" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="pay-body">
                  <div className="pay-title">
                    <strong>{option.label}</strong>
                    {isRecommended && (
                      <span className="pay-recommended">
                        <CircleCheck size={11} aria-hidden="true" /> Recommended
                      </span>
                    )}
                  </div>
                  <span className={`badge badge-${option.protection}`}>
                    <tier.Icon size={11} aria-hidden="true" /> {tier.label}
                  </span>
                  <p>{option.note}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {amount && <AmountAtStake amount={amount} />}
      {payment && payment.disputeSteps.length > 0 && (
        <details className="dispute">
          <summary>
            <LifeBuoy size={15} aria-hidden="true" />
            <span>If something goes wrong</span>
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <ol>
            {payment.disputeSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
