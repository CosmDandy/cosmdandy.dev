// Что на самом деле уехало в Cloudflare.
//
//   node tools/live-check.mjs                        продакшен
//   node tools/live-check.mjs --url https://…        любой адрес
//   node tools/live-check.mjs --url https://… --preview   превью-стенд
//   node tools/live-check.mjs --json
//
// Локальные проверки смотрят на файлы в репозитории, но между репозиторием и
// гостем стоит пайплайн, который делает с ними ещё четыре вещи: вырезает
// комментарии, пересчитывает версии по минифицированному, стирает отметку о
// сборке и вырезает отладочные слои. Каждый из этих шагов может не сработать
// молча — страница откроется, и выглядеть будет правильно.
//
// Чем это отличается от мерки скорости. Здесь не меряется ничего: проверяется
// конфигурация. Она либо верна, либо нет, и от чужой сети не зависит — поэтому
// это годится и для CI, где числа скорости врали бы через раз.
//
// Проверок семь групп, и каждая ловит свой отказ:
//   доступность   страница вообще отвечает, и отвечает по HTTPS
//   сжатие        текст едет сжатым (иначе вес вдесятеро)
//   кэш           заголовки те же, что обещает _headers
//   версии        хэш в ссылке — хэш того, что реально отдают
//   стенд         на проде нет отладки, на превью она есть
//   соседи        404, robots, sitemap, манифест, вторая страница
//   лента         история ревизий на месте и кэшируется навсегда
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const preview = args.includes('--preview');
const base = (args.includes('--url') ? args[args.indexOf('--url') + 1] : 'https://cosmdandy.dev')
  .replace(/\/$/, '');

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
// Предупреждение печатается и не роняет прогон. Нужно там, где проверка
// говорит правду про сегодняшний продакшен: ронять ею выкатку значит держать
// пайплайн красным до тех пор, пока руки не дойдут до починки, — а красный
// пайплайн перестают читать на второй день.
const warn = (name, ok, detail = '') =>
  checks.push({ name, ok: Boolean(ok), detail, soft: true });

const TIMEOUT = 30000;
async function get(path, init = {}) {
  const ctl = AbortSignal.timeout(TIMEOUT);
  const res = await fetch(base + path, {
    signal: ctl,
    redirect: 'manual',
    headers: { 'accept-encoding': 'br, gzip', ...init.headers },
    ...init,
  });
  return res;
}

// ── Доступность ───────────────────────────────────────────────────────────
let html = '';
try {
  const res = await get('/');
  check('главная отвечает 200', res.status === 200, `статус ${res.status}`);
  check('главная — это HTML', (res.headers.get('content-type') ?? '').includes('text/html'),
    res.headers.get('content-type') ?? 'нет content-type');
  html = await res.text();
  check('страница не пуста', html.length > 10000, `${html.length} символов`);
  // Заголовок воркера — доказательство, что отвечает именно он, а не старый
  // GitHub Pages, оставшийся в DNS.
  check('отдаёт Cloudflare', (res.headers.get('server') ?? '').includes('cloudflare'),
    res.headers.get('server') ?? 'нет server');
} catch (e) {
  check('главная отвечает', false, String(e));
}

// ── Сжатие ────────────────────────────────────────────────────────────────
// Проверяется на скрипте: он самый крупный из текстовых, и на нём отказ
// сжатия виден как ничто другое — треть мегабайта вместо шестидесяти килобайт.
for (const path of ['/', '/server.js', '/style.css']) {
  try {
    const res = await get(path);
    const enc = res.headers.get('content-encoding');
    check(`${path} едет сжатым`, enc === 'br' || enc === 'gzip' || enc === 'zstd',
      enc ?? 'без сжатия');
  } catch (e) {
    check(`${path} отвечает`, false, String(e));
  }
}

// ── Кэш: то же, что обещает _headers ──────────────────────────────────────
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

