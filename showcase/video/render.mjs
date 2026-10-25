// Renders showcase/video/index.html to showcase/checkoutguard-demo.mp4.
//   node showcase/video/render.mjs                 full render
//   node showcase/video/render.mjs --stills 5,36   PNG stills only (into --out dir)
//   node showcase/video/render.mjs --from 30 --to 40   partial render
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]);
    return acc;
  }, []),
);
const FPS = 30;
const output = resolve(args.output || join(here, '..', 'checkoutguard-demo.mp4'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'index.html')).href);
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);
const frame = async (t) => {
  await page.evaluate((t) => window.seek(t), t);
  return page.screenshot({ type: 'jpeg', quality: 92 });
};

if (args.stills) {
  const dir = resolve(args.out || join(here, 'stills'));
  mkdirSync(dir, { recursive: true });
  for (const t of String(args.stills).split(',').map(Number)) {
    await page.evaluate((t) => window.seek(t), t);
    await page.screenshot({ path: join(dir, `still-${t.toFixed(1)}.png`) });
  }
  console.log('stills in', dir);
  await browser.close();
  process.exit(0);
}

const from = Number(args.from ?? 0);
const to = Math.min(Number(args.to ?? duration), duration);
const total = Math.round((to - from) * FPS);
const ffmpeg = spawn(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
    output,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);
const done = new Promise((ok, fail) => ffmpeg.on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg exited ${c}`)))));
const started = Date.now();
for (let i = 0; i < total; i++) {
  const buf = await frame(from + i / FPS);
  if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  if (i % 150 === 0) process.stdout.write(`frame ${i}/${total} (${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
}
ffmpeg.stdin.end();
await done;
await browser.close();
console.log(`wrote ${output} (${total} frames)`);
