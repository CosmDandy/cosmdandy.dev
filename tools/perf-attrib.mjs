// Кто именно съедает кадры.
//
//   node tools/perf-attrib.mjs                 покой: разбор по анимациям
//   node tools/perf-attrib.mjs --mode service  сервисный режим
//   node tools/perf-attrib.mjs --mode card     карточка: то, что видно с телефона
//   node tools/perf-attrib.mjs --cpu 4         процессор вчетверо слабее
//   node tools/perf-attrib.mjs --repeat 3      медиана трёх прогонов на группу
//   node tools/perf-attrib.mjs --window 4      окно замера, секунды
//   node tools/perf-attrib.mjs --quick         только итог, без разбора
//   node tools/perf-attrib.mjs --json
//
// Рядом уже три мерки, и все три отвечают на вопрос «сколько». perf.mjs —
// сколько процессора ест открытая страница; perf-load.mjs и perf-matrix.mjs —
// сколько стоит её открыть. Ни одна не отвечает на «за что»: цифра 30 кадров в
// секунду одинаково выглядит и когда виноваты крыльчатки, и когда лампы, и
// когда сама машина, на которой это запущено.
//
// Здесь ответ добывается вычитанием. Сцена меряется целиком, потом по очереди
// гасится каждая анимация — и разница между «с ней» и «без неё» и есть её
// цена. Гасится паузой, а не отменой: пауза не трогает ни разметку, ни дерево
// стилей, элемент замирает в той фазе, в которой его застали, и включается
// обратно снятием одного inline-свойства. Тем же приёмом схема останавливает
// сама себя, уходя с экрана, — см. .rig.dormant.
//
// Список анимаций не записан здесь и не может разойтись с правдой: страница
// сама называет их через document.getAnimations(). Появится новая — попадёт в
// разбор в тот же день, без правки этого файла.
//
// ── Что считать поломкой ──────────────────────────────────────────────────
//
// Не кадры в секунду. Это число говорит о машине столько же, сколько о сайте:
// на ноутбуке владельца оно одно, в контейнере другое, в CI третье, и порог,
// поставленный по одному из них, на остальных двух врёт.
//
// Поэтому мерок две, и сравниваются они между собой. Нижняя строка разбора —
// та же сцена с погашенными анимациями: столько кадров браузер выдаёт на этой
// странице, когда не анимирует вообще ничего. Верхняя — она же в работе.
// Отношение и есть ответ: какую долю кадров, доступных этой машине, съела
// анимация. Оно переносится с машины на машину, потому что обе половины
// измерены на одном и том же железе за одну и ту же минуту.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { dropInputs, launch } from './browser.mjs';

