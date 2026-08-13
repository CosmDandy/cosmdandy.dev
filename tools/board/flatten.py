"""Слияние неподвижной краски в общие пути.

Схема рисуется поэлементно, потому что так её удобно собирать: каждый блок
кладёт свои прямоугольники, линии и круги там, где ему надо. Браузеру же
достаётся дерево, и он платит за каждый узел — не байтами, а пересчётом стиля.
Замерено на живой странице: при заходе 567 мс на стиль против 144 мс на
раскладку, и ещё 128 мс на каждые две секунды простоя, когда на схему никто не
смотрит.

При этом из шести с половиной тысяч фигур схемы больше девяноста процентов —
чистая краска: ни класса, ни анимации, ни обработчика, ни имени. Такую фигуру
незачем держать отдельным узлом: у соседа по цвету, обводке и толщине с ней
общая раскраска, и обе могут быть подпутями одного `<path>`.

Что сливается и что нет
-----------------------

Сливаются только фигуры без `class`, `id`, `transform`, `style`, обрезки и
маски — то есть те, до которых не дотягивается ни один селектор и ни одна
ссылка. Всё остальное остаётся ровно там, где стояло.

Копится это по группам, а не по всей схеме: группа `decor` — естественная
граница, за которой начинается чужая краска.

Порядок отрисовки при этом не меняется вообще — и это не обещание, а
устройство. Слитый путь встаёт на место первой фигуры корзины, а фигура
попадает в корзину, только если между ней и предыдущей участницей не было
ничего, что её задевает. Появилось — корзина закрывается, и следующая такая же
краска начинает новую, на своём месте.

Без этого правила слияние молча ломало картинку: площадка пайки у батарейки
совпала цветом с контактами, нарисованными до держателя, попала в их корзину и
уехала под держатель. Пиксельная проверка это ловит только если знать, куда
смотреть, — а правило не даёт этому случиться вовсе.

Направление обхода у всех подпутей одно (по часовой). Это не педантизм: у
`fill-rule: nonzero` два вложенных подпути противоположного направления дают
дырку, и слитые кольцо с кругом внутри превратились бы в бублик.

Полупрозрачность и наложение
----------------------------

Две полупрозрачные фигуры, лежащие друг на друге, дают более плотное пятно на
пересечении: краска кладётся дважды. Слитые в один путь, они красятся один раз,
и пятно пропадает. Замерено первой же попыткой — расхождение до 2,8 % пикселей
на схеме, и всё оно оттуда.

Поэтому у непрозрачной краски ограничений нет — наложение опаковых фигур
выглядит одинаково хоть врозь, хоть вместе, — а полупрозрачные попадают в одну
корзину только пока их габариты не пересекаются. Пересеклись — заводится вторая
корзина с той же раскраской, и рисуется она отдельным путём на своём месте.
Пути с кривыми в полупрозрачных корзинах не сливаются вовсе: честный габарит
дуги по числам в `d` не посчитать, а врать здесь нельзя.
"""

import re

TOKEN = re.compile(r'<(/?)(\w[\w-]*)((?:"[^"]*"|[^>"])*?)(/?)>', re.DOTALL)
SHAPES = {'rect', 'circle', 'ellipse', 'line', 'path', 'polyline'}
# Пока внутри такого — не трогаем ничего: на содержимое ссылаются по имени.
OPAQUE = {'defs', 'clipPath', 'mask', 'symbol', 'marker', 'pattern', 'text'}
# Признак «эту фигуру видит кто-то ещё»: селектор, ссылка, своя система
# координат. Такую не сливаем.
OWNED = ('class=', 'id=', 'transform=', 'clip-path=', 'mask=', 'filter=', 'style=',
         # Пунктир идёт вдоль всего пути и через `M` не сбрасывается: слитые
         # штриховые фигуры получили бы каждая свой сдвиг узора. Такие не
         # трогаем совсем.
         'stroke-dasharray=')
# Из чего состоит раскраска. Совпало всё — фигуры можно рисовать одним путём.
PAINT = ('fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity',
         'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
         'opacity', 'paint-order', 'fill-rule', 'vector-effect')

ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def _num(v):
    """Число без хвостовых нулей: 12.0 → 12, 12.50 → 12.5."""
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return s if s not in ('', '-0') else '0'


