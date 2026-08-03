// Характер движения узла — числом, а не на глаз.
//
//   node tools/physics.mjs
//
// Печатает по строке на узел: сколько пути он прошёл к каждой доле времени
// своего перехода. По этой строке и читается характер, который описан словами
// в TODO.md:
//
//   щелчок      треть времени на месте, потом почти весь ход разом
//               (вентилятор: 0 1 25 100)
//   тугой ход   равномерное сопротивление, разгон к концу
//               (райзер и блок питания: 2 5 10 15 24 40 90 100)
//   подъём      микродвижение, потом ровный уверенный ход
//               (плашка памяти: 0 0 1 3 23 60 92 100)
//   отброс      заход в минус — защёлку сперва додавливают внутрь
//               (лепесток памяти: -2 -7 28 100)
//   два приёма  полка в начале: узел трогается за ручкой и ждёт
//               (каддик: 6 8 9 32 68 90 100)
//   рычаг       линейно и коротко, без инерции
//               (ручка каддика: 13 38 77 100)
//
// Зачем отдельно от motion.mjs: тот снимает кадры, а съёмка стопорит таймлайн
// и замер плывёт. Здесь кадров нет — только выборка каждый кадр отрисовки.
//
// Чем ловится настоящая поломка: правило с той же специфичностью, стоящее в
// css ниже, отбирает у узла его кривую молча. Так `.unit .pick-body` в конце
// base.css перебивал --caddy и --heave, и каддик вместо шести процентов за
// первую десятую времени проходил пятьдесят девять.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { globSync } from 'node:fs';
const ROOT = '/workspaces/cosmdandy.dev';
const { chromium } = createRequire('/workspaces/.pw/')('playwright');
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  try { const b = await readFile(join(ROOT, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' }); res.end(b);
  } catch { res.writeHead(404).end('no'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => document.body.classList.add('view-rig'));
await page.waitForFunction(() => !document.getElementById('rig').classList.contains('assembly'),
  null, { timeout: 25000 }).catch(() => {});
for (let n = 0; n < 20; n++) {
  await page.evaluate(() => {
    const c = document.getElementById('crt');
    if (c) { c.classList.remove('on'); }
    document.getElementById('rig')?.classList.remove('dormant');
  });
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => !!document.querySelector('#crt.on')))) break;
}
await page.evaluate(() => document.getElementById('svc-switch')
  .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(1600);

const CASES = [
  ['память: плашка', '.dimm[data-dimm="L2"]', '.dimm[data-dimm="L2"] .pick-body', 1, 1300],
  ['память: лепесток', '.dimm[data-dimm="L4"]', '.dimm[data-dimm="L4"] .latch-l', 1, 900],
  ['блок питания', '.psu[data-psu="1"]', '.psu[data-psu="1"] .pick-body', 1, 1500],
  ['лепесток блока', '.psu[data-psu="2"]', '.psu[data-psu="2"] .psu-latch', 1, 500],
  ['райзер', '.riser[data-riser="1"]', '.riser[data-riser="1"] .pick-body', 1, 1500],
  ['вентилятор', '.fan[data-fan="3"]', '.fan[data-fan="3"] .pick-body', 1, 800],
  ['каддик', '.bay[data-unit="hdd1"]', '.bay[data-unit="hdd1"] .pick-body', 2, 1400],
  ['ручка каддика', '.bay[data-unit="hdd3"]', '.bay[data-unit="hdd3"] .bay-handle', 1, 400],
  ['радиатор CPU', '.cpu-slot[data-cpu="1"]', '.cpu-slot[data-cpu="1"] .heatsink', 1, 1000],
];
for (const [name, click, watch, clicks, span] of CASES) {
  const track = await page.evaluate(async ([click, watch, clicks, span]) => {
    const el = document.querySelector(watch);
    const btn = document.querySelector(click);
    const read = () => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return [m.e, m.f, m.a, m.d, m.b];
    };
    for (let i = 0; i < clicks; i++) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (i < clicks - 1) await new Promise(r => setTimeout(r, 700));
    }
    const t0 = performance.now();
    const out = [];
    await new Promise(done => {
      const tick = () => {
        const t = performance.now() - t0;
        out.push([Math.round(t), read()]);
        if (t < span) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    return out;
  }, [click, watch, clicks, span]);
  // Ось, по которой шло движение
  const last = track[track.length - 1][1];
  const first = track[0][1];
  let axis = 0, best = 0;
  for (let k = 0; k < 5; k++) {
    const d = Math.abs(last[k] - first[k]);
    if (d > best) { best = d; axis = k; }
  }
  const v0 = first[axis], v1 = last[axis];
  const at = frac => {
    const t = frac * span;
    let s = track[0];
    for (const p of track) { if (p[0] <= t) s = p; }
    return ((s[1][axis] - v0) / (v1 - v0 || 1) * 100).toFixed(0);
  };
  const AX = ['x', 'y', 'scaleX', 'scaleY', 'skew'][axis];
  console.log(`${name.padEnd(20)} ${AX} ${v0.toFixed(2)}→${v1.toFixed(2)}  ` +
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9].map(f => `${(f * 100) | 0}%:${at(f).padStart(4)}`).join(' '));
}
await browser.close(); server.close(); process.exit(0);
