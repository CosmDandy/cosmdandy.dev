// Заголовки безопасности: что браузер знает о правилах этого сайта.
//
//   node tools/security-headers.mjs                    объявлены ли в _headers
//   node tools/security-headers.mjs --url https://…    отдаются ли на живом
//   node tools/security-headers.mjs --json
//
// Статический сайт кажется неуязвимым — отдаются файлы, серверного кода нет.
// Уязвим не сервер, а браузер гостя: без правил он выполнит любой скрипт,
// который окажется в разметке, отправит полный адрес страницы на чужой сайт
// в Referer, даст встроить страницу в чужой фрейм и угадает тип файла по
// содержимому, а не по заголовку.
//
// Ни одно из этих правил нельзя проверить изнутри страницы: все они живут в
// заголовках, а заголовки на Cloudflare ставит _headers. Поэтому проверок две
// и они про разное: объявлено ли правило в файле — и доехало ли оно до гостя.
// Первое ловит опечатку в имени заголовка, второе — что файл вообще не поехал
// или что воркер его перебил.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// Что должно быть и почему. `check` возвращает замечание строкой или null,
// если со значением всё в порядке.
const WANTED = [
  {
    name: 'content-security-policy',
    why: 'без неё браузер выполнит любой скрипт, попавший в разметку',
    hard: true,
    check: v => {
      if (!/default-src/.test(v)) return 'нет default-src — правило ни к чему не привязано';
      if (/unsafe-eval/.test(v)) return "есть 'unsafe-eval' — это разрешение на eval()";
      if (!/frame-ancestors/.test(v)) return 'нет frame-ancestors — страницу можно встроить в чужой фрейм';
      // 'unsafe-inline' у скриптов — не отказ, а долг: на странице четыре
      // встроенных скрипта, и правильный ответ им — хэши, а не разрешение
      // всему подряд. До хэшей это лучше, чем отсутствие политики вовсе.
      if (/script-src[^;]*unsafe-inline/.test(v)) {
        return { soft: "script-src разрешает 'unsafe-inline' — стоит перейти на хэши" };
      }
      return null;
    },
  },
  {
    name: 'strict-transport-security',
    why: 'без него первый заход по http можно перехватить',
    hard: true,
    check: v => {
      const age = Number(v.match(/max-age=(\d+)/)?.[1] ?? 0);
      // Полгода — то, с чего начинают списки предзагрузки браузеров.
      if (age < 15768000) return `max-age=${age}, а нужно от 15768000 (полгода)`;
      return null;
    },
  },
  {
    name: 'x-content-type-options',
    why: 'без него браузер угадывает тип файла по содержимому и может выполнить картинку как скрипт',
    hard: true,
    check: v => (v.trim() === 'nosniff' ? null : `«${v}», а нужно nosniff`),
  },
  {
    name: 'referrer-policy',
    why: 'по умолчанию на чужой сайт уезжает полный адрес страницы, с которой ушли',
    hard: true,
    check: v => (/no-referrer|strict-origin/.test(v) ? null
      : `«${v}» — слишком щедро, нужно strict-origin-when-cross-origin или строже`),
  },
  {
    name: 'permissions-policy',
    why: 'без него встроенный кем-то фрейм может попросить камеру и геолокацию от имени сайта',
    hard: false,
    check: () => null,
  },
  {
    name: 'cross-origin-opener-policy',
    why: 'изолирует вкладку от той, что её открыла',
    hard: false,
    check: v => (/same-origin/.test(v) ? null : `«${v}», ожидалось same-origin`),
  },
];

// ── Что объявлено в _headers ──────────────────────────────────────────────
// Правило вида /* применяется ко всему; заголовки безопасности ставят именно
// так — иначе они окажутся на стилях и не окажутся на странице.
function declared() {
  const out = new Map();
  let path = null;
  for (const line of readFileSync(join(ROOT, '_headers'), 'utf8').split('\n')) {
    if (line.startsWith('/')) path = line.trim();
    else if (path && /^\s+\S+:/.test(line)) {
      const [name, ...rest] = line.trim().split(':');
      if (path === '/*') out.set(name.toLowerCase(), rest.join(':').trim());
    }
  }
  return out;
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const live = args.includes('--url') ? args[args.indexOf('--url') + 1].replace(/\/$/, '') : null;

let got;
if (live) {
  const res = await fetch(live + '/', { signal: AbortSignal.timeout(30000) });
  got = new Map([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
} else {
  got = declared();
}

const results = [];
for (const want of WANTED) {
  const value = got.get(want.name);
  if (value === undefined) {
    results.push({ name: want.name, ok: false, soft: !want.hard,
      detail: `не ${live ? 'отдаётся' : 'объявлен'} — ${want.why}` });
    continue;
  }
  const verdict = want.check(value);
  if (verdict === null) {
    results.push({ name: want.name, ok: true, detail: value.slice(0, 90) });
  } else if (typeof verdict === 'object' && verdict.soft) {
    results.push({ name: want.name, ok: false, soft: true, detail: verdict.soft });
  } else {
    results.push({ name: want.name, ok: false, soft: !want.hard, detail: verdict });
  }
}

const bad = results.filter(r => !r.ok && !r.soft);
const soft = results.filter(r => !r.ok && r.soft);

if (asJson) {
  console.log(JSON.stringify({ source: live ?? '_headers', results }, null, 2));
  process.exit(bad.length ? 1 : 0);
}

console.log(live ? `${live} — что отдаётся` : '_headers — что объявлено для /*');
console.log('');
for (const r of results) {
  const mark = r.ok ? '·' : r.soft ? 'СТОИТ ПОЧИНИТЬ' : 'ПЛОХО';
  console.log(`  ${mark} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}
console.log(`\n${results.length - bad.length - soft.length} из ${results.length} в порядке` +
  (soft.length ? `, ${soft.length} на потом` : ''));
process.exit(bad.length ? 1 : 0);