const ROOT = resolve(import.meta.dirname, '..');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};
const MODE = flag('--mode', 'idle');
const WINDOW_MS = Number(flag('--window', 4)) * 1000;
const QUICK = args.includes('--quick');
// В разборе прогонов много и без повторов — по одному на каждую анимацию, и
// шум там виден на глаз, по соседним строкам. В быстром режиме строк всего
// две, сравнивать не с чем, а решение по ним принимает CI, поэтому там медиана
// трёх: разброс между прогонами доходит до двух процентных пунктов, и с одним
// замером проверка краснела бы через раз без всякой правки в коде.
const REPEAT = Number(flag('--repeat', QUICK ? 3 : 1));
const CPU = Number(flag('--cpu', 1));
// Доля кадров, которую анимации вправе съесть.
//
// По-хорошему тут стояло бы 0.35 — «шестьдесят кадров превратились в тридцать
// девять»: движение ещё плавное, и остаётся запас на чужой слабый ноутбук.
// Стоит 0.55, и это не оценка «сколько допустимо», а замок на текущем
// положении: сегодня схема отдаёт 48–49%, и порог ниже сделал бы проверку
// красной с первого дня, то есть бесполезной — её выключили бы, а не починили.
//
// 0.55 ловит ровно то, ради чего проверка и заводится: новую анимацию,
// которая уронит и без того половинную плавность. Когда вращение крыльчаток
// подешевеет — а из разбора видно, что вся цена в нём, — порог опускается
// следом одним числом здесь.
const MAX_LOSS = Number(flag('--max-loss', 0.55));
const JSON_OUT = args.includes('--json');

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('нет такого файла'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

// Карточка живёт на узком экране: там схема скрыта совсем (max-width: 820px),
// и мерить её надо в том же окне, в каком её видят.
const CARD = MODE === 'card';
const browser = await launch();
const page = await browser.newPage({
  viewport: CARD ? { width: 390, height: 844 } : { width: 1700, height: 1050 },
  deviceScaleFactor: CARD ? 3 : 2,
  isMobile: CARD,
});
await page.addInitScript(dropInputs);
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(m => document.body.classList.add(m === 'card' ? 'view-card' : 'view-rig'), MODE);
if (MODE === 'service') {
  await page.evaluate(() => document.getElementById('svc-switch')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
// Сборка машины и самотест занимают около десяти секунд и меряются отдельно
// (perf.mjs --assembly). Здесь нужен установившийся режим, поэтому ждём факта
// — закрытия слоя самотеста, — а не секундомера. На карточке ждать нечего:
// схемы там нет, а её собственные появления идут меньше секунды.
if (CARD) {
  await page.waitForTimeout(2000);
} else {
  await page.waitForTimeout(11000);
  await page.waitForFunction(() => !document.getElementById('crt')?.open, null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
// Замедление ставится после сборки: иначе десять секунд ожидания растянутся
// вчетверо, а меряем мы всё равно установившийся режим.
if (CPU > 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.waitForTimeout(500);
}
const metrics = async () => Object.fromEntries(
  (await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

/** Что вообще анимируется на этой странице прямо сейчас. */
const inventory = await page.evaluate(() => {
  const by = new Map();
  for (const a of document.getAnimations()) {
    const name = a.animationName ?? a.transitionProperty ?? '(js)';
    const rec = by.get(name) ?? { name, count: 0, pseudo: 0, sample: '' };
    rec.count++;
    if (a.effect?.pseudoElement) rec.pseudo++;
    if (!rec.sample && a.effect?.target?.getAttribute) {
      const el = a.effect.target;
      rec.sample = el.tagName.toLowerCase() +
        (el.getAttribute('class') ? '.' + el.getAttribute('class').split(/\s+/).join('.') : '');
    }
    by.set(name, rec);
  }
  return [...by.values()].sort((x, y) => y.count - x.count);
});

/** Пауза — элементам, у которых крутится анимация с этим именем. */
const pause = names => page.evaluate(ns => {
  const set = new Set(ns);
  let paused = 0, missed = 0;
  for (const a of document.getAnimations()) {
    const name = a.animationName ?? a.transitionProperty ?? '(js)';
    if (!set.has(name)) continue;
    const el = a.effect?.target;
    // Псевдоэлементу inline-свойства не выдать: его паузу считаем непойманной
    // и говорим об этом вслух, а не тихо возвращаем заниженную цену.
    if (a.effect?.pseudoElement || !el?.style) { missed++; continue; }
    el.style.animationPlayState = 'paused';
    paused++;
  }
  return { paused, missed };
}, names);

const resume = () => page.evaluate(() => {
  for (const el of document.querySelectorAll('[style*="animation-play-state"]')) {
    el.style.animationPlayState = '';
  }
});

async function once() {
  await page.evaluate(() => {
    window.__f = [];
    const tick = t => { window.__f.push(t); window.__raf = requestAnimationFrame(tick); };
    window.__raf = requestAnimationFrame(tick);
  });
  const before = await metrics();
  await page.waitForTimeout(WINDOW_MS);
  const after = await metrics();
  const frames = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__f;
  });

  const d = k => (after[k] ?? 0) - (before[k] ?? 0);
  const secs = WINDOW_MS / 1000;
  const span = (frames.at(-1) - frames[0]) / 1000;
  const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
  const at = q => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] ?? 0;
  const share = v => v / secs * 100;
  const style = share(d('RecalcStyleDuration'));
  const layout = share(d('LayoutDuration'));
  const script = share(d('ScriptDuration'));
  const main = share(d('TaskDuration'));
  return {
    fps: (frames.length - 1) / span,
    frame_p50: at(0.5),
    frame_p95: at(0.95),
    main, style, layout, script,
    // Остаток главного потока — отрисовка, растр и сборка кадра. CDP не
    // разносит их по отдельности, а вместе они и есть цена «перекрасить SVG».
    paint: Math.max(0, main - style - layout - script),
    recalcs: d('RecalcStyleCount'),
  };
}

const median = xs => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
async function measure() {
  const runs = [];
  for (let i = 0; i < REPEAT; i++) runs.push(await once());
  return Object.fromEntries(Object.keys(runs[0]).map(k => [k, median(runs.map(r => r[k]))]));
}

// Полная сцена, потом каждая анимация по очереди, потом все разом.
await page.waitForTimeout(400);
const full = await measure();

const groups = [];
if (!QUICK) {
  for (const item of inventory) {
    const hit = await pause([item.name]);
    await page.waitForTimeout(400);
    const m = await measure();
    await resume();
    await page.waitForTimeout(400);
    groups.push({ ...item, ...hit, metrics: m, gain_fps: m.fps - full.fps });
  }
}

const allHit = await pause(inventory.map(i => i.name));
await page.waitForTimeout(400);
const floor = await measure();
await resume();

await browser.close();
server.close();

// Доля кадров, которую съела анимация. Обе половины сняты на одной машине за
// одну минуту, поэтому число переносится туда, где железо другое.
const loss = floor.fps > 0 ? Math.max(0, 1 - full.fps / floor.fps) : 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ mode: MODE, cpu: CPU, window_ms: WINDOW_MS, repeat: REPEAT,
    loss, max_loss: MAX_LOSS, full, floor, floor_missed: allHit.missed, groups }, null, 2));
  process.exit(loss > MAX_LOSS ? 1 : 0);
}

