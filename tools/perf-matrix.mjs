// Сколько стоит открыть страницу — на всём, с чего её открывают.
//
//   node tools/perf-matrix.mjs                 вся матрица
//   node tools/perf-matrix.mjs --device phone  только одно устройство
//   node tools/perf-matrix.mjs --repeat 3      медиана трёх прогонов
//   node tools/perf-matrix.mjs --update        переписать бюджеты текущим
//   node tools/perf-matrix.mjs --json          машиночитаемо
//   node tools/perf-matrix.mjs --url https://cosmdandy.dev   по живому адресу
//   node tools/perf-matrix.mjs --ci            только то, что не зависит от машины
//
// Рядом уже есть две мерки, и обе про другое: perf.mjs меряет установившийся
// режим — сколько процессора ест уже открытая страница; perf-load.mjs меряет
// первый заход с телефона на трёх сайтах сразу. Здесь третий вопрос, которого
// не задавал никто: одинаково ли быстро страница открывается на телефоне и на
// десктопе, и что меняет второй заход.
//
// Второй заход — половина смысла. Кэш описан в _headers, и описан хитро:
// стили и скрипт кэшируются навсегда, но ссылка на них несёт хэш содержимого.
// Ошибка здесь не видна вообще ничем: страница открывается, выглядит верно, а
// вернувшийся гость либо тащит по проводу то, что уже лежит у него в кэше,
// либо получает вчерашние стили и никогда не увидит правку. Поэтому локальный
// сервер отдаёт ровно те заголовки, что стоят в _headers, а мерка считает, что
// поехало по проводу на втором заходе.
//
// Brotli обязателен по той же причине, что и в perf-load.mjs: без него вес
// разметки завышается вдесятеро, и все выводы получаются про несуществующую
// беду.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompress, constants as zlibConst } from 'node:zlib';
import { promisify } from 'node:util';
import { extname, join, resolve } from 'node:path';
import { dropInputs, launch } from './browser.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const brotli = promisify(brotliCompress);
const ROOT = resolve(import.meta.dirname, '..');
const BUDGET = join(ROOT, 'tools/perf-budget.json');



// С чего эту страницу открывают. Разрешения — не круглые числа, а те, что
// стоят в статистике: 390×844 это iPhone 14, 360×800 — середина андроида,
// 820×1180 — iPad Air, 1440×900 — ноутбук, 1920×1080 — монитор.
//
// Процессор душится сильнее там, где экран меньше: телефон за десять тысяч
// не просто «медленнее ноутбука», он медленнее вчетверо-вшестеро, и вся
// разница между «открылось» и «подождите» живёт именно здесь.
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const FAST_4G = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 };
const WIFI = { offline: false, latency: 15, downloadThroughput: (30 * 1024 * 1024) / 8, uploadThroughput: (15 * 1024 * 1024) / 8 };

const DEVICES = {
  'phone-slow': { w: 360, h: 800, dpr: 2, mobile: true, net: SLOW_4G, cpu: 6, title: 'телефон подешевле, медленный 4G' },
  phone: { w: 390, h: 844, dpr: 3, mobile: true, net: SLOW_4G, cpu: 4, title: 'телефон, медленный 4G' },
  tablet: { w: 820, h: 1180, dpr: 2, mobile: true, net: FAST_4G, cpu: 2, title: 'планшет, быстрый 4G' },
  laptop: { w: 1440, h: 900, dpr: 2, mobile: false, net: WIFI, cpu: 1, title: 'ноутбук, wifi' },
  desktop: { w: 1920, h: 1080, dpr: 1, mobile: false, net: null, cpu: 1, title: 'десктоп, без ограничений' },
};

// Ширина, с которой страница показывает схему сервера. Ниже неё гость видит
// карточку, и схема ему не рисуется вовсе — но приезжает всё равно, вместе со
// своими стилями и логикой. Число берётся из самой страницы, а не пишется
// рядом: разъехавшись, оно молча переставило бы отчёт на несуществующий вид.
const RIG_FROM = Number(
  readFileSync(join(ROOT, 'index.html'), 'utf8')
    .match(/matchMedia\('\(min-width:\s*(\d+)px\)'\)/)?.[1] ?? 821);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.txt': 'text/plain', '.ico': 'image/x-icon',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.webmanifest', '.xml', '.txt']);

