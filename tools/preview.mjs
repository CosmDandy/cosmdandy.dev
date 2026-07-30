// Локальный просмотр: поднять статику, открыть страницу, проверить и снять кадр.
//
//   node tools/preview.mjs              вид сервера, кадр в tools/preview.png
//   node tools/preview.mjs --card       вид карточки
//   node tools/preview.mjs --service    сервисный режим (консоль и приборы)
//
// Почему свой сервер, а не file://: по file:// браузер блокирует шрифты по
// CORS, и в консоли висят ошибки, не имеющие отношения к делу.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// playwright живёт вне репозитория: тащить node_modules в статический сайт незачем
const PW_DIRS = ['/workspaces/.pw/', ROOT + '/'];
let chromium;
for (const dir of PW_DIRS) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* дальше */ }
}
if (!chromium) {
  console.error('нет playwright. Поставить:\n' +
    '  mkdir -p /workspaces/.pw && cd /workspaces/.pw && npm init -y\n' +
    '  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright');
  process.exit(1);
}

// Браузер берём из nix store: скачанный playwright-браузер здесь не стартует,
// в контейнере нет libglib-2.0.
const { globSync } = await import('node:fs');
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
if (!CHROME) { console.error('не нашёл chromium в /nix/store'); process.exit(1); }

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
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const args = process.argv.slice(2);
const view = args.includes('--card') ? 'card' : 'rig';
const service = args.includes('--service');
const shot = args.find(a => a.endsWith('.png')) ?? join(ROOT, 'tools/preview.png');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Эта сборка chromium роняет рендерер на любом <input> — воспроизведено на
// голой странице с одним полем. Поле ввода консоли убираем до отрисовки.
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () =>
    document.querySelectorAll('input').forEach(el => el.remove()));
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(500);
if (view === 'rig') await page.evaluate(() => document.body.classList.add('view-rig'));
// сервисный режим включаем штатным тумблером: класс, поставленный руками,
// пропустит всё, что делает обработчик (раскладку консоли, приборы, лог)
if (service) await page.evaluate(() => document.getElementById('svc-switch')?.dispatchEvent(
  new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(1000);

const stat = await page.evaluate(() => {
  const box = document.querySelector('.chassis')?.getBoundingClientRect();
  const q = s => document.querySelectorAll(s).length;
  return { узлов: q('*'), схема: box ? `${box.width | 0}×${box.height | 0}` : 'не видна',
    партномера: q('a.stamp'), выноски: q('a.callout'), вентиляторы: q('.fan'),
    планки: q('.dimm'), диски: q('.bay'), лампы: q('.led-act'), lightpath: q('.lp') };
});

console.log(Object.entries(stat).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
console.log(errors.length ? `  ОШИБКИ (${errors.length}): ${errors.slice(0, 3).join(' | ')}`
                          : '  ошибок на странице нет');

await page.screenshot({ path: shot });
console.log(`  кадр: ${shot}`);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
