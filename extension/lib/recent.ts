import { z } from 'zod';
import { storage } from './browser';
import { verdicts } from './contracts';

// Only what the list needs: never review text, findings or URLs.
const recentCheck = z.object({
  domain: z.string().max(253),
  verdict: z.enum(verdicts).nullable(),
  risk: z.number().min(0).max(100).nullable(),
  checkedAt: z.string(),
});
export type RecentCheck = z.infer<typeof recentCheck>;
const KEY = 'recentChecks';
export const RECENT_LIMIT = 5;

export async function loadRecent(): Promise<RecentCheck[]> {
  try {
    const stored = (await storage.get(KEY))[KEY];
    const parsed = z.array(recentCheck).safeParse(stored);
    return parsed.success ? parsed.data.slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

export async function recordCheck(entry: RecentCheck): Promise<RecentCheck[]> {
  const parsed = recentCheck.safeParse(entry);
  if (!parsed.success) return loadRecent();
  const { domain, verdict, risk, checkedAt } = parsed.data;
  const next = [
    { domain, verdict, risk, checkedAt },
    ...(await loadRecent()).filter((item) => item.domain !== domain),
  ].slice(0, RECENT_LIMIT);
  try {
    await storage.set({ [KEY]: next });
  } catch {
    // Not persisted; still show it for this session.
  }
  return next;
}

export async function clearRecent(): Promise<void> {
  try {
    await storage.remove(KEY);
  } catch {
    // Nothing to clear.
  }
}
