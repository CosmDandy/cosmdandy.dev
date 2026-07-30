// Behaviour check: what the visual comparison cannot see.
//
//   node tools/behave.mjs
//
// Pixels show how the machine looks; here we check what it does. Cutting the
// JS into blocks changes the order of the code, and the order of the code
// changes behaviour — without this test only a human clicking a node would
// notice the breakage.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire('/workspaces/.pw/');
const { chromium } = require('playwright');
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
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// an input field crashes the renderer of this chromium build
await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.body.classList.add('view-rig'));
await page.waitForTimeout(900);

const results = [];
const check = (name, ok, got) => results.push([name, ok, got]);

// helpers that run inside the page
const click = sel => page.evaluate(s => document
  .querySelector(s)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel);
const cls = sel => page.evaluate(s => document.querySelector(s)?.className?.baseVal
  ?? document.querySelector(s)?.className ?? '', sel);
const logText = () => page.evaluate(() => document.getElementById('log')?.textContent ?? '');
const rigCls = () => page.evaluate(() => document.getElementById('rig').className);

// 0. Assembly. The first visit shows an empty chassis and seats the nodes one
// by one: fans and power supplies, processors, memory channel by channel,
// risers, drives. We check that it ends on its own and leaves no node behind
// — a silently lost node looks like «it was always that way».
check('standby mode', (await rigCls()).includes('standby') || (await rigCls()).includes('init'),
      await rigCls());
await page.waitForFunction(
  () => !document.getElementById('rig').classList.contains('assembly'), null, { timeout: 20000 }
).catch(() => {});
check('assembly finished', !(await rigCls()).includes('assembly'), await rigCls());
const seated = await page.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)]
    .filter(el => parseFloat(getComputedStyle(el).opacity) > 0.5).length;
  return { fan: vis('.fan'), psu: vis('.psu'), cpu: vis('.cpu-slot .heatsink'),
           dimm: vis('.dimm .pick-body'), riser: vis('.riser'), bay: vis('.bay') };
});
// The numbers come from the passport rather than being written into the test:
// otherwise it catches not a broken assembly but the fact that the hardware in
// the machine was changed — and fails for a false reason.
const passport = await page.evaluate(() => {
  try { return JSON.parse(document.getElementById('rig-spec').textContent); } catch (e) { return null; }
});
check('every node seated',
      !!passport && seated.fan === passport.fan.n && seated.psu === passport.psu.n
      && seated.cpu === passport.cpu.n && seated.dimm === passport.dimm.slots
      && seated.riser === passport.riser.length
      && seated.bay === passport.bay.filter(b => !b.filler).length,
      JSON.stringify(seated));

// 0b. The reassemble button: the assembly can be watched again without wiping
// the history.
await click('#assemble-btn');
await page.waitForTimeout(200);
check('button restarts assembly', (await rigCls()).includes('assembly'), await rigCls());
await page.waitForFunction(
  () => !document.getElementById('rig').classList.contains('assembly'), null, { timeout: 20000 }
).catch(() => {});
check('reassembly finished', !(await rigCls()).includes('assembly'), await rigCls());

// 1. Power. An assembled machine starts on its own — the assembly is over, so
// it may be powered up. After that the button works as usual: off and on.
await page.waitForFunction(
  () => document.getElementById('rig').classList.contains('on'), null, { timeout: 15000 }
).catch(() => {});
check('machine started after assembly', (await rigCls()).includes('on'), await rigCls());
await click('#power');
await page.waitForTimeout(300);
check('button powers off', (await rigCls()).includes('standby'), await rigCls());
await click('#power');
await page.waitForFunction(
  () => document.getElementById('rig').classList.contains('on'), null, { timeout: 15000 }
).catch(() => {});
check('machine powered on', (await rigCls()).includes('on'), await rigCls());

// 2. Service mode is turned on by the switch
await click('#svc-switch');
await page.waitForTimeout(300);
check('service mode', (await rigCls()).includes('service'), await rigCls());

