// Где взять chromium — один ответ на все проверки.
//
// Раньше этот ответ был записан в каждом инструменте отдельно, и записан он
// был для одной машины: путь в /nix/store. В контейнере это верно, а в CI
// такого пути нет вовсе, и любая проверка там падала бы на первой строке ещё
// до того, как что-то проверила.
//
// Порядок поиска — от самого явного к самому общему:
//   CHROME_PATH        сказано прямо: берём и не спорим
//   /nix/store         контейнер разработки; скачанный playwright тут не
//                      стартует — в образе нет libglib-2.0
//   playwright         его собственный браузер: так это работает в CI
import { createRequire } from 'node:module';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

export function playwright() {
  // Три места, и все три настоящие: рядом с контейнером разработки, в самом
  // репозитории и в tools/ci — туда его ставит CI по своему файлу блокировки.
  for (const dir of ['/workspaces/.pw/', ROOT + '/tools/ci/', ROOT + '/']) {
    try { return createRequire(dir)('playwright'); } catch { /* следующий */ }
  }
  throw new Error('нет playwright. Поставить:\n' +
    '  mkdir -p /workspaces/.pw && cd /workspaces/.pw && npm init -y\n' +
    '  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright pngjs');
}

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const nix = globSync('/nix/store/*chromium-1[0-9][0-9]*/bin/chromium')
    .filter(p => !p.includes('unwrapped') && !p.includes('sandbox'))[0];
  if (nix) return nix;
  // Пусто — значит браузер берёт сам playwright: у него свой, скачанный.
  return undefined;
}

/** Снять поля ввода до первой отрисовки.
 *
 * Этот сборник chromium роняет рендерер на любом <input> — воспроизводится на
 * голой странице с одним полем. Проверки поэтому убирают поля перед съёмкой, и
 * долгое время хватало обработчика на DOMContentLoaded: первую отрисовку
 * задерживали блокирующие стили схемы, и поле не успевало нарисоваться.
 *
 * Стоило стилям схемы перестать блокировать отрисовку на узком экране, как
 * запас исчез: страница успевала показать поле раньше, чем его убирали, и
 * рендерер падал ещё до `load` — проверка отчитывалась не поломкой сайта, а
 * закрытым браузером.
 *
 * Поэтому наблюдатель, а не событие: поля исчезают в тот же кадр, в котором
 * появляются в разметке.
 */
export const dropInputs = () => {
  const drop = () => document.querySelectorAll('input').forEach(el => el.remove());
  // Ровно на DOMContentLoaded, и это единственное правильное место. Раньше —
  // и скрипт схемы, выполняемый с `defer` перед этим событием, не найдёт полей,
  // на которые рассчитывает: он падает на первом же обработчике и не доигрывает
  // вовсе. Позже — и поле успеет попасть в кадр.
  //
  // Наблюдатель, снимающий поля по мере появления, пробовался и отброшен по
  // первой причине: он опережает `defer`.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', drop, { once: true });
  } else {
    drop();
  }
};

/** Запустить браузер тем способом, который на этой машине работает. */
export async function launch(options = {}) {
  const { chromium } = playwright();
  const executablePath = chromePath();
  // Свои флаги вынимаются из настроек и дописываются к общим, а не наоборот.
  // Разложенные после `args:` настройки затирали вычисленный список целиком —
  // вместе с `--no-sandbox`, без которого браузер не стартует там, где нет
  // песочницы. Молча: в этом контейнере он всё равно поднимался.
  const { args = [], ...rest } = options;
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    ...rest,
    args: ['--no-sandbox', ...args],
  });
}
