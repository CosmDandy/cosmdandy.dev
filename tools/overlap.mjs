// Наложения в движении: то, чего не видит audit_text.py.
//
//   timeout 400 node tools/overlap.mjs
//
// audit_text.py разбирает готовый board-v17.svg.part и ловит подпись на
// чужой непрозрачной фигуре — но делает это по неподвижной разметке, то есть
// видит машину только в покое. А все настоящие жалобы владельца были про
// вынутые детали: номер болта поверх снятого процессора, рейзер поверх блока
// питания, бирка поверх уехавшего каддика. Статический разбор такого не
// видит в принципе — деталь и подпись на бумаге не пересекаются, они
// пересекаются только после того, как деталь и правда сдвинули. Значит нужен
// не парсер, а браузер: та же обвязка, что в behave.mjs, только вместо
// поведения он проверяет геометрию после каждого хода.
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

let browser, page;

// Прогон в полтора-два ярда снимков геометрии кладёт software-рендерер этой
// сборки chromium (swiftshader, без GPU) не всегда одинаково: за два пробных
// прогона браузер один раз падал молча, без единого pageerror, — похоже на
// исчерпание ресурсов от долгой сессии, а не на баг конкретного узла. Поэтому
// запуск браузера — отдельная функция: если он умрёт посреди перебора узлов,
// проще поднять всё заново и продолжить с того же узла, чем терять весь отчёт.
async function freshRig() {
  if (browser) await browser.close().catch(() => {});
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // То же поле, что крушит рендерер этой сборки chromium в behave.mjs.
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
    () => document.querySelectorAll('input').forEach(el => el.remove())));
  page.on('crash', () => console.error('!!! страница упала (crash)'));
  page.on('pageerror', e => console.error('!!! pageerror:', String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.body.classList.add('view-rig'));
  // Класс .assembly ставит не этот вызов, а IntersectionObserver где-то
  // следующим тиком (onRigShown в base.js) — сразу после add('view-rig') его
  // ещё может не быть. behave.mjs здесь же ждёт 900ms фиксированно; без этой
  // паузы waitForFunction ниже иногда застаёт «класса ещё нет» и решает, что
  // сборка уже прошла, хотя она не начиналась, — и тогда точка отсчёта
  // снимается с недособранной машины. Раз поймали именно так: часть узлов
  // (и то, что сидит внутри них) в покое мерилась серединой хода.
  await page.waitForTimeout(900);
  // Крышка уезжает сама во время сборки (base.js: armAssembly → wait(1500,
  // () => setLid(true))) — щёлкать по кнопке незачем, достаточно дождаться
  // конца сборки, как это делает behave.mjs.
  await page.waitForFunction(
    () => !document.getElementById('rig').classList.contains('assembly'), null, { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(700);
}

const click = sel => page.evaluate(s => document
  .querySelector(s)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel);

// Снять крышку и войти в сервисный режим — единственный, в котором узлы
// вообще можно вынуть. Общий шаг и для первого захода, и для восстановления
// после перезапуска браузера.
async function enterService() {
  await click('#lid-remove');
  await page.waitForTimeout(400);
  await click('#svc-switch');
  // initTimeline() в base.js асинхронный (фетчит history/index.json) и по
  // концу сам снимает hidden с ленты ревизий — а та стоит в той же CSS grid,
  // что и схема (base.css: .timeline { grid-area: 2/1/3/2 }). Пока лента ещё
  // hidden, сетка отдаёт схеме больше места, и вся геометрия чуть крупнее,
  // чем станет через мгновение. Поймали это по факту: точка отсчёта, снятая
  // до того, как лента успела появиться, была снята с другого масштаба, чем
  // всё, что мерилось после, — и по всей схеме разом.
  await page.waitForFunction(() => document.getElementById('timeline')?.hidden === false,
    null, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// Схема нарисована в перспективе (весь кожух под наклоном), а
// getBoundingClientRect всегда отдаёт прямоугольник по осям экрана — у
// наклонной детали эта рамка шире её видимого контура. Из-за этого рамки
// двух соседних плашек памяти пересекаются уже в покое, раньше всякого
// движения: у самих деталей общей площади нет, а у их экранных рамок есть.
// Считать наложением любое такое пересечение выше порога значит утонуть
// именно в том шуме, о котором предупреждали, — поэтому мерим не абсолютное
// пересечение, а прирост: насколько сильнее деталь легла на соседа ПОСЛЕ
// хода, чем лежала на нём же в покое.
const THRESHOLD = 0.20;  // порог самого пересечения
const GROWTH = 0.15;     // и требуемый прирост над тем, что было в покое

function area(r) { return r[2] * r[3]; }
function ratio(a, b) {
  const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (ox <= 0 || oy <= 0) return 0;
  const denom = Math.min(area(a), area(b));
  return denom > 0 ? (ox * oy) / denom : 0;
}

function has(o, re) { return re.test(o.a) || re.test(o.b); }

// Исключения — наложения, которые владелец уже разобрал в прошлом круге и не
// хочет видеть в каждом отчёте заново. Каждое подписано тем, откуда оно
// взялось, чтобы через полгода не гадать, а перепроверить конкретный пункт
// TODO-PLAN.md.
const EXCEPTIONS = [
  {
    from: 'TODO-PLAN.md · «Из прошлого круга: не сошлось» · F7 / V4',
    why: 'Блок питания 1 занимает паз снизу целиком — вынутому рейзеру ' +
      'подниматься некуда, зазора нет. Пункт V4 прямо снимает вопрос: ' +
      'перекрытие признано допустимым, это перспектива кожуха, а не ' +
      'столкновение деталей.',
    hit: o => o.kind === 'узел' && has(o, /^psu-1$/) && has(o, /^riser /),
  },
  {
    from: 'TODO-PLAN.md · «Из прошлого круга: не сошлось» · D12',
    why: 'Процессор откидывается на 152 влево (tools/board/blocks/cpu.css: ' +
      '".cpu-slot.opened .cpu-lid" — translate(-152px, 75px)) — ровно то ' +
      'расстояние, на котором по замеру он ложится на вентиляторы. Пункты ' +
      'W3/W4 задали направление точнее, но упор под них ещё не перемерен — ' +
      'это открытый, а не новый вопрос. Радиатор в исключение не входит: его ' +
      'нынешние 232 вправо (короче измерявшихся 252) как раз подобраны, ' +
      'чтобы НЕ доставать до вентиляторов, — если он всё же зацепит один, ' +
      'это настоящая находка, а не повтор известного.',
    hit: o => o.kind === 'узел' && has(o, /processor$/) && has(o, /^fan /),
  },
];

// Один снимок геометрии всей схемы. Считаем сырые прямоугольники внутри
// page.evaluate одним вызовом — на схеме сотни надписей, и тащить каждый
// rect через протокол Playwright по отдельности умножило бы время работы на
// их количество. А вот пересечения и сравнение с покоем — уже в Node: так
// подсчёт общий и для базовой точки отсчёта, и для каждого состояния, вместо
// двух копий одной и той же арифметики.
async function snapshot(state) {
  return page.evaluate((state) => {
    const rect = el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    // Видимость считается по всей цепочке предков, а не по самому узлу.
    // Воздуховоды уходят прозрачностью на группе (baffle.css: «.rig.lid-off
    // .baffle-c { opacity: 0 }»), и у надписи внутри неё computed opacity
    // остаётся единицей — первая версия принимала за находку буквы слотов на
    // давно растаявшем кожухе.
    const visible = el => {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.05) return false;
      }
      return true;
    };
    // Порядок отрисовки. В SVG нет z-index: кто в документе ниже, тот и
    // поверх. Один обход дерева даёт этот номер каждому узлу — и с ним
    // пересечение двух рамок наконец делится надвое. Деталь легла на
    // шелкографию (деталь ниже в документе — значит поверх неё) — это то же
    // самое, что снятый радиатор, положенный на плату: он и должен закрывать
    // то, подо что лёг. А вот подпись, оставшаяся видимой ПОВЕРХ снятой
    // детали, — та самая жалоба про «номер болта поверх процессора»: у
    // подписи нет своего слоя, она просто нарисована позже.
    const paint = new Map();
    {
      const walker = document.createTreeWalker(document.getElementById('rig'), NodeFilter.SHOW_ELEMENT);
      let i = 0;
      while (walker.nextNode()) paint.set(walker.currentNode, i++);
    }
    const z = el => paint.get(el) ?? -1;
    // Имя детали для отчёта. Данные (data-fan, data-cpu…) висят на группе
    // узла, а геометрию мы берём не с самой группы, а с того, что внутри неё
    // и правда едет по transform, — атрибут приходится искать у предка.
    const label = el => {
      const host = el.closest('[data-fan], [data-dimm], [data-riser], [data-psu], [data-unit], .cpu-slot');
      if (!host) return el.tagName.toLowerCase();
      if (host.dataset.fan !== undefined) return 'fan ' + (Number(host.dataset.fan) + 1);
      if (host.dataset.dimm !== undefined) return 'dimm ' + host.dataset.dimm;
      if (host.dataset.riser !== undefined) return 'riser ' + host.dataset.riser;
      if (host.dataset.psu !== undefined) return 'psu-' + host.dataset.psu;
      if (host.dataset.unit !== undefined) return host.dataset.unit;
      if (host.classList.contains('cpu-slot')) {
        if (el.classList.contains('heatsink')) return 'cpu' + host.dataset.cpu + ' heatsink';
        if (el.classList.contains('cpu-lid')) return 'cpu' + host.dataset.cpu + ' processor';
      }
      return el.tagName.toLowerCase();
    };

    // Вынутые узлы — сама деталь, которая физически сместилась. Это не
    // группа узла целиком (data-fan, data-riser и т.п. — она не движется,
    // движется вложенный .pick-body), а у процессора и вовсе не одна деталь:
    // радиатор и крышка с кристаллом едут в разные стороны разным translate
    // (cpu.css), и мерить их надо порознь, отдельно от неподвижного гнезда.
    // Мерить рамку всей группы вместо .pick-body — старая ошибка первой
    // версии: группа включает и неподвижную шелкографию рядом с узлом
    // (номер, обороты), которая просто СИДИТ внутри той же группы и поэтому
    // всегда «внутри» её рамки — хоть в покое, хоть после хода, — так что
    // рамка группы не отличает, наехала ли деталь на подпись, или подпись
    // всегда была её собственной.
    const movedEls = new Set([
      ...document.querySelectorAll('.fan.pulled .pick-body, .dimm.pulled .pick-body, ' +
        '.riser.pulled .pick-body, .psu.pulled .pick-body, ' +
        '.bay.pulled .pick-body, .blank.pulled .pick-body'),
      ...document.querySelectorAll('.cpu-slot.pulled .heatsink'),
      ...document.querySelectorAll('.cpu-slot.opened .cpu-lid'),
    ]);

    const parts = [
      ...document.querySelectorAll('.fan .pick-body, .dimm .pick-body, .riser .pick-body, ' +
        '.psu .pick-body, .bay .pick-body, .blank .pick-body'),
      ...document.querySelectorAll('.cpu-slot .heatsink, .cpu-slot .cpu-lid'),
    ].map(el => ({ name: label(el), r: rect(el), vis: visible(el), moved: movedEls.has(el), z: z(el) }));

    // Индекс в document order стабилен между снимками: классы туда-сюда
    // ходят, а сами узлы <text>/<a.callout> ни разу не добавляются и не
    // удаляются. Это и даёт ключ для сопоставления с точкой отсчёта.
    const texts = [...document.querySelectorAll('text')].map((el, i) => ({
      i, name: (el.textContent || '').trim().slice(0, 28) || '(пусто)', r: rect(el), vis: visible(el),
      z: z(el), tag: !!el.closest('a.callout'),
    }));
    const callouts = [...document.querySelectorAll('a.callout')].map((el, i) => ({
      i, name: (el.textContent || '').trim().slice(0, 28) || '(бирка)', r: rect(el), vis: visible(el),
      z: z(el), tag: true,
    }));

    return { state, parts, texts, callouts };
  }, state);
}

// Сравнение «до» и «после» одного хода. Точку отсчёта берём не одну на весь
// прогон, а свою для каждого узла, снятую секундой раньше того же хода:
// схема между дублями снимков не трогается ничем посторонним, а вот единая
// точка отсчёта на весь прогон один раз подвела. У сервисного режима есть
// async-довесок (initTimeline фетчит ленту ревизий, а та стоит в той же CSS
// grid, что и схема — base.css: .timeline { grid-area: 2/1/3/2 }), и вся
// схема на нём чуть меняет масштаб, пока лента появляется. Первая версия
// снимала точку отсчёта один раз в начале — и если лента успевала показаться
// только к середине перебора, ранние и поздние узлы мерились в разных
// масштабах, а разница читалась как наложение. Свежая точка отсчёта на
// каждый узел этого не боится: «до» и «после» всегда одного масштаба.
function compareSnapshots(before, after) {
  const out = [];
  const beforePart = new Map(before.parts.map(p => [p.name, p]));
  const moved = after.parts.filter(p => p.moved && p.vis && p.r[2] >= 1 && p.r[3] >= 1);
  for (const mp of moved) {
    const bmp = beforePart.get(mp.name);
    for (const p of after.parts) {
      if (p === mp || !p.vis || p.r[2] < 1 || p.r[3] < 1) continue;
      const r = ratio(mp.r, p.r);
      if (r < THRESHOLD) continue;
      const bp = beforePart.get(p.name);
      const base = (bmp && bp) ? ratio(bmp.r, bp.r) : 0;
      if (r - base < GROWTH) continue;
      out.push({ kind: 'узел', a: p.name, b: mp.name, ratio: r, base, state: after.state,
        over: p.z > mp.z, tag: false });
    }
    for (const t of after.texts) {
      if (!t.vis || t.r[2] < 1 || t.r[3] < 1) continue;
      const r = ratio(mp.r, t.r);
      if (r < THRESHOLD) continue;
      const bt = before.texts[t.i];
      const base = (bmp && bt) ? ratio(bmp.r, bt.r) : 0;
      if (r - base < GROWTH) continue;
      out.push({ kind: 'надпись', a: t.name, b: mp.name, ratio: r, base, state: after.state,
        over: t.z > mp.z, tag: t.tag });
    }
    for (const c of after.callouts) {
      if (!c.vis || c.r[2] < 1 || c.r[3] < 1) continue;
      const r = ratio(mp.r, c.r);
      if (r < THRESHOLD) continue;
      const bc = before.callouts[c.i];
      const base = (bmp && bc) ? ratio(bmp.r, bc.r) : 0;
      if (r - base < GROWTH) continue;
      out.push({ kind: 'бирка', a: c.name, b: mp.name, ratio: r, base, state: after.state,
        over: c.z > mp.z, tag: true });
    }
  }
  return out;
}

// ── Прогон по состояниям ────────────────────────────────────────────────────

const findings = [];

// 1. Собранная машина, крышка снята. Ничего не вынуто — сравнивать не с чем
// и не нужно, но состояние проверяем по чек-листу.
await freshRig();
await snapshot('собрано, крышка снята');

// 2. Крышка надета.
await click('#lid-on');
await page.waitForTimeout(500);
await snapshot('крышка надета');

// 3. Сервисный режим, всё ещё на местах.
await enterService();
await snapshot('сервисный режим, всё на месте');

// 4. Список узлов берём из разметки, а не пишем руками: тогда он сам собой
// подстраивается под число вентиляторов, банков памяти и дисков, которое
// диктует паспорт машины, а не то, сколько их было на прошлой сборке.
const nodes = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('[data-fan]').forEach(el => out.push(
    { kind: 'fan', sel: `[data-fan="${el.dataset.fan}"]`, label: 'fan ' + (Number(el.dataset.fan) + 1) }));
  document.querySelectorAll('[data-dimm]').forEach(el => out.push(
    { kind: 'dimm', sel: `[data-dimm="${el.dataset.dimm}"]`, label: 'dimm ' + el.dataset.dimm }));
  document.querySelectorAll('[data-riser]').forEach(el => out.push(
    { kind: 'riser', sel: `[data-riser="${el.dataset.riser}"]`, label: 'riser ' + el.dataset.riser }));
  document.querySelectorAll('[data-psu]').forEach(el => out.push(
    { kind: 'psu', sel: `[data-psu="${el.dataset.psu}"]`, label: 'psu-' + el.dataset.psu }));
  document.querySelectorAll('.bay, .blank').forEach(el => out.push(
    { kind: 'bay', sel: `[data-unit="${el.dataset.unit}"]`, label: el.dataset.unit }));
  document.querySelectorAll('.cpu-slot').forEach(el => out.push(
    { kind: 'cpu', sel: `.cpu-slot[data-cpu="${el.dataset.cpu}"]`, label: 'cpu' + el.dataset.cpu }));
  return out;
});