for (const [pattern, promised] of cacheRules()) {
  // Звёздочку разворачиваем в живой пример: правило про /fonts/* проверяется
  // на настоящем шрифте, иначе проверялся бы несуществующий адрес.
  //
  // Разворачивается любой шаблон со звездой, а не только оканчивающийся на
  // неё. Пока условие смотрело на конец строки, `/history/*.svg` уходил в
  // запрос как есть: сервер отвечал на него страницей 404 — и с тем же
  // вечным кэшем, потому что глоб покрывает и сам глоб. Проверка была
  // зелёной, ничего не проверяя.
  let path = pattern;
  if (pattern.includes('*')) {
    const prefix = pattern.slice(0, pattern.indexOf('*'));
    // Пути в разметке относительные («fonts/Inter-Regular.woff2»), а правило
    // в _headers абсолютное («/fonts/*»): ищем в обоих написаниях.
    const bare = prefix.replace(/^\//, '');
    const suffix = pattern.slice(pattern.indexOf('*') + 1);
    let found = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
      .find(u => (u.startsWith(prefix) || u.startsWith('./' + bare) || u.startsWith(bare))
        && u.endsWith(suffix));
    // Ленты ревизий в разметке нет — она собирается в CI и перечислена в
    // своём указателе. Оттуда и берём настоящее имя файла.
    if (!found && prefix.startsWith('/history/')) {
      const list = await get('/history/index.json').then(r => r.ok ? r.json() : null).catch(() => null);
      const first = Array.isArray(list) ? list[0] : Object.values(list ?? {})[0];
      const sha = typeof first === 'string' ? first : first?.sha ?? first?.name;
      if (sha) found = `/history/${String(sha).replace(/\.svg$/, '')}.svg`;
    }
    if (!found) { check(`${pattern}: есть пример для проверки`, false, 'не нашлось ни одного такого файла'); continue; }
    path = found.startsWith('/') ? found : '/' + found.replace(/^\.\//, '');
  }
  try {
    const res = await get(path.split('?')[0]);
    const got = res.headers.get('cache-control') ?? '';
    check(`${path}: кэш как обещано`, got.replace(/\s/g, '') === promised.replace(/\s/g, ''),
      `обещано «${promised}», отдано «${got || 'ничего'}»`);
  } catch (e) {
    check(`${path}: отвечает`, false, String(e));
  }
}

// Страница обязана переспрашиваться: в ней и лежат текущие версии статики.
try {
  const res = await get('/');
  const control = res.headers.get('cache-control') ?? '';
  check('страница не закэширована навсегда', !control.includes('immutable'), control);

  // «must-revalidate» без валидатора — обещание, которое нечем исполнить.
  // Браузер переспрашивает и получает всю страницу целиком вместо пустого
  // 304: сто тридцать восемь килобайт на каждый повторный заход. Замысел в
  // _headers записан прямо — «ETag revalidation is both cheaper and more
  // honest for them», — но валидатора в ответе может не оказаться вовсе.
  const etag = res.headers.get('etag');
  const modified = res.headers.get('last-modified');
  warn('страницу есть чем проверить (ETag или Last-Modified)', etag || modified,
    etag || modified || 'ни того, ни другого: каждый повторный заход везёт страницу целиком');

  if (etag || modified) {
    const again = await get('/', {
      headers: etag ? { 'if-none-match': etag } : { 'if-modified-since': modified },
    });
    warn('повторный заход отвечает 304', again.status === 304,
      `статус ${again.status}` + (again.status === 200 ? ', тело поехало заново' : ''));
  }
} catch { /* уже отмечено выше */ }

// ── Версии: хэш в ссылке — хэш того, что отдают ───────────────────────────
// Ссылка обещает год кэша. Если хэш посчитан не от того, что реально уехало
// по проводу, правка не дойдёт до вернувшегося гостя никогда.
const versioned = [...html.matchAll(/(?:href|src)="([^"]+?\.(?:css|js))\?v=([0-9a-f]{8})"/g)];
check('в ссылках есть версии', versioned.length > 0, `${versioned.length} шт`);
for (const [, file, want] of versioned) {
  const path = file.startsWith('/') ? file : '/' + file;
  try {
    const res = await get(`${path}?v=${want}`);
    const body = Buffer.from(await res.arrayBuffer());
    const got = createHash('sha256').update(body).digest('hex').slice(0, 8);
    check(`${path}: версия от этого же файла`, got === want, `в ссылке ${want}, у файла ${got}`);
  } catch (e) {
    check(`${path}: отвечает`, false, String(e));
  }
}

// ── Стенд: продакшен или превью ───────────────────────────────────────────
// Отметка о сборке и отладочные слои — ровно то, чем стенды отличаются. На
// проде их стирает пайплайн, и не стёртая отметка означала бы, что шаг не
// отработал, а гость платит за 105 КБ отладки.
const DEBUG_LAYERS = ['lyr-bounds', 'lyr-overlap', 'lyr-clash', 'lyr-grid'];
const found = DEBUG_LAYERS.filter(cls => html.includes(`class="${cls}"`));
// Стирание оставляет тег и опустошает content — так и задумано, поэтому
// пустой штамп означает «стёрт», а не «не стёрт». Проверять наличие тега
// было бы вечно красной проверкой.
const stamped = /<meta name="build" content="[^"]+"/.test(html);
if (preview) {
  check('превью: отметка о сборке на месте', stamped, stamped ? '' : 'нет <meta name="build">');
  check('превью: отладочные слои на месте', found.length === DEBUG_LAYERS.length,
    found.length ? `есть ${found.join(', ')}` : 'не найдено ни одного');
} else {
  check('продакшен: отметки о сборке нет', !stamped, stamped ? 'штамп не стёрт' : '');
  check('продакшен: отладочных слоёв нет', found.length === 0,
    found.length ? `не вырезано: ${found.join(', ')}` : '');
  // Комментарии — половина веса собранных файлов, и вырезает их сборка.
  try {
    const css = await (await get('/style.css')).text();
    check('продакшен: комментарии вырезаны', !css.includes('/*'),
      css.includes('/*') ? 'в стилях остались комментарии' : '');
  } catch (e) { check('/style.css отвечает', false, String(e)); }
}

// ── Соседи ────────────────────────────────────────────────────────────────
try {
  const res = await get('/такой-страницы-нет-' + Date.now());
  check('несуществующий адрес — 404', res.status === 404, `статус ${res.status}`);
  const body = await res.text();
  check('404 отдаёт свою страницу', body.includes('<html') && body.length > 300,
    `${body.length} символов`);
} catch (e) { check('404 отвечает', false, String(e)); }

for (const path of ['/robots.txt', '/sitemap.xml', '/site.webmanifest', '/tg/']) {
  try {
    const res = await get(path);
    check(`${path} на месте`, res.status === 200, `статус ${res.status}`);
  } catch (e) { check(`${path} отвечает`, false, String(e)); }
}

// ── Лента ревизий ─────────────────────────────────────────────────────────
// Собирается в CI из истории и в репозитории её нет: локально это не
// проверить ничем, а гость её просит командой `revisions on`.
try {
  const res = await get('/history/index.json');
  if (res.status === 200) {
    const list = await res.json();
    check('лента ревизий собрана', Array.isArray(list) ? list.length > 0 : Object.keys(list).length > 0,
      `${Array.isArray(list) ? list.length : Object.keys(list).length} записей`);
  } else {
    check('лента ревизий собрана', false, `index.json отдал ${res.status}`);
  }
} catch (e) {
  check('лента ревизий собрана', false, String(e));
}

// ── Вывод ─────────────────────────────────────────────────────────────────
const bad = checks.filter(c => !c.ok && !c.soft);
const soft = checks.filter(c => !c.ok && c.soft);
if (asJson) {
  console.log(JSON.stringify({ base, preview, checks, failed: bad.length }, null, 2));
  process.exit(bad.length ? 1 : 0);
}

console.log(`${base}${preview ? ' (превью)' : ''}\n`);
for (const c of checks) {
  const mark = c.ok ? '·' : c.soft ? 'СТОИТ ПОЧИНИТЬ' : 'ПЛОХО';
  console.log(`  ${mark} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - bad.length - soft.length} из ${checks.length} в порядке` +
  (soft.length ? `, ${soft.length} на потом` : ''));
process.exit(bad.length ? 1 : 0);
