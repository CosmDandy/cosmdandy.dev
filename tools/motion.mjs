// Покадровая съёмка движения: что на самом деле происходит между двумя
// состояниями узла.
//
//   node tools/motion.mjs heatsink     снять и вернуть радиатор
//   node tools/motion.mjs drive        вынуть и вставить диск
//   node tools/motion.mjs dimm         вынуть планку памяти
//   node tools/motion.mjs service      вход в сервисный режим
//
// Печатает ленту замеров: время от клика, вычисленный transform узла и его
// экранная координата. Плавное движение видно по ряду промежуточных
// значений; рывок — это два кадра, между которыми всё уже случилось.
// Кадры складываются в tools/motion/<сцена>-NN.png, чтобы посмотреть глазами.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'tools/motion');

const PW_DIRS = ['/workspaces/.pw/', ROOT + '/'];
let chromium;
for (const dir of PW_DIRS) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* дальше */ }
}
if (!chromium) { console.error('нет playwright'); process.exit(1); }
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
if (!CHROME) { console.error('не нашёл chromium в /nix/store'); process.exit(1); }

// Сцены: за чем следим, по чему кликаем и сколько ждать.
const SCENES = {
  heatsink: { watch: '.cpu-slot .heatsink', click: '.cpu-slot', shots: 3, span: 900 },
  cpu:      { watch: '.cpu-slot .cpu-lid',  click: '.cpu-slot', shots: 3, span: 900 },
  drive:    { watch: '.bay .pick-body',     click: '.bay',      shots: 3, span: 900 },
  dimm:     { watch: '.dimm .pick-body',    click: '.dimm',     shots: 1, span: 900 },
  fan:      { watch: '.fan .pick-body',     click: '.fan',      shots: 1, span: 900 },
  handle:   { watch: '.bay .bay-handle',    click: '.bay',      shots: 3, span: 900 },
  service:  { watch: '.stage',              click: '#svc-switch', shots: 0, span: 1100, plain: true },
  // Сборка идёт сама при первом заходе: кликать нечего, смотрим ленту целиком.
  assembly: { assembly: true },
};

const name = process.argv[2] ?? 'heatsink';
const scene = SCENES[name];
if (!scene) {
  console.error('сцены: ' + Object.keys(SCENES).join(', '));
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('нет такого файла'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// Headless Chromium по умолчанию отвечает «reduce» на prefers-reduced-motion,
// а в схеме под этот запрос стоит правило, гасящее все переходы. Без явного
// no-preference инструмент показывал бы рывок там, где его нет.
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1,
                                     reducedMotion: 'no-preference' });
await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
  () => document.querySelectorAll('input').forEach(el => el.remove())));