// 2b. In service mode there are no links on the board. This has to be checked
// by deed rather than by selector: the callouts once already «hid» themselves
// with opacity while staying clickable — a transparent <a> still sits under
// the cursor. We catch three different ways of navigating away: a new tab, the
// current one leaving, and a callout landing in the tab order.
const popups = [];
page.on('popup', p => popups.push(p.url()));
const urlBefore = page.url();
const clicked = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a.callout')];
  links.forEach(a => a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  return links.length;
});
await page.waitForTimeout(400);
check('callouts are present on the board', clicked > 0, String(clicked));
check('in service mode a callout opens no tab', popups.length === 0, popups.join(','));
check('in service mode the page does not follow a link', page.url() === urlBefore, page.url());
// getClientRects() is no good here: visibility: hidden still leaves the
// element a box in the flow. We ask directly — does it take focus.
const focusable = await page.evaluate(() => [...document.querySelectorAll('a.callout')]
  .filter(a => { a.focus(); return document.activeElement === a; }).length);
check('callouts are out of the tab order too', focusable === 0, String(focusable));

// 3. A fan is pulled out and written to the log
await click('.fan');
await page.waitForTimeout(200);
check('fan pulled', (await cls('.fan')).includes('pulled'), await cls('.fan'));
check('log has a line about fan', (await logText()).includes('fan'), '');

// 4. A memory module
await click('.dimm');
await page.waitForTimeout(200);
check('dimm pulled', (await cls('.dimm')).includes('pulled'), await cls('.dimm'));

// 5. The processor — three clicks: heatsink, processor, back
await click('.cpu-slot');
await page.waitForTimeout(150);
check('heatsink removed', (await cls('.cpu-slot')).includes('pulled'), await cls('.cpu-slot'));
await click('.cpu-slot');
await page.waitForTimeout(150);
check('processor removed', (await cls('.cpu-slot')).includes('opened'), await cls('.cpu-slot'));
await click('.cpu-slot');
await page.waitForTimeout(150);
check('processor back in place', !(await cls('.cpu-slot')).includes('pulled'), await cls('.cpu-slot'));

// 5b. A drive — three clicks: latch, caddy out, back. The caddy handle is a
// separate part, and the order has to be exactly this one: until the latch is
// swung open the drive does not leave the bay.
await click('.bay');
await page.waitForTimeout(150);
check('drive latch swung open', (await cls('.bay')).includes('unlatched'), await cls('.bay'));
check('drive still in the bay', !(await cls('.bay')).includes('pulled'), await cls('.bay'));
await click('.bay');
await page.waitForTimeout(150);
check('drive pulled', (await cls('.bay')).includes('pulled'), await cls('.bay'));
await click('.bay');
await page.waitForTimeout(150);
check('drive back in place', !(await cls('.bay')).includes('unlatched'), await cls('.bay'));

// 5a. Node names in the log: they come from the registry each block wrote
// itself into. A name that drifted apart is the least visible breakage of the
// split: everything works, but the machine starts calling its parts
// differently.
await page.evaluate(() => { document.getElementById('log').textContent = ''; });
const names = await page.evaluate(() => {
  const out = {};
  for (const sel of ['.fan', '.dimm', '.bay', '.riser', '.psu']) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = 'no such node'; continue; }
    const was = document.getElementById('log').children.length;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    out[sel] = [...document.getElementById('log').children].slice(was)
      .map(d => d.textContent).join(' ');
  }
  return out;
});
const EXPECT = { '.fan': /fan \d/, '.dimm': /dimm [LCR]\d/, '.bay': /hdd\d/,
  '.riser': /riser \d/, '.psu': /psu-\d/ };
for (const [sel, re] of Object.entries(EXPECT)) {
  check(`node name ${sel}`, re.test(names[sel] ?? ''), names[sel]);
}

// 6. The diagnostics panel does not slide out by itself — it takes a lot of
// room and is not always needed. But on command it must open.
check('light path did not open by itself', !(await rigCls()).includes('lp-open'), await rigCls());
await page.evaluate(() => window.__rig.exec('lightpath'));
await page.waitForTimeout(200);
check('light path opened on command', (await rigCls()).includes('lp-open'), await rigCls());
await page.evaluate(() => window.__rig.exec('lightpath'));
await page.waitForTimeout(200);

