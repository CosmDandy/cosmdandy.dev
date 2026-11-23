// Анимации карточки: живы ли и те ли.
//
//   node tools/anim.mjs              все проверки
//   node tools/anim.mjs --link CV    только одна ссылка, с раскладкой по кадрам
//
// Рядом уже есть две мерки движения, и обе про схему сервера: motion.mjs
// снимает кадры узла, physics.mjs печатает характер его хода числом. Карточку
// не проверял никто, а живёт она по своим правилам: шесть ссылок, пружинный
// переход на наведении и ступенчатое появление при загрузке.
//
// Что ломается на самом деле — и потому проверяется:
//
//   переход сорван      правило с той же специфичностью ниже по файлу
//                       отбирает у ссылки её transition, и наведение
//                       срабатывает мгновенно. На глаз это заметно не всем и
//                       не сразу, а на снимке не видно вовсе.
//   наведение мертво     селектор разъехался или сверху лёг прозрачный слой:
//                       ссылка выглядит правильно и не отзывается.
//   появление не доиграло  linkEnter стоит с backwards, то есть до старта
//                       ссылка прозрачна. Не доиграв, она такой и останется —
//                       гость видит пустое место вместо ссылки.
//   ступени разъехались  задержки идут через 60 мс, и порядок здесь и есть
//                       эффект; сбитый порядок читается как рывок.
//   вечное встало       badgeShimmer и livePulse крутятся всегда; остановка
//                       означает, что их согнали с композитора.
//   reduced-motion      выключение анимаций обязано работать: это не
//                       украшение, а требование доступности.
//
// Длительности берутся у самого браузера через getAnimations(): он читает тот
// же CSS, и сверять его число с числом из файла было бы тавтологией. Здесь
// проверяются свойства другого рода — что переход есть, что он не мгновенный
// и не бесконечный, что он доезжает и возвращается.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { dropInputs, launch } from './browser.mjs';

const ROOT = resolve(import.meta.dirname, '..');

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

// Карточка живёт ниже этой ширины; выше страница показывает схему, и ссылок
// на ней нет вовсе.
const CARD = { width: 390, height: 900 };

// Границы разумного для перехода на наведении. Не из CSS: там объявлено
// 0.40–0.48 с, и сверять браузер с файлом, который он же и прочитал, незачем.
// Здесь проверяется другое — что переход вообще существует и что он остался
// переходом, а не превратился в мгновенную подстановку или в вечное движение.
const HOVER_MIN_MS = 100;
const HOVER_MAX_MS = 1500;
// Ступени появления объявлены через 60 мс. Допуск широкий: измеряется не
// задержка, а порядок, в котором ссылки проявились.
const STEP_MIN_MS = 20;

const args = process.argv.slice(2);
const only = args.includes('--link') ? args[args.indexOf('--link') + 1] : null;

const failures = [];
const say = (ok, line) => {
  console.log(`  ${ok ? '·' : 'ПЛОХО'} ${line}`);
  if (!ok) failures.push(line);
};

const browser = await launch();

// ── Появление при загрузке ────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: CARD, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(dropInputs);

  // Снимаем ДО того, как анимации доиграют: после них getAnimations() пуст, и
  // спрашивать уже нечего.
  await page.goto(url, { waitUntil: 'commit' });
  const entering = await page.evaluate(async () => {
    await new Promise(ok => requestAnimationFrame(ok));
    const items = [...document.querySelectorAll('main a.link-item')];
    return items.map(el => {
      const anim = el.getAnimations().find(a => a.animationName?.startsWith('linkEnter'));
      const t = anim?.effect?.getTiming();
      return {
        text: (el.textContent ?? '').trim().slice(0, 12),
        name: anim?.animationName ?? null,
        delay: t?.delay ?? null,
        duration: t?.duration ?? null,
      };
    });
  });

  console.log('\nпоявление при загрузке');
  say(entering.length > 0, `ссылок на карточке: ${entering.length}`);
  for (const item of entering) {
    say(item.name !== null, `«${item.text}» появляется анимацией ${item.name ?? '— её нет'}`);
  }
  const delays = entering.map(i => i.delay).filter(d => d !== null);
  const stepped = delays.every((d, i) => i === 0 || d - delays[i - 1] >= STEP_MIN_MS);
  say(stepped && delays.length === entering.length,
    `ступени идут по возрастанию: ${delays.join(' → ')} мс`);

  // Доиграли — и ссылка видна. С backwards недоигравшая анимация оставляет
  // элемент прозрачным навсегда.
  await page.waitForTimeout(1600);
  const visible = await page.evaluate(() => [...document.querySelectorAll('main a.link-item')]
    .map(el => ({
      text: (el.textContent ?? '').trim().slice(0, 12),
      opacity: Number(getComputedStyle(el).opacity),
      running: el.getAnimations().some(a => a.playState === 'running'),
      disabled: el.classList.contains('disabled'),
    })));
  for (const v of visible) {
    // У выключенной ссылки конечная прозрачность своя — 0.35, это не поломка.
    const want = v.disabled ? 0.3 : 0.9;
    say(v.opacity >= want, `«${v.text}» доигралась до непрозрачности ${v.opacity.toFixed(2)}`);
  }
  say(errors.length === 0, errors.length ? `ошибок в консоли: ${errors[0].slice(0, 60)}` : 'консоль молчит');
  await context.close();
}