// Первый заход: состояние машины лежит в localStorage, и со второго раза
// сборки уже не будет. Для сцены сборки чистим его до загрузки страницы.
if (scene.assembly) await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
await page.addInitScript(() => { try { localStorage.setItem('rig-view', 'rig'); } catch (e) {} });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load' });
await page.evaluate(() => document.body.classList.add('view-rig'));
if (scene.assembly) {
  // Считаем, сколько узлов уже на месте: узел сел, когда его анимация
  // закончилась и он перестал быть прозрачным.
  const t0 = Date.now();
  for (let i = 0; i <= 26; i++) {
    while (Date.now() - t0 < i * 420) await page.waitForTimeout(6);
    const st = await page.evaluate(() => {
      const seated = sel => [...document.querySelectorAll(sel)]
        .filter(el => parseFloat(getComputedStyle(el).opacity) > 0.5).length;
      const rig = document.getElementById('rig');
      // Смотрим на то, что действительно садится: разъёмы и карманы остаются
      // на плате, летят только модули.
      return { fan: seated('.fan'), psu: seated('.psu'), cpu: seated('.cpu-slot .heatsink'),
               dimm: seated('.dimm .pick-body'), riser: seated('.riser'), bay: seated('.bay'),
               крышка: rig.classList.contains('lid-off') ? 'снята' : 'на месте',
               сборка: rig.classList.contains('assembly') ? 'идёт' : 'закончена',
               питание: ['init', 'standby', 'on'].find(c => rig.classList.contains(c)) ?? '—' };
    });
    console.log(String(Math.round((Date.now() - t0) / 100) / 10).padStart(5) + ' с  ' +
      `вент ${st.fan}/8  бп ${st.psu}/2  цп ${st.cpu}/2  память ${String(st.dimm).padStart(2)}/24  ` +
      `райзер ${st.riser}/2  диски ${st.bay}/7  крышка ${st.крышка}  ${st.сборка}  питание ${st.питание}`);
    await page.screenshot({ path: join(OUT, `assembly-${String(i).padStart(2, '0')}.png`) });
  }
  console.log(`\nкадры: ${OUT}`);
  await browser.close();
  server.close();
  process.exit(0);
}
await page.waitForTimeout(1800);
if (!scene.plain) {
  await page.evaluate(() => document.getElementById('svc-switch')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(1000);
}

// Клик шлём событием прямо в узел: мышью в наклонённую сцену попасть можно,
// но поверх узлов лежат зоны захвата соседей, и координатный клик уходит не
// туда. Обработчик всё равно висит выше и смотрит на цель события.
const clip = await page.evaluate(sel => {
  const b = document.querySelector(sel).getBoundingClientRect();
  return { x: Math.max(0, b.x - 90), y: Math.max(0, b.y - 90),
           width: Math.min(520, innerWidth - b.x + 90), height: Math.min(460, innerHeight - b.y + 90) };
}, scene.watch);

/** Одна серия: клик и лента замеров через равные промежутки. */
async function series(tag) {
  const t0 = Date.now();
  await page.evaluate(sel => document.querySelector(sel)
    .dispatchEvent(new MouseEvent('click', { bubbles: true })), scene.click);
  const rows = [];
  for (let i = 0; i <= 12; i++) {
    const at = Math.round((scene.span / 12) * i);
    while (Date.now() - t0 < at) await page.waitForTimeout(4);
    const m = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      // Заодно смотрим, какой переход на узле объявлен: чаще всего рывок
      // означает не кривую, а чужое правило, затёршее transform шорткатом.
      return { tr: cs.transform, y: Math.round(b.y), x: Math.round(b.x),
               переход: cs.transitionProperty + ' / ' + cs.transitionDuration };
    }, scene.watch);
    m.cls = await page.evaluate(sel => document.querySelector(sel).closest('.pick')?.getAttribute('class') ?? '—', scene.watch);
    rows.push({ мс: Date.now() - t0, ...m });
    await page.screenshot({ path: join(OUT, `${name}-${tag}-${String(i).padStart(2, '0')}.png`), clip });
  }
  const num = t => {
    const m = /matrix.*\(([^)]+)\)/.exec(t);
    return m ? m[1].split(',').map(v => Math.round(parseFloat(v) * 100) / 100).join(' ') : t;
  };
  console.log(`\n── ${name} · ${tag} ── переход: ${rows[0].переход}`);
  for (const r of rows) console.log(`${String(r.мс).padStart(4)} мс  y=${String(r.y).padStart(4)}  ${num(r.tr)}   [${r.cls}]`);
  const uniq = new Set(rows.map(r => r.x + ':' + r.y));
  const same = rows[0].tr === rows[rows.length - 1].tr;
  console.log(uniq.size > 2 ? `движение плавное: ${uniq.size} различных положений из ${rows.length} замеров`
    : same ? 'узел не двигался — на этом шаге снимают не его'
    : `РЫВОК: за всё движение узел принял ${uniq.size} положения — переход не идёт`);
}

for (let k = 0; k < Math.max(1, scene.shots); k++) {
  await series(k === 0 ? 'клик 1' : `клик ${k + 1}`);
  await page.waitForTimeout(400);
}

console.log(`\nкадры: ${OUT}`);
await browser.close();
server.close();
