// Local preview: serve the static files, open the page, check it, take a frame.
//
//   node tools/preview.mjs              server view, frame in tools/preview.png
//   node tools/preview.mjs --card       card view
//   node tools/preview.mjs --service    service mode (console and teardown)
//
// Why a server of our own rather than file://: over file:// the browser blocks
// the fonts on CORS, and the console fills with errors that have nothing to do
// with anything.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// playwright lives outside the repo: no reason to drag node_modules into a static site
const PW_DIRS = ['/workspaces/.pw/', ROOT + '/'];
let chromium;
for (const dir of PW_DIRS) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* try the next one */ }
}
if (!chromium) {
  console.error('no playwright. Install with:\n' +
    '  mkdir -p /workspaces/.pw && cd /workspaces/.pw && npm init -y\n' +
    '  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright');
  process.exit(1);
}

// The browser comes from the nix store: a playwright-downloaded one will not
// start here, the container has no libglib-2.0.
const { globSync } = await import('node:fs');
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
if (!CHROME) { console.error('no chromium found in /nix/store'); process.exit(1); }

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
const view = args.includes('--card') ? 'card' : 'rig';
const service = args.includes('--service');
const shot = args.find(a => a.endsWith('.png')) ?? join(ROOT, 'tools/preview.png');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// Scale 1 and not 2: the schematic has grown to ten thousand nodes, and at
// double resolution the compositor of this chromium build hands back an empty
// black frame — the page itself is fine meanwhile, checked at scale 1.
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// This chromium build kills the renderer on any <input> — reproduced on a bare
// page with a single field. We remove the console input before the first paint.
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () =>
    document.querySelectorAll('input').forEach(el => el.remove()));
});

await page.goto(url, { waitUntil: 'load' });
// The first visit assembles the machine in front of the visitor: a frame taken
// then would catch a half-empty chassis. We wait for the last unit to seat.
await page.waitForFunction(
  () => !document.getElementById('rig')?.classList.contains('assembly'),
  null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(500);
if (view === 'rig') await page.evaluate(() => document.body.classList.add('view-rig'));
// service mode goes on through the real switch: a class set by hand would skip
// everything the handler does (the console layout and the log)
if (service) await page.evaluate(() => document.getElementById('svc-switch')?.dispatchEvent(
  new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(1000);
// The self-test screen comes up on its own and covers the machine: a frame
// taken then is a POST screen, not the schematic. We dismiss it before the
// shot, the way a person would with Esc.
await page.evaluate(() => {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  const crt = document.getElementById('crt');
  if (crt) crt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

const stat = await page.evaluate(() => {
  const box = document.querySelector('.chassis')?.getBoundingClientRect();
  const q = s => document.querySelectorAll(s).length;
  return { nodes: q('*'), board: box ? `${box.width | 0}×${box.height | 0}` : 'not visible',
    partNumbers: q('a.stamp'), callouts: q('a.callout'), fans: q('.fan'),
    dimms: q('.dimm'), drives: q('.bay'), lamps: q('.led-act'), lightpath: q('.lp') };
});

console.log(Object.entries(stat).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
console.log(errors.length ? `  ERRORS (${errors.length}): ${errors.slice(0, 3).join(' | ')}`
                          : '  no errors on the page');

await page.screenshot({ path: shot });
console.log(`  frame: ${shot}`);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
