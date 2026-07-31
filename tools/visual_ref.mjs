// Visual check: a screenshot of the page in several states and a pixel-by-pixel
// comparison against the baseline.
//
//   node tools/visual_ref.mjs --save     take the baseline (before refactoring)
//   node tools/visual_ref.mjs            check the current state against it
//
// Why: splitting CSS and JS cannot be verified by comparing text — the order of
// rules changes the cascade, and the order of code changes behaviour. What has
// to be checked is what the eye sees, that is, pixels.
//
// We kill animations: otherwise the frame depends on the moment of capture and
// the comparison lies.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REF = join(ROOT, 'tools/.visual');

const require = createRequire('/workspaces/.pw/');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const { globSync } = await import('node:fs');
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };

const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('no'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

// States that must look the same before and after an edit.
const STATES = {
  card:        async () => {},
  rig:         async p => p.evaluate(() => document.body.classList.add('view-rig')),
  'rig-svc':   async p => {
    await p.evaluate(() => document.body.classList.add('view-rig'));
    await p.evaluate(() => document.getElementById('svc-switch')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  },
  'rig-dark':  async p => {
    await p.evaluate(() => document.body.classList.add('view-rig'));
    await p.evaluate(() => document.getElementById('theme-switch')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  },
  'rig-pulled': async p => {
    await p.evaluate(() => document.body.classList.add('view-rig'));
    await p.evaluate(() => document.getElementById('svc-switch')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    // We set the class by hand rather than by a click: the pull-out handler
    // starts timers and writes to the log, and the frame starts to depend on
    // the moment of capture. What we need is the layout of a pulled node, not
    // the pull-out scenario.
    await p.evaluate(() => {
      document.querySelector('.fan')?.classList.add('pulled');
      document.querySelector('.dimm')?.classList.add('pulled');
    });
  },
};

const save = process.argv.includes('--save');
await mkdir(REF, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let bad = 0;

for (const [name, setup] of Object.entries(STATES)) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('input').forEach(el => el.remove());
      const css = document.createElement('style');
      css.textContent = '*,*::before,*::after{animation:none!important;' +
        'transition:none!important;caret-color:transparent!important}' +
        // the console scrollbar appears and disappears — it follows the number
        // of lines in the log, and lines are appended on a timer
        '::-webkit-scrollbar{display:none!important}' +
        '.console-log{overflow:hidden!important}' +
        // the theme and view buttons have nothing to do with the schematic,
        // while their icons are redrawn on a timer and give false differences
        '.theme-switch,.view-switch{visibility:hidden!important}' +
        // the input line: the field is removed before painting, but what stays
        // behind it is a blinking caret at the left edge of the panel — 65
        // pixels that wandered from run to run
        // The console writes lines on a timer and keeps doing so after we clear
        // it: it holds the layout, but its contents differ every time. We hide
        // both it and the input line — we check the panel layout, not running
        // text.
        '.prompt,.console-log{visibility:hidden!important}';
      document.head.append(css);
    });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await setup(page);
  await page.waitForTimeout(700);
  // The console shows the clock and a running log — it changes from run to run,
  // and the comparison would catch that instead of edits in the styles. We kill
  // the completion hint for the same reason: it depends on the command history.
  await page.evaluate(() => {
    const log = document.getElementById('log');
    if (log) log.textContent = '';
    const up = document.getElementById('uptime');
    if (up) up.textContent = '--:--';
    document.querySelectorAll('.ghost-typed, .ghost-rest').forEach(el => { el.textContent = ''; });
  });
  await page.waitForTimeout(120);

  const shot = await page.screenshot();
  const file = join(REF, `${name}.png`);

  if (save || !existsSync(file)) {
    await writeFile(file, shot);
    console.log(`  ${name}: baseline taken`);
  } else {
    const a = PNG.sync.read(await readFile(file));
    const b = PNG.sync.read(shot);
    let diff = 0;
    if (a.width !== b.width || a.height !== b.height) {
      diff = -1;
    } else {
      for (let i = 0; i < a.data.length; i += 4) {
        if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1]
            || a.data[i + 2] !== b.data[i + 2]) diff++;
      }
    }
    const total = a.width * a.height;
    // Noise threshold. In service mode a 3×22 strip stays at the edge of the
    // panel, jittering by a pixel from run to run — it reproduces on unchanged
    // code as well. Anything bigger is already an edit: a shifted label gives
    // hundreds of pixels, a missing node — thousands.
    const NOISE = 120;
    if (diff === 0) {
      console.log(`  ${name}: pixel-for-pixel match`);
    } else if (diff > 0 && diff <= NOISE) {
      console.log(`  ${name}: ${diff} px — within the noise`);
    } else if (diff < 0) {
      console.log(`  ${name}: SIZE CHANGED ${a.width}×${a.height} → ${b.width}×${b.height}`);
      bad++;
    } else {
      await writeFile(join(REF, `${name}.now.png`), shot);
      console.log(`  ${name}: DIVERGED on ${diff} pixels (${(diff / total * 100).toFixed(3)}%)`
        + ` — current is in ${name}.now.png`);
      bad++;
    }
  }
  await page.close();
}

await browser.close();
server.close();
console.log(bad ? `visuals changed in ${bad} states` : 'visuals unchanged');
process.exit(bad ? 1 : 0);