// 7. Leaving service mode puts the machine back together
await click('#svc-switch');
await page.waitForTimeout(300);
const stillPulled = await page.evaluate(() => document.querySelectorAll('.pulled').length);
check('nodes are back in place', stillPulled === 0, `${stillPulled} left out`);

// 8. A part number leads to a commit
const stamp = await page.evaluate(() => {
  const a = document.querySelector('a.stamp');
  return { href: a?.getAttribute('href') ?? '', sha: a?.dataset.sha ?? '' };
});
check('part number points at its own commit',
  stamp.href.includes('/commit/' + stamp.sha) && stamp.sha.length === 7, stamp.sha);

// 9. The machine passport. It is printed into the page by the generator and
// must agree with the schematic: if it says twenty-four modules while
// twenty-three are drawn, every command starts lying at once.
const spec = await page.evaluate(() => {
  try { return JSON.parse(document.getElementById('rig-spec').textContent); } catch (e) { return null; }
});
check('passport parses', !!spec && !!spec.cpu, spec ? 'yes' : 'no');
const drawn = await page.evaluate(() => ({
  dimm: document.querySelectorAll('[data-dimm]').length,
  fan: document.querySelectorAll('[data-fan]').length,
  bay: document.querySelectorAll('.unit.pick.bay').length,
  psu: document.querySelectorAll('[data-psu]').length,
  cpu: document.querySelectorAll('[data-cpu]').length,
}));
check('passport agrees with the schematic',
  spec && drawn.dimm === spec.dimm.slots && drawn.fan === spec.fan.n
  && drawn.psu === spec.psu.n && drawn.cpu === spec.cpu.n
  && drawn.bay === spec.bay.filter(b => !b.filler).length,
  JSON.stringify(drawn));

// 10. Commands count by the schematic, not from memory. dimm used to promise
// thirty-two modules where there are twenty-four, and nvme list did not look
// at the bays at all.
const run = s => page.evaluate(cmd => (window.__rig.exec(cmd) || []).map(r => r.t).join('\n'), s);
check('terminal responds', (await run('help')).includes('ОБОЛОЧКА'), 'help');
check('dimm prints 24 of 24', (await run('dimm')).includes('24 of 24'), await run('dimm'));
check('nvme lists seven drives',
  (await run('nvme list')).split('\n').length === spec.bay.filter(b => !b.filler).length, 'nvme');
const fansOut = await run('fans');
check('no invented empty slot in the fan wall', !fansOut.includes('empty'), fansOut.split('\n')[5]);
check('fru takes the revision from the board',
  (await run('fru')).includes('Serial Number  : ' + spec.board.sha), 'fru');

// 11. A pulled node changes the output: a command has to look at the schematic
// at the moment it is called instead of printing the contents of the passport.
await click('#svc-switch');
await page.waitForTimeout(200);
await click('.dimm');
await page.waitForTimeout(400);
check('a pulled module shows up in dimm', (await run('dimm')).includes('23 of 24'), await run('dimm'));
await click('#svc-switch');
await page.waitForTimeout(400);

// 12. Tab completion: the candidates come from the registry rather than from a
// separate list — otherwise the help and the completion drift apart from the
// set of commands.
const comp = await page.evaluate(() => window.__rig.complete('sen'));
check('Tab completes a command', comp.length === 1 && comp[0] === 'sensors', comp.join(','));

// 13. The full-screen layer. It has to raise itself when the power goes on
// (the self-test), let one into setup on F2, and not leave the schematic
// computing animations while it cannot be seen anyway.
const crt = () => page.evaluate(() => ({
  open: !!document.getElementById('crt')?.classList.contains('on'),
  mode: document.getElementById('crt')?.dataset.mode ?? '',
  dormant: document.getElementById('rig').classList.contains('dormant'),
}));
await page.evaluate(() => window.__rig.exec('power off'));
await page.waitForTimeout(700);
// We count the lines before the start: the log already holds the self-test
// played back when the page loaded, and «is there a Memory Training in the
// log» would have answered «yes» before the machine even began to boot.
const postSeen = () => page.evaluate(
  () => ((document.getElementById('log')?.textContent ?? '').match(/Memory Training/g) || []).length);