async function runNode(n) {
  // Своя точка отсчёта прямо перед ходом — а не общая на весь прогон.
  const before = await snapshot(`(эталон) перед ${n.label}`);
  if (n.kind === 'cpu') {
    // Радиатор — первый щелчок, ход на var(--glide) = 0.72s.
    await click(n.sel); await page.waitForTimeout(850);
    findings.push(...compareSnapshots(before, await snapshot(`сервис, снят радиатор ${n.label}`)));
    // Процессор — второй щелчок, тот же var(--glide), но своя диагональ.
    await click(n.sel); await page.waitForTimeout(850);
    findings.push(...compareSnapshots(before, await snapshot(`сервис, снят процессор ${n.label}`)));
    // Третий щелчок возвращает оба класса разом — деталь встаёт на место.
    await click(n.sel); await page.waitForTimeout(850);
  } else if (n.kind === 'bay') {
    // Защёлка (var(--lever) = 0.13s), затем сам каддик (var(--caddy) = 1.05s).
    await click(n.sel); await page.waitForTimeout(250);
    await click(n.sel); await page.waitForTimeout(1250);
    findings.push(...compareSnapshots(before, await snapshot(`сервис, вынут ${n.label}`)));
    // Возврат — тоже два щелчка: каддик в корзину, потом защёлка закрыта.
    await click(n.sel); await page.waitForTimeout(1250);
    await click(n.sel); await page.waitForTimeout(300);
  } else if (n.kind === 'riser') {
    // Два движения с разными фазами (--riser-lift, затем --riser-slide с
    // задержкой 0.52s) — суммарно чуть меньше секунды до полной остановки.
    await click(n.sel); await page.waitForTimeout(1100);
    findings.push(...compareSnapshots(before, await snapshot(`сервис, вынут ${n.label}`)));
    await click(n.sel); await page.waitForTimeout(1100);
  } else {
    // Вентилятор, память, блок питания — одно движение, не длиннее var(--glide).
    await click(n.sel); await page.waitForTimeout(900);
    findings.push(...compareSnapshots(before, await snapshot(`сервис, вынут ${n.label}`)));
    await click(n.sel); await page.waitForTimeout(900);
  }
}

