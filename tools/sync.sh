#!/usr/bin/env bash
# Rebuild the board and splice it into index.html between the markers.
#
# The build lives here rather than in the prototype sandbox: the commit hash of
# every unit is worked out from its block file, and the part-number links have
# to point into this same repository. build.py splices the page itself — a
# separate step that rewrote index.html was the second place where an edit
# could get overwritten.
set -euo pipefail
cd "$(dirname "$0")"

python3 build.py

# Тема — один исходник на три страницы, вставляемый в разметку. Отдельным
# файлом он был лишним блокирующим запросом перед первым кадром у каждой.
python3 inline_theme.py

# Отметка о сборке — сразу после генератора: тот переписывает index.html между
# метками, и штамп, поставленный раньше, он бы не тронул, но и не обновил.
# Локально в отметке стоит состояние рабочего дерева, а не коммита: смотришь ты
# именно на дерево. На стендах её переставляет пайплайн, который развёртывает.
# Версия статики — до отметки о сборке: она считается от содержимого файлов,
# а штамп меняет только страницу, на хэши стилей и скрипта не влияя.
python3 stamp_assets.py

# Политика перечисляет встроенные скрипты по хэшам, поэтому считается после
# всех, кто эти скрипты правит: вставки темы и мерок. Локально она сходится с
# исходниками; в конвейере пересчитывается заново — там тела уже
# минифицированы, и хэши от них другие.
python3 csp.py

python3 stamp_build.py ../index.html ../404.html ../tg/index.html | tail -1

python3 audit_text.py | tail -1

# Pixels and behaviour are checked separately and take longer — run on demand:
#   node tools/visual_ref.mjs   (--save takes the reference)
#   node tools/behave.mjs

# The revision strip: locally it has to be rebuilt by hand. Without this the
# strip shows yesterday's history. It is deliberately not built in CI — the
# strip is a development tool and does not go out with the site.
python3 history.py | head -1
