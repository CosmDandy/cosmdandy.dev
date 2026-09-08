#!/usr/bin/env python3
"""Трасса контура: правила, которые глазом не проверяются.

    python3 tools/dlc_check.py            проверить, упасть на нарушении
    python3 tools/dlc_check.py --list     все отрезки с их координатами

Зачем. Шланг на схеме идёт там, где на живой машине ему есть где идти, и
ошибки тут не в отделке, а в геометрии: магистраль пошла не той стороной
памяти, легла на плашки, вошла в штуцер не с той стороны, сломалась под
прямым углом. На картинке всё это выглядит правдоподобно — линия и линия, —
и находится только сравнением с фотографией, то есть чужими глазами.

Правила ниже — то же сравнение, записанное числами. Они берутся из `geom`:
где стоят банки памяти, где проход у стены вентиляторов, где плиты. Трасса
берётся из `blocks/dlc.routes()` — оттуда же, откуда её рисует сборка.
"""
import argparse
import sys
from math import atan2, degrees, hypot
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from board import geom
from board.blocks import dlc

# Залом считается не по углу, а по радиусу, который в этот угол влезает:
# сборка скругляет колена дугой, и поворот на девяносто градусов законен, если
# отрезки по сторонам достаточно длинные. Пережимается рукав тогда, когда
# радиус меньше полутора его диаметров — это и есть предел изгиба.
MIN_R = 26           # меньше этого рукав пережат
SHARP = 100          # угол, ниже которого колено считается поворотом
# Проход у стены вентиляторов: всё, что левее памяти, считается левой стороной.
LEFT_LANE = geom.X_CORE
# Полоса между памятью и служебной зоной — единственный проход справа.
RIGHT_LANE = geom.X_CORE + geom.DIMM_SOCK_W


def banks():
    """Прямоугольники банков памяти: по ним шланг не проложить."""
    height = geom.BANK_N * geom.PITCH
    return [(geom.X_CORE, y, geom.DIMM_SOCK_W, height)
            for y in (geom.Y_BANK_L, geom.Y_BANK_C, geom.Y_BANK_R)]


def segments():
    """Все отрезки трассы: (имя, начало, конец).

    Берутся не из ломаной, а из `dlc.traced` — из того, что реально нарисовано.
    Колена скругляются, кривая срезает угол и уходит внутрь: по сырой ломаной
    проверять значит проверять не ту линию, которую видно на схеме.
    """
    out = []
    for name, points in dlc.routes().items():
        path = dlc.traced(points)
        for a, b in zip(path, path[1:]):
            out.append((name, a, b))
    return out


def crosses(seg, rect):
    """Пересекает ли отрезок прямоугольник — по выборке точек вдоль него.

    Точная задача о пересечении отрезка с прямоугольником тут не нужна: шаг
    выборки мельче плашки памяти, и всё, что реально проходит по банку, в неё
    попадает.
    """
    (x0, y0), (x1, y1) = seg
    rx, ry, rw, rh = rect
    steps = max(2, int(hypot(x1 - x0, y1 - y0) / 4))
    for i in range(steps + 1):
        t = i / steps
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        if rx <= x <= rx + rw and ry <= y <= ry + rh:
            return (round(x), round(y))
    return None


def side(a, b, p):
    """С какой стороны от прямой ab лежит точка p."""
    return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))


def touching(s1, s2):
    """Есть ли у отрезков общий конец: соседи по трассе и сходящиеся в штуцере.

    Такие пары касаются по построению, и считать это пересечением нельзя.
    """
    return any(hypot(p[0] - q[0], p[1] - q[1]) < 1 for p in s1 for q in s2)


