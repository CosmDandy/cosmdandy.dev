// Сцены открытия: играет ли машина пролог и тем ли кончается.
//
//   node tools/opening.mjs             все сцены
//   node tools/opening.mjs cpu         одна, с раскладкой по кадрам
//
// Рядом уже есть три мерки движения: motion.mjs снимает кадры узла,
// physics.mjs печатает характер его хода числом, anim.mjs проверяет карточку.
// Здесь проверяется то, чего нет ни в одной из них, — что между щелчком по
// узлу и уходом на его адрес происходит сцена, и что она кончается уходом.
//
// Что ломается на самом деле — и потому проверяется:
//
//   ушли молча         сцена не нашлась, и щелчок сработал как раньше:
//                      гость видит мгновенный переход вместо пролога. Это же
//                      случается, когда блок забыл объявить себя в OPENERS.
//   ушли не туда       адрес взят у подписи, а не у узла, или наоборот.
//   камера не поехала  frameOf посчитал кадр от пустого габарита, и viewBox
//                      остался прежним. На снимке это незаметно: схема просто
//                      не приблизилась, а сцена идёт своим чередом.
//   камера не вернулась после прерывания — а страница осталась стоять, и
//                      гость смотрит на кусок платы во весь экран.
//   кремний разошёлся с паспортом  ядер нарисовано не столько, сколько
//                      обещано в spec. Врать на плате нельзя ровно так же,
//                      как в консоли, — это одно и то же число.
//   раскладка разошлась с паспортом  клетки графа сняты не с тех отсеков:
//                      неделя пришла с заглушки, в которой ничего не стоит.
//   сцена не кончилась  таймер потерялся, занавес не опустился, ухода нет:
//                      узел нажали, и ничего не произошло.
//   reduced-motion     сцены не бывает вовсе, уход мгновенный. Это не
//                      украшение, от которого можно оставить половину.
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

// Сцена описывается тем, что о ней можно спросить снаружи: по какому узлу
// щёлкают, куда обязаны уйти и что должно появиться на плате по дороге.
const SCENES = {
  cpu: {
    unit: '.unit[data-group="cpu"]',
    goes: 'cv.cosmdandy.dev',
    // Кремний строится скриптом по паспорту, и число ядер обязано совпасть.
    counts: { '.cores .core': spec => spec.cpu.cores,
              '.cores .ccd-box': spec => spec.cpu.ccd },
    span: 2700,
  },
  hdd: {
    unit: '.unit[data-group="hdd"]',
    goes: 'github.com/cosmdandy',
    // counts у этой сцены нет нарочно: форма графа календарная, а не из
    // паспорта, и подписывать её «как в паспорте» значило бы соврать в
    // выводе проверки. Обе величины спрашиваем пробой, где подпись своя.
    probes: {
      'год по неделям: 53 столбца по 7 дней': {
        take: () => [document.querySelectorAll('.bay-graph .week').length,
                     document.querySelectorAll('.bay-graph .day').length],
        // Семь дней в неделе и пятьдесят три недельных столбца в году —
        // ровно столько их и на самом github. Про календарь машина ничего
        // не знает, и в паспорте этих чисел нет и быть не должно.
        want: () => [53, 53 * 7],
      },
      // Что снято с дисков — вопрос уже к паспорту: недели разложены по
      // занятым отсекам чередованием, и заглушке в этой раскладке делать
      // нечего.
      'недели разложены по занятым отсекам': {
        take: () => [...new Set([...document.querySelectorAll('.bay-graph .week')]
                        .map(w => Number(w.dataset.bay)))].sort((a, b) => a - b),
        want: spec => spec.bay.filter(b => !b.filler).map(b => b.bay),
      },
    },
    span: 2700,
  },
  dimm: {
    unit: '.unit[data-group="dimm"]',
    goes: 'blog.cosmdandy.dev',
    // Корпусов на планке столько, сколько выходит из разрядности: шина с
    // коррекцией — 72 бита, чип отдаёт восемь. Считаем так же, как сцена.
    counts: { '.bank-cells .cell': spec =>
      spec.dimm.banks[0].n * Math.round(72 / parseInt(/x(\d+)/i.exec(spec.dimm.ranks)[1], 10)) },
    span: 2700,
  },
  // Сетевые гнёзда. Все три сцены об одном — куда уходит трафик, — и потому
  // у них есть своя мерка, `lands`: камера обязана доехать до СВОЕГО
  // коммутатора. Десятигигабитная карта и гигабитная пара висят на разных
  // железках, и свести их к одной значит потерять ровно то, ради чего сцену
  // рисовали. На снимке этого не видно: оба коммутатора выглядят одинаково.
  ocp: {
    unit: '.unit[data-group="ocp"]',
    goes: 'linkedin.com/in/cosmdandy',
    // Гнёзд на морде столько же, сколько в паспорте: врать на схеме нельзя и
    // про то, чего в машине нет.
    counts: { '.sw[data-sw="sw10"] .swport':
      spec => spec.net.sw.find(w => w.id === 'sw10').ports },
    lands: 'sw10',
    escapeAt: 2400,
    span: 3200,
  },
  eth: {
    unit: '.unit[data-group="eth"]',
    goes: '/tg/',
    counts: { '.sw[data-sw="sw1"] .swport':
      spec => spec.net.sw.find(w => w.id === 'sw1').ports },
    lands: 'sw1',
    escapeAt: 2400,
    span: 3200,
  },
  tw: {
    unit: '.unit[data-group="tw"]',
    goes: 'x.com/cosmdandy',
    lands: 'sw1',
    escapeAt: 2400,
    span: 3200,
  },
};