// ── Заголовки кэша: те же, что в проде ────────────────────────────────────
// Читаются из самого _headers, а не переписываются рядом. Второй список
// разошёлся бы с первым в первую же правку — и мерка молча стала бы мерить
// не тот кэш, что уедет.
function cacheRules() {
  const rules = [];
  let path = null;
  for (const line of readFileSync(join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (line.startsWith('/')) path = line.trim();
    else if (path && /^\s+\S+:/.test(line)) {
      const [name, ...rest] = line.trim().split(':');
      if (name.toLowerCase() === 'cache-control') rules.push([path, rest.join(':').trim()]);
    }
  }
  return rules;
}

function cacheFor(rules, path) {
  for (const [pattern, value] of rules) {
    if (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern) return value;
  }
  // Умолчание воркера: тело не шлётся, но спросить браузер обязан.
  return 'public, max-age=0, must-revalidate';
}

async function serve() {
  const rules = cacheRules();
  const cache = new Map();
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = path === '/' || path.endsWith('/') ? path + 'index.html' : path;
    const ext = extname(file);
    let body = cache.get(file);
    if (body === undefined) {
      body = await readFile(join(ROOT, file)).catch(() => null);
      cache.set(file, body);
    }
    if (body === null) { res.writeHead(404).end('no such file'); return; }

    const etag = '"' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '"';
    const control = cacheFor(rules, path);
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag, 'cache-control': control });
      res.end();
      return;
    }
    const headers = { 'content-type': MIME[ext] ?? 'application/octet-stream', etag, 'cache-control': control };
    let out = body;
    if (COMPRESSIBLE.has(ext) && (req.headers['accept-encoding'] ?? '').includes('br')) {
      out = await brotli(body, { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 } });
      headers['content-encoding'] = 'br';
    }
    headers['content-length'] = out.length;
    res.writeHead(200, headers);
    res.end(out);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

// ── Когда гость увидел страницу ───────────────────────────────────────────
// FCP на этой странице меряет только половину случаев, и это выяснилось
// измерением: на широком экране он есть, а на узком его нет вовсе — ни с
// душеным процессором, ни без него. На узком показывается карточка, и Chrome
// не признаёт её содержимое contentful; проверено и с флагом мобильного
// устройства, и без него, и с ожиданием в двенадцать секунд.
//
// Поэтому кадр снимается напрямую. Screencast отдаёт картинки с отметками
// времени, и первый кадр, заметно потяжелевший против пустого фона, — это и
// есть момент, когда на экране появилось что-то кроме заливки. Сравнение по
// весу кадра, а не по пикселям: JPEG пустого фона жмётся в разы сильнее
// текста, и разница видна без разбора картинки.
async function watchFrames(cdp) {
  const frames = [];
  const onFrame = async e => {
    frames.push({ at: e.metadata.timestamp * 1000, bytes: e.data.length });
    await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 40, everyNthFrame: 1 });
  return {
    async stop(startedAt) {
      await cdp.send('Page.stopScreencast').catch(() => {});
      cdp.off('Page.screencastFrame', onFrame);
      if (frames.length < 2) return null;
      // База — первый кадр, а не самый лёгкий из всех. Минимум по всей ленте
      // берёт кадр из середины, где страница успела потемнеть или анимация
      // ушла за край, и тогда «появление» находится позже самого появления.
      const empty = frames[0].bytes;
      const first = frames.find(f => f.bytes > empty * 1.25);
      // Не нашлось ни одного потяжелевшего кадра — значит на экране так
      // ничего и не появилось. Это «не знаю», а не «мгновенно»: ноль прошёл
      // бы любой бюджет и худший случай отчитался бы как лучший.
      return first ? Math.max(0, first.at - startedAt) : null;
    },
  };
}


