// Доступность: можно ли пользоваться страницей не мышью и не глазами.
//
//   node tools/a11y.mjs              карточка и схема
//   node tools/a11y.mjs --card       только карточка
//   node tools/a11y.mjs --rig        только схема
//   node tools/a11y.mjs --json
//
// Проверок два рода, и они отвечают на разные вопросы.
//
// Первый — axe: свод правил W3C, прогоняемый по готовому дереву. Он ловит то,
// что видно из разметки: контраст ниже нормы, ссылку без текста, кнопку без
// имени, поле без подписи, заголовки через уровень, отсутствие языка
// документа. Это дёшево и покрывает больше половины типовых бед.
//
// Второй — то, чего axe не видит в принципе: пройти страницу табом. Правило
// «фокус должен быть виден» проверяется не разметкой, а тем, изменился ли
// пиксель вокруг элемента, когда на него встал фокус. И порядок обхода —
// он должен идти сверху вниз, а не прыгать, потому что кто-то расставил
// элементы флексом в обратном порядке.
//
// Схема проверяется отдельно от карточки и с поблажкой: это иллюстрация из
// пяти тысяч фигур, и требовать от каждой дорожки текстовой альтернативы
// бессмысленно. Спрашивается с неё другое — что она объявлена картинкой и
// не перехватывает фокус на каждый свой прямоугольник.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { dropInputs, launch } from './browser.mjs';

const ROOT = resolve(import.meta.dirname, '..');

// axe лежит там же, где playwright: рядом с контейнером, в tools/ci или в репозитории.
let axePath = null;
for (const dir of ['/workspaces/.pw/', ROOT + '/tools/ci/', ROOT + '/']) {
  try { axePath = createRequire(dir).resolve('axe-core/axe.min.js'); break; } catch { /* дальше */ }
}
if (!axePath) { console.error('нет axe-core: npm i axe-core'); process.exit(1); }
const AXE = await readFile(axePath, 'utf8');

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

// Карточка живёт до 821 px, схема с 821. Проверяются оба вида: у них разная
// разметка, и общего у них только шапка.
const VIEWS = {
  card: { width: 390, height: 900, title: 'карточка' },
  rig: { width: 1600, height: 1000, title: 'схема' },
};

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const only = args.includes('--card') ? 'card' : args.includes('--rig') ? 'rig' : null;

const browser = await launch();
const report = {};
const failures = [];

for (const [name, view] of Object.entries(VIEWS)) {
  if (only && only !== name) continue;
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    isMobile: name === 'card',
    hasTouch: name === 'card',
    // Движение мешает и axe (он меряет контраст на кадре), и проверке фокуса.
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(dropInputs);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  await page.addScriptTag({ content: AXE });
  const axeRun = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, {
      // Уровни A и AA — то, что требует закон и здравый смысл. AAA включает,
      // например, контраст 7:1, недостижимый ни для одной тёмной темы с
      // приглушённым текстом, и требовать его от визитки незачем.
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    return res.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
      count: v.nodes.length,
    }));
  });

  // Обход табом — настоящий, нажатиями. Первая версия этого цикла делала
  // return на первой же итерации и возвращала снимок querySelectorAll: то
  // есть проверяла порядок разметки, а не порядок обхода. Сегодня они
  // совпадают, но элемент, до которого табом не добраться — внутри inert,
  // под aria-hidden, за ловушкой фокуса, — так и остался бы незамеченным.
  const tabbing = [];
  await page.evaluate(() => document.body.setAttribute('tabindex', '-1'));
  await page.evaluate(() => document.body.focus());
  const seenKeys = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
        top: Math.round(r.top),
        left: Math.round(r.left),
        key: el.id || (el.tagName + ':' + Math.round(r.top) + ',' + Math.round(r.left)),
      };
    });
    if (!at) continue;
    // Круг замкнулся — фокус пошёл по второму заходу.
    if (seenKeys.has(at.key)) break;
    seenKeys.add(at.key);
    tabbing.push(at);
  }
  await page.evaluate(() => document.body.removeAttribute('tabindex'));

  // Виден ли фокус: ставим его на первую ссылку и смотрим, изменилась ли
  // картинка вокруг неё. Правило проверяется пикселями, потому что
  // outline: none в чужом правиле разметка не показывает никак.
  let focusVisible = null;
  {
    // Снимается область ВОКРУГ элемента, а не сам элемент. Обводка фокуса
    // рисуется снаружи границы — outline-offset здесь ещё и положительный, —
    // и снимок самого элемента обрезал бы ровно то, что проверяется. Первая
    // версия этого не учитывала и молча возвращала «не знаю».
    // Снимаем фокус: до этого по странице прошёл обход табом, и он оставил
    // фокус на последнем элементе. Если им окажется тот, что мы снимаем,
    // «до» и «после» будут одинаковыми — и проверка объявит невидимым тот
    // фокус, который на самом деле виден.
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(100);

    const box = await page.evaluate(() => {
      const el = [...document.querySelectorAll('a[href], button')].find(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.top < innerHeight - r.height;
      });
      if (!el) return null;
      el.dataset.a11yProbe = '1';
      const r = el.getBoundingClientRect();
      const pad = 8;
      return { x: Math.max(0, r.left - pad), y: Math.max(0, r.top - pad),
               width: r.width + pad * 2, height: r.height + pad * 2 };
    });
    if (box) {
      const before = await page.screenshot({ clip: box });
      await page.evaluate(() => document.querySelector('[data-a11y-probe]')?.focus());
      await page.waitForTimeout(200);
      const after = await page.screenshot({ clip: box });
      focusVisible = !before.equals(after);
    }
  }

  const bad = axeRun.filter(v => v.impact === 'critical' || v.impact === 'serious');
  const soft = axeRun.filter(v => v.impact !== 'critical' && v.impact !== 'serious');

  report[name] = { violations: axeRun, focusable: tabbing.length, focusVisible };

  if (!asJson) {
    console.log(`\n${view.title} · ${view.width}×${view.height}`);
    console.log(`  фокусируемых элементов: ${tabbing.length}`);
    for (const v of bad) {
      console.log(`  ПЛОХО ${v.id} (${v.impact}): ${v.help} — ${v.count} шт, ${v.nodes[0]}`);
      failures.push(`${name}: ${v.id} — ${v.help}`);
    }
    for (const v of soft) {
      console.log(`  СТОИТ ПОЧИНИТЬ ${v.id} (${v.impact}): ${v.help} — ${v.count} шт`);
    }
    if (!axeRun.length) console.log('  · axe не нашёл нарушений A и AA');

    if (focusVisible === false) {
      console.log('  ПЛОХО фокус не виден: с клавиатуры не понять, где находишься');
      failures.push(`${name}: фокус не виден`);
    } else if (focusVisible === true) {
      console.log('  · фокус виден');
    }

    // Порядок обхода: сверху вниз. Прыжок назад больше чем на треть экрана —
    // это обычно флекс, переставивший элементы местами.
    const jumps = tabbing.filter((el, i) =>
      i > 0 && el.top < tabbing[i - 1].top - view.height / 3);
    if (jumps.length) {
      console.log(`  СТОИТ ПОЧИНИТЬ порядок обхода прыгает вверх ${jumps.length} раз`);
    } else if (tabbing.length) {
      console.log('  · порядок обхода идёт сверху вниз');
    }
  }
  await context.close();
}

await browser.close();
server.close();

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(failures.length ? `\n${failures.length} нарушений` : '\nдоступность в порядке');
process.exit(failures.length ? 1 : 0);
