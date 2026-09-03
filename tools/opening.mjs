// Сцены открытия: играет ли машина пролог и тем ли кончается.
//
//   node tools/opening.mjs             все сцены
//   node tools/opening.mjs cpu         одна
//
// Рядом уже есть две мерки движения: motion.mjs снимает кадры узла, а
// physics.mjs печатает характер его хода числом.
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
    // Куда наводить курсор: середина всего узла приходится на подписи и лампы,
    // а человек целится в саму крышку.
    aim: '.cpu-slot .ihs',
    // Когда жать escape. По умолчанию 900 мс — ровно тот миг, когда камера
    // процессора только трогается, и viewBox ещё равен исходному. Сравнение
    // «камера вернулась» на нём проходило бы даже если возврат вовсе убрать:
    // проверка, которая не может провалиться, бесполезна.
    escapeAt: 1400,
    goes: 'cv.cosmdandy.dev',
    shows: { sel: '.cores', held: 900 },
    // Радиатор обязан уехать, и уехать на глазах. Мерка появилась не от
    // хорошей жизни: сцена проходила все прежние проверки — класс вставал,
    // правило подходило, адрес был верный, — а деталь со стороны стояла.
    // Триста миллисекунд её держал занятый главный поток, а остаток пути она
    // проделывала уже за краем кадра, вместе с наездом камеры. Ни одна мерка
    // этого не видела: все спрашивали про состояние, ни одна — про движение.
    //
    // Мерить надо собственный transform детали, а не её место на экране:
    // экранное место растёт и от наезда, и такой мерке довольно камеры, чтобы
    // отчитаться об успехе, пока деталь стоит.
    moves: {
      sel: '.cpu-slot .heatsink',
      // Тронуться не позже: столько занимает первый кадр перехода.
      startsBy: 260,
      // И пройти почти весь путь до того, как тронется камера, — иначе
      // движение уедет за границу кадра и его никто не увидит.
      doneAtCamera: 0.9,
    },
    // Кремний строится скриптом по паспорту, и число ядер обязано совпасть.
    counts: { '.cores .core': spec => spec.cpu.cores,
              '.cores .ccd-box': spec => spec.cpu.ccd },
    span: 2700,
  },
  hdd: {
    unit: '.unit[data-group="hdd"]',
    goes: 'github.com/cosmdandy',
    shows: { sel: '.bay-graph', held: 900 },
    // counts у этой сцены нет нарочно: заливка не календарь, и клетки в ней
    // считать незачем — их число зависит от размера окна, а не от паспорта.
    // Спрашиваем то, ради чего сцена и переделывалась.
    probes: {
      // Залито до краёв. Ровно эта жалоба и была: «не на весь экран, по бокам
      // явные рамки» — заливка жила внутри схемы, а у схемы есть поля. Смотрим
      // угол окна: там обязан быть холст, а не страница под ним.
      'заливка дошла до углов окна': {
        take: () => {
          const cv = document.querySelector('canvas.bay-graph');
          if (!cv || !cv.getContext) return ['холста нет'];
          const g = cv.getContext('2d');
          const corners = [[4, 4], [cv.width - 6, 4], [4, cv.height - 6],
                           [cv.width - 6, cv.height - 6]];
          // Прозрачный угол значит, что туда заливка не дошла: холст очищен, и
          // сквозь него видно машину.
          return [corners.filter(c => g.getImageData(c[0], c[1], 1, 1).data[3] > 200).length];
        },
        want: () => [4],
      },
    },
    span: 2700,
  },
  dimm: {
    unit: '.unit[data-group="dimm"]',
    goes: 'blog.cosmdandy.dev',
    shows: { sel: '.bank-cells', held: 900 },
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
    shows: { sel: '.sw[data-sw="sw10"]', held: 700 },
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
    shows: { sel: '.sw[data-sw="sw1"]', held: 700 },
    counts: { '.sw[data-sw="sw1"] .swport':
      spec => spec.net.sw.find(w => w.id === 'sw1').ports },
    lands: 'sw1',
    escapeAt: 2400,
    span: 3200,
  },
  tw: {
    unit: '.unit[data-group="tw"]',
    goes: 'x.com/cosmdandy',
    shows: { sel: '.sw[data-sw="sw1"]', held: 700 },
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
  const clickedAt0 = Date.now();
  // Наводим курсор и щёлкаем мышью по координатам, а не шлём событие в узел.
  // Разница не формальная: под курсором работает :hover, и его правила спорят
  // со сценическими при равной силе. Ровно на этом сцена процессора и стояла —
  // событие в элемент курсор не наводит, и проверка честно видела движение
  // там, где человек видел неподвижную деталь. Пять раз подряд.
  const aim = await page.evaluate(sel => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  }, sc.aim || sc.unit);
  await page.mouse.move(aim.x, aim.y);
  // С запасом: на наведении сцена строит своё тяжёлое, и щелчок в упор
  // приходится в занятый главный поток. Человек так и водит мышью — сперва
  // наводит, потом жмёт.
  await page.waitForTimeout(450);

  // Трек заводим здесь, а не раньше: до наведения того, что показывает сцена,
  // в разметке ещё нет, и трек каждый кадр обыскивал бы весь документ впустую.
  // Он же и тормозил старт детали — мерка снова мешала измеряемому.
  // Дорожка движения: снимаем собственный сдвиг детали и кадр схемы подряд,
  // чтобы потом сказать, когда тронулась деталь и когда — камера.
  if (sc.moves || sc.shows) {
    await page.evaluate(o => {
      const board = document.getElementById('board');
      const moved = o.moves ? document.querySelector(o.moves.sel) : null;
      // Сдвиг берём собственный, из transform детали, а не её место на экране:
      // экранное место растёт и от наезда камеры, и такой мерке довольно
      // камеры, чтобы отчитаться об успехе над неподвижной деталью.
      const shift = () => {
        if (!moved) return 0;
        const n = /matrix\(([^)]+)\)/.exec(getComputedStyle(moved).transform);
        return n ? Math.abs(parseFloat(n[1].split(',')[4])) : 0;
      };
      // Видимость — то, что решает глаз: прозрачность вместе с visibility, и у
      // всех предков тоже. Своя единица не спасает, если группа над тобой
      // погашена, а именно так эти сцены и устроены.
      // Цепочку предков собираем один раз — но лениво, при первом появлении
      // элемента: то, что показывают сцены, строится скриптом уже по ходу дела,
      // и собранная заранее цепочка вышла бы пустой. На этом мерка показа и
      // отчиталась, что кристаллы не видны ни одной миллисекунды.
      let chain = null;
      const links = () => {
        if (chain) return chain;
        const el = o.shows ? document.querySelector(o.shows.sel) : null;
        if (!el) return null;
        chain = [];
        for (let n = el; n && n.nodeType === 1; n = n.parentNode) chain.push(n);
        return chain;
      };
      // И считаем видимость не каждый кадр, а раз в полсотни миллисекунд.
      // Мерка обязана мешать измеряемому как можно меньше: с обходом на каждом
      // кадре она отъедала первые кадры сцены и показывала, что деталь
      // трогается на сто миллисекунд позже, чем на самом деле. Проверка,
      // меняющая то, что меряет, — это не проверка.
      let seenAt = -1e9, seenVal = 0;
      const seen = now => {
        const c = links();
        if (!c || !c.length) return 0;
        if (now - seenAt < 50) return seenVal;
        seenAt = now;
        let k = 1;
        for (const n of c) {
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none') { k = 0; break; }
          k *= parseFloat(cs.opacity);
        }
        seenVal = k;
        return k;
      };
      window.__track = [];
      const t0 = performance.now();
      (function tick() {
        const now = performance.now();
        window.__track.push({ t: now - t0, shift: shift(),
                              seen: seen(now), view: board.getAttribute('viewBox') });
        if (performance.now() - t0 < 4200) requestAnimationFrame(tick);
      })();
    }, { moves: sc.moves || null, shows: sc.shows || null });
  }
  await page.mouse.click(aim.x, aim.y);

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

  if (sc.moves || sc.shows) {
    await page.waitForTimeout(Math.max(2100, (sc.span || 0) + 400));
    const track = await page.evaluate(() => window.__track);
    const view00 = track[0].view;

    // Показ: главное сцены обязано побыть на экране, а не мелькнуть перед
    // уходом. Мерка нужна потому, что ровно так и было: кристаллы доходили до
    // полной яркости за сотню миллисекунд до перехода, и гость видел не
    // раскладку кремния, ради которой всё затевалось, а блик по крышке.
    if (sc.shows) {
      const lit = track.filter(p => p.seen > 0.9);
      const held = lit.length ? lit[lit.length - 1].t - lit[0].t : 0;
      if (held < sc.shows.held) {
        fail(`${sc.shows.sel}: видно ${Math.round(held)} мс, надо ${sc.shows.held} — `
             + 'главное сцены мелькает и пропадает');
      } else {
        okay(`${sc.shows.sel}: видно ${Math.round(held)} мс`);
      }
    }
    if (!sc.moves) { /* дальше только про движение */ } else {
    const full = Math.max(...track.map(p => p.shift));
    const started = track.find(p => p.shift > full * 0.05);
    const camera = track.find(p => p.view !== view00);
    if (!full) {
      fail(`${sc.moves.sel}: не сдвинулась вовсе за всю сцену`);
    } else if (!started || started.t > sc.moves.startsBy) {
      fail(`${sc.moves.sel}: тронулась на ${started ? Math.round(started.t) : '—'} мс, `
           + `а должна была к ${sc.moves.startsBy} — со стороны деталь стоит`);
    } else if (camera) {
      const at = track.find(p => p.t >= camera.t) || track[track.length - 1];
      const done = at.shift / full;
      if (done < sc.moves.doneAtCamera) {
        fail(`${sc.moves.sel}: к старту камеры прошла ${(done * 100).toFixed(0)}% пути, `
             + `надо ${(sc.moves.doneAtCamera * 100).toFixed(0)}% — остаток уедет за кадр`);
      } else {
        okay(`${sc.moves.sel}: тронулась на ${Math.round(started.t)} мс, `
             + `к наезду прошла ${(done * 100).toFixed(0)}% пути`);
      }
    } else {
      okay(`${sc.moves.sel}: тронулась на ${Math.round(started.t)} мс`);
    }
    }
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