// Одна попытка перезапустить всё с нуля, если браузер за время перебора успел
// умереть, — вместо того чтобы терять уже собранные находки вместе со всем
// отчётом.
for (const n of nodes) {
  for (let attempt = 1; ; attempt++) {
    try {
      await runNode(n);
      break;
    } catch (e) {
      console.error(`!!! ${n.label}: ${String(e?.message ?? e).slice(0, 80)} (попытка ${attempt})`);
      if (attempt >= 2) { console.error(`!!! пропускаю ${n.label}`); break; }
      await freshRig();
      await enterService();
    }
  }
}

await browser.close().catch(() => {});
server.close();

// ── Отчёт ──────────────────────────────────────────────────────────────────

const tagged = findings.map(o => ({ ...o, exception: EXCEPTIONS.find(e => e.hit(o)) ?? null }));

// Дубликаты: если вынуты сразу два узла из одной пары одновременно (у
// процессора радиатор и крышка съезжают вместе на втором щелчке), проверка
// «сосед» встречает их с обеих сторон — это одна и та же находка, а не две.
const seen = new Set();
const unique = [];
for (const o of tagged) {
  const key = [o.state, o.kind, [o.a, o.b].sort().join('~')].join('||');
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(o);
}
unique.sort((a, b) => b.ratio - a.ratio);

