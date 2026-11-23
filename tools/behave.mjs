// Behaviour check: what the visual comparison cannot see.
//
//   node tools/behave.mjs
//
// Pixels show how the machine looks; here we check what it does. Cutting the
// JS into blocks changes the order of the code, and the order of the code
// changes behaviour — without this test only a human clicking a node would
// notice the breakage.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { launch } from './browser.mjs';

const ROOT = resolve(import.meta.dirname, '..');


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

const browser = await launch();
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

// 5b. Каддик — четыре щелчка: защёлка, наружу, обратно в корзину, защёлка
// закрыта. Ручка — отдельная деталь, и порядок обязан быть ровно таким: пока
// защёлка не откинута, диск из отсека не выходит, а на обратном пути он
// сперва заходит в корзину и только потом ручку захлопывают. Раньше третий
// щелчок снимал оба класса разом: каддик въезжал, ручка складывалась сама на
// полпути, и второго движения не было вовсе.
await click('.bay');
await page.waitForTimeout(150);
check('drive latch swung open', (await cls('.bay')).includes('unlatched'), await cls('.bay'));
check('drive still in the bay', !(await cls('.bay')).includes('pulled'), await cls('.bay'));
await click('.bay');
await page.waitForTimeout(150);
check('drive pulled', (await cls('.bay')).includes('pulled'), await cls('.bay'));
await click('.bay');
await page.waitForTimeout(150);
check('drive back in the bay, handle still open',
      !(await cls('.bay')).includes('pulled') && (await cls('.bay')).includes('unlatched'),
      await cls('.bay'));
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
  const g = document.querySelector('g.stamp');
  if (!g) return null;
  return { sha: g.dataset.sha, tag: g.tagName,
           texts: [...g.querySelectorAll('text')].map(t => t.textContent),
           link: !!g.closest('a') };
});
// Партномер — набивка, а не ссылка: уводить со страницы ему незачем, а под
// курсором он меняет номер на дату той сборки, которой принадлежит.
check('the part number is a stamp, not a link',
      !!stamp && !stamp.link && stamp.sha.length === 7 && stamp.texts.length === 2
      && stamp.texts[0].startsWith('P/N'), JSON.stringify(stamp));

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

// 15b. Закрытый экран прячется от читалки — и прячется по-настоящему. Пока
// фокус оставался на нём самом (openCrt переводит фокус туда руками), Chrome
// отказывался ставить aria-hidden и писал об этом в панель Issues: «Blocked
// aria-hidden on an element because its descendant retained focus». В консоль
// это не попадает, поймать прогоном нельзя — поэтому проверяем не жалобу, а
// то условие, из-за которого она возникает: экран спрятан, фокуса внутри нет.
const shut = await page.evaluate(() => {
  const el = document.getElementById('crt');
  return { hidden: el.getAttribute('aria-hidden'), inside: el.contains(document.activeElement) };
});
check('закрытый экран спрятан от читалки, и фокус из него ушёл',
  shut.hidden === 'true' && !shut.inside, JSON.stringify(shut));

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

// 19. Both supplies out — the machine loses mains: nothing blinks and the
// console goes grey. One supply out is redundancy lost, two is a power
// failure, and the two must not read the same.
await page.evaluate(() => window.__rig.exec('service on'));
await page.waitForTimeout(300);
await click('.psu[data-psu="1"]');
await page.waitForTimeout(200);
check('one supply out is not a blackout', !(await rigCls()).includes('blackout'), await rigCls());
await click('.psu[data-psu="2"]');
await page.waitForTimeout(700);
const dead = await page.evaluate(() => {
  const core = document.querySelector('.led-hb:not(.halo)');
  return { rig: document.getElementById('rig').className,
           hb: getComputedStyle(core).fillOpacity,
           anim: getComputedStyle(core).animationName,
           pwr: getComputedStyle(document.querySelector('.pwr-led')).strokeOpacity,
           side: getComputedStyle(document.querySelector('.rig-side')).filter };
});
check('both supplies out kill the machine',
      dead.rig.includes('blackout') && !/\bon\b/.test(dead.rig), dead.rig);
check('nothing is lit on a dead machine',
      dead.hb === '0' && dead.anim === 'none' && dead.pwr === '0', JSON.stringify(dead));
check('the console dies with the machine', dead.side.includes('grayscale'), JSON.stringify(dead));
check('the power failure is in the log', (await logText()).includes('ac lost'), 'log');
check('the event log keeps it', (await run('sel')).includes('power lost'), await run('sel'));
await click('.psu[data-psu="2"]');
await page.waitForTimeout(500);
check('a supply back means standby',
      !(await rigCls()).includes('blackout') && (await rigCls()).includes('standby'), await rigCls());
await click('.psu[data-psu="1"]');
await page.waitForTimeout(300);

// 20. Esc is the spare way out of service mode: the switch is drawn on the
// board, and the board is exactly what can be off the screen.
check('service mode is still on', (await rigCls()).includes('service'), await rigCls());
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Esc leaves service mode', !(await rigCls()).includes('service'), await rigCls());

