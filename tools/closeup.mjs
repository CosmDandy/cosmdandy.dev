// Крупный план участка платы: снимок узла в векторном увеличении.
//
//   node tools/closeup.mjs out.png "x y w h"          участок в координатах платы
//   node tools/closeup.mjs out.png "540 180 400 460"  зона процессоров
//   node tools/closeup.mjs out.png "1180 340 180 160" вывод контура на стенке
//   node tools/closeup.mjs out.png "..." --pull       со снятым узлом
//
// Зачем отдельно от preview. Тот снимает машину целиком: 1700×1050 на всю
// плату, и узел размером с водоблок занимает в кадре двести точек. Сравнивать
// такой кадр с фотографией живой машины бессмысленно — деталь мельче трёх
// точек не видно вовсе, и правки в ней делаются вслепую. Здесь схеме
// подменяется viewBox, браузер перерисовывает вектор, и тот же водоблок
// приходит в тысячу с лишним точек по ширине: видно фаску, муфту и угол, под
// которым шланг сходит со штуцера.
//
// Гасится и перспектива: машина на странице стоит с наклоном, и мерить по
// такому кадру нельзя — на дальнем краю масштаб другой. Для сравнения с
// фотографией нужен плоский вид.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { globSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = process.argv[2] ?? join(ROOT, 'tools/closeup.png');
const VIEW = process.argv.find(a => /^[\d.\s-]+$/.test(a) && a.trim().split(/\s+/).length === 4)
  ?? '540 180 400 460';
const PULL = process.argv.includes('--pull');

const [, , vw, vh] = VIEW.trim().split(/\s+/).map(Number);
// Ширину кадра держим около полутора тысяч точек: больше этого браузер отдаёт
// пустой кадр на схеме такого размера, меньше — теряется смысл затеи.
//
// Нижняя граница жёсткая и не косметическая: до 821 точки страница показывает
// карточку, а схемы на ней нет вовсе. Узкий вырез с маленьким множителем давал
// ровно такое окно, и кадр приходил пустым — по нему я и правил вслепую.
const MIN_W = 900;
const SCALE = Math.max(Math.min(3, Math.round(1500 / vw * 10) / 10), MIN_W / vw);

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
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: Math.round(vw * SCALE), height: Math.round(vh * SCALE) },
});
// Этот сборкой chromium убивает рендерер на любом <input>: убираем поле
// консоли до первой отрисовки, как это делает preview.
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () =>
    document.querySelectorAll('input').forEach(el => el.remove()));
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(
  () => !document.getElementById('rig')?.classList.contains('assembly'),
  null, { timeout: 20000 }).catch(() => {});
await page.evaluate(() => document.body.classList.add('view-rig'));
await page.waitForTimeout(500);
// Крышку снимаем её же кнопкой: под крышкой смотреть нечего.
await page.evaluate(() => {
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  document.getElementById('lid-remove')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(1500);
if (PULL) {
  await page.evaluate(() => document.querySelector('.cpu-slot')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(1400);
}

const applied = await page.evaluate(({ vb, w, h }) => {
  // `.chassis` — это div-обёртка, а viewBox живёт на самом svg внутри неё.
  // Час отладки ушёл на то, что атрибут ставился диву и молча ничего не делал.
  const svg = document.querySelector('.chassis svg') || document.querySelector('svg.chassis');
  if (!svg) { return null; }
  svg.setAttribute('viewBox', vb);
  // Наклон гасим у всех предков, а не только у самой схемы. Он же был причиной
  // съехавшего кадра: `position: fixed` внутри предка с transform отсчитывается
  // от этого предка, а не от окна, и вырез уезжал вниз вместе с машиной.
  for (let el = svg; el && el !== document.documentElement; el = el.parentElement) {
    Object.assign(el.style, { transform: 'none', perspective: 'none' });
  }
  Object.assign(svg.parentElement.style, {
    position: 'fixed', left: '0', top: '0', margin: '0', zIndex: '99999',
    width: `${w}px`, height: `${h}px`, maxWidth: 'none', maxHeight: 'none',
  });
  Object.assign(svg.style, { width: '100%', height: '100%', background: '#0b1114' });
  return svg.getAttribute('viewBox');
}, { vb: VIEW.trim(), w: Math.round(vw * SCALE), h: Math.round(vh * SCALE) });
if (!applied) { console.error('нет схемы на странице'); process.exit(1); }
await page.waitForTimeout(400);

// Снимок окна: схема разложена по нему один в один, а playwright отказывается
// снимать сам узел — на схеме такого размера он не признаёт его видимым.
await page.screenshot({ path: OUT });
console.log(`  view: ${applied}\n  scale: ×${SCALE}\n  frame: ${OUT}`);
await browser.close();
server.close();