// ── Наведение ─────────────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: CARD });
  const page = await context.newPage();
  await page.addInitScript(dropInputs);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1600);   // ждём, пока доиграет появление

  const names = await page.evaluate(() => [...document.querySelectorAll('main a.link-item')]
    .map(el => (el.textContent ?? '').trim().split('\n')[0].trim()));

  console.log('\nнаведение');
  for (const [i, name] of names.entries()) {
    if (only && only.toLowerCase() !== name.toLowerCase()) continue;
    const item = page.locator('main a.link-item').nth(i);

    const before = await item.evaluate(el => {
      const s = getComputedStyle(el);
      return { transform: s.transform, background: s.backgroundImage, shadow: s.boxShadow };
    });

    await item.hover();
    // Сразу после наведения переход ещё идёт — тут и видно, переход это или
    // мгновенная подстановка.
    const started = await item.evaluate(el => el.getAnimations().map(a => ({
      property: a.transitionProperty ?? a.animationName ?? '?',
      duration: a.effect?.getTiming()?.duration ?? null,
    })));
    const moving = started.filter(a => a.duration > 0);
    say(moving.length > 0, `«${name}»: переход есть (${moving.map(m => m.property).join(', ') || 'ни одного'})`);
    for (const m of moving) {
      say(m.duration >= HOVER_MIN_MS && m.duration <= HOVER_MAX_MS,
        `«${name}»: ${m.property} длится ${Math.round(m.duration)} мс`);
    }

    // Пружина уходит за конечное значение и возвращается — снимаем ход по
    // кадрам, иначе перелёт не отличить от обычного доезда.
    const track = await item.evaluate(el => new Promise(done => {
      const seen = [];
      const t0 = performance.now();
      const tick = () => {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        seen.push(Math.round(m.m42 * 100) / 100);
        if (performance.now() - t0 < 700) requestAnimationFrame(tick);
        else done(seen);
      };
      requestAnimationFrame(tick);
    }));
    const lowest = Math.min(...track);
    const settled = track.at(-1);
    say(settled < 0, `«${name}»: доехала до ${settled} px по вертикали`);
    // Пружина обязана перелететь: кривая cubic-bezier(0.34, 1.56, …) уводит
    // ссылку выше конечного положения и возвращает. Без этой проверки ход
    // снимался по кадрам впустую — замена пружины на линейный переход
    // выглядела бы точно так же, а это ровно тот класс поломки, ради
    // которого проверка и написана.
    say(lowest < settled, `«${name}»: с перелётом — ниже всего ${lowest}, встала на ${settled}`);
    if (only) console.log(`        ход: ${track.join(' ')}`);

    const after = await item.evaluate(el => {
      const s = getComputedStyle(el);
      return { transform: s.transform, background: s.backgroundImage, shadow: s.boxShadow };
    });
    const changed = ['transform', 'background', 'shadow'].filter(k => before[k] !== after[k]);
    say(changed.length > 0, `«${name}»: наведение поменяло ${changed.join(', ') || 'ничего'}`);

    // Увели мышь — вернулось. Незакрытый hover оставляет ссылку приподнятой
    // навсегда, и на карточке зависают две поднятые сразу.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(800);
    const back = await item.evaluate(el => getComputedStyle(el).transform);
    say(back === before.transform, `«${name}»: вернулась на место`);
  }
  await context.close();
}

// ── Вечные анимации ───────────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: CARD });
  const page = await context.newPage();
  await page.addInitScript(dropInputs);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1600);

  console.log('\nвечные анимации');
  const endless = await page.evaluate(() => document.getAnimations()
    .filter(a => a.effect?.getTiming()?.iterations === Infinity)
    .map(a => ({ name: a.animationName ?? '?', state: a.playState })));
  say(endless.length > 0, `бесконечных: ${endless.length} (${endless.map(e => e.name).join(', ') || 'ни одной'})`);
  for (const a of endless) {
    say(a.state === 'running', `${a.name} крутится (${a.state})`);
  }
  await context.close();
}

// ── Выключение движения ───────────────────────────────────────────────────
{
  const context = await browser.newContext({ viewport: CARD, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.addInitScript(dropInputs);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  console.log('\nprefers-reduced-motion');
  const still = await page.evaluate(() => {
    const items = [...document.querySelectorAll('main a.link-item, h1, .bio, .now, .badge, .live-dot')];
    return {
      running: document.getAnimations().filter(a => a.playState === 'running')
        .map(a => a.animationName ?? '?'),
      hidden: items.filter(el => Number(getComputedStyle(el).opacity) < 0.3
        && !el.classList.contains('disabled')).length,
    };
  });
  say(still.running.length === 0,
    still.running.length ? `движение осталось: ${still.running.join(', ')}` : 'всё стоит');
  say(still.hidden === 0, `невидимых элементов: ${still.hidden}`);
  await context.close();
}

await browser.close();
server.close();

console.log(failures.length ? `\n${failures.length} замечаний` : '\nанимации в порядке');
process.exit(failures.length ? 1 : 0);