// 21. A narrow window hides the schematic whole — and with it both the switch
// and the console. Browser zoom squeezes the css window exactly the same way,
// so service mode must not survive it: there would be nothing left to leave it
// with.
await click('#svc-switch');
await page.waitForTimeout(200);
await page.setViewportSize({ width: 780, height: 1000 });
await page.waitForTimeout(400);
check('a hidden schematic leaves no service mode',
      !(await rigCls()).includes('service'), await rigCls());
await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(400);

// 22. The machine is assembled with the power off and comes up with a
// self-test: on a live machine nothing is seated under voltage.
await page.evaluate(() => window.__rig.exec('power on'));
await page.waitForFunction(() => document.getElementById('rig').classList.contains('on'),
  null, { timeout: 15000 }).catch(() => {});
// Wait for the self-test of that start to play out and the screen to go: while
// it is up the schematic is inert, so a person could not press the button
// either — and a screen left over from before would answer for the new one in
// the check below.
await page.waitForFunction(() => !document.getElementById('crt').classList.contains('on'),
  null, { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(400);
await click('#assemble-btn');
await page.waitForTimeout(400);
check('assembly powers the machine off',
      (await rigCls()).includes('assembly') && !/\bon\b/.test(await rigCls()), await rigCls());
await page.waitForFunction(() => !document.getElementById('rig').classList.contains('assembly'),
  null, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => document.getElementById('crt')?.classList.contains('on')
  && document.getElementById('crt').dataset.mode === 'post', null, { timeout: 25000 }).catch(() => {});
check('assembly ends with a self-test on the screen',
      (await crt()).open && (await crt()).mode === 'post', JSON.stringify(await crt()));

// 23. The plaques wait for the screen. The machine is assembled, the self-test
// rises — the labels appear only once it has gone. They used to surface for a
// second in the gap and hide again under the screen.
const tagOp = () => page.evaluate(() => getComputedStyle(document.querySelector('.callout')).opacity);
check('no plaques under the screen', (await crt()).open && (await tagOp()) === '0',
      (await tagOp()) + ' ' + JSON.stringify(await crt()));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.getElementById('crt').classList.contains('on'),
  null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2200);
check('the plaques come after the screen', (await tagOp()) === '1', await tagOp());

// 24. A callout is one thing: the line to the board is the colour of the spine
// at the edge of the plaque and of the icon on it.
const lines = await page.evaluate(() => [...document.querySelectorAll('.callout')].map(c => {
  const hex = c.querySelector('.co-edge').getAttribute('fill');
  const rgb = getComputedStyle(c.querySelector('.co-line')).stroke;
  const m = /^#(..)(..)(..)$/.exec(hex);
  return { want: m ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})` : hex,
           got: rgb };
}));
check('the leader line is the colour of its own plaque',
      lines.length > 0 && lines.every(l => l.want === l.got), JSON.stringify(lines.slice(0, 3)));

// 25. The network indicator on the panel: one lamp per built-in interface —
// two gigabits and the management port. All three blink with traffic, and the
// management one is amber and lives on standby power.
const netDots = await page.evaluate(() => [...document.querySelectorAll('.led-act')]
  .filter(el => !el.classList.contains('halo') && el.hasAttribute('cx')
                && +el.getAttribute('cx') < 100 && +el.getAttribute('cy') > 95
                && +el.getAttribute('cy') < 130)
  .map(d => ({ fill: d.getAttribute('fill'), aux: d.classList.contains('aux'),
               anim: getComputedStyle(d).animationName })));
check('three lamps for three built-in interfaces', netDots.length === 3, JSON.stringify(netDots));
check('all three blink', netDots.every(d => d.anim === 'act'), JSON.stringify(netDots));
check('management is amber and on standby',
      netDots.filter(d => d.fill === '#b58900' && d.aux).length === 1
      && netDots.filter(d => d.fill === '#859900' && !d.aux).length === 2, JSON.stringify(netDots));

// 26. Leaving service mode, the machine folds up in one movement rather than
// in seven clicks at once: for the duration of the return the units travel on
// the curve of the whole composition.
await click('#svc-switch');
await page.waitForTimeout(300);
await click('.fan');
await page.waitForTimeout(400);
const clickDur = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.fan .pick-body')).transitionDuration);
await click('#svc-switch');
await page.waitForTimeout(150);
const stowDur = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.fan .pick-body')).transitionDuration);
check('the units are stowed on the slow curve', stowDur !== clickDur && stowDur === '1.5s',
      clickDur + ' → ' + stowDur);
await page.waitForTimeout(1800);
// Сравнивать с длительностью, снятой у вынутого узла, нельзя: наружу и внутрь
// у него разные кривые — своя на вынимание и своя посадочная на возврат. Важно
// тут другое: что общая медленная кривая уборки после возврата отпустила узел и
// он снова ходит своей.
const backDur = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.fan .pick-body')).transitionDuration);
check('the click comes back after the return',
      backDur !== stowDur && backDur !== '1.5s', clickDur + ' → ' + stowDur + ' → ' + backDur);

// A running fan is a disc, a fan at reduced rpm is blades. Both states are
// pure css, so what can break them silently is a selector — and that is
// exactly what a screenshot would not tell apart from a colour tweak.
const rotorState = () => page.evaluate(() => {
  const f = document.querySelector('.fan .fan-blades');
  const get = sel => getComputedStyle(f.querySelector(sel)).fillOpacity;
  return { vane: +get('.rotor-vane'), blur: +get('.rotor-blur') };
});
const running = await rotorState();
check('at rated rpm the impeller is a disc', running.blur > 0.9 && running.vane < 0.1,
      JSON.stringify(running));
await page.evaluate(() => document.querySelector('.rig').classList.add('nv-eff'));
await page.waitForTimeout(700);
const eased = await rotorState();
check('the Efficiency profile brings the blades back', eased.vane > 0.3 && eased.blur < 0.1,
      JSON.stringify(eased));
await page.evaluate(() => document.querySelector('.rig').classList.remove('nv-eff'));
// The compositor layer is what pays for smooth rotation: lose it and the turn
// goes back to repainting the scene on every frame the monitor draws.
const willChange = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.fan .fan-blades')).willChange);
check('the impeller turns on a layer of its own', willChange === 'transform', willChange);

// 29. Панель диагностики. Контрольный индикатор — не лампа: он показывает, где
// машина находится, и за время самотеста код на нём меняется, а после —
// замирает на том, с которого начинается загрузка. Кнопка сброса гасит
// защёлкнувшуюся ошибку и отказывается это делать, пока узел вынут.
const segMask = () => page.evaluate(() => [...document.querySelectorAll('.seg')]
  .map(el => (el.classList.contains('on') ? '1' : '0')).join(''));
await page.evaluate(() => document.getElementById('rig').classList.remove('service'));
await click('#power');                       // выключаем
await page.waitForTimeout(300);
check('the checkpoint goes dark with the machine', /^0+$/.test(await segMask()), await segMask());
await click('#power');                       // и включаем обратно
const seen = new Set();
for (let i = 0; i < 8; i++) { seen.add(await segMask()); await page.waitForTimeout(160); }
check('the checkpoint counts through the self-test', seen.size >= 3, String(seen.size));
await page.waitForFunction(() => {
  const on = [...document.querySelectorAll('.seg')].filter(e => e.classList.contains('on'));
  return on.length === 12;
}, null, { timeout: 8000 }).catch(() => {});
check('the checkpoint stops at the boot code',
      (await page.evaluate(() => [...document.querySelectorAll('.seg')]
        .filter(e => e.classList.contains('on')).length)) === 12,
      await segMask());

// Ошибка защёлкивается: узел вернули, а лампа неисправности горит дальше.
await page.evaluate(() => document.getElementById('svc-switch')
  .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(400);
await click('.fan[data-fan="2"]');
await page.waitForTimeout(200);
check('a pulled unit latches the fault', (await rigCls()).includes('fault-latched'), await rigCls());
await click('.fan[data-fan="2"]');           // вернули на место
await page.waitForTimeout(200);
check('the latch outlives the repair',
      !(await rigCls()).includes('has-fault') && (await rigCls()).includes('fault-latched'),
      await rigCls());
await click('#lp-reset');
await page.waitForTimeout(150);
check('reset clears the latched fault', !(await rigCls()).includes('fault-latched'), await rigCls());
await click('.fan[data-fan="2"]');           // снова вынули
await page.waitForTimeout(200);
await click('#lp-reset');
await page.waitForTimeout(150);
check('reset refuses while a unit is out', (await rigCls()).includes('fault-latched')
      && (await logText()).includes('reset refused'), await rigCls());
await click('.fan[data-fan="2"]');
await page.waitForTimeout(200);

// 27. Сборка ждёт схему. На узком экране открывается карточка, .rig лежит в
// display: none, и ни одна анимация в нём не заводится. Расписание раньше
// отсчитывалось от загрузки страницы независимо ни от чего, и гость, дошедший
// до схемы через полминуты, получал уже собранную машину: смотреть было
// нечего. Своя страница, потому что вход играет один раз за визит.
//
// Кнопки переключения вида больше нет — вид выбирает ширина окна. Поэтому и
// проверяем ширину: узкое окно держит карточку, расширение показывает схему и
// с ней запускает сборку.
const p2 = await browser.newPage({ viewport: { width: 700, height: 1000 } });
await p2.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));
await p2.goto(url, { waitUntil: 'load' });
const seatAnims = pg => pg.evaluate(() => document.querySelector('.chassis')
  .getAnimations({ subtree: true })
  .filter(a => String(a.animationName || '').startsWith('seat')).length);
await p2.waitForTimeout(11000);      // дольше всего расписания сборки
const waiting = await p2.evaluate(() => document.getElementById('rig').className);
check('the machine waits disassembled while the card is up',
      waiting.includes('assembly') && (await seatAnims(p2)) === 0, waiting);
await p2.setViewportSize({ width: 1600, height: 1000 });
await p2.waitForTimeout(1000);
check('widening the window is what starts the assembly', (await seatAnims(p2)) > 0,
      String(await seatAnims(p2)));

// 28. The assembly ends by its own animations, not by the clock. A tab in the
// background, a schematic scrolled off the edge, the machine's screen up — all
// of them pause the animations (.dormant), while a timer keeps ticking. It took
// the assembly class off early, and the units whose turn had not come simply
// appeared in place, all at once and without a movement.
await p2.evaluate(() => document.getElementById('rig').classList.add('dormant'));
await p2.waitForTimeout(4000);
const stillOn = await p2.evaluate(() => document.getElementById('rig').className);
check('a pause does not end the assembly', stillOn.includes('assembly'), stillOn);
await p2.evaluate(() => document.getElementById('rig').classList.remove('dormant'));
await p2.waitForFunction(() => !document.getElementById('rig').classList.contains('assembly'),
  null, { timeout: 20000 }).catch(() => {});
check('after the pause the assembly plays out to the end',
      !(await p2.evaluate(() => document.getElementById('rig').className)).includes('assembly')
      && (await seatAnims(p2)) === 0, await p2.evaluate(() => document.getElementById('rig').className));
await p2.close();

// 29. Звук. Обещание одно и жёсткое: пока гость сам не нажал кнопку, страница
// не заводит аудиоконтекст вообще. Проверяем счётчиком на конструкторе, а не
// на слух — контекст, заведённый «про запас», браузер показал бы значком звука
// на вкладке молчащей визитки, и это ровно то, чего здесь быть не должно.
const clickIn = (pg, sel) => pg.evaluate(s => document.querySelector(s)
  ?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel);
const acProbe = () => {
  const Real = window.AudioContext;
  window.__acs = [];
  // Когда звук запланирован — в секундах от «сейчас». По этому списку
  // проверяется, что сборка звучит в момент посадки, а не старта хода.
  window.__at = [];
  window.AudioContext = function () {
    const c = new Real();
    window.__acs.push(c);
    const bs = c.createBufferSource.bind(c);
    c.createBufferSource = function () {
      const n = bs();
      const start = n.start.bind(n);
      n.start = function (when, off) {
        window.__at.push(when - c.currentTime);
        return start(when, off);
      };
      return n;
    };
    return c;
  };
};
const p3 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
p3.on('pageerror', e => errors.push(String(e)));
await p3.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));
await p3.addInitScript(acProbe);
await p3.goto(url, { waitUntil: 'load' });
await p3.evaluate(() => document.body.classList.add('view-rig'));
await p3.waitForTimeout(1200);
const acCount = () => p3.evaluate(() => window.__acs.length);
const pressed = () => p3.evaluate(() => document.getElementById('sfx-btn').getAttribute('aria-pressed'));
const soundPref = () => p3.evaluate(() => { try { return localStorage.getItem('sound'); } catch (e) { return null; } });
check('звука нет, пока его не включили', (await acCount()) === 0 && (await pressed()) === 'false',
      `contexts: ${await acCount()}, pressed: ${await pressed()}`);
await clickIn(p3, '#sfx-btn');
await p3.waitForTimeout(200);
check('кнопка заводит контекст и запоминает выбор',
      (await acCount()) === 1 && (await pressed()) === 'true' && (await soundPref()) === 'on',
      `contexts: ${await acCount()}, pressed: ${await pressed()}, pref: ${await soundPref()}`);
await clickIn(p3, '#sfx-btn');
await p3.waitForTimeout(200);
check('повторное нажатие выключает и второго контекста не заводит',
      (await acCount()) === 1 && (await pressed()) === 'false' && (await soundPref()) === 'off',
      `contexts: ${await acCount()}, pressed: ${await pressed()}, pref: ${await soundPref()}`);
await p3.close();

// 30. Синтез. Проверка выше ничего не говорит о том, что звук вообще
// собирается: без настоящего жеста браузер держит контекст остановленным, и
// sfx() честно молчит на каждом вызове. Поэтому отдельное окно с отключённой
// политикой автозапуска — только там голоса действительно строятся, и видно,
// падает ли что-нибудь внутри них.
const errBefore = errors.length;
const loud = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p4 = await loud.newPage({ viewport: { width: 1600, height: 1000 } });
p4.on('pageerror', e => errors.push(String(e)));
await p4.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));
await p4.addInitScript(acProbe);
await p4.goto(url, { waitUntil: 'load' });
await p4.evaluate(() => document.body.classList.add('view-rig'));
await p4.waitForTimeout(1200);
await clickIn(p4, '#sfx-btn');
await p4.waitForTimeout(400);
const acState = await p4.evaluate(() => window.__acs[0] && window.__acs[0].state);
check('включённый звук поднимает контекст', acState === 'running', String(acState));
// Ждём конца первой сборки. Пока она идёт, reassemble() сам себя блокирует, а
// узлы закрыты для кликов — вся проверка ниже прошла бы вхолостую и покрасила
// бы код, который на самом деле цел.
await p4.waitForFunction(
  () => !document.getElementById('rig').classList.contains('assembly'),
  null, { timeout: 25000 }).catch(() => {});
await p4.waitForTimeout(800);
// Все голоса разом: тумблер, снятие и посадка узла, крышка, писк спикера и
// целое расписание сборки. Падение внутри любого из них всплывёт в errors.
await clickIn(p4, '#svc-switch');
await clickIn(p4, '.unit.pick.bay');
await p4.waitForTimeout(200);
await clickIn(p4, '.unit.pick.bay');
await clickIn(p4, '#lid-remove');
await p4.waitForTimeout(200);
await clickIn(p4, '#svc-switch');
await clickIn(p4, '#power');
await p4.waitForTimeout(700);
await clickIn(p4, '#power');

// Звук сборки обязан попадать в момент посадки, а не в момент старта хода.
// Здесь и пряталась ошибка: --seat — это задержка начала движения, и у каддика
// с его ходом в 1.2 с звук уходил вперёд настолько, что диск садился в полной
// тишине. Сверяем последний запланированный звук с последней посадкой: сроки
// берутся у самих анимаций, поэтому расходиться им больше чем на треть секунды
// нечем — этот зазор и есть разгон трения перед ударом.
await p4.evaluate(() => { window.__at = []; });
await clickIn(p4, '#assemble-btn');
await p4.waitForTimeout(500);
const beat = await p4.evaluate(() => {
  const land = document.querySelector('.chassis').getAnimations({ subtree: true })
    .filter(a => String(a.animationName || '').startsWith('seat'))
    .map(a => {
      const t = a.effect.getComputedTiming();
      return ((t.delay || 0) + (t.activeDuration || 0)) / 1000;
    })
    .filter(v => isFinite(v) && v > 0);
  return {
    n: window.__at.length,
    sound: window.__at.length ? Math.max(...window.__at) : null,
    land: land.length ? Math.max(...land) : null,
  };
});
check('звук сборки попадает в посадку, а не в старт хода',
      beat.n > 0 && beat.land !== null && Math.abs(beat.sound - beat.land) < 0.35,
      `звуков ${beat.n}, последний ${beat.sound && beat.sound.toFixed(2)}с,` +
      ` последняя посадка ${beat.land && beat.land.toFixed(2)}с`);

await p4.waitForTimeout(2000);
check('голоса строятся без ошибок', errors.length === errBefore,
      errors.slice(errBefore, errBefore + 2).join(' | '));
await p4.close();
await loud.close();

// 31. Прошивка. Setup перестал быть плоским списком: Advanced — это оглавление,
// Enter уводит на уровень ниже, Esc возвращает, а не выбрасывает наружу. Плюс
// три вещи, которых у плоского списка не было вовсе — рамка подтверждения,
// окно помощи и всплывающее меню загрузки.
//
// Ловушка здесь та же, что в разделе 30, только злее: между концом сборки и
// подъёмом экрана самотеста есть окно, в котором экран закрыт, а лента ещё не
// началась. F2, нажатая в нём, уходит в отложенный вход и срабатывает через
// четыре секунды — посреди чужой проверки. Поэтому ждём весь цикл: экран
// поднялся, отыграл и ушёл.
const p5 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
p5.on('pageerror', e => errors.push(String(e)));
await p5.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));
await p5.goto(url, { waitUntil: 'load' });
await p5.evaluate(() => document.body.classList.add('view-rig'));

const biosSettle = async () => {
  await p5.waitForFunction(() => !document.getElementById('rig').classList.contains('assembly'),
                           null, { timeout: 30000 }).catch(() => {});
  await p5.waitForFunction(() => document.getElementById('crt').classList.contains('on'),
                           null, { timeout: 30000 }).catch(() => {});
  await p5.waitForFunction(() => !document.getElementById('crt').classList.contains('on'),
                           null, { timeout: 30000 }).catch(() => {});
  await p5.waitForTimeout(400);
};
const tap = async k => { await p5.keyboard.press(k); await p5.waitForTimeout(70); };
const bios = () => p5.evaluate(() => ({
  mode: document.getElementById('crt').dataset.mode,
  on: document.getElementById('crt').classList.contains('on'),
  path: (document.getElementById('crt-setup-path') || {}).textContent || '',
  tabs: [...document.querySelectorAll('#crt-setup-tabs .crt-tab')].map(t => t.textContent).join('|'),
  labels: [...document.querySelectorAll('#crt-setup-rows .crt-row-label')].map(t => t.textContent),
  ovl: document.getElementById('crt-overlay').hidden
    ? null : document.getElementById('crt-overlay').dataset.kind,
  ovlText: document.getElementById('crt-overlay-body').textContent,
  code: (document.getElementById('crt-post-code') || {}).textContent,
  spin: getComputedStyle(document.getElementById('rig')).getPropertyValue('--spin').trim(),
}));

await biosSettle();
await tap('F2');
let b = await bios();
check('F2 открывает Setup', b.mode === 'setup' && b.on, `${b.mode}/${b.on}`);
check('вкладок шесть, со Security и Save & Exit',
      b.tabs === 'Main|Advanced|Boot|Security|IMM|Save & Exit', b.tabs);

await tap('ArrowRight');
b = await bios();
check('Advanced — оглавление, а не список тумблеров',
      b.labels.length > 0 && b.labels.every(l => l.startsWith('▶ ')), b.labels.join(','));
await tap('Enter');
b = await bios();
check('Enter уводит на уровень ниже, крошки это показывают',
      b.path === 'Advanced  ▸  Processor Configuration', b.path);
await tap('ArrowLeft');
b = await bios();
check('стрелка внутри подменю не выбрасывает через уровень',
      b.path.includes('Processor'), b.path);
await tap('Escape');
b = await bios();
check('Esc из подменю возвращает на корень вкладки', b.path === 'Advanced', b.path);

// Выделенная строка обязана читаться. Правило, попавшее прямо в подпись,
// побеждает наследование при любой специфичности — и подпись входа оставалась
// светло-серой на жёлтом поле, то есть невидимой. Цвет берём вычисленный: на
// глаз тут верить нечему, вопрос ровно в том, какое правило победило.
const sel31 = await p5.evaluate(() => {
  const row = document.querySelector('#crt-setup-rows .crt-row.sel');
  if (!row) return null;
  return { fg: getComputedStyle(row.querySelector('.crt-row-label')).color,
           bg: getComputedStyle(row).backgroundColor };
});
check('выделенная строка — чёрным по жёлтому, а не белым по жёлтому',
      !!sel31 && sel31.fg === 'rgb(0, 0, 0)' && sel31.bg === 'rgb(216, 216, 0)',
      JSON.stringify(sel31));

await tap('F1');
b = await bios();
check('F1 открывает окно помощи, а не пишет в невидимую консоль',
      b.ovl === 'help' && b.ovlText.includes('Select Item'), `${b.ovl}: ${b.ovlText.slice(0, 40)}`);
await tap('Escape');

// Политика оборотов: правка живёт в черновике, пока её не сохранили, и только
// F10 доводит её до схемы. Это то же разделение, что у всей прошивки, — просто
// здесь его видно глазом, по периоду вращения крыльчатки.
const spin0 = (await bios()).spin;
await p5.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('rig-nv') || '{}');
  raw.fanPolicy = 'Acoustic';
  localStorage.setItem('rig-nv', JSON.stringify(raw));
});
b = await bios();
check('запись мимо Setup схему не трогает', b.spin === spin0, `${b.spin} vs ${spin0}`);

for (let i = 0; i < 3; i++) await tap('ArrowRight');   // Boot → Security → IMM
await tap('ArrowDown');                                 // Cooling
await tap('Enter');
b = await bios();
check('политика оборотов стоит в меню контроллера, а не в Advanced',
      b.path.includes('Cooling') && b.labels.some(l => l.startsWith('Fan Speed Policy')),
      `${b.path}: ${b.labels.join(',')}`);
await tap('-');                                         // Balanced → Efficiency
b = await bios();
check('до сохранения период вращения прежний', b.spin === spin0, `${b.spin} vs ${spin0}`);
await tap('F10');
b = await bios();
check('F10 спрашивает подтверждение', b.ovl === 'confirm', String(b.ovl));
await tap('ArrowRight'); await tap('Enter');            // No
b = await bios();
check('No оставляет в Setup', b.mode === 'setup' && !b.ovl && b.on, `${b.mode}/${b.ovl}`);
await tap('F10'); await tap('Enter');                   // Yes
await p5.waitForTimeout(250);
b = await bios();
check('Yes сохраняет, закрывает экран и замедляет крыльчатки',
      !b.on && Math.abs(parseFloat(b.spin) - 2 * parseFloat(spin0)) < 0.01,
      `on=${b.on}, spin ${b.spin} vs ${spin0}`);

await tap('F11');
b = await bios();
check('F11 поднимает всплывающее меню загрузки', b.ovl === 'boot', String(b.ovl));
const orderBefore = await p5.evaluate(() => JSON.parse(localStorage.getItem('rig-nv')).bootOrder.join(','));
await tap('Escape');
await p5.waitForTimeout(200);
b = await bios();
const orderAfter = await p5.evaluate(() => JSON.parse(localStorage.getItem('rig-nv')).bootOrder.join(','));
check('отмена уносит и меню, и пустой экран под ним', !b.ovl && !b.on, `${b.ovl}/${b.on}`);
check('меню загрузки не трогает сохранённый порядок', orderBefore === orderAfter,
      `${orderBefore} → ${orderAfter}`);

// Машина, которой не с чего грузиться. Раньше проверка ловила только Legacy
// поверх GPT, и пустая корзина бодро «загружалась» с несуществующего диска.
// Здесь мы убираем все три пути сразу — иначе прошивка обязана уйти в PXE, и
// это будет правильно.
await p5.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('rig-nv') || '{}');
  raw.netStack = 'Disabled';
  raw.vmedia = 'Detached';
  raw.fanPolicy = 'Balanced';
  localStorage.setItem('rig-nv', JSON.stringify(raw));
  location.reload();
});
await p5.waitForTimeout(1200);
await p5.evaluate(() => document.body.classList.add('view-rig'));
await p5.waitForFunction(() => !document.getElementById('rig').classList.contains('assembly'),
                         null, { timeout: 30000 }).catch(() => {});
await p5.waitForTimeout(600);
await clickIn(p5, '#svc-switch');
await p5.waitForTimeout(800);
// У каддика четыре движения, вынимается он двумя: откинуть защёлку и вытянуть.
for (let step = 0; step < 2; step++) {
  const bays = await p5.evaluate(() => document.querySelectorAll('.unit.pick.bay').length);
  for (let i = 0; i < bays; i++) {
    await p5.evaluate(n => document.querySelectorAll('.unit.pick.bay')[n]
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })), i);
    await p5.waitForTimeout(60);
  }
  await p5.waitForTimeout(500);
}
// Из сервисного режима не выходим: выход сажает все вынутые узлы обратно.
await clickIn(p5, '#power');
await p5.waitForTimeout(500);
await p5.evaluate(() => { document.getElementById('log').innerHTML = ''; });
await clickIn(p5, '#power');
await p5.waitForFunction(() => document.getElementById('crt').classList.contains('on'),
                         null, { timeout: 20000 }).catch(() => {});
await p5.waitForTimeout(6500);
const noboot = await p5.evaluate(() => ({
  log: [...document.querySelectorAll('#log div')].map(d => d.textContent),
  on: document.getElementById('crt').classList.contains('on'),
  code: document.getElementById('crt-post-code').textContent,
  lit: (() => {
    const out = [];
    for (let d = 0; d < 2; d++) for (const seg of 'abcdefg') {
      const el = document.querySelector('.seg-' + d + seg);
      if (el && el.classList.contains('on')) out.push(d + seg);
    }
    return out.join(',');
  })(),
}));
check('машина без единого устройства не делает вид, что грузится',
      noboot.log.some(t => /No boot device found/.test(t))
      && !noboot.log.some(t => /Booting \/dev\/nvme0n1/.test(t)),
      noboot.log.slice(-4).join(' / '));
check('и называет причину по каждому устройству',
      noboot.log.some(t => /NVMe 0 — no drive in cage/.test(t)),
      noboot.log.filter(t => /—/.test(t)).join(' / '));
check('экран остаётся стоять на отказе', noboot.on, String(noboot.on));
// Экран пишет D6, индикатор на плате — d6: на семисегментном D неотличима от 0,
// и живые платы пишут её строчной. Число при этом одно, и в том весь смысл:
// пока лента индикатора была заготовленной, эти двое расходились.
check('код отказа на экране и на плате — один и тот же',
      noboot.code === 'D6' && noboot.lit === '0b,0c,0d,0e,0g,1a,1c,1d,1e,1f,1g',
      `экран ${noboot.code}, плата ${noboot.lit}`);

// Пароль задаётся в два ввода, и вторая рамка обязана дожить до ввода. Здесь
// пряталась тихая ошибка: первая рамка закрывала не себя, а уже открытую
// следующую, и «повторите ввод» гасло в том же кадре, в котором появлялось.
await p5.evaluate(() => { localStorage.removeItem('rig-nv'); location.reload(); });
await p5.waitForTimeout(1200);
await p5.evaluate(() => document.body.classList.add('view-rig'));
await biosSettle();
await tap('F2');
for (let i = 0; i < 3; i++) await tap('ArrowRight');   // Security
await tap('Enter');
let pw = await p5.evaluate(() => document.getElementById('crt-overlay-title').textContent);
check('Security просит новый пароль', pw === 'Create New Password', pw);
await p5.keyboard.type('hunter2');
await tap('Enter');
pw = await p5.evaluate(() => ({
  hidden: document.getElementById('crt-overlay').hidden,
  title: document.getElementById('crt-overlay-title').textContent,
}));
check('вторая рамка просит повторить и не гаснет',
      !pw.hidden && pw.title === 'Confirm New Password', JSON.stringify(pw));
await p5.keyboard.type('hunter2');
await tap('Enter');
const pwRows = await p5.evaluate(() => [...document.querySelectorAll('#crt-setup-rows .crt-row')]
  .map(r => r.querySelector('.crt-row-label').textContent + ' = '
          + r.querySelector('.crt-row-value').textContent));
check('пароль отмечен установленным',
      pwRows.some(t => /Administrator Password = Installed/.test(t)),
      pwRows.filter(t => /Password/.test(t)).join(' | '));
await tap('F10'); await tap('Enter');
await p5.waitForTimeout(250);
await tap('F2');
await p5.waitForTimeout(200);
pw = await p5.evaluate(() => document.getElementById('crt-overlay-title').textContent);
check('сохранённый пароль спрашивают на входе', pw === 'Enter Administrator Password', pw);
await p5.keyboard.type('hunter2');
await tap('Enter');
check('и он пускает', (await p5.evaluate(() => document.getElementById('crt').dataset.mode)) === 'setup');

await p5.close();

// 32. Лента ревизий. Три поломки одного корня: showRev переписывает разметку
// платы целиком (board.innerHTML = markup), и всё, что было к ней привязано,
// уезжает вместе со старыми узлами.
//
//   · органы управления нарисованы на плате — прямой обработчик умирал, и
//     после первого же движения ползунка «Сервис» и крышка переставали
//     нажиматься; теперь слушаем на самой плате, она подмену переживает;
//   · архивная схема — снимок, а не машина: до шестидесятой ревизии лопасти
//     висели на <path> без своей точки вращения, и сегодняшняя анимация
//     уносила их в левый верхний угол холста;
//   · сама команда стала on|off.
const p6 = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
p6.on('pageerror', e => errors.push(String(e)));
// #tl-range оставляем: без ползунка эту проверку нечем двигать.
await p6.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input:not(#tl-range)').forEach(el => el.remove())));
await p6.goto(url, { waitUntil: 'load' });
await p6.evaluate(() => document.body.classList.add('view-rig'));
await p6.waitForFunction(() => !document.getElementById('rig').classList.contains('assembly'),
                         null, { timeout: 30000 }).catch(() => {});
await p6.waitForFunction(() => !document.getElementById('crt').classList.contains('on'),
                         null, { timeout: 30000 }).catch(() => {});
await p6.waitForTimeout(500);

const tap6 = sel => p6.evaluate(s => document.querySelector(s)
  ?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel);
const rigHas = c => p6.evaluate(k => document.getElementById('rig').classList.contains(k), c);
// Лента теперь не прячется display'ем, а схлопывается переходом: hidden
// остаётся только за «истории нет вовсе». Спрашиваем то же, что и страница.
const strip = () => p6.evaluate(() => {
  const t = document.getElementById('timeline');
  return !t.hidden && !document.getElementById('rig').classList.contains('revs-off');
});
const slide = async i => {
  await p6.evaluate(n => { const r = document.getElementById('tl-range');
    r.value = String(n); r.dispatchEvent(new Event('input', { bubbles: true })); }, i);
  await p6.waitForTimeout(2200);
};

// Ряд кнопок отмерян от кнопки темы, крайней справа. Пока светлая тема
// погашена, её место осталось бы пустым, и ряд висел бы в 54 пикселях от края.
const rowGap = await p6.evaluate(() => {
  const w = window.innerWidth;
  const vis = ['.theme-switch', '.zoom-btn', '.assemble-btn', '.sfx-btn']
    .map(s => document.querySelector(s))
    .filter(el => el && getComputedStyle(el).display !== 'none');
  return { сколько: vis.length, справа: Math.round(w - Math.max(...vis.map(el => el.getBoundingClientRect().right))) };
});
check('ряд кнопок прижат к правому краю', rowGap.справа === 24, JSON.stringify(rowGap));

await tap6('#svc-switch');
await p6.waitForTimeout(1600);
check('лента поднимается вместе с сервисным режимом', await strip(), 'timeline');

await p6.evaluate(() => window.__rig.exec('revisions off'));
await p6.waitForTimeout(400);
check('revisions off убирает ленту', !(await strip()), 'timeline');
await p6.evaluate(() => window.__rig.exec('revisions on'));
await p6.waitForTimeout(900);
check('revisions on поднимает её обратно', await strip(), 'timeline');

// Ревизия 58 (в ленте — 59-я) — последняя, где лопасти были на <path>.
await slide(58);
const arch = await p6.evaluate(() => {
  const el = document.querySelector('#board .fan-blades');
  if (!el) return null;
  const b = el.getBoundingClientRect();
  const board = document.getElementById('board').getBoundingClientRect();
  return { anim: getComputedStyle(el).animationName,
           inside: b.left >= board.left - 2 && b.top >= board.top - 2 && b.right <= board.right + 2 };
});
check('архивная схема не анимируется', arch && arch.anim === 'none', JSON.stringify(arch));
check('лопасти архивной схемы остаются на месте', arch && arch.inside, JSON.stringify(arch));
check('архивная схема помечена снимком', await rigHas('archive'), 'archive');

// И назад на сегодняшнюю: она снова живая машина, и её кнопки работают.
await slide(await p6.evaluate(() => Number(document.getElementById('tl-range').max)));
check('сегодняшняя схема снова машина, а не снимок', !(await rigHas('archive')), 'archive');
const svcWas = await rigHas('service');
await tap6('#svc-switch');
await p6.waitForTimeout(700);
check('после ползунка выключатель сервиса жив', (await rigHas('service')) !== svcWas, 'service');
// Обе кнопки крышки, и по очереди, а не подряд. Подряд их жать нельзя: они
// парные, и вторая возвращает то, что сделала первая, — состояние приходит
// туда же, откуда ушло. Пока «снять крышку» была мертва (её клик не всплывал
// до платы, слушали именно плату), это сходило с рук: работала одна кнопка из
// двух, состояние менялось, проверка зеленела. То есть зеленела она благодаря
// поломке. Теперь живы обе, и спрашиваем каждую отдельно: сначала ту, что
// уместна в текущем положении крышки, потом обратную.
const lidWas = await rigHas('lid-off');
const lidFlip = async want => {
  await tap6(want ? '#lid-remove' : '#lid-on');
  // Крышка снимается в три движения и едет больше секунды — ждём факт, а не
  // часы: на фиксированной паузе проверка ловила бы середину хода.
  return p6.waitForFunction(
    w => document.getElementById('rig').classList.contains('lid-off') === w,
    want, { timeout: 6000 }).then(() => true, () => false);
};
const lidThere = await lidFlip(!lidWas);
const lidBack = await lidFlip(lidWas);
check('после ползунка обе кнопки крышки живы', lidThere && lidBack,
      `туда=${lidThere} обратно=${lidBack}`);
await p6.close();

const failed = results.filter(r => !r[1]);
for (const [name, ok, got] of results) console.log(`  ${ok ? '·' : 'BROKEN'} ${name}${ok ? '' : ` → ${got}`}`);
if (errors.length) console.log(`  ERRORS: ${errors.slice(0, 2).join(' | ')}`);
console.log(failed.length || errors.length
  ? `failed: ${failed.length}, errors: ${errors.length}` : 'behaviour is fine');

await browser.close();
server.close();
process.exit(failed.length || errors.length ? 1 : 0);
