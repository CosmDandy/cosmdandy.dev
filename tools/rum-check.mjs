// Воркер: метка версии на странице и приём мерок от гостя.
//
//   node tools/rum-check.mjs
//   node tools/rum-check.mjs --keep   оставить стенд поднятым и напечатать адрес
//
// Единственная часть сайта, где есть серверный код, — и единственная, которую
// нельзя проверить ни разбором файлов, ни браузером. Поэтому стенд поднимается
// по-настоящему: тем же wrangler, тем же worker.js, с теми же заголовками, что
// уедут в прод.
//
// Проверяется два ответа на два вопроса.
//
// «Не менялось?» — заголовки обещают `must-revalidate`, и до появления воркера
// исполнить это было нечем: механизм раздачи файлов не ставит на HTML ни ETag,
// ни Last-Modified, и каждый повторный заход вёз 138 КБ страницы заново.
//
// «Сколько это стоило гостю?» — приём мерок. Здесь важнее не то, что валидное
// принимается, а что не принимается всё остальное: чужой источник, мусор
// вместо тела, метод не тот, тело не по размеру. Открытая ручка на живом
// домене — это приглашение засорить журнал кому угодно.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const keep = process.argv.includes('--keep');

// wrangler лежит там же, где playwright: рядом с контейнером, в tools/ci или
// в самом репозитории. Ищется файлом, а не через resolve: у пакета закрыты
// подпути в exports, и resolve('wrangler/bin/wrangler.js') падает даже там,
// где пакет установлен.
const wrangler = ['/workspaces/.pw/', ROOT + '/tools/ci/', ROOT + '/']
  .map(dir => join(dir, 'node_modules/wrangler/bin/wrangler.js'))
  .find(path => existsSync(path));
if (!wrangler) { console.error('нет wrangler: npm i wrangler'); process.exit(1); }

// Тот же список файлов, что копирует выкатка. Держать его здесь вторым
// экземпляром не хочется, но альтернатива — отдать воркеру корень репозитория
// вместе с .git и tools, а это тысячи файлов на индексацию ради семи нужных.
const SITE = ['index.html', '404.html', 'style.css', 'server.css', 'server.js',
  'robots.txt', 'sitemap.xml', 'site.webmanifest', '_headers'];
const DIRS = ['assets', 'fonts', 'tg'];

const stage = await mkdtemp(join(tmpdir(), 'rum-'));
const site = join(stage, 'site');
await cp(join(ROOT, SITE[0]), join(site, SITE[0]), { recursive: true });
for (const name of SITE.slice(1)) await cp(join(ROOT, name), join(site, name));
for (const name of DIRS) await cp(join(ROOT, name), join(site, name), { recursive: true });

// Конфиг берётся настоящий и правится в одном месте — директории. Написать
// свой значило бы проверять не ту раздачу, что уедет.
const raw = await readFile(join(ROOT, 'wrangler.jsonc'), 'utf8');
const config = JSON.parse(raw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n'));
config.assets.directory = site;
config.main = join(ROOT, 'worker.js');
const configPath = join(stage, 'wrangler.json');
await writeFile(configPath, JSON.stringify(config, null, 2));

// Порт разный от запуска к запуску: два прогона подряд не должны спорить за
// один и тот же, а освобождается он не мгновенно.
const port = 8700 + Math.floor((Date.now() / 1000) % 300);
const dev = spawn(process.execPath,
  [wrangler, 'dev', '--config', configPath, '--port', String(port), '--ip', '127.0.0.1'],
  { cwd: stage, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });

const log = [];
dev.stdout.on('data', d => log.push(String(d)));
dev.stderr.on('data', d => log.push(String(d)));

const base = `http://127.0.0.1:${port}`;
const failures = [];
const say = (ok, line) => {
  console.log(`  ${ok ? '·' : 'ПЛОХО'} ${line}`);
  if (!ok) failures.push(line);
};

async function ready() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch { /* ещё поднимается */ }
    if (dev.exitCode !== null) return false;
    await new Promise(ok => setTimeout(ok, 500));
  }
  return false;
}

