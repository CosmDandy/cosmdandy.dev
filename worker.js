// Воркер перед статикой. Делает ровно две вещи, которых файлы сами не умеют.
//
// ПЕРВОЕ — метка версии на страницу. Заголовки обещают `must-revalidate`, то
// есть браузер обязан переспросить, — но переспрашивать ему нечем: механизм
// раздачи файлов не ставит на HTML ни `ETag`, ни `Last-Modified`. Померено на
// живом сайте: каждый повторный заход везёт 138 КБ страницы заново вместо
// пустого ответа «не менялось».
//
// Метка берётся из версии самого воркера, а не считается от тела. Тело — это
// мегабайт разметки, и хэшировать его на каждый запрос значит платить за
// проверку больше, чем стоит сама отдача. Версия же меняется ровно тогда,
// когда выкатили новое, и не меняется, когда не выкатывали, — это и есть
// правильный ключ.
//
// ВТОРОЕ — приём мерок скорости от живых гостей. Локальная мерка меряет
// контейнер разработки с эмуляцией телефона; поле — это телефон в метро,
// чужой Wi-Fi и процессор, которого у нас нет. Метрики складываются в журнал
// воркера (`observability` уже включена) — их видно в `wrangler tail` и в
// панели. Заводить ради этого хранилище незачем: вопрос к ним не «сколько их
// всего», а «стало ли хуже после выкатки».
//
// Всё остальное воркер не трогает: `run_worker_first` перечисляет только
// страницы и `/rum`, файлы едут мимо него напрямую.

// Имена метрик закрыты списком — он же и есть ограничение на их число:
// присланное сверх списка отсеивается по имени, а не по счёту. Отдельный
// предел на количество стоял и резал по порядку вставки, то есть всегда
// отрезал два последних имени — cls и inp. Именно те, ради которых в
// tools/rum.js заведены два наблюдателя.
const ALLOWED = new Set(['ttfb', 'fcp', 'lcp', 'cls', 'inp', 'dcl', 'load']);
// Тело мерки — несколько чисел; килобайта хватает с запасом.
const MAX_BODY = 1024;

async function takeMetrics(request, env) {
  // Только со своего же сайта. Совпадение требуется явно, а не «если
  // заголовок есть»: sendBeacon со страницы ставит Origin всегда, а вот
  // curl и любой скрипт его не ставят вовсе — и мягкая проверка пропускала
  // ровно тех, кого должна была остановить, блокируя лишь честно
  // представившихся.
  const host = new URL(request.url).origin;
  if (request.headers.get('origin') !== host) {
    return new Response(null, { status: 403 });
  }

  // Размер меряется по прочитанному, а не по заголовку. Content-Length
  // клиент может не прислать (поток, HTTP/2) или прислать мусором: у
  // отсутствующего Number(null) даёт 0, у мусорного — NaN, и оба проходили
  // сравнение. Тело на двести килобайт так и заходило.
  let text;
  try {
    text = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return new Response(null, { status: 413 });
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }

  // `null` — тоже валидный JSON, и обращение к его полю роняло обработчик:
  // четыре байта в теле давали пятисотую ошибку на публичной ручке.
  const sent = body && typeof body === 'object' ? body.m : null;
  const metrics = Object.entries(sent ?? {})
    .filter(([name, value]) => ALLOWED.has(name) && Number.isFinite(value));
  if (!metrics.length) {
    return new Response(null, { status: 400 });
  }

  // Пишем одной строкой: журнал читают глазами и грепом, и разложенная по
  // строкам мерка распалась бы на куски, между которыми не видно связи.
  console.log(JSON.stringify({
    kind: 'rum',
    at: Date.now(),
    // Страна и тип соединения — то, ради чего поле и заводят: они объясняют
    // разброс, которого в лабораторной мерке нет вовсе.
    country: request.cf?.country ?? '??',
    colo: request.cf?.colo ?? '??',
    view: body.v === 'rig' ? 'rig' : 'card',
    width: Number.isFinite(body.w) ? body.w : null,
    net: typeof body.n === 'string' ? body.n.slice(0, 12) : null,
    warm: Boolean(body.c),
    // Времена — целые миллисекунды, сдвиги — три знака после запятой. CLS
    // это доля экрана, и она вся живёт между нулём и десятой: округление до
    // целого превращало 0.02 в 0, то есть теряло метрику целиком.
    metrics: Object.fromEntries(metrics.map(([k, v]) =>
      [k, k === 'cls' ? Math.round(v * 1000) / 1000 : Math.round(v)])),
  }));

  // Пустой ответ: страница уже ушла, и читать его некому — мерки отправляются
  // на выгрузке через sendBeacon.
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/rum') {
      if (request.method !== 'POST') {
        return new Response(null, { status: 405, headers: { allow: 'POST' } });
      }
      return takeMetrics(request, env);
    }

    const response = await env.ASSETS.fetch(request);

    // Метка ставится только на страницы. У стилей и скрипта имя несёт хэш
    // содержимого, они кэшируются навсегда и переспрашивать их браузер не
    // будет вовсе — метка им не нужна и только удлинила бы ответ.
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) {
      return response;
    }

    const version = env.CF_VERSION_METADATA?.id ?? 'dev';
    const etag = `W/"${version}"`;

    // Слабая метка (W/) — потому что сравнивается смысл, а не байты: тело
    // может приехать сжатым по-разному, оставаясь той же страницей.
    const asked = request.headers.get('if-none-match');
    if (asked && asked.replace(/^W\//, '') === etag.replace(/^W\//, '')) {
      const headers = new Headers();
      for (const name of ['cache-control', 'content-type', 'vary']) {
        const value = response.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set('etag', etag);
      return new Response(null, { status: 304, headers });
    }

    const headers = new Headers(response.headers);
    headers.set('etag', etag);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
