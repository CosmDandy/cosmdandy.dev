"""Сборка платы: порядок блоков, проверки, вставка в страницу.

Схема собирается из независимых узлов. Узел — это файл в board/blocks/:
рисует себя и ничего не знает о соседях. Общее лежит в board/: geom —
координаты, canvas — холст и регистр занятых мест, palette/ink/lamps/metal/
ports — то, чем рисуют, revision — партномера.

Здесь только три вещи, которых не может знать отдельный блок:

1. ПОРЯДОК. Он же порядок слоёв, он же очередь на место: кто первым занял
   прямоугольник, того и место. Поэтому список ниже — не алфавит и не
   «как удобно читать», а сборочный порядок, и менять его нужно осознанно.

2. ГРАНИЦЫ. Блок может объявить BOUNDS = (x, y, w, h) — свой прямоугольник.
   Тогда сборка проверит, что он в него уложился, и упадёт с именем блока,
   если нет. Это и есть гарантия, что двое, правящих разные узлы, не
   налезут друг на друга: ошибку находит скрипт, а не глаз.

3. ОТЧЁТ. Что не поместилось на плату (место кончилось) и во что каждый
   блок в итоге уложился. Молчаливая потеря деталей здесь случалась трижды.

Геометрия снята с реальной схемы Gigabyte R183-S94 (вид сверху, крышка
снята), индикация — с IBM x3550 M3. Композиция повёрнута на 90°: фронт
слева, глубина вправо, потому что экран широкий, а сервер длинный.

Две роли элементов, и они не совпадают:
  .unit — то, что называет себя ярлыком при наведении (диск, банк памяти,
          процессор, сетевая карта). Ярлык живёт рядом со своим узлом.
  .pick — то, что физически вынимается: планка, диск, вентилятор, радиатор,
          райзер, блок питания.
Лампа неисправности всегда лежит внутри своего .pick — иначе селектор
`.pick.pulled .fault` до неё не достаёт, и горят не те лампы.

Индикация: гасим лампы через fill-opacity, а не opacity. opacity на SVG
создаёт composited layer, и слои перекрывают сцену целиком — именно так
выглядел баг «весь фон стал чёрным».
"""

import importlib
import re
from pathlib import Path

from board.canvas import Canvas

HERE = Path(__file__).parent

# Порядок сборки. Плата идёт снизу вверх: поле, зоны, разводка, отверстия,
# рассыпуха — и только потом узлы, которые на ней стоят. Выноски-подписи
# предпоследние: они ложатся поверх всего, кроме выдвижной панели.
ORDER = [
    'chassis',       # корпус и уши стойки
    'pcb_field',     # текстолит с вырезами под блоки питания
    'pcb_zones',     # резервации под крупные узлы + шелкография
    'pcb_edge',      # разъёмы у кромки
    'pcb_traces',    # разводка: публикует узлы для отверстий
    'pcb_vias',      # переходные отверстия — по узлам разводки
    'pcb_scatter',   # рассыпуха: садится в то, что осталось, поэтому поздно
    'vrm',           # питание ядра, вплотную к сокетам
    'front_panel',   # блок управления на фронте
    'drives',        # корзина 2.5″
    'backplane',
    'cables',        # жгуты SlimSAS
    'fans',
    'cable_ends',    # ответные разъёмы жгутов на плате
    'memory',
    'cpu',
    'service',       # батарея, microSD, тумблер, таблица перемычки
    'psu',
    'risers',
    'rear_io',       # SFP+, RJ45, порт управления
    'marks',         # обозначения узлов на текстолите
    'frames',        # контурные рамки функциональных блоков
    'callouts',      # подписи-ссылки — поверх всего
    'lightpath',     # выдвижная панель диагностики
]



