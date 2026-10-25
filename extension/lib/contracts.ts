import { z } from 'zod';
import { paymentMethods } from './extract';
const link = z
  .string()
  .url()
  .refine((s) => /^https?:\/\//.test(s));
const finding = z.object({
  title: z.string(),
  excerpt: z.string(),
  url: link.nullable(),
  kind: z.enum([
    'customer-allegation',
    'observed-pattern',
    'verified-fact',
    'positive-experience',
  ]),
  concern: z.enum([
    'non-delivery',
    'refund',
    'counterfeit',
    'repetition',
    'ai-text',
    'positive',
    'context',
    'domain-age',
    'policy',
    'payment',
    'pricing',
  ]),
  verification: z.enum(['verified', 'unverified', 'fictional']),
  date: z.string().nullable(),
});
export const verdicts = ['proceed', 'protect', 'pause'] as const;
export const protectionTiers = [
  'strong',
  'moderate',
  'limited',
  'none',
] as const;
const decision = z.object({
  verdict: z.enum(verdicts),
  headline: z.string(),
  reasons: z.array(z.string()),
});
// Method stays a string so a backend that learns a new method still renders.
const payment = z.object({
  options: z.array(
    z.object({
      method: z.string(),
      label: z.string(),
      protection: z.enum(protectionTiers),
      note: z.string(),
    }),
  ),
  recommended: z.string().nullable(),
  warning: z.string().nullable(),
  disputeSteps: z.array(z.string()),
});
const amount = z.number().min(0).max(1_000_000);
const amountAtStake = z.object({
  price: amount.nullable(),
  compareAtPrice: amount.nullish(),
  currency: z.string().nullish(),
  discountPercent: z.number().min(0).max(100).nullish(),
});
const brief = z.object({ text: z.string(), generated: z.boolean() });
export const responseSchema = z.object({
  domain: z.string(),
  productTitle: z.string(),
  overallRisk: z.number().min(0).max(100).nullable(),
  coverage: z.number().min(0).max(100),
  limitedEvidence: z.boolean(),
  summary: z.string(),
  nextSteps: z.array(z.string()),
  scannedAt: z.string(),
  demo: z.boolean(),
  sources: z.array(
    z.object({
      source: z.enum(['reddit', 'instagram', 'store', 'reviews']),
      status: z.enum([
        'available',
        'insufficient-data',
        'unavailable',
        'error',
      ]),
      score: z.number().nullable(),
      findings: z.array(finding),
      limitations: z.array(z.string()),
      checkedAt: z.string(),
      cached: z.boolean(),
      expiresAt: z.string().nullable(),
    }),
  ),
  // v2 additions are optional so an older backend still renders.
  decision: decision.nullish(),
  payment: payment.nullish(),
  amountAtStake: amountAtStake.nullish(),
  brief: brief.nullish(),
});
export type Analysis = z.infer<typeof responseSchema>;
export type Verdict = (typeof verdicts)[number];
export type Protection = (typeof protectionTiers)[number];
export type Source = Analysis['sources'][number]['source'];
export const pageSignalsSchema = z.object({
  paymentMethods: z.array(z.enum(paymentMethods)).max(16),
  hasReturnPolicy: z.boolean().nullable(),
  hasContactPage: z.boolean().nullable(),
  hasEmail: z.boolean().nullable(),
  hasPhone: z.boolean().nullable(),
  price: amount.nullable(),
  compareAtPrice: amount.nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
});
export type Scenario = 'warning' | 'positive' | 'limited' | 'outage';
