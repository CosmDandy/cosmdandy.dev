#!/usr/bin/env bash
# Все проверки разом.
#
#   tools/test.sh            быстрые: без браузера, секунда с небольшим
#   tools/test.sh --browser  плюс браузерные: карточка, поведение, скорость
#   tools/test.sh --live     плюс живой сайт (нужна сеть наружу)
#   tools/test.sh --all      всё
#
# Разделение по времени, а не по важности. Быстрые гоняются после каждой
# правки и стоят секунды; браузерные поднимают chromium и меряют время, и
# гонять их на каждое сохранение бессмысленно; живые ходят в интернет и
# проверяют не код, а то, что из него развернулось.
#
# Каждая проверка печатает своё и возвращает код. Раннер не глотает вывод: у
# половины из них ответ — это не «ок», а число, которое надо прочитать глазами.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

mode="${1:-}"
browser=0; live=0
case "$mode" in
  --browser) browser=1 ;;
  --live) live=1 ;;
  --all) browser=1; live=1 ;;
  '') ;;
  *) echo "не знаю режима «$mode». Есть: --browser, --live, --all"; exit 2 ;;
esac

failed=()
run() {
  local name="$1"; shift
  echo ""
  echo "── $name ─────────────────────────────────────────────"
  if "$@"; then
    return 0
  fi
  failed+=("$name")
}

# ── Быстрые: чистая логика и собранные файлы ──────────────────────────────
run "юнит-тесты" python3 -m unittest discover -s tests -t tests
run "слои платы" python3 tools/layers.py
run "подписи не наехали" python3 tools/audit_text.py
run "заголовки безопасности" node tools/security-headers.mjs

# ── Браузерные ────────────────────────────────────────────────────────────
if [ "$browser" = 1 ]; then
  # Лента ревизий в репозитории не лежит, а три сценария поведения её просят.
  # Без неё они падают на пустом месте — не поломка, а несобранные данные.
  if [ ! -d history ]; then
    echo "ленты ревизий нет, собираю (нужна поведению)"
    python3 tools/history.py | tail -1
  fi
  run "карточка на телефоне" node tools/mobile.mjs
  run "анимации карточки" node tools/anim.mjs
  run "доступность" node tools/a11y.mjs
  run "воркер" node tools/rum-check.mjs
  run "поведение машины" node tools/behave.mjs
  # Мерке нужна остывшая машина: сразу после поведения TTI подскакивает вдвое
  # — 2093 мс против 814, 829, 858 в изоляции. Ждём, пока предыдущая проверка
  # отпустит свои браузеры, а не гадаем по секундомеру.
  while pgrep -f 'chromium.*--headless' > /dev/null 2>&1; do sleep 1; done
  sleep 3
  run "скорость по устройствам" node tools/perf-matrix.mjs
  # Разбор по анимациям стоит полторы минуты, поэтому в общем прогоне идёт
  # быстрый режим: только «сцена в работе» против «сцены без анимаций». Кто
  # именно виноват, спрашивают отдельно — node tools/perf-attrib.mjs.
  while pgrep -f 'chromium.*--headless' > /dev/null 2>&1; do sleep 1; done
  run "плавность схемы" node tools/perf-attrib.mjs --quick
fi

# ── Живые ─────────────────────────────────────────────────────────────────
if [ "$live" = 1 ]; then
  run "развёрнутый сайт" node tools/live-check.mjs
fi

echo ""
if [ ${#failed[@]} -eq 0 ]; then
  echo "всё в порядке"
  exit 0
fi
echo "не прошло: ${failed[*]}"
exit 1
