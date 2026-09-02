// Сколько уходит на переход по узлу и что из этого можно спрятать под сцену.
//
//   node tools/warmup.mjs           все сцены, у которых есть адрес
//   node tools/warmup.mjs cpu       одна
//
// Пролог длится две-три секунды, и всё это время сеть простаивает: браузер
// узнаёт адрес, устанавливает соединение и качает документ только после того,
// как сцена доиграла. Мерка показывает, сколько на это уходит на самом деле —
// отдельно на имя, отдельно на рукопожатие, отдельно на сам ответ.
//
// Числа отсюда — не про скорость сайта, а про разницу между «греем заранее» и
// «не греем»: в контейнере DNS отвечает пять секунд подряд, на живой машине
// будет иначе. Сравнивать надо два прогона одной мерки, а не её вывод с
// ощущением.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const PW_DIRS = ['/workspaces/.pw/', ROOT + '/'];
let chromium;
for (const dir of PW_DIRS) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* next */ }
}
if (!chromium) { console.error('no playwright'); process.exit(1); }
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
if (!CHROME) { console.error('chromium not found in /nix/store'); process.exit(1); }

// По какому узлу щёлкаем и куда он уводит. Внешние адреса меряются как есть:
// прогрев соединения работает и для них, даже когда сам документ переиспользовать
// нельзя.
const TARGETS = {
  cpu:  { unit: '.unit[data-group="cpu"]',  aim: '.cpu-slot .ihs', host: 'cv.cosmdandy.dev' },
  dimm: { unit: '.unit[data-group="dimm"]', host: 'blog.cosmdandy.dev' },
  hdd:  { unit: '.unit[data-group="hdd"]',  host: 'github.com' },
  ocp:  { unit: '.unit[data-group="ocp"]',  host: 'linkedin.com' },
  // Своя страница, и на ней прогрев виден без оговорок: остальные цели лежат
  // на соседних хостах, а локально страница отдаётся с 127.0.0.1 — для
  // браузера это чужой сайт, и правила переиспользования у него строже, чем
  // будут на живом домене. Мерить выигрыш надо там, где мерить можно.
  // Целимся в зону захвата узла: середина его габарита приходится на пустое
  // место между гнёздами, и щелчок туда не попадает ни во что.
  eth:  { unit: '.unit[data-group="eth"]', aim: '.unit[data-group="eth"] .body',
          host: '127.0.0.1', path: '/tg/' },
};

