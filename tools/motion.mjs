// Frame-by-frame capture of motion: what actually happens between two states
// of a node.
//
//   node tools/motion.mjs heatsink     take the heatsink off and put it back
//   node tools/motion.mjs drive        pull the drive out and push it back
//   node tools/motion.mjs dimm         pull out a memory module
//   node tools/motion.mjs service      entering service mode
//
// Prints a timeline of samples: the time since the click, the computed
// transform of the node and its screen coordinate. Smooth motion shows up as a
// row of intermediate values; a jump is two frames with everything already
// done in between. Frames are collected in tools/motion/<scene>-NN.png, so you
// can look at them with your own eyes.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'tools/motion');

const PW_DIRS = ['/workspaces/.pw/', ROOT + '/'];
let chromium;
for (const dir of PW_DIRS) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* next */ }
}
if (!chromium) { console.error('no playwright'); process.exit(1); }
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
if (!CHROME) { console.error('chromium not found in /nix/store'); process.exit(1); }

// Scenes: what we watch, what we click on and how long we wait.
const SCENES = {
  heatsink: { watch: '.cpu-slot .heatsink', click: '.cpu-slot', shots: 3, span: 900 },
  cpu:      { watch: '.cpu-slot .cpu-lid',  click: '.cpu-slot', shots: 3, span: 900 },
  drive:    { watch: '.bay .pick-body',     click: '.bay',      shots: 3, span: 900 },
  dimm:     { watch: '.dimm .pick-body',    click: '.dimm',     shots: 1, span: 900 },
  fan:      { watch: '.fan .pick-body',     click: '.fan',      shots: 1, span: 900 },
  handle:   { watch: '.bay .bay-handle',    click: '.bay',      shots: 3, span: 900 },
  // Вынимание: у каждого узла свой характер, и проверять его надо по числам,
  // а не по ощущению. Кадр показывает, где деталь оказалась, а таблица — как
  // она туда шла: у щелчка треть времени на месте, у тугого хода равномерное
  // сопротивление, у лепестка — заход в минус перед отбросом.
  latch:     { watch: '.dimm .latch-l',     click: '.dimm',     shots: 1, span: 900 },
  psu:       { watch: '.psu .pick-body',    click: '.psu',      shots: 2, span: 1400 },
  'psu-latch': { watch: '.psu .psu-latch',  click: '.psu',      shots: 1, span: 900 },
  riser:     { watch: '.riser .pick-body',  click: '.riser',    shots: 2, span: 1400 },
  'drive-in': { watch: '.bay .drive-body',  click: '.bay',      shots: 2, span: 1400 },
  service:  { watch: '.stage',              click: '#svc-switch', shots: 0, span: 1100, plain: true },
  // Assembly runs by itself on the first visit: nothing to click, we watch the
  // whole timeline.
  assembly: { assembly: true },
  // A close-up of one node seating: we wait for its --seat and capture the run.
  'seat-dimm':  { assembly: true, seatOf: '.dimm', watch: '.dimm .pick-body' },
  // You have to look where the seating animation is declared: for a module that
  // is the module body, for the rest — the whole node itself.
  'seat-fan':   { assembly: true, seatOf: '.fan', watch: '.fan' },
  'seat-psu':   { assembly: true, seatOf: '.psu', watch: '.psu' },
  'seat-bay':   { assembly: true, seatOf: '.bay', watch: '.bay' },
  'seat-riser': { assembly: true, seatOf: '.riser', watch: '.riser' },
  // The processor seats in two moves: first the lid with the die, then the
  // heatsink. We watch the die — it is the one that should stay exposed for a
  // while.
  'seat-die':   { assembly: true, seatOf: '.cpu-slot', watch: '.cpu-slot .die' },
  'seat-cpu':   { assembly: true, seatOf: '.cpu-slot', watch: '.cpu-slot .heatsink' },
};

const name = process.argv[2] ?? 'heatsink';
const scene = SCENES[name];
if (!scene) {
  console.error('scenes: ' + Object.keys(SCENES).join(', '));
  process.exit(1);
}

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

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// Headless Chromium answers "reduce" to prefers-reduced-motion by default, and
// the schematic has a rule under that query which kills every transition.
// Without an explicit no-preference the tool would show a jump where there is
// none.
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1,
                                     reducedMotion: 'no-preference' });