// ── Один заход ────────────────────────────────────────────────────────────
async function visit(page, cdp, url, device) {
  const req = new Map();
  const wire = [];
  const onSent = e => req.set(e.requestId, e.request.url);
  const onDone = e => wire.push({ url: req.get(e.requestId) ?? '?', bytes: e.encodedDataLength });
  const onCached = e => wire.push({ url: req.get(e.requestId) ?? '?', bytes: 0, fromCache: true });
  cdp.on('Network.requestWillBeSent', onSent);
  cdp.on('Network.loadingFinished', onDone);
  cdp.on('Network.requestServedFromCache', onCached);

  const film = await watchFrames(cdp);
  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  // Даём отложенной работе досчитаться: LCP и длинные задачи приходят после
  // load, и на душеном процессоре приходят заметно позже.
  await page.waitForTimeout(device.cpu > 1 ? 6000 : 3000);

  const painted = await film.stop(startedAt);

  const inPage = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime]));
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime ?? null;
    // Что действительно поехало по проводу, знает только сама страница:
    // transferSize нулевой у всего, что взято из кэша.
    const fromNetwork = performance.getEntriesByType('resource')
      .filter(e => e.transferSize > 0)
      .map(e => ({ url: e.name, bytes: e.transferSize }));
    return {
      nodes: document.getElementsByTagName('*').length,
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      html: nav.transferSize,
      fcp: paint['first-contentful-paint'] ?? null,
      lcp,
      longTasksEnd: window.__longTasks?.length ? Math.max(...window.__longTasks) : null,
      fromNetwork,
    };
  });

  cdp.off('Network.requestWillBeSent', onSent);
  cdp.off('Network.loadingFinished', onDone);
  cdp.off('Network.requestServedFromCache', onCached);

  const bytes = wire.reduce((s, r) => s + r.bytes, 0);
  return {
    requests: wire.length,
    bytes,
    painted,
    fcp: inPage.fcp,
    lcp: inPage.lcp,
    dcl: inPage.dcl,
    load: inPage.load,
    // Приблизительный TTI: когда главный поток перестал залипать. Точного
    // определения у него нет, а для «нажал и ждёшь» это ближайшее честное.
    tti: Math.max(inPage.dcl, inPage.longTasksEnd ?? 0),
    nodes: inPage.nodes,
    // Путь без хоста и без версии: с версией список разъезжался бы от каждой
    // правки стилей, а вопрос к нему один — что поехало снова.
    overWire: inPage.fromNetwork
      .map(r => r.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '/')
      .sort(),
  };
}

async function measure(device, live) {
  // Живой адрес меряется тем же кодом, что и локальный: разница только в том,
  // кто отдаёт файлы. Иначе пришлось бы держать две мерки и сравнивать их
  // выводы между собой, а они разошлись бы первой же правкой.
  const { server, url } = live ? { server: null, url: live } : await serve();
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width: device.w, height: device.h },
    deviceScaleFactor: device.dpr,
    isMobile: device.mobile,
    hasTouch: device.mobile,
  });
  const page = await context.newPage();
  // Поля ввода роняют рендерер этой сборки — убираем их до первой отрисовки.
  await page.addInitScript(dropInputs);
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver(l => window.__longTasks.push(...l.getEntries().map(e => e.startTime + e.duration)))
        .observe({ type: 'longtask', buffered: true });
    } catch { /* нет поддержки — TTI посчитается по DCL */ }
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (device.net) await cdp.send('Network.emulateNetworkConditions', device.net);
  if (device.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: device.cpu });

  const cold = await visit(page, cdp, url, device);
  // Тёплый заход — тот же контекст и тот же кэш: именно так возвращается
  // гость. Новый контекст пришёл бы с пустым кэшем и померил бы холодный
  // заход второй раз.
  const warm = await visit(page, cdp, url, device);

  await browser.close();
  server?.close();
  return { cold, warm };
}

// ── Медиана: числа шумят, и одиночный прогон ловит шум, а не правку ───────
const median = xs => {
  const ok = xs.filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
  if (!ok.length) return null;
  return ok.length % 2 ? ok[(ok.length - 1) / 2] : (ok[ok.length / 2 - 1] + ok[ok.length / 2]) / 2;
};

function fold(runs) {
  const keys = ['requests', 'bytes', 'painted', 'fcp', 'lcp', 'dcl', 'load', 'tti', 'nodes'];
  const out = Object.fromEntries(keys.map(k => [k, median(runs.map(r => r[k]))]));
  // Список поехавшего по проводу берётся из последнего прогона: он не число,
  // и усреднять его нечем — а расходиться между прогонами ему не с чего.
  out.overWire = runs.at(-1).overWire;
  return out;
}

// ── Что считается провалом ────────────────────────────────────────────────
// Кроме бюджетов есть одно правило, не зависящее ни от какой базы: на втором
// заходе то, что объявлено вечным, не имеет права ехать снова. Это не вопрос
// скорости, это вопрос исправности _headers — и ломается оно молча.
const FOREVER = /^\/(style\.css|server\.css|server\.js|fonts\/|history\/|tg\/style\.css)/;