def bbox(fragments):
    """Грубые габариты нарисованного: по числам в координатных атрибутах.

    Считаем по координатным атрибутам и намеренно не разбираем пути: в d=""
    вперемешку лежат абсолютные точки, относительные смещения и радиусы дуг,
    и попытка взять их за координаты даёт габарит вдвое больше настоящего.
    Для контроля «не залез ли блок к соседу» хватает прямоугольников,
    окружностей, линий и подписей — важен порядок величины.
    """
    xs, ys = [], []
    for frag in fragments:
        for attr, bag in (('x', xs), ('y', ys), ('cx', xs), ('cy', ys),
                          ('x1', xs), ('x2', xs), ('y1', ys), ('y2', ys)):
            for m in re.finditer(rf'\b{attr}="(-?\d+(?:\.\d+)?)"', frag):
                bag.append(float(m.group(1)))
    if not xs or not ys:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def build():
    board, lid = Canvas(), Canvas()
    report = []

    for name in ORDER:
        mod = importlib.import_module(f'board.blocks.{name}')
        mark = len(board.parts)
        mod.render(board)
        drawn = board.parts[mark:]
        box = bbox(drawn)
        report.append((name, len(drawn), box))

        limits = getattr(mod, 'BOUNDS', None)
        if limits and box:
            lx, ly, lw, lh = limits
            x0, y0, x1, y1 = box
            assert lx <= x0 and ly <= y0 and x1 <= lx + lw and y1 <= ly + lh, (
                f'блок {name} вышел за свои границы: нарисовал '
                f'({x0:.0f},{y0:.0f})–({x1:.0f},{y1:.0f}), объявил {limits}')

    importlib.import_module('board.blocks.lid').render(lid)

    if board.lost:
        print('НЕ РАЗМЕСТИЛОСЬ:', ', '.join(board.lost))
    return board, lid, report


BLOCK_MARK = re.compile(r'^([ \t]*)/\* @block: ([a-z_]+) \*/[ \t]*$', re.MULTILINE)


def build_css():
    """Собрать server.css: база плюс стили узлов на своих местах.

    Маркер `/* @block: имя */` стоит ровно там, где правила узла лежали в
    едином файле. Это не украшение: при равной специфичности спор решает
    порядок, и переезд правила вниз или вверх меняет вид, ничего не сломав
    в синтаксисе.
    """
    base = (HERE / 'board/styles/base.css').read_text(encoding='utf-8')
    used = []

    def paste(m):
        indent, name = m.group(1), m.group(2)
        part = (HERE / f'board/blocks/{name}.css').read_text(encoding='utf-8').rstrip('\n')
        used.append(name)
        return f'{indent}/* ── {name} ──────────────────────────────── */\n{part}'

    css = BLOCK_MARK.sub(paste, base)
    head = ('/* СОБРАННЫЙ ФАЙЛ — правки затрёт следующая сборка.\n'
            ' * Источники: tools/board/styles/base.css и tools/board/blocks/*.css,\n'
            ' * собирает tools/build.py. Стили узла лежат рядом с его геометрией.\n'
            ' */\n')
    (HERE.parent / 'server.css').write_text(head + css, encoding='utf-8')
    return used


def main():
    board, lid, report = build()
    svg, lidart = board.svg(), lid.svg()
    css_blocks = build_css()

    (HERE / 'board-v17.svg.part').write_text(svg, encoding='utf-8')
    (HERE / 'board-v17-lid.svg.part').write_text(lidart, encoding='utf-8')

    page = HERE.parent / 'index.html'
    if page.exists():
        html = page.read_text(encoding='utf-8')
        html = re.sub(r'(<!-- BOARD:BEGIN -->).*?(<!-- BOARD:END -->)',
                      lambda m: m.group(1) + '\n' + svg + '\n' + m.group(2), html, flags=re.DOTALL)
        html = re.sub(r'(<!-- LIDART:BEGIN -->).*?(<!-- LIDART:END -->)',
                      lambda m: m.group(1) + '\n' + lidart + '\n' + m.group(2), html, flags=re.DOTALL)
        for probe in ('data-for=', 'class="die"', 'data-group="tw"'):
            assert probe in html, probe
        page.write_text(html, encoding='utf-8')

    print(f'плата: {len(board.parts)} фрагментов, {len(svg)} символов; '
          f'крышка: {len(lidart)} символов')
    print(f'стили: база + {len(css_blocks)} узлов ({", ".join(css_blocks)})')
    return report


if __name__ == '__main__':
    main()