const before = await postSeen();
await page.evaluate(() => window.__rig.exec('power on'));
// We wait for an event rather than for seconds: the self-test lines come out
// on timers, and on a stopwatch the scenario failed from load rather than from
// a breakage.
await page.waitForFunction(
  () => document.getElementById('crt')?.classList.contains('on'), null, { timeout: 10000 }
).catch(() => {});
const post = await crt();
check('self-test raises the screen', post.open && post.mode === 'post', JSON.stringify(post));
check('the schematic is paused under the open layer', post.dormant, String(post.dormant));
await page.waitForFunction(
  n => ((document.getElementById('log')?.textContent ?? '').match(/Memory Training/g) || []).length > n,
  before, { timeout: 10000 }).catch(() => {});
check('self-test lines go to the console too', (await postSeen()) > before, 'log');

// 14. Enter from the self-test leads into setup. F2 works just as well, but on
// a Mac the top row is given to brightness and the key never reaches the page.
await page.keyboard.press('Enter');
await page.waitForTimeout(4200);
check('Enter opens setup', (await crt()).mode === 'setup', JSON.stringify(await crt()));

// 15. Esc leaves without saving, F10 saves. Different storage keys: the
// firmware is edited rarely, while the power is clicked every time.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Esc closes setup', !(await crt()).open, JSON.stringify(await crt()));

// 16. top shows the same metrics the gauges used to, and leaves on q.
await page.evaluate(() => window.__rig.exec('top'));
await page.waitForTimeout(600);
check('top opens the screen', (await crt()).mode === 'top', JSON.stringify(await crt()));
await page.keyboard.press('q');
await page.waitForTimeout(400);
check('q closes top', !(await crt()).open, JSON.stringify(await crt()));

// 16b. In each mode exactly one panel is visible. The panels are switched with
// the hidden attribute, and each has its own display — the browser rule for
// [hidden] loses to it, and all three showed at once, three windows on top of
// one another.
await page.evaluate(() => window.__rig.exec('bios'));
await page.waitForTimeout(400);
const shown = await page.evaluate(() => ['.crt-post', '.crt-setup', '.crt-top']
  .filter(s => getComputedStyle(document.querySelector(s)).display !== 'none'));
check('one panel is visible in setup', shown.length === 1 && shown[0] === '.crt-setup', shown.join(','));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 17. There are no gauges in the side column any more — the console took their
// place.
const gauges = await page.evaluate(() => document.querySelectorAll('.gauge').length);
check('gauges removed', gauges === 0, String(gauges));

// 18. Pipeline and file system: a command hands over lines, a filter cuts them.
check('the pipeline filters',
  (await run('fans | grep FAN2')).split('\n').length === 1, await run('fans | grep FAN2'));
check('wc counts lines', (await run('fans | wc -l')).trim().endsWith(String(spec.fan.n)),
  await run('fans | wc -l'));
check('/proc/cpuinfo knows about the cores',
  (await run('cat /proc/cpuinfo | grep "model name" | wc -l')).trim()
    .endsWith(String(spec.cpu.cores * spec.cpu.n * 2)), await run('cat /proc/cpuinfo | grep "model name" | wc -l'));

const failed = results.filter(r => !r[1]);
for (const [name, ok, got] of results) console.log(`  ${ok ? '·' : 'BROKEN'} ${name}${ok ? '' : ` → ${got}`}`);
if (errors.length) console.log(`  ERRORS: ${errors.slice(0, 2).join(' | ')}`);
console.log(failed.length || errors.length
  ? `failed: ${failed.length}, errors: ${errors.length}` : 'behaviour is fine');

await browser.close();
server.close();
process.exit(failed.length || errors.length ? 1 : 0);