async function finish(code) {
  dev.kill('SIGTERM');
  if (!keep) await rm(stage, { recursive: true, force: true });
  process.exit(code);
}

if (!await ready()) {
  console.error('стенд не поднялся:\n' + log.join('').slice(-2000));
  await finish(1);
}

console.log(`стенд на ${base}\n`);
console.log('метка версии');
const first = await fetch(base + '/');
const etag = first.headers.get('etag');
say(Boolean(etag), `страница отдаёт ETag: ${etag ?? 'нет'}`);
say(first.headers.get('cache-control')?.includes('must-revalidate') ?? false,
  `и просит переспрашивать: ${first.headers.get('cache-control')}`);

if (etag) {
  const again = await fetch(base + '/', { headers: { 'if-none-match': etag } });
  const body = await again.arrayBuffer();
  say(again.status === 304, `повторный заход: ${again.status}`);
  say(body.byteLength === 0, `тело на повторном заходе: ${body.byteLength} байт`);
  // 304 обязан нести те же указания по кэшу, что и полный ответ: без них
  // браузер не знает, сколько ещё держать у себя то, что не менялось.
  say(Boolean(again.headers.get('cache-control')),
    `и указания по кэшу: ${again.headers.get('cache-control') ?? 'нет'}`);

  // Метка заведомо чужая, но записанная латиницей: заголовки — это байты, и
  // кириллица в них не помещается вовсе, отчего падал сам тест, а не воркер.
  const stale = await fetch(base + '/', { headers: { 'if-none-match': 'W/"not-ours"' } });
  say(stale.status === 200, `с чужой меткой отдаётся заново: ${stale.status}`);
}

// Файлы едут мимо воркера — им метка не нужна, у них вечный кэш и версия в
// адресе. Проверяем, что воркер их не трогает и не ломает заголовки.
const asset = await fetch(base + '/style.css');
say(asset.headers.get('cache-control')?.includes('immutable') ?? false,
  `стили по-прежнему кэшируются навсегда: ${asset.headers.get('cache-control')}`);

console.log('\nприём мерок');
// Origin в запрос ставит браузер, а не fetch из node: свой источник называем
// сами, иначе каждый случай проверял бы отказ по источнику, а не то, ради
// чего он написан.
const post = (body, headers = {}) => fetch(base + '/rum', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

// Тот же запрос, но без Origin — так приходит curl и любой скрипт.
const postBare = body => fetch(base + '/rum', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const good = await post({ m: { ttfb: 120, fcp: 800, cls: 0.023 }, v: 'card', w: 390, n: '4g' });
say(good.status === 204, `валидная мерка принята: ${good.status}`);

// Полный набор — ровно тот, что шлёт tools/rum.js. Пока стоял предел на число
// метрик, срезались две последние, и это всегда были cls и inp: те самые, ради
// которых в сборщике заведены два наблюдателя.
const full = await post({
  m: { ttfb: 90, dcl: 400, load: 900, fcp: 700, lcp: 1200, cls: 0.05, inp: 64 },
  v: 'rig', w: 1600, n: '4g',
});
say(full.status === 204, `полный набор из семи метрик принят: ${full.status}`);

// Тело потоком: браузер так не делает, а curl и любой скрипт — запросто.
// Content-Length при этом не ставится вовсе, и пока размер проверялся по
// заголовку, двести килобайт заходили без единого возражения.
const streamed = await fetch(base + '/rum', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  duplex: 'half',
  body: new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('{"m":{"ttfb":1},"junk":"' + 'x'.repeat(200000) + '"}'));
      c.close();
    },
  }),
}).catch(e => ({ status: 'сорвалось: ' + e.message }));

