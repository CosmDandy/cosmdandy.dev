// Сколько страница просит у процессора, когда на неё просто смотрят.
//
//   node tools/perf.mjs             покой: машина собрана, лампы мигают
//   node tools/perf.mjs --service   сервисный режим (консоль и разбор)
//   node tools/perf.mjs --assembly  первые секунды: машина собирается
//
// Что меряем и почему именно это. Анимация в большом SVG не композитится:
// любое изменение заливки или поворота заставляет браузер заново растеризовать
// область, а потом собрать всю сцену. Поэтому цена почти не зависит от числа
// анимируемых фигур — она зависит от того, сколько кадров подряд в сцене
// хоть что-то меняется. Отсюда две цифры: доля главного потока (TaskDuration
// за окно замера) и доля кадров, в которых браузер что-то перерисовывал.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const WINDOW_MS = 6000;

let chromium;
for (const dir of ['/workspaces/.pw/', ROOT + '/']) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* дальше */ }
}
if (!chromium) { console.error('нет playwright'); process.exit(1); }
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
const service = args.includes('--service');
const assembly = args.includes('--assembly');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, deviceScaleFactor: 2 });
// та же сборка chromium роняет рендерер на <input>, что и в preview
await page.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () =>
    document.querySelectorAll('input').forEach(el => el.remove()));
});
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.body.classList.add('view-rig'));
if (service) await page.evaluate(() => document.getElementById('svc-switch')
  ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
// Сборка идёт около десяти секунд. В режиме покоя ждём, пока она кончится:
// иначе меряем разовую хореографию вместо того, что грузит машину постоянно.
await page.waitForTimeout(assembly ? 300 : 11000);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries(
  (await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

// Счётчик кадров: rAF отмечает каждый кадр, который браузер вообще выдал.
await page.evaluate(() => {
  window.__frames = [];
  const tick = t => { window.__frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const before = await metrics();
await page.waitForTimeout(WINDOW_MS);
const after = await metrics();
const frames = await page.evaluate(() => window.__frames);

const d = k => (after[k] ?? 0) - (before[k] ?? 0);
const span = (frames.at(-1) - frames[0]) / 1000;
const fps = (frames.length - 1) / span;
// «Долгий кадр» — тот, что не уложился в бюджет 60 Гц с запасом.
const gaps = frames.slice(1).map((t, i) => t - frames[i]);
const slow = gaps.filter(g => g > 20).length;

const pct = v => `${(v / (WINDOW_MS / 1000) * 100).toFixed(1)}%`;
const режим = assembly ? 'сборка' : service ? 'сервисный режим' : 'покой';
console.log(`  режим: ${режим}, окно ${WINDOW_MS / 1000} с`);
console.log(`  главный поток: ${pct(d('TaskDuration'))} (из них стиль ${pct(d('RecalcStyleDuration'))}, раскладка ${pct(d('LayoutDuration'))})`);
console.log(`  скрипт: ${pct(d('ScriptDuration'))}`);
console.log(`  кадров в секунду: ${fps.toFixed(1)}, долгих кадров: ${slow} из ${gaps.length}`);
console.log(`  узлов в документе: ${after.Nodes | 0}, слоёв: ${after.LayoutObjects | 0}`);

await browser.close();
server.close();
