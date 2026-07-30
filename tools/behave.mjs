// Проверка поведения: то, что визуальная сверка не видит.
//
//   node tools/behave.mjs
//
// Пиксели показывают, как машина выглядит; здесь проверяется, что она делает.
// Разрез JS по блокам меняет порядок кода, а порядок кода меняет поведение —
// без этого теста поломку заметил бы только человек, кликнувший узел.
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
  } catch { res.writeHead(404).end('нет'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// поле ввода роняет рендерер этой сборки chromium
await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.body.classList.add('view-rig'));
await page.waitForTimeout(900);

const results = [];
const check = (name, ok, got) => results.push([name, ok, got]);

// helpers внутри страницы
const click = sel => page.evaluate(s => document
  .querySelector(s)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel);
const cls = sel => page.evaluate(s => document.querySelector(s)?.className?.baseVal
  ?? document.querySelector(s)?.className ?? '', sel);
const logText = () => page.evaluate(() => document.getElementById('log')?.textContent ?? '');
const rigCls = () => page.evaluate(() => document.getElementById('rig').className);

// 0. Сборка. Первый заход показывает пустое шасси и ставит узлы по одному:
// вентиляторы и блоки питания, процессоры, память по каналам, райзеры,
// диски. Проверяем, что она заканчивается сама и не оставляет ни одного
// узла за бортом — молча потерянный узел выглядит как «так и было».
check('дежурный режим', (await rigCls()).includes('standby') || (await rigCls()).includes('init'),
      await rigCls());
await page.waitForFunction(
  () => !document.getElementById('rig').classList.contains('assembly'), null, { timeout: 20000 }
).catch(() => {});
check('сборка завершилась', !(await rigCls()).includes('assembly'), await rigCls());
const seated = await page.evaluate(() => {
  const vis = sel => [...document.querySelectorAll(sel)]
    .filter(el => parseFloat(getComputedStyle(el).opacity) > 0.5).length;
  return { вент: vis('.fan'), бп: vis('.psu'), цп: vis('.cpu-slot .heatsink'),
           память: vis('.dimm .pick-body'), райзер: vis('.riser'), диски: vis('.bay') };
});
// Числа берём из паспорта, а не пишем в тесте: иначе он ловит не поломку
// сборки, а то, что железо в машине поменяли — и падает по ложному поводу.
const passport = await page.evaluate(() => {
  try { return JSON.parse(document.getElementById('rig-spec').textContent); } catch (e) { return null; }
});
check('все узлы сели на места',
      !!passport && seated.вент === passport.fan.n && seated.бп === passport.psu.n
      && seated.цп === passport.cpu.n && seated.память === passport.dimm.slots
      && seated.райзер === passport.riser.length
      && seated.диски === passport.bay.filter(b => !b.filler).length,
      JSON.stringify(seated));

// 0б. Кнопка пересборки: сборку можно посмотреть ещё раз, не чистя историю.
await click('#assemble-btn');
await page.waitForTimeout(200);
check('кнопка запускает пересборку', (await rigCls()).includes('assembly'), await rigCls());
await page.waitForFunction(
  () => !document.getElementById('rig').classList.contains('assembly'), null, { timeout: 20000 }
).catch(() => {});
check('пересборка завершилась', !(await rigCls()).includes('assembly'), await rigCls());

// 1. Питание. Собранная машина стартует сама — сборка кончилась, значит её
// можно включать. Дальше кнопка работает как обычно: выключает и включает.
await page.waitForFunction(
  () => document.getElementById('rig').classList.contains('on'), null, { timeout: 15000 }
).catch(() => {});
check('машина стартовала после сборки', (await rigCls()).includes('on'), await rigCls());
await click('#power');
await page.waitForTimeout(300);
check('кнопка выключает', (await rigCls()).includes('standby'), await rigCls());
await click('#power');
await page.waitForFunction(
  () => document.getElementById('rig').classList.contains('on'), null, { timeout: 15000 }
).catch(() => {});
check('машина включилась', (await rigCls()).includes('on'), await rigCls());

// 2. Сервисный режим включается тумблером
await click('#svc-switch');
await page.waitForTimeout(300);
check('сервисный режим', (await rigCls()).includes('service'), await rigCls());

// 3. Вентилятор вынимается и пишется в лог
await click('.fan');
await page.waitForTimeout(200);
check('вентилятор вынут', (await cls('.fan')).includes('pulled'), await cls('.fan'));
check('в логе строка про fan', (await logText()).includes('fan'), '');

// 4. Планка памяти
await click('.dimm');
await page.waitForTimeout(200);
check('планка вынута', (await cls('.dimm')).includes('pulled'), await cls('.dimm'));

// 5. Процессор — три клика: радиатор, процессор, обратно
await click('.cpu-slot');
await page.waitForTimeout(150);
check('снят радиатор', (await cls('.cpu-slot')).includes('pulled'), await cls('.cpu-slot'));
await click('.cpu-slot');
await page.waitForTimeout(150);
check('снят процессор', (await cls('.cpu-slot')).includes('opened'), await cls('.cpu-slot'));
await click('.cpu-slot');
await page.waitForTimeout(150);
check('процессор на месте', !(await cls('.cpu-slot')).includes('pulled'), await cls('.cpu-slot'));

// 5b. Диск — три клика: защёлка, каддик наружу, обратно. Ручка каддика
// отдельная деталь, и порядок обязан быть именно таким: пока защёлка не
// откинута, диск из корзины не идёт.
await click('.bay');
await page.waitForTimeout(150);
check('защёлка диска откинута', (await cls('.bay')).includes('unlatched'), await cls('.bay'));
check('диск ещё в корзине', !(await cls('.bay')).includes('pulled'), await cls('.bay'));
await click('.bay');
await page.waitForTimeout(150);
check('диск вынут', (await cls('.bay')).includes('pulled'), await cls('.bay'));
await click('.bay');
await page.waitForTimeout(150);
check('диск на месте', !(await cls('.bay')).includes('unlatched'), await cls('.bay'));

// 5a. Имена узлов в логе: их даёт реестр, куда каждый блок вписал себя сам.
// Разъехавшееся имя — самая незаметная поломка разреза: всё работает, но
// машина начинает называть свои части иначе.
await page.evaluate(() => { document.getElementById('log').textContent = ''; });
const names = await page.evaluate(() => {
  const out = {};
  for (const sel of ['.fan', '.dimm', '.bay', '.riser', '.psu']) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = 'нет узла'; continue; }
    const was = document.getElementById('log').children.length;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    out[sel] = [...document.getElementById('log').children].slice(was)
      .map(d => d.textContent).join(' ');
  }
  return out;
});
const EXPECT = { '.fan': /fan \d/, '.dimm': /dimm [LCR]\d/, '.bay': /hdd\d/,
  '.riser': /riser \d/, '.psu': /psu-\d/ };
