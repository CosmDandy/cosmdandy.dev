// How much CPU the page asks for when you are just looking at it.
//
//   node tools/perf.mjs             idle: the machine is assembled, lamps blink
//   node tools/perf.mjs --service   service mode (console and teardown)
//   node tools/perf.mjs --assembly  the first seconds: the machine assembles
//
// What we measure and why exactly this. Animation in a large SVG is not
// composited: any change of a fill or a rotation makes the browser rasterise
// the area again and then compose the whole scene. So the cost barely depends
// on the number of animated shapes — it depends on how many frames in a row
// have anything at all changing in the scene. Hence the two numbers: the share
// of the main thread (TaskDuration over the measurement window) and the share
// of frames in which the browser repainted something.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const WINDOW_MS = 6000;

let chromium;
for (const dir of ['/workspaces/.pw/', ROOT + '/']) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* next */ }
}
if (!chromium) { console.error('no playwright'); process.exit(1); }
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
if (!CHROME) { console.error('chromium not found in /nix/store'); process.exit(1); }

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('no such file'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const args = process.argv.slice(2);
const service = args.includes('--service');
const assembly = args.includes('--assembly');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, deviceScaleFactor: 2 });
// the same chromium build crashes the renderer on <input> as in preview
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () =>
    document.querySelectorAll('input').forEach(el => el.remove()));
});
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.body.classList.add('view-rig'));
if (service) await page.evaluate(() => document.getElementById('svc-switch')
  ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
// Assembly takes about ten seconds, then the machine powers up and plays the
// self-test on a full-screen layer. In idle mode we wait for both of those to
// finish: otherwise we measure the one-off choreography instead of what loads
// the machine all the time. We wait on the fact, not on a timer — until the
// layer closes.
if (assembly) {
  await page.waitForTimeout(300);
} else {
  await page.waitForTimeout(11000);
  await page.waitForFunction(() => !document.getElementById('crt')?.open, null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries(
  (await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

// Frame counter: rAF marks every frame the browser actually produced.
await page.evaluate(() => {
  window.__frames = [];
  const tick = t => { window.__frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const before = await metrics();
await page.waitForTimeout(WINDOW_MS);
const after = await metrics();
const frames = await page.evaluate(() => window.__frames);

const d = k => (after[k] ?? 0) - (before[k] ?? 0);
const span = (frames.at(-1) - frames[0]) / 1000;
const fps = (frames.length - 1) / span;
// A "long frame" is one that missed the 60 Hz budget with room to spare.
const gaps = frames.slice(1).map((t, i) => t - frames[i]);
const slow = gaps.filter(g => g > 20).length;

const pct = v => `${(v / (WINDOW_MS / 1000) * 100).toFixed(1)}%`;
const mode = assembly ? 'assembly' : service ? 'service mode' : 'idle';
console.log(`  mode: ${mode}, window ${WINDOW_MS / 1000} s`);
console.log(`  main thread: ${pct(d('TaskDuration'))} (of that style ${pct(d('RecalcStyleDuration'))}, layout ${pct(d('LayoutDuration'))})`);
console.log(`  script: ${pct(d('ScriptDuration'))}`);
console.log(`  frames per second: ${fps.toFixed(1)}, long frames: ${slow} of ${gaps.length}`);
console.log(`  nodes in document: ${after.Nodes | 0}, layers: ${after.LayoutObjects | 0}`);

await browser.close();
server.close();
