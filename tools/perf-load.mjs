// Сколько стоит открыть страницу с телефона.
//
//   node tools/perf-load.mjs                 три сайта, обычная сеть и телефон
//   node tools/perf-load.mjs --site visitka  только один
//   node tools/perf-load.mjs --json          машиночитаемый вывод
//
// perf.mjs рядом меряет установившийся режим — сколько процессора съедает уже
// открытая страница. Здесь противоположное: первые секунды. Жалоба владельца
// («долго грузится на телефонах») живёт именно тут, и меряется она не одним
// числом, а связкой: сколько байт реально уехало по проводу, сколько на это
// ушло времени, когда появился первый пиксель и когда страница перестала
// тормозить на ввод.
//
// Локальный сервер отдаёт файлы из репозитория и дожимает их brotli — ровно
// так же, как Cloudflare в проде. Без этого вес HTML завышался бы в десять раз
// и все выводы были бы про несуществующую проблему. Чего нет на диске (у CV
// PDF и превью собираются в CI), берётся с живого домена.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { brotliCompress, constants as zlibConst } from 'node:zlib';
import { promisify } from 'node:util';
import { extname, join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const brotli = promisify(brotliCompress);

const SITES = {
  visitka: { root: '/workspaces/cosmdandy.dev', origin: 'https://cosmdandy.dev' },
  cv: { root: '/workspaces/cv.cosmdandy.dev/pages', origin: 'https://cv.cosmdandy.dev' },
  blog: { root: '/workspaces/kvt-blog-cosmdandy-dev-main/public', origin: 'https://blog.cosmdandy.dev' },
};

// Профиль «телефон» — середина рынка, а не флагман: медленный 4G и процессор
// вчетверо слабее машины, на которой это запускается.
const PROFILES = {
  desktop: { net: null, cpu: 1 },
  phone: {
    net: { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
    cpu: 4,
  },
};

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.webp': 'image/webp', '.pdf': 'application/pdf', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
  '.json': 'application/json', '.txt': 'text/plain',
};
// Дожимать имеет смысл только текст; woff2, png и webp уже сжаты.
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.webmanifest', '.xml', '.json', '.txt']);

let chromium;
for (const dir of ['/workspaces/.pw/', '/workspaces/cosmdandy.dev/']) {
  try { ({ chromium } = createRequire(dir)('playwright')); break; } catch { /* next */ }
}
if (!chromium) { console.error('no playwright'); process.exit(1); }
const CHROME = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
  .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
if (!CHROME) { console.error('chromium not found in /nix/store'); process.exit(1); }

async function serve(site) {
  const cache = new Map();
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const path = rel === '/' || rel.endsWith('/') ? rel + 'index.html' : rel;
    const ext = extname(path);
    let body = cache.get(path);
    if (body === undefined) {
      try {
        body = await readFile(join(site.root, path));
      } catch {
        const r = await fetch(site.origin + path).catch(() => null);
        body = r?.ok ? Buffer.from(await r.arrayBuffer()) : null;
      }
      cache.set(path, body);
    }
    if (body === null) { res.writeHead(404).end('no such file'); return; }
    const headers = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
    let out = body;
    if (COMPRESSIBLE.has(ext) && (req.headers['accept-encoding'] ?? '').includes('br')) {
      out = await brotli(body, { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 } });
      headers['content-encoding'] = 'br';
    }
    headers['content-length'] = out.length;
    res.writeHead(200, headers);
    res.end(out);
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function measure(site, profile) {
  const { server, url } = await serve(site);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  // Тот же chromium роняет рендерер на <input>, что и в perf.mjs рядом.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () =>
      document.querySelectorAll('input').forEach(el => el.remove()));
    window.__firstFrame = null;
    requestAnimationFrame(t => { window.__firstFrame = t; });
    window.__longTasks = [];
    try {
      new PerformanceObserver(l => window.__longTasks.push(...l.getEntries().map(e => e.startTime + e.duration)))
        .observe({ type: 'longtask', buffered: true });
    } catch { /* нет поддержки — TTI посчитаем по DCL */ }
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile.net) await cdp.send('Network.emulateNetworkConditions', profile.net);
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });

  const req = new Map();
  const resources = [];
  cdp.on('Network.requestWillBeSent', e => req.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', e => {
    resources.push({ url: req.get(e.requestId) ?? '?', bytes: e.encodedDataLength });
  });

  await cdp.send('Performance.enable');
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  // Даём странице докрутить отложенную работу — LCP и длинные задачи после load.
  await page.waitForTimeout(profile.cpu > 1 ? 6000 : 3000);

  const perfMetrics = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

  const inPage = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime]));
    const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1)?.startTime ?? null;
    return {
      nodes: document.getElementsByTagName('*').length,
      responseEnd: nav.responseEnd,
      domInteractive: nav.domInteractive,
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      fcp: paint['first-contentful-paint'] ?? null,
      lcp,
      firstFrame: window.__firstFrame,
      longTasksEnd: window.__longTasks.length ? Math.max(...window.__longTasks) : null,
    };
  });

  await browser.close();
  server.close();

  resources.sort((a, b) => b.bytes - a.bytes);
  const total = resources.reduce((s, r) => s + r.bytes, 0);
  return {
    requests: resources.length,
    totalBytes: total,
    heaviest: resources.slice(0, 4),
    ...inPage,
    // TTI приблизительный: момент, когда после первой отрисовки главный поток
    // перестал залипать длинными задачами. Точного определения у него нет,
    // а для «нажал и ждёшь» это ближайшее честное число.
    tti: Math.max(inPage.dcl, inPage.longTasksEnd ?? 0),
    scriptMs: (perfMetrics.ScriptDuration ?? 0) * 1000,
    styleMs: (perfMetrics.RecalcStyleDuration ?? 0) * 1000,
    layoutMs: (perfMetrics.LayoutDuration ?? 0) * 1000,
  };
}

const args = process.argv.slice(2);
const only = args.includes('--site') ? args[args.indexOf('--site') + 1] : null;
const asJson = args.includes('--json');
const kb = b => `${(b / 1024).toFixed(0)} KB`;
const ms = v => (v === null || v === undefined ? '—' : `${Math.round(v)} ms`);
const short = u => u.replace(/^https?:\/\/[^/]+/, '') || '/';

const out = {};
for (const [name, site] of Object.entries(SITES)) {
  if (only && only !== name) continue;
  out[name] = {};
  for (const [pname, profile] of Object.entries(PROFILES)) {
    const r = await measure(site, profile);
    out[name][pname] = r;
    if (asJson) continue;
    console.log(`\n${name} · ${pname === 'phone' ? 'телефон (4G ×4 CPU)' : 'десктоп, без ограничений'}`);
    console.log(`  запросов ${r.requests}, по проводу ${kb(r.totalBytes)}`);
    console.log(`  самое тяжёлое: ${r.heaviest.map(h => `${short(h.url)} ${kb(h.bytes)}`).join(', ')}`);
    console.log(`  первая отрисовка ${ms(r.fcp)}, LCP ${ms(r.lcp)}, первый кадр ${ms(r.firstFrame)}`);
    console.log(`  разбор HTML ${ms(r.domInteractive - r.responseEnd)}, DCL ${ms(r.dcl)}, load ${ms(r.load)}, интерактивно ${ms(r.tti)}`);
    console.log(`  узлов в DOM ${r.nodes}; скрипт ${ms(r.scriptMs)}, стили ${ms(r.styleMs)}, раскладка ${ms(r.layoutMs)}`);
  }
}
if (asJson) console.log(JSON.stringify(out, null, 2));