// Файлы схемы. Сама разметка схемы лежит внутри страницы и отдельным запросом
// не считается — её вес приходится оценивать сжатием, см. rigWeight().
const RIG_FILES = /^\/(server\.css|server\.js)/;

let rigMarkup = null;
async function rigWeight() {
  if (rigMarkup !== null) return rigMarkup;
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const cut = html
    .replace(/<!-- BOARD:BEGIN -->[\s\S]*?<!-- BOARD:END -->/, '')
    .replace(/<!-- LIDART:BEGIN -->[\s\S]*?<!-- LIDART:END -->/, '');
  const q = { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 } };
  const [full, without] = await Promise.all([
    brotli(Buffer.from(html)), brotli(Buffer.from(cut)),
  ].map((pr, i) => (i === 0 ? brotli(Buffer.from(html), q) : brotli(Buffer.from(cut), q))));
  rigMarkup = full.length - without.length;
  return rigMarkup;
}

function cacheProblems(warm) {
  return warm.overWire.filter(p => FOREVER.test(p));
}

const args = process.argv.slice(2);
const only = args.includes('--device') ? args[args.indexOf('--device') + 1] : null;
const repeat = args.includes('--repeat') ? Number(args[args.indexOf('--repeat') + 1]) : 1;
const asJson = args.includes('--json');
const update = args.includes('--update');
// Живой адрес: прод или превью-стенд. Бюджеты к нему не применяются — числа
// оттуда несут в себе чужую сеть и загрузку края CDN, и падение по ним
// означало бы «сегодня медленный интернет», а не «страница потяжелела».
// Чем живой прогон ценен, так это правдой про сжатие и заголовки кэша: их
// ставит воркер, и локально их не проверить ничем.
const live = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
// В CI бюджеты по времени бесполезны: раннер другой машины, и его секунды —
// не наши. Вес по проводу и работа кэша от машины не зависят вовсе, поэтому
// проверяются везде одинаково, а времена печатаются справочно.
const ci = args.includes('--ci');

if (only && !DEVICES[only]) {
  console.error(`нет такого устройства: ${only}. Есть: ${Object.keys(DEVICES).join(', ')}`);
  process.exit(2);
}

const kb = b => `${(b / 1024).toFixed(0)} KB`;
const ms = v => (v === null || v === undefined ? '—' : `${Math.round(v)} ms`);