const n1 = v => v.toFixed(1);
const row = (label, m, extra = '') =>
  `  ${label.padEnd(22)} ${n1(m.fps).padStart(5)}  ${n1(m.frame_p50).padStart(5)}  ${n1(m.frame_p95).padStart(6)}  ` +
  `${n1(m.main).padStart(5)}% ${n1(m.paint).padStart(5)}% ${n1(m.style).padStart(5)}%  ${extra}`;

console.log(`режим: ${MODE}, окно ${WINDOW_MS / 1000} с, прогонов на группу: ${REPEAT}` +
  (CPU > 1 ? `, процессор слабее в ${CPU} раз` : ''));
console.log('');
console.log('  что анимируется          кадр/с   p50    p95   поток  отрис  стиль');
console.log('  ' + '─'.repeat(72));
console.log(row('всё как есть', full));
for (const g of groups.slice().sort((a, b) => b.gain_fps - a.gain_fps)) {
  const note = `${g.count} шт` + (g.missed ? `, не погашено ${g.missed}` : '') +
    (g.gain_fps > 0.5 ? `  +${n1(g.gain_fps)} кадр/с` : '');
  console.log(row('без ' + g.name, g.metrics, note));
}
console.log(row('без анимаций вовсе', floor, 'потолок машины'));
console.log('');
if (inventory.some(i => i.pseudo)) {
  console.log('  на псевдоэлементах анимации паузой не ловятся — их цена осела в «всё как есть»');
}
console.log('  p50/p95 — миллисекунды между соседними кадрами; 16.7 это 60 кадров в секунду');
console.log('  «отрис» — остаток главного потока после стиля, разметки и скрипта: отрисовка и растр');
console.log('');
const verdict = loss > MAX_LOSS ? '✘' : '✔';
console.log(`  ${verdict} анимация съедает ${(loss * 100).toFixed(0)}% кадров, доступных этой машине ` +
  `(порог ${(MAX_LOSS * 100).toFixed(0)}%)`);
if (loss > MAX_LOSS && groups.length) {
  const worst = groups.slice().sort((a, b) => b.gain_fps - a.gain_fps)[0];
  console.log(`    дороже всех «${worst.name}» — ${worst.count} шт, ${n1(worst.gain_fps)} кадр/с`);
}
process.exit(loss > MAX_LOSS ? 1 : 0);
