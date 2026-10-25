// Captures real side-panel UI from the running preview (demo mode) into ./assets.
// Needs: backend on :8000 and `make preview` on :5173.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'assets');
mkdirSync(out, { recursive: true });
const DSF = 3; // element shots get zoomed in the video, so capture above 2x
const URL = process.env.PREVIEW_URL || 'http://localhost:5173/preview.html';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 400, height: 900 },
  deviceScaleFactor: DSF,
});
const page = await ctx.newPage();
// Fixed, tidy clock for timestamps shown in the panel.
if (page.clock) await page.clock.setFixedTime(new Date('2026-10-24T14:32:00'));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const shot = async (selector, name) => {
  const el = page.locator(selector).first();
  if (!(await el.count())) return console.warn('missing', selector);
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: join(out, `${name}.png`) });
  console.log('saved', name);
};

// Geometry (in device pixels of the captures) for scroll targets and highlight rings in the video.
const layout = { dsf: DSF };
const sections = (sels) =>
  page.evaluate(([sels, dsf]) => {
    const o = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) o[s] = Math.round((el.getBoundingClientRect().top + scrollY) * dsf);
    }
    o.height = Math.round(document.documentElement.scrollHeight * dsf);
    return o;
  }, [sels, DSF]);
const children = (parent, child) =>
  page.evaluate(
    ([parent, child, dsf]) => {
      const p = document.querySelector(parent);
      if (!p) return [];
      const r = p.getBoundingClientRect();
      return [...p.querySelectorAll(child)].map((c) => {
        const b = c.getBoundingClientRect();
        return [b.left - r.left, b.top - r.top, b.width, b.height].map((v) => Math.round(v * dsf));
      });
    },
    [parent, child, DSF],
  );
const SECTIONS = ['.primary', '.fixture-label', '.decision', '.pay-card', '.pay-options', '.stake', '.dispute', '.risk-card', '.coverage', '.evidence-list', '.brief', '.next-steps', '.recent'];

// Idle panel, before any check.
layout.idle = await sections(SECTIONS);
await page.screenshot({ path: join(out, 'panel-idle.png'), fullPage: false });

// Loading state: hold the request so the spinner is visible.
let release;
const gate = new Promise((r) => (release = r));
await page.route('**/analyze', async (route) => {
  await gate;
  await route.continue();
});
await page.selectOption('#scenario', 'warning');
await page.click('button.primary');
await page.waitForSelector('.loading');
await page.screenshot({ path: join(out, 'panel-loading.png') });
await shot('.loading', 'el-loading');
release();
await page.waitForSelector('.decision');

for (const scenario of ['outage', 'warning', 'positive', 'limited']) {
  await page.selectOption('#scenario', scenario);
  await page.click('button.primary');
  // Each run differs in verdict from the one before it, so this waits for fresh results.
  const verdict = { outage: 'protect', warning: 'pause', positive: 'proceed', limited: 'protect' }[scenario];
  await page.waitForSelector(`.results .decision--${verdict}`);
  await page.waitForTimeout(250);
  await page.evaluate(() =>
    document.querySelectorAll('details.dispute').forEach((d) => (d.open = true)),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(out, `panel-${scenario}.png`), fullPage: true });
  layout[scenario] = {
    sections: await sections(SECTIONS),
    reasons: await children('.decision', '.decision-reasons li'),
    payOptions: await children('.pay-options', '.pay-option'),
    dispute: await children('details.dispute', 'li'),
    stake: await children('.stake', '.stake-discount, .stake-hint'),
    coverage: await children('.coverage', 'span, .coverage-track'),
    risk: await children('.risk-card', '.risk-number'),
  };
  await shot('.decision', `el-decision-${scenario}`);
  await shot('.pay-card', `el-pay-${scenario}`);
  await shot('.risk-card', `el-risk-${scenario}`);
  await shot('.coverage', `el-coverage-${scenario}`);
  await shot('.why', `el-why-${scenario}`);
  await shot('.fixture-label', `el-fixture-${scenario}`);
  if (scenario === 'warning') {
    await shot('.pay-options', 'el-pay-options-warning');
    await shot('.pay-warning', 'el-pay-warning-warning');
    await shot('.stake', 'el-stake-warning');
    await shot('details.dispute', 'el-dispute-warning');
    await shot('.evidence-list', 'el-evidence-warning');
    await shot('.source-card:nth-child(1)', 'el-source-reddit-warning');
    await shot('.source-card:nth-child(3)', 'el-source-store-warning');
    await shot('.brief', 'el-brief-warning');
    await shot('.next-steps', 'el-next-warning');
  }
}
// Order above leaves all three verdicts in the list, matching the limited panel.
const recent = page.locator('.recent');
await recent.scrollIntoViewIfNeeded();
const box = await recent.boundingBox();
await page.screenshot({
  path: join(out, 'el-recent.png'),
  clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 },
});
layout.recent = await children('.recent', 'li');
writeFileSync(join(out, 'layout.js'), `window.LAYOUT = ${JSON.stringify(layout, null, 1)};\n`);
await browser.close();
