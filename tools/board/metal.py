"""Metal: leads, pads, contacts, stamped parts.

We do them in silver rather than the same grey paint as the silkscreen: on a
live board solder is the only thing that catches a highlight, and it is by
that highlight that the eye separates a part from the drawing under it.
"""

import math
from board.geom import SOCKET_H, SOCKET_W
from board.ink import mono
from board.palette import COLD, HOT, SILVER, SILVER_DIM, SILVER_LIT


def pad(x, y, w, h, r=0.6):
    """Contact pad: solder with a highlight on top and a shadow below."""
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{SILVER_DIM}"/>'
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h - 0.8:.1f}" rx="{r}" fill="{SILVER}"/>'
            f'<rect x="{x + 0.4:.1f}" y="{y + 0.3:.1f}" width="{max(0.6, w - 0.8):.1f}" height="0.6" '
            f'fill="{SILVER_LIT}" fill-opacity="0.55"/>')

def relief(x, y, w, h, rx=1):
    """Package chamfer: a light edge on top, a shadow below. Cheaper than a
    shadow and creates no compositing layer, unlike filter."""
    return (f'<path d="M{x + rx:.1f} {y:.1f} H{x + w - rx:.1f}" stroke="rgba(223,232,234,0.20)" '
            f'stroke-width="0.9" fill="none"/>'
            f'<path d="M{x + rx:.1f} {y + h:.1f} H{x + w - rx:.1f}" stroke="rgba(0,0,0,0.38)" '
            f'stroke-width="1.1" fill="none"/>')

IHS_INSET = 11        # насколько крышка уже поля контактов, на сторону


def ihs_path(x, y):
    """Контур крышки процессора: прямоугольник со срезанным углом ключа.

    Полукруглых вырезов по бокам здесь больше нет. Они изображали ключи
    сокета, но ключи — это выступы держателя, а не дырки в металле: на живой
    крышке их нет ни одного. Остался единственный настоящий признак — срез
    угла у первого вывода, и срез этот на текстолите подложки, а не на самом
    металле, поэтому подложка рисуется по своему контуру (см. substrate_path).

    Функция отдельная потому, что этим же контуром обрезается перелив по
    кристаллу: прямоугольный clip превращал крышку обратно в плиту.
    """
    # Крышка меньше поля контактов под ней, и это не вкус: кристалл под
    # теплораспределителем всегда меньше площадки, на которой сидят ножки, —
    # иначе он свисал бы с неё. Подложка при этом прежнего размера, её габарит
    # задаёт держатель.
    ix, iy = x + 40 + IHS_INSET, y + 34 + IHS_INSET
    iw, ih = SOCKET_W - 80 - 2 * IHS_INSET, SOCKET_H - 68 - 2 * IHS_INSET
    # Среза здесь нет вовсе. Он — признак подложки, её и режут по углу первого
    # вывода; металл крышки лежит на подложке ровным прямоугольником, и
    # повторённый на нём срез читался вторым ключом, которого у процессора нет.
    return (f'M{ix} {iy} H{ix + iw} V{iy + ih} H{ix} Z')


def substrate_path(x, y, m=5):
    """Контур текстолита процессора: он шире крышки на кайму m.

    Срез угла — здесь: подложку режут по углу первого вывода, чтобы модуль
    нельзя было посадить в держатель наоборот. Металл крышки просто
    повторяет срез сверху.
    """
    ix, iy = x + 40 - m, y + 34 - m
    iw, ih = SOCKET_W - 80 + 2 * m, SOCKET_H - 68 + 2 * m
    # Срез мельче прежних восемнадцати: он и на живой подложке скромный, а
    # главное — под большим срезом из-под текстолита вылезало поле контактов,
    # и снятый процессор открывал ножки там, где их быть не может.
    cut = 10
    return (f'M{ix + cut} {iy} H{ix + iw} V{iy + ih} H{ix} V{iy + cut} Z')