const only = process.argv[2];
// Сколько держать курсор перед щелчком. Ноль — прогрев не успевает, и это
// наша точка отсчёта; полторы секунды — успевает целиком. Разница между двумя
// прогонами и есть ответ, работает ли прогрев.
const HOVER = process.argv[3] === undefined ? 450 : Number(process.argv[3]);
// Третьим словом «cold» — глушим предзагрузку и получаем то, как было до неё.
// Отличаем её по заголовку, которым браузер сам помечает такие запросы:
// подменять ради замера рабочий код нельзя, иначе меряешь не его.
const COLD = process.argv[4] === 'cold' || process.argv[3] === 'cold';
const names = only ? [only] : Object.keys(TARGETS);
if (only && !TARGETS[only]) {
  console.error('цели: ' + Object.keys(TARGETS).join(', '));
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const server = createServer(async (req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  // Путь, оканчивающийся на косую, — это каталог со своим index.html. Без
  // этого /tg/ отдавал 404, перехода не происходило, и мерка молча ждала его
  // сорок пять секунд.
  if (rel.endsWith('/')) rel += 'index.html';
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('no such file'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const HOME = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

function ms(v) { return (Math.round(v * 10) / 10).toString().padStart(8); }

for (const name of names) {
  const t = TARGETS[name];
  // Свой профиль на каждый прогон: общий кеш и прогретые соединения сделали бы
  // второй замер быстрее первого просто по порядку, а не по существу.
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 },
                                         reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  if (COLD) {
    await page.route('**/*', route => {
      const h = route.request().headers();
      const purpose = h['sec-purpose'] || h['purpose'] || '';
      if (purpose.includes('prefetch') || purpose.includes('prerender')) return route.abort();
      return route.continue();
    });
  }
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
    () => document.querySelectorAll('input').forEach(el => el.remove())));
  await page.addInitScript(() => { try { localStorage.setItem('rig-view', 'rig'); } catch (e) {} });
  await page.goto(HOME, { waitUntil: 'load' });
  await page.evaluate(() => document.body.classList.add('view-rig'));
  await page.waitForFunction(() => {
    const c = document.getElementById('rig').classList;
    return c.contains('lid-off') && !c.contains('service') && !c.contains('assembly')
        && !c.contains('stowing') && !c.contains('tags-off');
  }, null, { timeout: 30000 });

  // Момент ухода ловим снаружи: sessionStorage тут не годится — он свой у
  // каждого origin, а мы уходим на соседний хост, и записанное на одном на
  // другом уже не прочитать. Первая версия мерки печатала из-за этого нули.
  let leftAt = 0;
  page.on('framenavigated', f => {
    if (f === page.mainFrame() && !leftAt && !f.url().startsWith('http://127.0.0.1')) {
      leftAt = Date.now();
    }
  });

  const aim = await page.evaluate(sel => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }, t.aim || t.unit);
  await page.mouse.move(aim.x, aim.y);
  if (HOVER) await page.waitForTimeout(HOVER);

  const clicked = Date.now();
  await page.mouse.click(aim.x, aim.y);

  let nav = null;
  try {
    // Ждём опросом, а не waitForURL: когда страница показана заранее, её
    // активация выглядит для playwright как прерванная навигация
    // (ERR_ABORTED), и ожидание падает ровно в том случае, ради которого всё
    // затевалось.
    const until = Date.now() + 45000;
    for (;;) {
      const u = new URL(page.url());
      // hostname, а не host: у локального сервера в host входит порт, и
      // сравнение с «127.0.0.1» не совпадало никогда.
      if (u.hostname.endsWith(t.host) && (!t.path || u.pathname === t.path)) break;
      if (Date.now() > until) throw new Error('перехода не дождались');
      await page.waitForTimeout(50);
    }
    await page.waitForLoadState('load');
    nav = await page.evaluate(() => {
      const e = performance.getEntriesByType('navigation')[0];
      if (!e) return null;
      return {
        dns: e.domainLookupEnd - e.domainLookupStart,
        conn: e.connectEnd - e.connectStart,
        tls: e.secureConnectionStart ? e.connectEnd - e.secureConnectionStart : 0,
        wait: e.responseStart - e.requestStart,
        body: e.responseEnd - e.responseStart,
        load: e.loadEventEnd - e.startTime,
      };
    });
  } catch (e) {
    console.log(`── ${name} → ${t.host} ──\n  не дождались перехода: ${e.message.split('\n')[0]}`);
    await ctx.close();
    continue;
  }

  console.log(`── ${name} → ${t.host}${t.path || ''} · наведение ${HOVER} мс`
              + (COLD ? ' · без предзагрузки' : '') + ' ──');
  if (!nav) { console.log('  тайминги недоступны'); await ctx.close(); continue; }
  const scene = leftAt ? leftAt - clicked : 0;
  const net = nav.dns + nav.conn + nav.wait + nav.body;
  console.log(`  щелчок → уход    ${ms(scene)} мс — столько идёт сцена`);
  console.log(`  имя (dns)        ${ms(nav.dns)} мс`);
  console.log(`  соединение       ${ms(nav.conn)} мс  из них tls ${ms(nav.tls)}`);
  console.log(`  ждали ответа     ${ms(nav.wait)} мс`);
  console.log(`  тело ответа      ${ms(nav.body)} мс`);
  console.log(`  ─ сеть до байтов ${ms(net)} мс — вот это и прячется под сцену`);
  console.log(`  до load целиком  ${ms(nav.load)} мс`);
  await ctx.close();
}

await browser.close();
server.close();
