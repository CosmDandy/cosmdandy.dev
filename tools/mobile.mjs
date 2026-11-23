// Карточка: то, что видит гость с телефона.
//
//   node tools/mobile.mjs            все размеры
//   node tools/mobile.mjs --width 390
//
// На узком экране схемы нет вовсе — страница показывает карточку со ссылками,
// и переключает вид одна медиа-граница. Все остальные проверки в tools/ смотрят
// на схему, то есть ровно на то, чего мобильный гость не увидит никогда.
//
// Что здесь ловится:
//   граница      вид переключается там, где обещано, и ни пикселем раньше
//   ссылки       все на месте, ведут наружу и не перекрыты ничем
//   прокрутка    ничего не торчит вбок — самая частая мобильная поломка
//   касание      цель не меньше сорока четырёх точек, иначе в неё не попасть
//   тишина       ни одной ошибки в консоли
//
// Перекрытие проверяется попаданием, а не разметкой: берётся центр ссылки и
// спрашивается, кто в этой точке окажется под пальцем. Прозрачный слой поверх
// кнопки в разметке не виден никак, а нажатие съедает целиком.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { dropInputs, launch } from './browser.mjs';
import { readFileSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');


// Граница берётся из самой страницы: разъехавшись, число молча проверяло бы
// не тот вид.
const RIG_FROM = Number(
  readFileSync(join(ROOT, 'index.html'), 'utf8')
    .match(/matchMedia\('\(min-width:\s*(\d+)px\)'\)/)?.[1] ?? 821);

// Ширины, с которых заходят. Две последние стоят по обе стороны границы: если
// вид переключится не там, где обещано, разойдётся ровно эта пара.
const WIDTHS = [320, 360, 390, 414, 768, RIG_FROM - 1, RIG_FROM];
const TAP = 44;   // наименьшая цель, в которую попадают пальцем

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

const args = process.argv.slice(2);
const only = args.includes('--width') ? Number(args[args.indexOf('--width') + 1]) : null;

const browser = await launch();
const failures = [];

for (const width of WIDTHS) {
  if (only && only !== width) continue;
  const rig = width >= RIG_FROM;
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: !rig,
    hasTouch: !rig,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Тот же chromium роняет рендерер на <input>, что и в соседних проверках.
  await page.addInitScript(dropInputs);

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1200);

  const seen = await page.evaluate((min) => {
    const body = document.body.className;
    const board = document.getElementById('board');
    const links = [...document.querySelectorAll('main a[href]')]
      .filter(a => a.getBoundingClientRect().width > 0);
    return {
      view: body.includes('view-rig') ? 'rig' : body.includes('view-card') ? 'card' : '?',
      // Схема на узком экране не должна занимать раскладку: она не показана, и
      // платить за её геометрию гостю не за что.
      boardHeight: board ? board.getBoundingClientRect().height : 0,
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      links: links.map(a => {
        const r = a.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        return {
          text: (a.textContent ?? '').trim().slice(0, 20),
          href: a.getAttribute('href'),
          w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right),
          // Кто окажется под пальцем: сама ссылка, её потомок — или чужой слой.
          covered: !(hit === a || a.contains(hit)),
          coveredBy: hit === a || a.contains(hit) ? null
            : (hit?.tagName ?? '?') + '.' + (hit?.className?.baseVal ?? hit?.className ?? ''),
        };
      }),
      min,
    };
  }, TAP);

  const bad = [];
  const want = rig ? 'rig' : 'card';
  if (seen.view !== want) bad.push(`вид ${seen.view}, а ожидался ${want}`);
  if (!rig && seen.boardHeight > 0) bad.push(`схема занимает ${Math.round(seen.boardHeight)} px раскладки`);
  if (seen.scrollX > 0) bad.push(`страница шире экрана на ${seen.scrollX} px`);
  if (!rig && seen.links.length === 0) bad.push('на карточке нет ни одной ссылки');
  for (const l of seen.links) {
    if (l.covered) bad.push(`ссылку «${l.text}» перекрывает ${l.coveredBy}`);
    if (l.right > width + 1) bad.push(`ссылка «${l.text}» уходит за край на ${l.right - width} px`);
    if (l.h < TAP) bad.push(`в ссылку «${l.text}» не попасть пальцем: ${l.w}×${l.h}`);
    if (!l.href || l.href === '#') bad.push(`ссылка «${l.text}» никуда не ведёт`);
  }
  for (const e of errors) bad.push(`ошибка в консоли: ${e.slice(0, 80)}`);

  const mark = bad.length ? 'ПЛОХО' : '·';
  console.log(`  ${mark} ${String(width).padStart(4)}px  вид ${seen.view}, ` +
    `ссылок ${seen.links.length}${rig ? '' : `, схема ${Math.round(seen.boardHeight)} px`}`);
  for (const line of bad) {
    console.log(`        ${line}`);
    failures.push(`${width}px: ${line}`);
  }

  await context.close();
}

await browser.close();
server.close();

console.log(failures.length
  ? `\n${failures.length} замечаний`
  : `\nкарточка в порядке на всех ширинах, граница вида на ${RIG_FROM}px`);
process.exit(failures.length ? 1 : 0);