def _f(d, key, default=0.0):
    try:
        return float(d.get(key, default))
    except ValueError:
        return default


def to_path(tag, d):
    """Фигура как участок пути. None — значит, не наш случай."""
    if tag == 'path':
        s = d.get('d', '').strip()
        return s if s[:1] in ('M', 'm') else None
    if tag == 'line':
        return (f'M{_num(_f(d, "x1"))} {_num(_f(d, "y1"))}'
                f'L{_num(_f(d, "x2"))} {_num(_f(d, "y2"))}')
    if tag == 'polyline':
        pts = d.get('points', '').split()
        return ('M' + 'L'.join(pts)) if len(pts) > 1 else None
    if tag == 'circle':
        cx, cy, r = _f(d, 'cx'), _f(d, 'cy'), _f(d, 'r')
        if r <= 0:
            return None
        return (f'M{_num(cx - r)} {_num(cy)}'
                f'a{_num(r)} {_num(r)} 0 1 0 {_num(2 * r)} 0'
                f'a{_num(r)} {_num(r)} 0 1 0 {_num(-2 * r)} 0Z')
    if tag == 'ellipse':
        cx, cy = _f(d, 'cx'), _f(d, 'cy')
        rx, ry = _f(d, 'rx'), _f(d, 'ry')
        if rx <= 0 or ry <= 0:
            return None
        return (f'M{_num(cx - rx)} {_num(cy)}'
                f'a{_num(rx)} {_num(ry)} 0 1 0 {_num(2 * rx)} 0'
                f'a{_num(rx)} {_num(ry)} 0 1 0 {_num(-2 * rx)} 0Z')
    if tag == 'rect':
        x, y = _f(d, 'x'), _f(d, 'y')
        w, h = _f(d, 'width'), _f(d, 'height')
        if w <= 0 or h <= 0:
            return None
        rx = _f(d, 'rx', _f(d, 'ry'))
        ry = _f(d, 'ry', rx)
        rx, ry = min(rx, w / 2), min(ry, h / 2)
        if rx <= 0 or ry <= 0:
            return (f'M{_num(x)} {_num(y)}h{_num(w)}v{_num(h)}h{_num(-w)}Z')
        return (f'M{_num(x + rx)} {_num(y)}'
                f'h{_num(w - 2 * rx)}a{_num(rx)} {_num(ry)} 0 0 1 {_num(rx)} {_num(ry)}'
                f'v{_num(h - 2 * ry)}a{_num(rx)} {_num(ry)} 0 0 1 {_num(-rx)} {_num(ry)}'
                f'h{_num(-(w - 2 * rx))}a{_num(rx)} {_num(ry)} 0 0 1 {_num(-rx)} {_num(-ry)}'
                f'v{_num(-(h - 2 * ry))}a{_num(rx)} {_num(ry)} 0 0 1 {_num(rx)} {_num(-ry)}Z')
    return None


ALPHA = re.compile(r'rgba\([^)]*,\s*([\d.]+)\s*\)')


def translucent(d):
    """Кладёт ли фигура краску сквозь себя."""
    for k in ('opacity', 'fill-opacity', 'stroke-opacity'):
        try:
            if k in d and float(d[k]) < 1:
                return True
        except ValueError:
            return True
    for k in ('fill', 'stroke'):
        m = ALPHA.search(d.get(k, ''))
        if m and float(m.group(1)) < 1:
            return True
    return False


