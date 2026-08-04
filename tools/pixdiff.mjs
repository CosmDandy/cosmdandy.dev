// Попиксельная сверка кадров схемы: доказательство того, что переписывание
// перфорации (1632 полигона в пути) не сдвинуло картинку ни на пиксель.
// Слов «должно быть так же» тут мало — нужна гарантия на уровне байтов кадра.
//
//   node tools/pixdiff.mjs --save   снять эталон в tools/.pixdiff/
//   node tools/pixdiff.mjs          сравнить текущее состояние с эталоном
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REF = join(ROOT, 'tools/.pixdiff');
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

// Помимо --no-sandbox нужны флаги детерминизма растра: без них два запуска
// одной и той же неизменной страницы всё равно расходятся на несколько сотен
// пикселей по ±1…6 на канале — тайлы 3D-перспективы платы (rotateX + большой
// perspective на .stage) и субпиксельный хинтинг текста растрируются раз на
// раз чуть иначе. Внутри одной вкладки повторный снимок бьётся в ноль, а
// между двумя загрузками — нет; поэтому дело не во времени и не в анимации,
// а в самом растровом проходе, и глушить его нужно на уровне браузера.
const browser = await chromium.launch({ executablePath: CHROME, args: [
  '--no-sandbox', '--disable-gpu', '--disable-lcd-text', '--force-color-profile=srgb',
  '--disable-partial-raster', '--num-raster-threads=1', '--disable-font-subpixel-positioning',
] });

// Живое время — главный источник ложных отличий: вентилятор крутится, лампы
// мигают, гало дышит. Два прогона никогда не попадают в один и тот же кадр
// анимации, поэтому перед снимком все анимации и переходы глушатся стилем с
// !important — сравнивать нужно геометрию и цвет перфорации, а не то, на
// какой фазе мигания застали лампу.
//
// .rig-glow отдельной строкой: это не анимация, а статичное пятно на
// blur(140px) под всей машиной. От него шло само по себе небольшое (±1-2 по
// каналу) расхождение между двумя загрузками страницы даже после общей
// заморозки — к перфорации, которую и проверяет этот инструмент, пятно
// отношения не имеет, глушим его тем же приёмом.
//
// #uptime — часы аптайма в шапке консоли, их обновляет свой setInterval раз
// в секунду независимо от любых css-переходов. Гасить их через textContent
// в JS не вышло: между тем, как мы его обнуляем, и снимком проходит время
// ожидания ниже, и ровно за него интервал успевает тикнуть обратно —
// проверка ловила то «00:14», то «00:15» с шансом примерно 1 к 5. Прячем
// элемент через css: тикать он продолжает, но невидимо, и гонки не остаётся.
async function freeze(page) {
  await page.addStyleTag({ content:
    '*,*::before,*::after{animation:none!important;transition:none!important}'
    + '.rig-glow{opacity:0!important}'
    + '#uptime{visibility:hidden!important}' });
}

// Фиксированная пауза в миллисекундах — азартная игра: в контейнере рядом
// работают другие сессии, и под нагрузкой сборка или переход крышки идут
// дольше расчётного, а снимок всё равно срывается по будильнику и ловит кадр
// на середине хода. Вместо стольки-то миллисекунд опрашиваем видимое
// состояние (прозрачность и трансформацию всего, что умеет двигаться и
// проступать в наших четырёх кадрах) и считаем его осевшим, когда два опроса
// подряд с шагом вернули одно и то же — независимо от того, сколько это
// заняло по часам.
async function settleSnapshot(page) {
  return page.evaluate(() => [...document.querySelectorAll(
    '.callout, .lid, .rig-side, .stage, .rig-id h2, .rig-id .bio, .rig-body')]
    .map(el => {
      const cs = getComputedStyle(el);
      return cs.opacity + '|' + cs.transform + '|' + cs.translate + '|' + cs.scale;
    }).join(';'));
}
async function waitSettled(page, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let prev = await settleSnapshot(page);
  while (Date.now() < deadline) {
    await page.waitForTimeout(200);
    const cur = await settleSnapshot(page);
    if (cur === prev) return;
    prev = cur;
  }
}

