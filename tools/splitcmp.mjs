// Окупается ли отдельная <svg> на каждый слой.
//
//   node tools/splitcmp.mjs
//
// Замысел: сейчас вся схема — один корень с пятью тысячами узлов, и любая
// перерисовка внутри него заставляет браузер растрировать весь этот корень
// заново. Если разложить слои по отдельным <svg>, область перерисовки должна
// сжаться до того слоя, в котором что-то изменилось.
//
// Прежде чем переделывать генератор, меряем на прототипе: те же самые слои
// растаскиваются по корням прямо в браузере, и сразу после этого снимается
// та же мерка, что и до. Разметка одна и та же, разница только в числе корней.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const WINDOW_MS = 6000;
const { chromium } = createRequire('/workspaces/.pw/')('playwright');
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
  } catch { res.writeHead(404).end('no such file'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Растаскивание слоёв по корням. Первый слой остаётся в #board — так у
// прототипа сохраняются все селекторы, завязанные на #board, и defs, на
// которые ссылаются <use> из остальных слоёв.
const SPLIT = () => {
  const board = document.getElementById('board');
  const vb = board.getAttribute('viewBox');
  const host = board.parentElement;
  const cs = getComputedStyle(board);
  if (cs.position === 'static') host.style.position = 'relative';
  const layers = [...board.children].filter(el => /^lyr-/.test(el.getAttribute('class') || ''));
  const moved = [];
  for (const g of layers.slice(1)) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', vb);
    svg.setAttribute('class', 'board-layer ' + g.getAttribute('class'));
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
    svg.appendChild(g);
    host.appendChild(svg);
    moved.push(g.getAttribute('class'));
  }
  return moved;
};

async function measure(page, label, split) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
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
  const gaps = frames.slice(1).map((t, i) => t - frames[i]);
  const pct = v => (v / (WINDOW_MS / 1000) * 100).toFixed(1) + '%';
  console.log(`  ${label}${split ? ' (слои врозь)' : ' (один корень)'}: ` +
    `основной поток ${pct(d('TaskDuration'))}, стиль ${pct(d('RecalcStyleDuration'))}, ` +
    `раскладка ${pct(d('LayoutDuration'))}, скрипт ${pct(d('ScriptDuration'))}, ` +
    `${((frames.length - 1) / span).toFixed(1)} кадр/с, длинных ${gaps.filter(g => g > 20).length}/${gaps.length}`);
}

async function run(mode, split) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
    () => document.querySelectorAll('input').forEach(el => el.remove())));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.body.classList.add('view-rig'));
  await page.waitForTimeout(11000);
  await page.waitForFunction(() => !document.querySelector('.crt')?.classList.contains('on'),
    null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  if (mode === 'service') {
    await page.evaluate(() => document.getElementById('lid-remove')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById('svc-switch')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(1500);
  }
  if (split) {
    const moved = await page.evaluate(SPLIT);
    await page.waitForTimeout(800);
    if (mode === 'idle') console.log('  вынесено в свои корни:', moved.join(', '));
    // снимок только затем, чтобы убедиться: прототип рисует то же самое
  }
  if (mode === 'spot') {
    // Прожектор — тот самый случай, ради которого слои и делались: наведение
    // вешает filter: brightness() на целый слой. Гоняем его туда-обратно всё
    // окно замера, иначе одна перекраска в 0,28 с растворится в шести
    // секундах покоя.
    await page.evaluate(() => {
      const rig = document.getElementById('rig');
      const unit = document.querySelector('[data-group="dimm"], .unit');
      setInterval(() => {
        rig.classList.toggle('spot');
        if (unit) unit.classList.toggle('lit');
      }, 400);
    });
    await page.waitForTimeout(500);
  }
  await measure(page, mode === 'service' ? 'сервис' : mode === 'spot' ? 'прожектор' : 'покой', split);
  await page.close();
}

for (const mode of ['idle', 'service', 'spot']) {
  for (const split of [false, true]) await run(mode, split);
}

await browser.close();
server.close();