const cases = [
  ['мусор вместо тела', await post('не json'), 400],
  ['пустой набор метрик', await post({ m: {} }), 400],
  ['неизвестные имена метрик', await post({ m: { нечто: 1 } }), 400],
  // `null` — валидный JSON, и обращение к его полю роняло обработчик: четыре
  // байта давали пятисотую ошибку на публичной ручке.
  ['тело null', await post('null'), 400],
  ['тело — число', await post('123'), 400],
  ['чужой источник', await post({ m: { ttfb: 1 } }, { origin: 'https://evil.example' }), 403],
  // Заголовка Origin у не-браузерного клиента нет вовсе, и мягкая проверка
  // пропускала именно его, блокируя лишь честно представившихся.
  ['источник не назван', await postBare({ m: { ttfb: 1 } }), 403],
  ['слишком большое тело', await post({ m: { ttfb: 1 }, junk: 'x'.repeat(2000) }), 413],
  ['тело потоком, без размера', streamed, 413],
  // Случая «Content-Length соврал» здесь нет нарочно: fetch в node отвергает
  // такой заголовок сам, до отправки, и проверялся бы не воркер, а undici.
  // Суть покрыта случаем выше — воркер меряет прочитанное, а не обещанное,
  // и заголовку не верит вовсе.
];
for (const [name, res, want] of cases) {
  say(res.status === want, `${name}: ${res.status}, ожидалось ${want}`);
}
const wrongMethod = await fetch(base + '/rum');
say(wrongMethod.status === 405, `GET вместо POST: ${wrongMethod.status}`);
say(wrongMethod.headers.get('allow') === 'POST',
  `и говорит, что можно: ${wrongMethod.headers.get('allow') ?? 'ничего'}`);

// Мерка должна доехать до журнала — иначе принимать её незачем.
await new Promise(ok => setTimeout(ok, 1500));
const written = log.join('').match(/\{"kind":"rum".*?\}\}/g) ?? [];
say(written.length > 0, `в журнал записано мерок: ${written.length}`);
if (written.length) {
  // Именно первая: после неё в журнал уходит полный набор, и «последняя» —
  // это уже он. Проверки ниже про ту мерку, что отправлена первой.
  const last = JSON.parse(written[0]);
  say(last.metrics?.ttfb === 120, `время сохранено как есть: ttfb ${last.metrics?.ttfb}`);
  // Сдвиг макета живёт между нулём и десятой доли: округление до целого
  // превращало бы 0.023 в 0, то есть теряло метрику целиком.
  say(last.metrics?.cls === 0.023, `сдвиг сохранён с долями: cls ${last.metrics?.cls}`);
  say(last.view === 'card' && last.width === 390, `вид и ширина: ${last.view}, ${last.width}`);

  const seven = written.map(JSON.parse).find(r => r.view === 'rig');
  const names = Object.keys(seven?.metrics ?? {});
  say(names.length === 7, `метрик в полном наборе доехало: ${names.length} (${names.join(', ')})`);
}

// ── Страница под политикой ────────────────────────────────────────────────
// Политика перечисляет встроенные скрипты по хэшам. Ошибка на один байт — и
// браузер откажется выполнить их все: тема не применится, схема не соберётся,
// страница останется голой разметкой. Проверить это можно только браузером и
// только с настоящими заголовками, то есть здесь.
console.log('\nстраница под политикой');
{
  const { launch } = await import('./browser.mjs');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const blocked = [];
  page.on('console', m => {
    const text = m.text();
    if (/content security policy|refused to/i.test(text)) blocked.push(text.slice(0, 120));
  });
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
    () => document.querySelectorAll('input').forEach(el => el.remove())));
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  say(blocked.length === 0, blocked.length
    ? `политика отвергла своё же: ${blocked[0]}`
    : 'ни один свой скрипт не отвергнут');

  // Косвенная проверка того же, но с другой стороны: если бы скрипты не
  // выполнились, ни одного из этих следов на странице не было бы.
  const alive = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme || getComputedStyle(document.body).backgroundColor,
    view: document.body.className,
    rig: typeof window.__rig,
  }));
  say(Boolean(alive.view), `вид выставлен скриптом: ${alive.view || 'ничего'}`);
  say(alive.rig === 'object', `консоль машины поднялась: window.__rig — ${alive.rig}`);

  await browser.close();
}

if (keep) {
  console.log(`\nстенд оставлен на ${base}, файлы в ${stage}`);
  console.log('остановить: Ctrl+C');
  await new Promise(() => {});
}

console.log(failures.length ? `\n${failures.length} замечаний` : '\nворкер в порядке');
await finish(failures.length ? 1 : 0);