def bbox(tag, d):
    """Габарит фигуры. None — посчитать честно нельзя.

    У путей честного габарита по числам не выходит: дуга выпирает за свои
    опорные точки, а относительные команды — это не координаты. Такой путь и
    не сливается, и закрывает все открытые корзины: неизвестный габарит — это
    габарит во всю группу.
    """
    if tag == 'rect':
        x, y, w, h = _f(d, 'x'), _f(d, 'y'), _f(d, 'width'), _f(d, 'height')
        box = (x, y, x + w, y + h)
    elif tag == 'circle':
        cx, cy, r = _f(d, 'cx'), _f(d, 'cy'), _f(d, 'r')
        box = (cx - r, cy - r, cx + r, cy + r)
    elif tag == 'ellipse':
        cx, cy = _f(d, 'cx'), _f(d, 'cy')
        rx, ry = _f(d, 'rx'), _f(d, 'ry')
        box = (cx - rx, cy - ry, cx + rx, cy + ry)
    elif tag == 'line':
        x1, y1, x2, y2 = _f(d, 'x1'), _f(d, 'y1'), _f(d, 'x2'), _f(d, 'y2')
        box = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
    else:
        return None
    # Обводка вылезает за габарит на половину своей толщины.
    half = _f(d, 'stroke-width', 1) / 2 if d.get('stroke', 'none') != 'none' else 0
    return (box[0] - half, box[1] - half, box[2] + half, box[3] + half)


def _hits(a, b):
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def _union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


class _Bucket:
    __slots__ = ('paint', 'pieces', 'boxes', 'since', 'see_through')

    def __init__(self, paint, see_through):
        self.paint = paint
        self.pieces = []
        self.boxes = []       # габариты участниц — нужны только сквозной краске
        self.since = None     # что нарисовано после последней участницы
        self.see_through = see_through


class _Group:
    __slots__ = ('open',)

    def __init__(self):
        self.open = {}        # раскраска → открытая корзина

    def note(self, box, skip=None):
        """Между участницами корзин появилась фигура: запоминаем её габарит."""
        for paint, b in list(self.open.items()):
            if b is skip:
                continue
            if box is None:
                del self.open[paint]      # габарит неизвестен — закрываем всё
            else:
                b.since = _union(b.since, box)


def flatten(svg):
    """Возвращает (разметка, сколько фигур было, сколько стало)."""
    out = []            # ячейки вывода: строка или корзина
    stack = []
    opaque = 0
    was = now = 0

    def note_all(box):
        for g in stack:
            g.note(box)

    pos = 0
    for m in TOKEN.finditer(svg):
        if m.start() > pos:
            out.append(svg[pos:m.start()])
        pos = m.end()
        close, tag, attrs, self_close = m.groups()
        whole = m.group(0)

        if tag in OPAQUE:
            if not self_close:
                opaque += -1 if close else 1
            out.append(whole)
            note_all(None)
            continue
        if opaque > 0:
            out.append(whole)
            continue
        if tag == 'g':
            # Вложенная группа может нести что угодно и переносить систему
            # координат: для всех открытых корзин снаружи это неизвестный
            # габарит.
            note_all(None)
            if close:
                if stack:
                    stack.pop()
            else:
                stack.append(_Group())
            out.append(whole)
            continue
        if tag not in SHAPES:
            out.append(whole)
            note_all(None)
            continue

        was += 1
        d = dict(ATTR.findall(attrs))
        box = bbox(tag, d)
        if not stack or any(k in attrs for k in OWNED):
            out.append(whole)
            now += 1
            note_all(box)
            continue
        piece = to_path(tag, d)
        if piece is None or box is None:
            out.append(whole)
            now += 1
            note_all(box)
            continue

        paint = tuple((k, d[k]) for k in PAINT if k in d)
        see_through = translucent(d)
        g = stack[-1]
        b = g.open.get(paint)
        if b is not None:
            # Корзина принимает фигуру, только если между ними ничего не
            # вклинилось; сквозная краска — ещё и если не наложится на своих.
            blocked = b.since is not None and _hits(box, b.since)
            if not blocked and see_through:
                blocked = any(_hits(box, o) for o in b.boxes)
            if blocked:
                del g.open[paint]
                b = None
        if b is None:
            b = _Bucket(paint, see_through)
            g.open[paint] = b
            out.append(b)
            now += 1
        b.pieces.append(piece)
        b.since = None
        if see_through:
            b.boxes.append(box)
        # Для чужих корзин эта фигура — помеха.
        for gg in stack:
            gg.note(box, skip=b)
    out.append(svg[pos:])

    parts = []
    for cell in out:
        if isinstance(cell, _Bucket):
            attrs = ''.join(f' {k}="{v}"' for k, v in cell.paint)
            parts.append(f'<path d="{"".join(cell.pieces)}"{attrs}/>')
        else:
            parts.append(cell)
    return ''.join(parts), was, now