def idc_header(x, y, pins, label, vertical=False):
    """Ribbon header: two rows of contacts inside a plastic shroud.

    Flat ribbon cables run to these — to the front panel, to the power
    button, to USB and to the intrusion sensor. The keying slot on one side
    is there so the cable cannot be plugged in the wrong way round; on a live
    board it is visible at once.
    """
    n = pins // 2
    w, h = n * 4.4 + 8, 13
    if vertical:
        w, h = h, w
    body = (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h:.1f}" rx="1" fill="#12191d" '
            f'stroke="rgba(147,161,161,0.34)" stroke-width="1.1"/>')
    pins_svg = []
    for k in range(n):
        for r in range(2):
            if vertical:
                px, py = x + 3.4 + r * 5.2, y + 5 + k * 4.4
            else:
                px, py = x + 5 + k * 4.4, y + 3.4 + r * 5.2
            pins_svg.append(pad(px, py, 2.2, 2.2, 0.3))
    # key: a cut-out in the shroud, midway along the long side
    if vertical:
        key = (f'<rect x="{x + w - 2.6:.1f}" y="{y + h / 2 - 3:.1f}" width="2.6" height="6" '
               f'fill="#0a1013"/>')
    else:
        key = (f'<rect x="{x + w / 2 - 3:.1f}" y="{y + h - 2.6:.1f}" width="6" height="2.6" '
               f'fill="#0a1013"/>')
    tag = (mono(x + w / 2, y + h + 8, label, 5.5, op=0.34) if not vertical
           else mono(x + w + 2, y + h / 2, label, 5.5, anchor="start", op=0.34))
    return body + ''.join(pins_svg) + key + relief(x, y, w, h) + tag


def power_header(x, y, label="P12V_BP"):
    """2×4 power header: eight thick contacts in a frame with a latch.

    It is told apart from data connectors at once — the pitch is bigger, the
    contacts three times thicker: what goes through them is tens of amps,
    not a signal.
    """
    w, h = 30, 20
    out = [(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#161f24" '
            f'stroke="rgba(147,161,161,0.40)" stroke-width="1.3"/>')]
    for r in range(2):
        for c in range(4):
            out.append(pad(x + 3.6 + c * 6.2, y + 4 + r * 7, 4, 4.6, 0.8))
    # latch on the top wall
    out.append(f'<path d="M{x + w / 2 - 5} {y} v-3.4 h10 v3.4" fill="none" '
               f'stroke="rgba(147,161,161,0.40)" stroke-width="1.3"/>')
    out.append(relief(x, y, w, h, 2))
    out.append(mono(x + w / 2, y + h + 9, label, 5.5, op=0.36))
    return ''.join(out)


def hs_screw(x, y, r=5.4):
    """Винт радиатора: шляпка с крестовым шлицем.

    Без пружины — она нужна только процессорному, где усилие прижима задаёт
    именно она. Здесь радиатор притянут к своей плате, и прижим держит
    плоскость основания.
    """
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="#162025" '
            f'stroke="rgba(147,161,161,0.46)" stroke-width="1.3"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*0.48:.1f}" fill="#0c1418" '
            f'stroke="rgba(147,161,161,0.34)"/>'
            f'<line x1="{x-r*0.44:.1f}" y1="{y:.1f}" x2="{x+r*0.44:.1f}" y2="{y:.1f}" '
            f'stroke="rgba(147,161,161,0.5)" stroke-width="1.2"/>'
            f'<line x1="{x:.1f}" y1="{y-r*0.44:.1f}" x2="{x:.1f}" y2="{y+r*0.44:.1f}" '
            f'stroke="rgba(147,161,161,0.5)" stroke-width="1.2"/>')