for (const [sel, re] of Object.entries(EXPECT)) {
  check(`имя узла ${sel}`, re.test(names[sel] ?? ''), names[sel]);
}

// 6. Панель диагностики сама не выезжает — места она занимает много, а
// нужна не всегда. Но по команде обязана открываться.
check('light path сам не открылся', !(await rigCls()).includes('lp-open'), await rigCls());
await page.evaluate(() => window.__rig.exec('lightpath'));
await page.waitForTimeout(200);
check('light path открылся по команде', (await rigCls()).includes('lp-open'), await rigCls());
await page.evaluate(() => window.__rig.exec('lightpath'));
await page.waitForTimeout(200);

// 7. Выход из сервисного режима собирает машину обратно
await click('#svc-switch');
await page.waitForTimeout(300);
const stillPulled = await page.evaluate(() => document.querySelectorAll('.pulled').length);
check('узлы вернулись на место', stillPulled === 0, `осталось ${stillPulled}`);

// 8. Партномер ведёт на коммит
const stamp = await page.evaluate(() => {
  const a = document.querySelector('a.stamp');
  return { href: a?.getAttribute('href') ?? '', sha: a?.dataset.sha ?? '' };
});
check('партномер ссылается на свой коммит',
  stamp.href.includes('/commit/' + stamp.sha) && stamp.sha.length === 7, stamp.sha);

// 9. Паспорт машины. Он печатается генератором в страницу и обязан сходиться
// со схемой: если в нём двадцать четыре планки, а нарисовано двадцать три,
// врать начнёт каждая команда разом.
const spec = await page.evaluate(() => {
  try { return JSON.parse(document.getElementById('rig-spec').textContent); } catch (e) { return null; }
});
check('паспорт разбирается', !!spec && !!spec.cpu, spec ? 'есть' : 'нет');
const drawn = await page.evaluate(() => ({
  dimm: document.querySelectorAll('[data-dimm]').length,
  fan: document.querySelectorAll('[data-fan]').length,
  bay: document.querySelectorAll('.unit.pick.bay').length,
  psu: document.querySelectorAll('[data-psu]').length,
  cpu: document.querySelectorAll('[data-cpu]').length,
}));
check('паспорт сходится со схемой',
  spec && drawn.dimm === spec.dimm.slots && drawn.fan === spec.fan.n
  && drawn.psu === spec.psu.n && drawn.cpu === spec.cpu.n
  && drawn.bay === spec.bay.filter(b => !b.filler).length,
  JSON.stringify(drawn));

// 10. Команды считают по схеме, а не по памяти. Раньше dimm обещал тридцать
// две планки при двадцати четырёх, а nvme list не смотрел на корзину вовсе.
const run = s => page.evaluate(cmd => (window.__rig.exec(cmd) || []).map(r => r.t).join('\n'), s);
check('терминал отвечает', (await run('help')).includes('ОБОЛОЧКА'), 'help');
check('dimm печатает 24 из 24', (await run('dimm')).includes('24 of 24'), await run('dimm'));
check('nvme перечисляет семь дисков',
  (await run('nvme list')).split('\n').length === spec.bay.filter(b => !b.filler).length, 'nvme');