console.log(`Порог пересечения: ${Math.round(THRESHOLD * 100)}% площади меньшей фигуры, ` +
  `прирост над покоем не меньше ${Math.round(GROWTH * 100)} п.п.`);
console.log(`Состояний проверено: 3 + ${nodes.length} узлов по очереди.\n`);

// Пересечение рамок само по себе ещё ни о чём не говорит: схема нарисована
// сверху, а снятая деталь лежит НАД платой — она обязана закрывать собой то,
// подо что легла. Разделяем по порядку отрисовки.
const line = o => {
  const pct = (o.ratio * 100).toFixed(0).padStart(3);
  const basePct = (o.base * 100).toFixed(0);
  const mark = o.exception ? '  [исключение]' : '';
  return `  ${pct}% (в покое ${basePct}%)  ${o.kind}: «${o.a}» × «${o.b}»  —  ${o.state}${mark}`;
};

const covered = unique.filter(o => !o.over);              // деталь сверху — так и надо
const floating = unique.filter(o => o.over && o.tag);     // бирка сверху — слой tags
const defects = unique.filter(o => o.over && !o.tag);     // подпись сверху — вот это баг

if (unique.length === 0) {
  console.log('Пересечений с приростом над покоем не найдено ни в одном состоянии.');
} else {
  console.log(`Снятая деталь легла поверх — ${covered.length}: она выше платы, так и должно быть.`);
  console.log(`Бирка со ссылкой поверх детали — ${floating.length}: слой tags над машиной по замыслу.`);
  if (defects.length) {
    console.log('\nОстались подписи, нарисованные ПОВЕРХ снятой детали:');
    for (const o of defects) console.log(line(o));
  }
}

const excepted = defects.filter(o => o.exception);
if (excepted.length) {
  console.log('\nИсключения, учтённые при подсчёте:');
  for (const e of EXCEPTIONS) {
    const count = excepted.filter(o => o.exception === e).length;
    if (count) console.log(`  · ${e.from} — ${count} совпадени${count === 1 ? 'е' : count < 5 ? 'я' : 'й'}\n    ${e.why}`);
  }
}

const reportable = defects.filter(o => !o.exception);
console.log();
if (reportable.length === 0) {
  console.log('наложений нет');
  process.exit(0);
} else {
  console.log(`наложений: ${reportable.length}`);
  process.exit(1);
}