def finned_sink(x, y, w, h, r=5.4, inset=10, pitch=3.4):
    """Пассивный радиатор: рёбра вдоль потока и винты по углам.

    Один вид на всю машину. Раньше их было три разных — процессорный,
    силовой в блоке питания и какой-то свой у сетевой карты, — и последний
    читался просто заштрихованным прямоугольником: ни рёбер по потоку, ни
    крепежа. Радиатор узнают по двум вещам, и обе теперь общие.

    Поток в этой машине идёт спереди назад, то есть по X, — рёбра лежат вдоль
    него.
    """
    fins = ''.join(f'<line x1="{x+inset-1:.1f}" y1="{y+inset-1+i*pitch:.1f}" '
                   f'x2="{x+w-inset+1:.1f}" y2="{y+inset-1+i*pitch:.1f}" '
                   f'stroke="rgba(147,161,161,0.22)" stroke-width="1.2"/>'
                   for i in range(int((h - inset * 2 + 2) // pitch)))
    screws = ''.join(hs_screw(sx, sy, r)
                     for sx in (x + inset, x + w - inset)
                     for sy in (y + inset, y + h - inset))
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="4" '
            f'fill="#26333a" stroke="rgba(147,161,161,0.38)"/>' + fins + screws)


def hexgrid(x, y, w, h, s=6, gap=4.4, fill='rgba(2,7,9,0.42)',
            stroke='rgba(147,161,161,0.16)', skip=(), r=1.6):
    """Перфорация сотами: это дырки в стали, а не рисунок на ней.

    Отсюда две вещи, которых раньше не было.

    Шаг. Соту рисуем остриём вверх: ширина у неё 1.72·s, высота 2·s. Значит
    столбцы стоят через 1.72·s + gap, а соседние ряды — через 1.5·s +
    0.866·gap со сдвигом на полшага вбок; так соты и укладываются в решётку,
    не наезжая друг на друга. Прежние формулы брали 1.5·s + gap по горизонтали
    и вдвое меньше нужного по вертикали, и ряды слипались в сплошное поле.

    Просвет. Дырка заливалась глухим #0a1216 — тем же тоном, каким закрашена
    сталь вокруг. Получалось пятно на листе, а не отверстие. Теперь заливка
    полупрозрачная: сквозь неё виден текстолит, а лист поверх него читается
    именно листом с дырками.

    fill и stroke вынесены наружу ради крышки. Она лежит поверх всей машины, и
    полупрозрачной заливки ей мало: под крышкой не текстолит, а мигающие лампы
    гнёзд, и владелец просил, чтобы сквозь соты было видно именно их. Поэтому
    крышка зовёт эту же решётку дважды — сплошным чёрным в маску, которой лист
    пробивается насквозь, и одним контуром поверх, чтобы у дырки осталась
    кромка.
    """
    # Одна фигура на всё поле, а не отдельная на каждую дырку. Соты у решётки
    # одинаковые, и различаются только местом: у пути от каждой остаётся
    # «доехать сюда», а сама сота — общий хвост из относительных команд. По
    # разметке это 36 символов вместо 133, но дело не в байтах: полторы тысячи
    # узлов DOM браузер разбирает, хранит и обходит при каждой перерисовке, а
    # один путь — нет. На схеме таких дырок было 1632 — пятая часть страницы.
    #
    # Пиксель при этом тот же: подпути не пересекаются, и любое правило
    # заливки закрашивает их одинаково. Обводка тоже своя у каждой соты —
    # контур идёт по каждому подпути отдельно.
    # Вершины абсолютные и округлены той же десятой, что и раньше у полигонов.
    # Относительные смещения вышли бы короче, но они копят ошибку округления:
    # сота уезжала на сотые доли единицы, и края дырок ложились на другие
    # пиксели. Померено — до пяти единиц из 255 на кромке; глазу не видно, но
    # доказать, что картинка не изменилась, тогда уже нельзя.
    def n(v):
        return f'{v:.1f}'.removesuffix('.0')

    corners = ((0, -1), (1, -0.5), (1, 0.5), (0, 1), (-1, 0.5), (-1, -0.5))

    def hexagon(cx, cy):
        """Сота со скруглёнными вершинами.

        Пробитая дырка не бывает с острыми углами: пуансон оставляет скругление
        радиусом в десятые доли миллиметра, и в этом масштабе оно как раз
        читается. С острыми вершинами поле сот выглядело гравировкой по стали,
        а не перфорацией.

        Каждая вершина срезается на r вдоль обоих рёбер, а сам угол становится
        опорной точкой квадратичной кривой — то же самое, что делает rx у
        прямоугольника.
        """
        pts = [(cx + s * 0.86 * ddx, cy + s * ddy) for ddx, ddy in corners]
        parts = []
        for i, (px, py) in enumerate(pts):
            ax, ay = pts[i - 1]
            bx, by = pts[(i + 1) % len(pts)]
            la = math.hypot(px - ax, py - ay) or 1
            lb = math.hypot(bx - px, by - py) or 1
            k = min(r, la / 2, lb / 2)
            sx, sy = px + (ax - px) / la * k, py + (ay - py) / la * k
            ex, ey = px + (bx - px) / lb * k, py + (by - py) / lb * k
            parts.append(('M' if not parts else 'L') + f'{n(sx)} {n(sy)}')
            parts.append(f'Q{n(px)} {n(py)} {n(ex)} {n(ey)}')
        return ''.join(parts) + 'z'

    def занята(cx, cy):
        """Сота попадает в зону, которую перфорация обходит."""
        return any(kx - s <= cx <= kx + kw + s and ky - s <= cy <= ky + kh + s
                   for kx, ky, kw, kh in skip)

    d = []
    dx = s * 1.72 + gap
    dy = s * 1.5 + gap * 0.866
    row, cy = 0, y + s
    while cy < y + h - s:
        cx = x + s + (dx / 2 if row % 2 else 0)
        while cx < x + w - s * 0.9:
            if not занята(cx, cy):
                d.append(hexagon(cx, cy))
            cx += dx
        cy += dy
        row += 1
    if not d:
        return ''
    return f'<path class="perf" d="{"".join(d)}" fill="{fill}" stroke="{stroke}"/>'


def service_label(x, y, w, h, title, lines, head=HOT, arrow=None):
    """Service label on the cover: a brick-coloured header and a light field.

    The field is kept on fill-opacity rather than a solid white fill: the
    cover is dark, and opaque paper on it burns the eyes.

    The colour of the header is not decoration but the replacement code
    itself: HOT (terracotta) means "may be changed on the fly", COLD (blue)
    means "power down first". These are the only two tones that belong here,
    and both are already defined in palette, next to the wiring that paints
    live units in the same language.

    Lines prefixed with NOTE:/Attention: are two different warnings off a
    live sticker: the first is simply for information, the second is about
    the risk of ruining hardware, which is why it is bolder and darker than
    the rest of the lines.

    `arrow` is the direction in which the part leaves the chassis
    ('left'/'right'): drawing it makes no sense on every label, but where a
    live plate does have the arrow, it is part of the language and not an
    ornament.
    """
    head_h = h * 0.19
    body_y = y + head_h
    body_h = h - head_h
    parts = [
        (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="#e8e3d5" fill-opacity="0.78" '
         f'stroke="rgba(147,161,161,0.35)" stroke-width="1.2"/>'),
        (f'<path d="M{x} {y+head_h:.1f} V{y+3} Q{x} {y} {x+3} {y} H{x+w-3} Q{x+w} {y} {x+w} {y+3} '
         f'V{y+head_h:.1f} Z" fill="{head}"/>'),
    ]
    icon_r = head_h * 0.34
    icx, icy = x + head_h * 0.6, y + head_h / 2
    for i in range(4):
        parts.append(f'<ellipse cx="{icx:.1f}" cy="{icy-icon_r*0.55:.1f}" rx="{icon_r*0.30:.1f}" '
                     f'ry="{icon_r*0.55:.1f}" fill="#161005" transform="rotate({i*90} {icx:.1f} {icy:.1f})"/>')
    parts.append(f'<circle cx="{icx:.1f}" cy="{icy:.1f}" r="{icon_r*0.16:.1f}" fill="#161005"/>')
    parts.append(f'<text x="{x+head_h*1.05:.1f}" y="{y+head_h/2+head_h*0.16:.1f}" text-anchor="start" '
                 f'fill="#161005" font-family="ui-monospace, Menlo, monospace" '
                 f'font-size="{max(8, head_h*0.46):.1f}" font-weight="700" letter-spacing="0.04em">{title}</text>')
    line_h = body_h / (len(lines) + 1)
    for i, ln in enumerate(lines):
        if ln.startswith("Attention:"):
            fill, fop, wt = "#7a1c0f", 0.92, 700
        elif ln.startswith("NOTE:"):
            fill, fop, wt = "#161005", 0.60, 400
        else:
            fill, fop, wt = "#161005", 0.82, 400
        parts.append(f'<text x="{x+10}" y="{body_y + line_h*(i+1):.1f}" text-anchor="start" fill="{fill}" '
                     f'fill-opacity="{fop}" font-family="ui-monospace, Menlo, monospace" font-size="7.5" '
                     f'font-weight="{wt}">{ln}</text>')
    if arrow:
        ay = y + h - 9
        ax0, ax1 = x + 12, x + w - 12
        x1, x2 = (ax1, ax0) if arrow == "left" else (ax0, ax1)
        tip = -1 if arrow == "left" else 1
        parts.append(f'<path d="M{x1:.1f} {ay:.1f} H{x2:.1f}" stroke="#161005" stroke-opacity="0.55" '
                     f'stroke-width="1.6" fill="none"/>'
                     f'<path d="M{x2:.1f} {ay:.1f} l{-tip*7:.1f} -4.5 v9 Z" fill="#161005" fill-opacity="0.55"/>')
    return ''.join(parts)


def service_legend(x, y, w, h):
    """Colour code legend: without it label headers are just coloured strips.

    It stands once on the whole cover: the other plates merely use the code
    explained here, and repeating it on each of them would be the same text
    eight times in a row.
    """
    parts = [
        (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="#e8e3d5" fill-opacity="0.78" '
         f'stroke="rgba(147,161,161,0.35)" stroke-width="1.2"/>'),
        (f'<text x="{x+10}" y="{y+h*0.22:.1f}" text-anchor="start" fill="#161005" fill-opacity="0.85" '
         f'font-family="ui-monospace, Menlo, monospace" font-size="8" font-weight="700" '
         f'letter-spacing="0.04em">КОД ЗАМЕНЫ</text>'),
    ]
    rows = ((HOT, "горячая замена"), (COLD, "обесточить машину"))
    sw = h * 0.16
    for i, (color, text) in enumerate(rows):
        ry = y + h * 0.42 + i * h * 0.32
        parts.append(f'<rect x="{x+10}" y="{ry-sw*0.72:.1f}" width="{sw*1.6:.1f}" height="{sw:.1f}" rx="1.5" '
                     f'fill="{color}"/>'
                     f'<text x="{x+10+sw*1.6+7:.1f}" y="{ry:.1f}" text-anchor="start" fill="#161005" '
                     f'fill-opacity="0.82" font-family="ui-monospace, Menlo, monospace" '
                     f'font-size="7.5">{text}</text>')
    return ''.join(parts)


def rating_label(x, y, num, w=136, h=42):
    """Power label for its own feed: the same block number on all the marks.

    The yellow square with the bolt warns that there are two feeds and both
    have to be de-energised; the orange one next to it is a hand, that is,
    "do not reach in under voltage". This pair used to stand twice, mirrored
    at the edges, and the label read as two different ones: on a live machine
    each sign is applied exactly once.
    """
    yw, ow = h * 0.86, h * 0.62
    dw = w - yw - ow

    def bolt(cx, cy, sz):
        tri = (f'<path d="M{cx:.1f} {cy-sz:.1f} L{cx+sz*0.9:.1f} {cy+sz*0.75:.1f} '
               f'L{cx-sz*0.9:.1f} {cy+sz*0.75:.1f} Z" fill="none" stroke="#161005" '
               f'stroke-width="{max(1, sz*0.14):.1f}"/>')
        zig = (f'<path d="M{cx+sz*0.10:.1f} {cy-sz*0.55:.1f} L{cx-sz*0.30:.1f} {cy+sz*0.08:.1f} '
               f'L{cx+sz*0.02:.1f} {cy+sz*0.08:.1f} L{cx-sz*0.16:.1f} {cy+sz*0.62:.1f} '
               f'L{cx+sz*0.40:.1f} {cy-sz*0.10:.1f} L{cx+sz*0.08:.1f} {cy-sz*0.10:.1f} Z" fill="#161005"/>')
        return tri + zig

    yellow = (f'<rect x="{x}" y="{y}" width="{yw:.1f}" height="{h}" fill="#f2c200" '
              f'stroke="rgba(20,20,10,0.5)" stroke-width="1"/>'
              + bolt(x + yw * 0.36, y + h * 0.42, h * 0.26)
              + f'<text x="{x+yw*0.74:.1f}" y="{y+h*0.68:.1f}" text-anchor="middle" fill="#161005" '
                f'font-family="ui-monospace, Menlo, monospace" font-size="{h*0.44:.1f}" '
                f'font-weight="700">{num}</text>')
    ox = x + yw
    orange = (f'<rect x="{ox:.1f}" y="{y}" width="{ow:.1f}" height="{h}" fill="#cb4b16" '
              f'stroke="rgba(20,20,10,0.4)" stroke-width="1"/>'
              f'<path d="M{ox+ow*0.22:.1f} {y+h*0.32:.1f} q{ow*0.14:.1f} -{h*0.16:.1f} {ow*0.28:.1f} 0 '
              f'q{ow*0.14:.1f} {h*0.16:.1f} {ow*0.28:.1f} 0" fill="none" stroke="#161005" stroke-width="1.4"/>'
              + f'<text x="{ox+ow/2:.1f}" y="{y+h*0.80:.1f}" text-anchor="middle" fill="#161005" '
                f'font-family="ui-monospace, Menlo, monospace" font-size="{h*0.36:.1f}" '
                f'font-weight="700">{num}</text>')

    # Currents off a live machine's plate, broken into lines: the label sits
    # along the supply, not across it, and a full line does not fit its length.
    dx = x + yw + ow
    rows = ["100-127V 5,3A", "200-240V 2,6A", "-48…-60V 18,3A"]
    line_h = h / (len(rows) + 1)
    dark = (f'<rect x="{dx:.1f}" y="{y}" width="{dw:.1f}" height="{h}" fill="#10171a" '
            f'stroke="rgba(147,161,161,0.28)" stroke-width="1"/>'
            + ''.join(f'<text x="{dx+5:.1f}" y="{y+line_h*(i+1)+1:.1f}" text-anchor="start" '
                      f'fill="rgba(238,232,213,0.72)" font-family="ui-monospace, Menlo, monospace" '
                      f'font-size="6">{ln}</text>' for i, ln in enumerate(rows)))
    return (yellow + orange + dark
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" '
              f'stroke="rgba(20,20,10,0.55)" stroke-width="1.2"/>')