const result = {};
for (const [name, device] of Object.entries(DEVICES)) {
  if (only && only !== name) continue;
  const runs = [];
  for (let i = 0; i < repeat; i++) runs.push(await measure(device, live));
  result[name] = {
    cold: fold(runs.map(r => r.cold)),
    warm: fold(runs.map(r => r.warm)),
  };
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// Бюджет — только по числам, за которые платит гость: вес по проводу и три
// времени. Число узлов и запросов печатается, но под бюджет не идёт: оно
// меняется от любой правки схемы и падало бы на каждой.
// LCP здесь нет и быть не может: кандидатами на него Chrome считает картинки,
// видео и текстовые блоки, а вся схема — это inline <svg>, и ни один её узел в
// кандидаты не попадает. Мерка его печатает (пусто — тоже ответ), но бюджет по
// пустому числу не ставится.
// На тёплом заходе «видно» не меряется честно: браузер часто оставляет на
// экране картинку прошлого захода, и первый же кадр приходит непустым. Число
// печатается, но бюджета ему нет — оно скакало от 0 до 1020 мс на неизменной
// странице. Вес и отзывчивость от этого не страдают.
//
// Времена бюджетируются только когда мерили всерьёз — от трёх прогонов.
// Одиночному замеру здесь верить нельзя, и это не осторожность, а измерение:
// одно и то же неизменное состояние давало по TTI 682, 696 и 1943 мс, а по
// появлению страницы 162 и 1151 мс. Причина одна — длинные задачи на этой
// странице это отрисовка схемы, и она конкурирует со всем, что на машине;
// стоит рядом отработать другой браузерной проверке, и число уезжает втрое.
// Медиана трёх прогонов такие выбросы съедает, одиночная — нет.
//
// Вес по проводу от машины не зависит вовсе: те же файлы, то же сжатие. Он и
// работа кэша проверяются всегда, в том числе в CI.
const TIMES = ['painted', 'tti'];
const GUARDED = ci ? ['bytes'] : ['bytes', ...TIMES];
const guardedFor = state => GUARDED
  // На тёплом заходе появление не меряется честно и при трёх прогонах.
  .filter(k => !(state === 'warm' && k === 'painted'))
  .filter(k => !(TIMES.includes(k) && repeat < 3));
// Запас разный, потому что разного качества числа. Вес по проводу
// детерминирован — те же файлы, то же сжатие, — и запас ему нужен только на
// правку в пару килобайт. Времена шумят: три прогона подряд расходятся на
// пять процентов, но стоит рядом отработать другой браузерной проверке, и
// TTI подскакивает вдвое — машина ещё не остыла. Мерено: 814, 829, 858 мс в
// изоляции против 2093 мс сразу после behave.
const HEADROOM = { bytes: 1.05, painted: 2, tti: 2 };

if (update) {
  const budget = {};
  for (const [name, r] of Object.entries(result)) {
    budget[name] = {};
    for (const state of ['cold', 'warm']) {
      budget[name][state] = Object.fromEntries(
        guardedFor(state).filter(k => r[state][k] !== null)
          .map(k => [k, Math.ceil(r[state][k] * (HEADROOM[k] ?? 1.5))]));
    }
  }
  const merged = existsSync(BUDGET) && only
    ? { ...JSON.parse(readFileSync(BUDGET, 'utf8')), ...budget }
    : budget;
  writeFileSync(BUDGET, JSON.stringify(merged, null, 2) + '\n');
  const gap = Object.entries(HEADROOM).map(([k, v]) => `${k} ×${v}`).join(', ');
  console.log(`бюджеты переписаны (запас: ${gap}): ${BUDGET}`);
  if (repeat === 1) {
    console.log('снято одним прогоном — для времён надёжнее --repeat 3');
  }
  process.exit(0);
}

const budget = existsSync(BUDGET) ? JSON.parse(readFileSync(BUDGET, 'utf8')) : null;
const failures = [];

for (const [name, r] of Object.entries(result)) {
  const d = DEVICES[name];
  console.log(`\n${name} · ${d.title} · ${d.w}×${d.h} @${d.dpr}x, CPU ×${d.cpu}` +
    (live ? ` · ${live}` : ''));
  for (const state of ['cold', 'warm']) {
    const v = r[state];
    const label = state === 'cold' ? 'без кэша' : 'с кэшем ';
    console.log(`  ${label}  ${String(v.requests).padStart(3)} запр  ${kb(v.bytes).padStart(7)}  ` +
      `видно ${ms(v.painted).padStart(8)}  FCP ${ms(v.fcp).padStart(8)}  отзыв ${ms(v.tti).padStart(8)}`);
    for (const key of guardedFor(state)) {
      const limit = live ? undefined : budget?.[name]?.[state]?.[key];
      if (limit !== undefined && v[key] !== null && v[key] > limit) {
        failures.push(`${name}/${state}: ${key} ${Math.round(v[key])} > бюджета ${limit}`);
      }
    }
  }
  const stale = cacheProblems(r.warm);
  if (stale.length) {
    failures.push(`${name}: на втором заходе снова поехало вечное — ${stale.join(', ')}`);
  } else {
    console.log(`  кэш      вечное на втором заходе не поехало`);
  }
  console.log(`  узлов в DOM ${r.cold.nodes}`);
  if (d.w < RIG_FROM) {
    // Не поломка и не бюджет — счёт. Схема включается с RIG_FROM пикселей, а
    // едет на любой экран: и файлы, и разметка внутри страницы.
    const files = r.cold.overWire.filter(u => RIG_FILES.test(u));
    const markup = await rigWeight();
    console.log(`  схемы здесь нет (вид карточки до ${RIG_FROM}px), ` +
      `но за неё уплачено: ${files.join(', ')} + разметка ≈ ${kb(markup)} brotli`);
  }
}

if (live) {
  console.log(`\nмерено по живому адресу ${live} — бюджеты не применяются, ` +
    'числа несут в себе чужую сеть');
  process.exit(failures.length ? 1 : 0);
}
if (!budget) {
  console.log('\nбюджетов нет. Снять текущие: node tools/perf-matrix.mjs --update');
  process.exit(0);
}
if (failures.length) {
  console.log('');
  for (const line of failures) console.log(`  ХУЖЕ: ${line}`);
  console.error('\nПроизводительность вышла за бюджет. Если так и задумано — ' +
    'node tools/perf-matrix.mjs --update');
  process.exit(1);
}
console.log(repeat < 3
  ? '\nвсё в бюджете (времена справочные — бюджет по ним считается от --repeat 3)'
  : '\nвсё в бюджете');