const only = process.argv[2];
const names = only ? [only] : Object.keys(SCENES);
if (only && !SCENES[only]) {
  console.error('scenes: ' + Object.keys(SCENES).join(', '));
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
  } catch { res.writeHead(404).end('no such file'); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const URL_BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

let bad = 0;
const fail = (msg) => { bad++; console.log('  ✘ ' + msg); };
const okay = (msg) => console.log('  ✔ ' + msg);

// Машина готова к переходам не сразу: сперва она собирается, потом с неё
// сходит крышка. Спрашиваем у неё самой, а не ждём круглое число секунд.
async function fresh(reducedMotion) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 },
                                       deviceScaleFactor: 1, reducedMotion });
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
    () => document.querySelectorAll('input').forEach(el => el.remove())));
  await page.addInitScript(() => { try { localStorage.setItem('rig-view', 'rig'); } catch (e) {} });
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.evaluate(() => document.body.classList.add('view-rig'));
  // Условие то же, что у самой платы в linksLive: пока идёт самотест, узлы
  // не ссылки, и щелчок по ним не значит ничего. Ждать круглое число секунд
  // тут нельзя — сборка длится по паспорту, а не по нашему представлению.
  await page.waitForFunction(() => {
    const c = document.getElementById('rig').classList;
    return c.contains('lid-off') && !c.contains('service') && !c.contains('assembly')
        && !c.contains('stowing') && !c.contains('tags-off');
  }, null, { timeout: 30000 });
  // Уход перехватываем здесь, а не блокировкой сети: страница подменяет
  // window.open собой, и наша обёртка ложится поверх её — записываем адрес и
  // никуда не идём, иначе снимать будет уже нечего.
  await page.evaluate(() => {
    window.__left = [];
    window.open = function (href) { window.__left.push(String(href)); return null; };
  });
  return page;
}

const view = page => page.evaluate(() =>
  document.getElementById('board').getAttribute('viewBox'));

