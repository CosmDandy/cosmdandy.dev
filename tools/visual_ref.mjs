// Визуальная сверка: снимок страницы в нескольких состояниях и попиксельное
// сравнение с эталоном.
//
//   node tools/visual_ref.mjs --save     снять эталон (перед рефакторингом)
//   node tools/visual_ref.mjs            сверить текущее состояние с эталоном
//
// Зачем: разрез CSS и JS нельзя проверить сравнением текста — порядок правил
// меняет каскад, а порядок кода меняет поведение. Проверять надо то, что
// видит глаз, то есть пиксели.
//
// Анимации гасим: иначе кадр зависит от момента съёмки и сверка врёт.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REF = join(ROOT, 'tools/.visual');

const require = createRequire('/workspaces/.pw/');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

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

// Состояния, которые обязаны выглядеть одинаково до и после правки.
const STATES = {
  card:        async () => {},
  rig:         async p => p.evaluate(() => document.body.classList.add('view-rig')),
  'rig-svc':   async p => {
    await p.evaluate(() => document.body.classList.add('view-rig'));
    await p.evaluate(() => document.getElementById('svc-switch')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  },
  'rig-dark':  async p => {
    await p.evaluate(() => document.body.classList.add('view-rig'));
    await p.evaluate(() => document.getElementById('theme-switch')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  },
  'rig-pulled': async p => {
    await p.evaluate(() => document.body.classList.add('view-rig'));
    await p.evaluate(() => document.getElementById('svc-switch')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    // Класс ставим руками, а не кликом: обработчик вынимания заводит таймеры
    // и пишет в лог, и кадр начинает зависеть от момента съёмки. Нам нужна
    // раскладка вынутого узла, а не сценарий вынимания.
    await p.evaluate(() => {
      document.querySelector('.fan')?.classList.add('pulled');
      document.querySelector('.dimm')?.classList.add('pulled');
    });
  },
};

const save = process.argv.includes('--save');
await mkdir(REF, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let bad = 0;

for (const [name, setup] of Object.entries(STATES)) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('input').forEach(el => el.remove());
      const css = document.createElement('style');
      css.textContent = '*,*::before,*::after{animation:none!important;' +
        'transition:none!important;caret-color:transparent!important}' +
        // полоса прокрутки консоли то появляется, то нет — по числу строк
        // в логе, а строки дописываются по таймеру
        '::-webkit-scrollbar{display:none!important}' +
        '.console-log{overflow:hidden!important}' +
        // кнопки темы и вида к схеме отношения не имеют, а их иконки
        // перерисовываются по таймеру и дают ложные расхождения
        '.theme-switch,.view-switch{visibility:hidden!important}' +
        // строка ввода: поле удаляется до отрисовки, но от него остаётся
        // мигающая каретка у левого края панели — 65 пикселей, которые
        // гуляли от прогона к прогону
        // Консоль пишет строки по таймеру и после нашей очистки: раскладку
        // она держит, а содержимое каждый раз своё. Прячем и её, и строку
        // ввода — проверяем вёрстку панели, а не бегущий текст.
        '.prompt,.console-log{visibility:hidden!important}';
      document.head.append(css);
    });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await setup(page);
  await page.waitForTimeout(700);
  // Консоль показывает время и бегущий журнал — он меняется от прогона к
  // прогону, и сверка ловила бы его, а не правки в стилях. Подсказку
  // дополнения гасим по той же причине: она зависит от истории команд.
  await page.evaluate(() => {
    const log = document.getElementById('log');
    if (log) log.textContent = '';
    const up = document.getElementById('uptime');
    if (up) up.textContent = '--:--';
    document.querySelectorAll('.ghost-typed, .ghost-rest').forEach(el => { el.textContent = ''; });
  });
  await page.waitForTimeout(120);

  const shot = await page.screenshot();
  const file = join(REF, `${name}.png`);

  if (save || !existsSync(file)) {
    await writeFile(file, shot);
    console.log(`  ${name}: эталон снят`);
  } else {
    const a = PNG.sync.read(await readFile(file));
    const b = PNG.sync.read(shot);
    let diff = 0;
    if (a.width !== b.width || a.height !== b.height) {
      diff = -1;
    } else {
      for (let i = 0; i < a.data.length; i += 4) {
        if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1]
            || a.data[i + 2] !== b.data[i + 2]) diff++;
      }
    }
    const total = a.width * a.height;
    // Порог шума. В сервисном режиме остаётся полоска 3×22 у края панели,
    // дрожащая на пиксель от прогона к прогону, — она воспроизводится и на
    // неизменённом коде. Всё, что крупнее, уже правка: сдвиг подписи даёт
    // сотни пикселей, пропавший узел — тысячи.
    const NOISE = 120;
    if (diff === 0) {
      console.log(`  ${name}: совпадает пиксель в пиксель`);
    } else if (diff > 0 && diff <= NOISE) {
      console.log(`  ${name}: ${diff} пикс — в пределах шума`);
    } else if (diff < 0) {
      console.log(`  ${name}: РАЗМЕР ИЗМЕНИЛСЯ ${a.width}×${a.height} → ${b.width}×${b.height}`);
      bad++;
    } else {
      await writeFile(join(REF, `${name}.now.png`), shot);
      console.log(`  ${name}: РАЗОШЛОСЬ на ${diff} пикселях (${(diff / total * 100).toFixed(3)}%)`
        + ` — стало в ${name}.now.png`);
      bad++;
    }
  }
  await page.close();
}

await browser.close();
server.close();
console.log(bad ? `визуал изменился в ${bad} состояниях` : 'визуал не изменился');
process.exit(bad ? 1 : 0);