const fansOut = await run('fans');
check('в стенке нет выдуманного пустого места', !fansOut.includes('empty'), fansOut.split('\n')[5]);
check('fru берёт ревизию из платы',
  (await run('fru')).includes('Serial Number  : ' + spec.board.sha), 'fru');

// 11. Вынутый узел меняет вывод: команда обязана смотреть на схему в момент
// вызова, а не печатать состав из паспорта.
await click('#svc-switch');
await page.waitForTimeout(200);
await click('.dimm');
await page.waitForTimeout(400);
check('вынутая планка видна в dimm', (await run('dimm')).includes('23 of 24'), await run('dimm'));
await click('#svc-switch');
await page.waitForTimeout(400);

// 12. Дополнение по Tab: кандидаты берутся из реестра, а не из отдельного
// списка — иначе справка и дополнение расходятся с набором команд.
const comp = await page.evaluate(() => window.__rig.complete('sen'));
check('Tab дополняет команду', comp.length === 1 && comp[0] === 'sensors', comp.join(','));

// 13. Полноэкранный слой. Он должен подниматься сам при включении питания
// (самотест), пускать в setup по F2 и не оставлять схему считать анимации,
// пока её всё равно не видно.
const crt = () => page.evaluate(() => ({
  open: !!document.getElementById('crt')?.open,
  mode: document.getElementById('crt')?.dataset.mode ?? '',
  dormant: document.getElementById('rig').classList.contains('dormant'),
}));
await page.evaluate(() => window.__rig.exec('power off'));
await page.waitForTimeout(700);
await page.evaluate(() => window.__rig.exec('power on'));
await page.waitForTimeout(1600);
const post = await crt();
check('самотест поднимает экран', post.open && post.mode === 'post', JSON.stringify(post));
check('под открытым слоем схема на паузе', post.dormant, String(post.dormant));
check('строки самотеста идут и в консоль', (await logText()).includes('Memory Training'), 'лог');

// 14. Enter из самотеста ведёт в setup. F2 работает наравне, но на маке
// верхний ряд отдан яркости, и до страницы клавиша не доходит.
await page.keyboard.press('Enter');
await page.waitForTimeout(4200);
check('Enter открывает setup', (await crt()).mode === 'setup', JSON.stringify(await crt()));

// 15. Esc выходит без сохранения, F10 сохраняет. Разные ключи хранилища:
// прошивку правят редко, а питание щёлкают каждый раз.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check('Esc закрывает setup', !(await crt()).open, JSON.stringify(await crt()));

// 16. top показывает те же метрики, что были в приборах, и уходит по q.
await page.evaluate(() => window.__rig.exec('top'));
await page.waitForTimeout(600);
check('top открывает экран', (await crt()).mode === 'top', JSON.stringify(await crt()));
await page.keyboard.press('q');
await page.waitForTimeout(400);
check('q закрывает top', !(await crt()).open, JSON.stringify(await crt()));

// 16б. В каждом режиме видна ровно одна панель. Панели переключаются
// атрибутом hidden, а у каждой свой display — правило браузера для [hidden]
// ему проигрывает, и все три показывались разом, тремя окнами внахлёст.
await page.evaluate(() => window.__rig.exec('bios'));
await page.waitForTimeout(400);
const shown = await page.evaluate(() => ['.crt-post', '.crt-setup', '.crt-top']
  .filter(s => getComputedStyle(document.querySelector(s)).display !== 'none'));
check('в setup видна одна панель', shown.length === 1 && shown[0] === '.crt-setup', shown.join(','));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 17. Приборов в боковой колонке больше нет — их место заняла консоль.
const gauges = await page.evaluate(() => document.querySelectorAll('.gauge').length);
check('приборы удалены', gauges === 0, String(gauges));

// 18. Конвейер и файловая система: команда отдаёт строки, фильтр их режет.
check('конвейер фильтрует',
  (await run('fans | grep FAN2')).split('\n').length === 1, await run('fans | grep FAN2'));
check('wc считает строки', (await run('fans | wc -l')).trim().endsWith(String(spec.fan.n)),
  await run('fans | wc -l'));
check('/proc/cpuinfo знает про ядра',
  (await run('cat /proc/cpuinfo | grep "model name" | wc -l')).trim()
    .endsWith(String(spec.cpu.cores * spec.cpu.n * 2)), await run('cat /proc/cpuinfo | grep "model name" | wc -l'));

const failed = results.filter(r => !r[1]);
for (const [name, ok, got] of results) console.log(`  ${ok ? '·' : 'СЛОМАНО'} ${name}${ok ? '' : ` → ${got}`}`);
if (errors.length) console.log(`  ОШИБКИ: ${errors.slice(0, 2).join(' | ')}`);
console.log(failed.length || errors.length
  ? `провалено: ${failed.length}, ошибок: ${errors.length}` : 'поведение в порядке');

await browser.close();
server.close();
process.exit(failed.length || errors.length ? 1 : 0);