for (const name of names) {
  const sc = SCENES[name];
  console.log(`\n── ${name} ──`);
  const page = await fresh('no-preference');
  const spec = await page.evaluate(() => JSON.parse(document.getElementById('rig-spec').textContent));

  const has = await page.$(sc.unit);
  if (!has) { fail(`узла ${sc.unit} нет на плате`); await page.close(); continue; }

  const view0 = await view(page);
  await page.evaluate(sel => document.querySelector(sel)
    .dispatchEvent(new MouseEvent('click', { bubbles: true })), sc.unit);

  // Сразу после щелчка уход ещё не должен состояться: между ними сцена.
  await page.waitForTimeout(140);
  const early = await page.evaluate(() => window.__left.slice());
  if (early.length) fail(`ушли сразу, без сцены: ${early[0]}`);
  else okay('щелчок не уводит сразу — идёт сцена');

  const opening = await page.evaluate(() =>
    document.getElementById('rig').classList.contains('opening'));
  if (!opening) fail('класс opening не встал: пролога нет'); else okay('плата отмечена как занятая');

  // Камера. Смотрим не «изменился ли viewBox», а пришёл ли он к габариту узла:
  // кадр обязан накрыть его и быть заметно уже прежнего.
  await page.waitForTimeout(1400);
  const view1 = await view(page);
  if (view1 === view0) fail('камера не поехала: viewBox прежний');
  else {
    const [, , w0] = view0.trim().split(/\s+/).map(Number);
    const [x, y, w, h] = view1.trim().split(/\s+/).map(Number);
    const box = await page.evaluate(sel => {
      const b = document.querySelector(sel).getBBox();
      return [b.x, b.y, b.width, b.height];
    }, sc.unit);
    const inside = box[0] > x - w && box[0] < x + w && box[1] > y - h && box[1] < y + h;
    if (w >= w0) fail(`камера не приблизилась: ${w.toFixed(0)} против ${w0.toFixed(0)}`);
    else if (!inside) fail(`кадр мимо узла: ${view1} против габарита ${box.map(Math.round).join(' ')}`);
    else okay(`камера навелась: ${w0.toFixed(0)} → ${w.toFixed(0)} единиц ширины`);
  }

  for (const [sel, want] of Object.entries(sc.counts || {})) {
    const n = await page.$$eval(sel, els => els.length).catch(() => 0);
    const need = want(spec);
    if (n !== need) fail(`${sel}: ${n}, а в паспорте ${need}`);
    else okay(`${sel}: ${n} — как в паспорте`);
  }

  // Не всё, что сцена обязана взять из паспорта, считается фигурами. Проба
  // снимает со страницы одно значение и сверяет его с тем, что обещано:
  // раскладку недель по отсекам счётом квадратов не выразить.
  for (const [what, probe] of Object.entries(sc.probes || {})) {
    const got = await page.evaluate(probe.take);
    const need = probe.want(spec);
    if (JSON.stringify(got) !== JSON.stringify(need)) {
      fail(`${what}: ${JSON.stringify(got)}, а в паспорте ${JSON.stringify(need)}`);
    } else okay(`${what}: ${JSON.stringify(got)}`);
  }

  // Кончается ли сцена уходом, и туда ли.
  await page.waitForTimeout(sc.span);
  const left = await page.evaluate(() => window.__left.slice());
  if (!left.length) fail('сцена не кончилась уходом');
  else if (!left[0].includes(sc.goes)) fail(`ушли не туда: ${left[0]}, ждали ${sc.goes}`);
  else okay(`ушли на ${sc.goes}`);

  // Куда доехала камера. Мерка своя, потому что общая её не ловит: «кадр стал
  // уже» и «кадр накрыл узел» одинаково верны и для того коммутатора, и для
  // соседнего. Спрашиваем прямо — середина нужной железки обязана оказаться
  // внутри кадра, а отмеченной сценой обязана быть она одна.
  if (sc.lands) {
    const box = await page.evaluate(id => {
      const e = document.querySelector(`.sw[data-sw="${id}"]`);
      if (!e) return null;
      const b = e.getBBox();
      return [b.x + b.width / 2, b.y + b.height / 2];
    }, sc.lands);
    if (!box) fail(`коммутатора ${sc.lands} нет на схеме`);
    else {
      const [x, y, w, h] = (await view(page)).trim().split(/\s+/).map(Number);
      const inside = box[0] > x && box[0] < x + w && box[1] > y && box[1] < y + h;
      if (!inside) fail(`камера не доехала до ${sc.lands}: кадр ${x.toFixed(0)} `
                        + `${y.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`);
      else okay(`камера доехала до ${sc.lands}`);
    }
    // И горит при этом ровно один коммутатор. Зажечь оба — то же враньё, что
    // лампа линка на обесточенной машине: путь трафика на схеме один.
    const lit = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.sw.scene')).map(e => e.dataset.sw));
    if (lit.length !== 1 || lit[0] !== sc.lands)
      fail(`отмечены коммутаторы [${lit}], а ждали один ${sc.lands}`);
    else okay(`горит один коммутатор — ${sc.lands}`);
  }
  await page.close();

  // Прерывание: escape уводит немедленно и возвращает камеру на место.
  const p2 = await fresh('no-preference');
  const base = await view(p2);
  await p2.evaluate(sel => document.querySelector(sel)
    .dispatchEvent(new MouseEvent('click', { bubbles: true })), sc.unit);
  // Когда жать escape. У сетевых сцен шкаф показывается поздно, и на
  // общих девятистах миллисекундах прерывать было бы нечего: проверка
  // всегда попадала бы в момент, когда шкафа ещё нет.
  await p2.waitForTimeout(sc.escapeAt || 900);
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(120);
  const after = await p2.evaluate(() => ({
    left: window.__left.slice(),
    opening: document.getElementById('rig').classList.contains('opening'),
  }));
  // Кадр сравниваем числами, а не строкой: возврат пишет viewBox через
  // toFixed, и «1546» против «1546.0» — это одно и то же окно.
  const same = (a, b) => {
    const p = a.trim().split(/\s+/).map(Number), q = b.trim().split(/\s+/).map(Number);
    return p.every((v, i) => Math.abs(v - q[i]) < 0.5);
  };
  if (!after.left.length) fail('escape не увёл');
  else if (after.opening) fail('escape увёл, но плата осталась занятой');
  else if (!same(await view(p2), base)) fail('escape увёл, но камера осталась наехавшей');
  else okay('escape прерывает: уход сразу, камера на месте');

  // И ничего не осталось догорать. Камера вернулась тем же кадром, а всё, что
  // сцена рисовала выше рамки, эти полсекунды лежало бы поверх страницы: у
  // схемы overflow: visible, и за рамкой ничего не отсекается.
  if (sc.lands) {
    const ghost = await p2.evaluate(() => {
      const r = document.querySelector('.rack');
      if (!r) return null;
      const cs = getComputedStyle(r);
      return { vis: cs.visibility, op: cs.opacity };
    });
    if (!ghost) fail('шкафа нет на схеме вовсе');
    else if (ghost.vis !== 'hidden' || Number(ghost.op) > 0.01)
      fail(`после escape шкаф ещё виден: ${ghost.vis} / ${ghost.op}`);
    else okay('после escape шкаф погашен сразу');
  }
  await p2.close();

  // На prefers-reduced-motion сцены нет вовсе.
  const p3 = await fresh('reduce');
  await p3.evaluate(sel => document.querySelector(sel)
    .dispatchEvent(new MouseEvent('click', { bubbles: true })), sc.unit);
  await p3.waitForTimeout(120);
  const rm = await p3.evaluate(() => window.__left.slice());
  if (!rm.length) fail('reduced-motion: не ушли вовсе');
  else if (!rm[0].includes(sc.goes)) fail(`reduced-motion: ушли не туда — ${rm[0]}`);
  else okay('reduced-motion: уход сразу, без сцены');
  await p3.close();
}

// Подпись-выноска ведёт туда же, куда её узел, и обязана играть ту же сцену.
{
  console.log('\n── выноски ──');
  const page = await fresh('no-preference');
  for (const name of names) {
    const sc = SCENES[name];
    const group = /data-group="([^"]+)"/.exec(sc.unit)[1];
    const co = await page.$(`a.callout[data-for="${group}"]`);
    if (!co) { fail(`выноски для ${group} нет`); continue; }
    await page.evaluate(g => {
      window.__left = [];
      document.querySelector(`a.callout[data-for="${g}"]`)
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, group);
    await page.waitForTimeout(140);
    const st = await page.evaluate(() => ({
      left: window.__left.slice(),
      opening: document.getElementById('rig').classList.contains('opening'),
    }));
    if (st.left.length) fail(`${group}: выноска ушла сразу, мимо сцены`);
    else if (!st.opening) fail(`${group}: выноска не завела сцену`);
    else okay(`${group}: выноска играет ту же сцену`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }
  await page.close();
}

await browser.close();
server.close();
console.log(bad ? `\nпровалов: ${bad}` : '\nвсё на месте');
process.exit(bad ? 1 : 0);