await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));
// The first visit: the state of the machine lives in localStorage, and from the
// second time on there is no assembly any more. For the assembly scene we clear
// it before the page loads.
if (scene.assembly) await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
await page.addInitScript(() => { try { localStorage.setItem('rig-view', 'rig'); } catch (e) {} });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => document.body.classList.add('view-rig'));
if (scene.seatOf) {
  // The node knows when it will be seated: the time lives in its own --seat. We
  // wait for that moment and sample the seating run often — that way the
  // character of the motion is visible, not only the fact that the node showed
  // up.
  const seatAt = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    return parseFloat(el.style.getPropertyValue('--seat')) || 0;
  }, scene.seatOf);
  const t0 = Date.now();
  console.log(`── ${name} ── seating scheduled for ${seatAt.toFixed(2)} s`);
  for (let i = 0; i <= 16; i++) {
    const at = (seatAt - 0.1) * 1000 + i * 80;
    while (Date.now() - t0 < at) await page.waitForTimeout(5);
    const m = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return { tr: cs.transform, y: Math.round(b.y * 10) / 10, op: Math.round(cs.opacity * 100) / 100 };
    }, scene.watch);
    const off = /matrix\(([^)]+)\)/.exec(m.tr);
    const dxy = off ? off[1].split(',').slice(4).map(v => Math.round(parseFloat(v) * 10) / 10).join(' ') : '—';
    console.log(`${String(Math.round(Date.now() - t0)).padStart(5)} ms  shift ${dxy.padStart(12)}  opacity ${m.op}`);
  }
  console.log(`\nframes: ${OUT}`);
  await browser.close();
  server.close();
  process.exit(0);
}
if (scene.assembly) {
  // We count how many nodes are already in place: a node has seated once its
  // animation is over and it has stopped being transparent.
  const t0 = Date.now();
  for (let i = 0; i <= 26; i++) {
    while (Date.now() - t0 < i * 420) await page.waitForTimeout(6);
    const st = await page.evaluate(() => {
      const seated = sel => [...document.querySelectorAll(sel)]
        .filter(el => parseFloat(getComputedStyle(el).opacity) > 0.5).length;
      const rig = document.getElementById('rig');
      // We look at what really seats: connectors and caddies stay on the board,
      // only the modules fly in.
      return { fan: seated('.fan'), psu: seated('.psu'), cpu: seated('.cpu-slot .heatsink'),
               dimm: seated('.dimm .pick-body'), riser: seated('.riser'), bay: seated('.bay'),
               cover: rig.classList.contains('lid-off') ? 'off' : 'in place',
               assembly: rig.classList.contains('assembly') ? 'running' : 'finished',
               power: ['init', 'standby', 'on'].find(c => rig.classList.contains(c)) ?? '—' };
    });
    console.log(String(Math.round((Date.now() - t0) / 100) / 10).padStart(5) + ' s  ' +
      `fan ${st.fan}/8  psu ${st.psu}/2  cpu ${st.cpu}/2  memory ${String(st.dimm).padStart(2)}/24  ` +
      `riser ${st.riser}/2  drives ${st.bay}/7  cover ${st.cover}  ${st.assembly}  power ${st.power}`);
    await page.screenshot({ path: join(OUT, `assembly-${String(i).padStart(2, '0')}.png`) });
  }
  console.log(`\nframes: ${OUT}`);
  await browser.close();
  server.close();
  process.exit(0);
}
await page.waitForTimeout(1800);
if (!scene.plain) {
  await page.evaluate(() => document.getElementById('svc-switch')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(1000);
}

// We send the click as an event straight into the node: you can hit a tilted
// stage with the mouse, but the grab zones of the neighbours lie on top of the
// nodes, and a coordinate click goes to the wrong place. The handler sits
// higher up anyway and looks at the target of the event.
const clip = await page.evaluate(sel => {
  const b = document.querySelector(sel).getBoundingClientRect();
  return { x: Math.max(0, b.x - 90), y: Math.max(0, b.y - 90),
           width: Math.min(520, innerWidth - b.x + 90), height: Math.min(460, innerHeight - b.y + 90) };
}, scene.watch);

/** One series: a click and a timeline of samples at equal intervals. */
async function series(tag) {
  const t0 = Date.now();
  await page.evaluate(sel => document.querySelector(sel)
    .dispatchEvent(new MouseEvent('click', { bubbles: true })), scene.click);
  const rows = [];
  for (let i = 0; i <= 12; i++) {
    const at = Math.round((scene.span / 12) * i);
    while (Date.now() - t0 < at) await page.waitForTimeout(4);
    const m = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      // While we are at it we look at which transition is declared on the node:
      // most often a jump means not a curve but someone else's rule that wiped
      // the transform with a shorthand.
      return { tr: cs.transform, y: Math.round(b.y), x: Math.round(b.x),
               transition: cs.transitionProperty + ' / ' + cs.transitionDuration };
    }, scene.watch);
    m.cls = await page.evaluate(sel => document.querySelector(sel).closest('.pick')?.getAttribute('class') ?? '—', scene.watch);
    rows.push({ ms: Date.now() - t0, ...m });
    await page.screenshot({ path: join(OUT, `${name}-${tag}-${String(i).padStart(2, '0')}.png`), clip });
  }
  const num = t => {
    const m = /matrix.*\(([^)]+)\)/.exec(t);
    return m ? m[1].split(',').map(v => Math.round(parseFloat(v) * 100) / 100).join(' ') : t;
  };
  console.log(`\n── ${name} · ${tag} ── transition: ${rows[0].transition}`);
  for (const r of rows) console.log(`${String(r.ms).padStart(4)} ms  y=${String(r.y).padStart(4)}  ${num(r.tr)}   [${r.cls}]`);
  const uniq = new Set(rows.map(r => r.x + ':' + r.y));
  const same = rows[0].tr === rows[rows.length - 1].tr;
  console.log(uniq.size > 2 ? `motion is smooth: ${uniq.size} distinct positions out of ${rows.length} samples`
    : same ? 'the node did not move — this step captures something else'
    : `JUMP: over the whole motion the node took ${uniq.size} positions — the transition is not running`);
}

for (let k = 0; k < Math.max(1, scene.shots); k++) {
  await series(k === 0 ? 'click 1' : `click ${k + 1}`);
  await page.waitForTimeout(400);
}

console.log(`\nframes: ${OUT}`);
await browser.close();
server.close();
