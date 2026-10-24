import { z } from 'zod';
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
  ]),
  verification: z.enum(['verified', 'unverified', 'fictional']),
  date: z.string().nullable(),
});
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
      source: z.enum(['reddit', 'instagram', 'reviews']),
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
});
export type Analysis = z.infer<typeof responseSchema>;
export type Scenario = 'warning' | 'positive' | 'limited' | 'outage';
