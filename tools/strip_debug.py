"""Отладочные слои схемы — вон из продакшена.

Схема несёт четыре слоя, которые нужны только тому, кто её правит: границы
занятости, наслоения рисунка, координатную сетку и заготовку под наслоения.
Панель, которой они переключаются, на продакшен и так не попадает — она
появляется только там, где есть отметка о сборке, то есть локально и на
стендах. А сами слои попадали: они часть разметки и уезжали в страницу всегда.

Померено на этой машине: 1 435 элементов и 105 КБ — 23 % всех фигур схемы и
10 % её байтов. Платил за них каждый гость, а пользуются ими двое, и только
когда правят плату.

Отсюда и место этого шага: не в генераторе, а в развёртывании. Собирается
_site один раз и уходит в оба стенда, поэтому вырезать надо там, где известно,
что стенд продакшен, — рядом со стиранием отметки о сборке, по той же причине
и в той же точке.

    python3 tools/strip_debug.py _site/index.html
"""

import re
import sys
from pathlib import Path

LAYERS = ('lyr-bounds', 'lyr-overlap', 'lyr-clash', 'lyr-grid')
OPEN_CLOSE = re.compile(r'<g\b|</g>')


def cut(html, cls):
    """Вырезает группу вместе с содержимым. Возвращает (разметка, сколько байт)."""
    start = html.find(f'<g class="{cls}"')
    if start < 0:
        return html, 0
    depth, pos = 0, start
    while True:
        m = OPEN_CLOSE.search(html, pos)
        if not m:
            return html, 0        # разметка не закрыта — не трогаем ничего
        depth += 1 if m.group(0) == '<g' else -1
        pos = m.end()
        if depth == 0:
            break
    return html[:start] + html[pos:], pos - start


def main(argv):
    if not argv:
        print(__doc__.strip().splitlines()[-1].strip())
        return 1
    total = 0
    for name in argv:
        page = Path(name)
        html = page.read_text(encoding='utf-8')
        gone = []
        for cls in LAYERS:
            html, n = cut(html, cls)
            if n:
                gone.append(f'{cls} −{n}')
                total += n
        page.write_text(html, encoding='utf-8')
        print(f'{page.name}: {", ".join(gone) if gone else "отладочных слоёв нет"}')
    print(f'вырезано {total} байт')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
