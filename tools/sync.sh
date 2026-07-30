#!/usr/bin/env bash
# Перегенерировать плату и вставить её в index.html между маркерами.
# Генератор живёт здесь, а не в песочнице прототипа: по нему считаются хэши
# коммитов на каждый узел, и ссылки должны вести в этот же репозиторий.
set -euo pipefail
cd "$(dirname "$0")"
python3 gen_board.py

python3 - <<'PY'
import re
p = '../index.html'
h = open(p, encoding='utf-8').read()
board = open('board-v17.svg.part', encoding='utf-8').read()
lid   = open('board-v17-lid.svg.part', encoding='utf-8').read()
new = re.sub(r'(<!-- BOARD:BEGIN -->).*?(<!-- BOARD:END -->)',
             lambda m: m.group(1) + '\n' + board + '\n' + m.group(2), h, flags=re.S)
new = re.sub(r'(<!-- LIDART:BEGIN -->).*?(<!-- LIDART:END -->)',
             lambda m: m.group(1) + '\n' + lid + '\n' + m.group(2), new, flags=re.S)
for probe in ('data-for=', 'class="die"', 'data-group="tw"'):
    assert probe in new, probe
open(p, 'w', encoding='utf-8').write(new)
print('на странице: плата', len(board), 'символов, крышка', len(lid))
PY

# Лента ревизий: локально её надо пересобрать вручную, в CI это делает
# отдельный шаг. Без этого лента показывает вчерашнюю историю.
python3 history.py | head -1