// Довести схему до собранной и включённой — общий разгон для всех кадров,
// крышка/сервис/лупа снимаются уже поверх него. Повторяет приём из
// поведенческой проверки (tools/behave.mjs): вход на первом визите играет
// сборку сам, ждать нажатия кнопки не нужно, а конца сборки и возврата
// крышки ждём по классам rig, а не по секундомеру.
async function ready(page) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    () => !document.getElementById('rig').classList.contains('assembly'), null, { timeout: 30000 }
  ).catch(() => {});
  // Крышка снимается сама через 1.5с после конца сборки — тоже событие, не таймер.
  await page.waitForFunction(
    () => document.getElementById('rig').classList.contains('lid-off'), null, { timeout: 10000 }
  ).catch(() => {});
  // Самотест дописывает свои строки в тот же журнал, куда позже пишет и наш
  // клик (сервис, крышка): если кликнуть раньше его последней строки, порядок
  // двух строк в консоли зависит от того, кто успел первым — и это точная
  // причина «нестабильных пикселей», которые сперва выглядели как шум
  // растеризации. Ждём подпись конца самотеста, а не сколько-то мс.
  await page.waitForFunction(
    () => (document.getElementById('log')?.textContent ?? '').includes('F2 — BIOS Setup'),
    null, { timeout: 15000 }
  ).catch(() => {});
  // И только теперь убираем экран самотеста. Пока Escape нажимался до этого
  // ожидания, он не успевал ничего закрыть, и кадр `ready` снимался с экраном
  // поверх машины — платы в нём не было вовсе. Обратный прогон это показал:
  // `#board { opacity: 0.2 }` менял крышку, сервис и лупу и не менял `ready`
  // ни на пиксель. Инструмент сверки, который отчитывается об успехе по кадру
  // без предмета, хуже, чем отсутствие инструмента.
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('.crt')?.classList.contains('on'),
    null, { timeout: 10000 }
  ).catch(() => {});
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    // снять сонный режим: в headless схема считает себя невидимой и прячет бирки
    document.getElementById('rig').classList.remove('dormant', 'tags-off');
  });
  // Бирки проступают лесенкой (у самой дальней --tag-order задержка+переход
  // кончаются к 2.79с) — ждём, пока переходы улягутся, а не гадаем секунды.
  await waitSettled(page);
}

// dispatchEvent, а не .click(): часть узлов помечена pointer-events по CSS,
// а слушатель клика на них всё равно висит — так же бьёт behave.mjs.
const click = (page, sel) => page.evaluate(s => document
  .querySelector(s)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), sel);

const STATES = {
  ready:   null,
  lid:     p => click(p, '.lid-on-btn'),
  service: p => click(p, '.svc-switch'),
  zoom:    p => click(p, '#zoom-btn'),
};

async function shoot(name, action) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  // без этого один input в разметке валит рендерер именно этой сборки chromium
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded',
    () => document.querySelectorAll('input').forEach(el => el.remove())));
  await ready(page);
  if (action) { await action(page); await waitSettled(page); }
  await freeze(page);
  await page.waitForTimeout(200);
  const png = await page.screenshot();
  await page.close();
  return png;
}

// PNG декодировать нечем без стороннего пакета — зато у любой вкладки уже
// есть canvas. Прогоняем оба кадра через Image → canvas → getImageData на
// служебной странице и сравниваем сырые байты прямо там же.
async function compare(refBuf, curBuf) {
  const page = await browser.newPage();
  const result = await page.evaluate(async ([a, b]) => {
    async function toPixels(b64) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return { w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data };
    }
    const ra = await toPixels(a);
    const rb = await toPixels(b);
    if (ra.w !== rb.w || ra.h !== rb.h) return { sizeMismatch: [ra.w, ra.h, rb.w, rb.h] };
    let diff = 0, maxDelta = 0;
    for (let i = 0; i < ra.data.length; i += 4) {
      const d = Math.max(
        Math.abs(ra.data[i] - rb.data[i]), Math.abs(ra.data[i + 1] - rb.data[i + 1]),
        Math.abs(ra.data[i + 2] - rb.data[i + 2]), Math.abs(ra.data[i + 3] - rb.data[i + 3]));
      if (d > 0) { diff++; if (d > maxDelta) maxDelta = d; }
    }
    return { diff, total: ra.w * ra.h, maxDelta };
  }, [refBuf.toString('base64'), curBuf.toString('base64')]);
  await page.close();
  return result;
}

// Русское склонение «отличие»: в примерах из задания 0 и 1843 — разные формы.
function plural(n, one, few, many) {
  const mod100 = Math.abs(n) % 100, mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 > 1 && mod10 < 5) return few;
  if (mod10 === 1) return one;
  return many;
}

const save = process.argv.includes('--save');
await mkdir(REF, { recursive: true });

const diverged = [];
// try/finally: одно упавшее состояние (например, вкладка не пережила чужую
// нагрузку на контейнер) не должно оставлять осиротевший chromium висеть —
// он потом мешает как раз тем же самым, из-за чего упал этот запуск.
try {
  for (const [name, action] of Object.entries(STATES)) {
    const png = await shoot(name, action);
    const file = join(REF, `${name}.png`);
    if (save || !existsSync(file)) {
      await writeFile(file, png);
      console.log(`${name}: эталон сохранён`);
      continue;
    }
    const ref = await readFile(file);
    const res = await compare(ref, png);
    if (res.sizeMismatch) {
      const [rw, rh, cw, ch] = res.sizeMismatch;
      console.log(`${name}: изменился размер кадра ${rw}×${rh} → ${cw}×${ch}`);
      diverged.push(name);
    } else if (res.diff === 0) {
      console.log(`${name}: 0 ${plural(0, 'отличие', 'отличия', 'отличий')} из ${res.total}`);
    } else {
      console.log(`${name}: ${res.diff} ${plural(res.diff, 'отличие', 'отличия', 'отличий')}`
        + ` (${(res.diff / res.total * 100).toFixed(2)}%), максимум по каналу ${res.maxDelta}`);
      diverged.push(name);
    }
  }
} finally {
  await browser.close();
  server.close();
}

console.log(diverged.length ? `картинка изменилась: ${diverged.join(', ')}` : 'картинка не изменилась');
process.exit(diverged.length ? 1 : 0);