def meet(s1, s2):
    """Точка пересечения отрезков или None."""
    (a, b), (c, d) = s1, s2
    d1, d2 = side(c, d, a), side(c, d, b)
    d3, d4 = side(a, b, c), side(a, b, d)
    if (d1 > 0) == (d2 > 0) or (d3 > 0) == (d4 > 0):
        return None
    t = d1 / (d1 - d2)
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def check():
    bad = []
    hubs = dlc.hubs()

    # 1. По памяти шланг не проходит. Кроме плит, между которыми он и лежит:
    #    полоса самих плит из банков вычтена самой их геометрией.
    for name, a, b in segments():
        for k, rect in enumerate(banks()):
            hit = crosses((a, b), rect)
            if hit:
                bad.append(f'{name}: отрезок {a}–{b} идёт по банку памяти в точке {hit}')

    # 2. Переход между плитами идёт слева от памяти. Справа для него полосы нет:
    #    там служебная зона и карманы блоков питания.
    for name, a, b in segments():
        if abs(b[1] - a[1]) > 250 and min(a[0], b[0]) > LEFT_LANE:
            bad.append(f'{name}: переход между плитами идёт справа от памяти '
                       f'(x={min(a[0], b[0]):.0f}, левая сторона — до {LEFT_LANE})')

    # 3. В каждое колено влезает радиус изгиба. Сборка скругляет углы дугой, но
    #    радиус она урезает по длине соседних отрезков: на коротком колене от
    #    дуги ничего не остаётся, и шланг ломается.
    for name, points in dlc.routes().items():
        for i in range(1, len(points) - 1):
            (x0, y0), (x1, y1), (x2, y2) = points[i - 1], points[i], points[i + 1]
            a1 = atan2(y0 - y1, x0 - x1)
            a2 = atan2(y2 - y1, x2 - x1)
            ang = abs(degrees(a1 - a2)) % 360
            ang = min(ang, 360 - ang)
            r = min(dlc.BEND, hypot(x1 - x0, y1 - y0) * dlc.BEND_FRAC,
                    hypot(x2 - x1, y2 - y1) * dlc.BEND_FRAC)
            if ang < SHARP and r < MIN_R:
                bad.append(f'{name}: колено в ({x1:.0f},{y1:.0f}) — {ang:.0f}° '
                           f'при радиусе {r:.0f}, нужен не меньше {MIN_R}')

    # 4. Шланг не наматывается. Правило про сторону входа в штуцер эту проверку
    #    прошло формально: трасса обходила зону кругом и возвращалась, числа
    #    сходились, а машина выглядела намотанной. Меряем длину — но не против
    #    прямой между концами: заход в проход слева обязателен, и по прямой там
    #    не пройти. Эталон — тот же путь, проложенный по-манхэттенски через
    #    проход, если трасса в него заходит.
    for name, points in dlc.routes().items():
        path = dlc.traced(points)
        length = sum(hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(path, path[1:]))
        start, end = path[0], path[-1]
        west = min(x for x, _y in path)
        if west < LEFT_LANE:
            ideal = abs(start[0] - west) + abs(end[0] - west) + abs(end[1] - start[1])
        else:
            ideal = abs(end[0] - start[0]) + abs(end[1] - start[1])
        if ideal > 60 and length > ideal * 1.4:
            bad.append(f'{name}: длина {length:.0f} при кратчайшем пути {ideal:.0f} — '
                       f'шланг идёт в обход, а не по месту')

    # 5. Шланги не пересекаются — ни с чужой трассой, ни сами с собой. Ошибка
    #    видная и очень дорогая: на кадре она выглядит узлом у края плиты, а по
    #    отдельности каждая трасса при этом законна, поэтому ни одно правило
    #    выше её не ловит.
    segs = segments()
    for i, (n1, a1, b1) in enumerate(segs):
        for n2, a2, b2 in segs[i + 1:]:
            if touching((a1, b1), (a2, b2)):
                continue
            hit = meet((a1, b1), (a2, b2))
            if hit:
                bad.append(f'{n1} и {n2} пересекаются в точке '
                           f'({hit[0]:.0f},{hit[1]:.0f})')

    # 6. Сколько трассы лежит справа от памяти. Полностью убрать её оттуда
    #    нельзя — вывод контура стоит в задней стенке, — но правая часть должна
    #    оставаться подводкой к выводу, а не второй магистралью вдоль машины.
    right = sum(hypot(b[0] - a[0], b[1] - a[1])
                for _n, a, b in segments() if min(a[0], b[0]) >= RIGHT_LANE)
    total = sum(hypot(b[0] - a[0], b[1] - a[1]) for _n, a, b in segments())
    share = right / total * 100 if total else 0
    return bad, share, total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true', help='показать все отрезки')
    args = ap.parse_args()

    if args.list:
        for name, a, b in segments():
            print(f'  {name:8} ({a[0]:6.0f},{a[1]:6.0f}) → ({b[0]:6.0f},{b[1]:6.0f})')
        print()

    bad, share, total = check()
    print(f'трасса: {total:.0f} единиц, справа от памяти {share:.0f}%')
    if bad:
        print(f'нарушений: {len(bad)}')
        for line in bad:
            print(f'  ✘ {line}')
        return 1
    print('трасса в порядке')
    return 0


if __name__ == '__main__':
    sys.exit(main())
