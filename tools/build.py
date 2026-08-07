"""Board assembly: block order, checks, insertion into the page.

The schematic is assembled from independent units. A unit is a file in
board/blocks/: it draws itself and knows nothing about its neighbours. What
is shared lives in board/: geom — the coordinates, canvas — the canvas and
the register of taken space, palette/ink/lamps/metal/ports — what we draw
with, revision — the part numbers.

Only three things live here, the ones a single block cannot know:

1. ORDER. It is also the layer order, and also the queue for space: whoever
   claims a rectangle first owns it. So the list below is not alphabetical
   and not "whatever reads nicely", it is the assembly order, and changing
   it has to be a deliberate act.

2. BOUNDS. A block may declare BOUNDS = (x, y, w, h) — its own rectangle.
   The build then checks that the block fitted inside it, and fails with
   the block's name if it did not. That is the guarantee that two people
   editing different units will not overlap: the mistake is found by the
   script, not by the eye.

3. REPORT. What did not fit on the board (space ran out) and what each
   block ended up occupying. Silently losing parts has happened three times.

The geometry is taken from the real Gigabyte R183-S94 layout (top view,
cover removed), the indicators from an IBM x3550 M3. The composition is
rotated 90°: front on the left, depth to the right, because the screen is
wide and the server is long.

Elements have two roles, and they do not coincide:
  .unit — the thing that names itself with a label on hover (a drive, a
          memory bank, a processor, a network card). The label lives next
          to its own unit.
  .pick — the thing that physically comes out: a DIMM, a drive, a fan, a
          heatsink, a riser, a power supply.
The fault lamp always lies inside its own .pick — otherwise the selector
`.pick.pulled .fault` cannot reach it, and the wrong lamps light up.

Indicators: we dim the lamps with fill-opacity, not opacity. opacity on SVG
creates a composited layer, and those layers cover the whole scene — that
is exactly what the "the entire background went black" bug looked like.
"""

import hashlib
import importlib
import json
import re
from pathlib import Path

from board.canvas import AVOID, Canvas
from board.geom import H, W
from board.ink import callout_box
from board.revision import SN_SLOT
from board.spec import EXPECT, passport

HERE = Path(__file__).parent

# Assembly order. The board goes bottom up: the field, the zones, the
# traces, the holes, the passives — and only then the units standing on it.
# The callout labels are second to last: they lie on top of everything
# except the pull-out panel.
ORDER = [
    'chassis',       # chassis and rack ears
    'pcb_field',     # laminate with cutouts for the power supplies
    'pcb_zones',     # reservations for the large units + silkscreen
    'pcb_edge',      # connectors along the edge
    'pcb_traces',    # traces: publishes the nodes for the vias
    'pcb_vias',      # vias — placed on the trace nodes
    'pcb_scatter',   # passives: sit in whatever is left, hence late
    # Рамки блоков — это краска на текстолите, и лежать они обязаны под
    # деталями, а не поверх. Пока они рисовались последними, пунктирная линия
    # банка проходила по поднятой плашке памяти: узел уезжал вверх, а обводка
    # оставалась нарисованной сверху.
    'frames',        # outline frames of the functional blocks
    'vrm',           # core power, right up against the sockets
    'front_panel',   # control panel on the front
    'drives',        # 2.5″ cage
    'backplane',
    'fans',
    'memory',
    'service',       # battery, microSD, toggle switch, jumper table
    'psu',
    'risers',
    'rear_io',       # SFP+, RJ45, management port
    'marks',         # unit designations on the laminate
    # Воздуховоды памяти лежат поверх всего, что накрывают: под ними и сокеты,
    # и шелкография банков. Поэтому и стоят после marks — кожух непрозрачный,
    # и краска, нарисованная сверху него, висела бы в воздухе.
    'baffle',        # чёрные кожухи над банками памяти
    # Процессор идёт после всего, что лежит на текстолите. Снятые радиатор и
    # крышка уезжают с гнезда на соседнюю территорию, и пока блок стоял раньше
    # марок, кожухов и сервисной зоны, их накрывало нарисованным поверх: деталь
    # в руке оказывалась под платой.
    'cpu',
    'callouts',      # link labels — on top of everything
    'lightpath',     # pull-out diagnostics panel
]



# Как блок называется по-русски. Нужно панели слоёв: имя модуля годится для
# кода, но «pcb_scatter» ничего не говорит тому, кто смотрит на плату.
BLOCK_RU = {
    'chassis': 'рама и уши стойки',
    'pcb_field': 'текстолит с вырезами',
    'pcb_zones': 'бронь под узлы',
    'pcb_edge': 'разъёмы по кромке',
    'pcb_traces': 'дорожки',
    'pcb_vias': 'переходные отверстия',
    'pcb_scatter': 'рассыпуха и шелкография',
    'frames': 'рамки зон',
    'vrm': 'питание ядра',
    'front_panel': 'передняя панель',
    'drives': 'корзина дисков',
    'backplane': 'бэкплейн',
    'fans': 'вентиляторы',
    'memory': 'память',
    'service': 'сервисная зона',
    'psu': 'блоки питания',
    'risers': 'райзеры',
    'rear_io': 'задняя панель',
    'marks': 'обозначения узлов',
    'baffle': 'воздуховоды',
    'cpu': 'процессоры',
    'callouts': 'бирки-ссылки',
    'lightpath': 'панель диагностики',
}


def bbox(fragments):
    """Rough extents of what was drawn: from the numbers in coordinates.

    We count the coordinate attributes and deliberately do not parse paths:
    a d="" holds absolute points, relative offsets and arc radii all mixed
    together, and taking those for coordinates gives an extent twice the
    real one. For the "did the block creep into its neighbour" check,
    rectangles, circles, lines and labels are enough — what matters is the
    order of magnitude.
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
        # Кто рисует — знает сборка, и она же говорит это регистру. Блокам
        # дописывать источник в каждый вызов не нужно: первый же забытый
        # оставил бы бронь без хозяина, а именно по хозяину её и ищут.
        board.by = name
        mod.render(board)
        board.by = None
        drawn = board.parts[mark:]
        box = bbox(drawn)
        report.append((name, len(drawn), box))

        limits = getattr(mod, 'BOUNDS', None)
        if limits and box:
            lx, ly, lw, lh = limits
            x0, y0, x1, y1 = box
            assert lx <= x0 and ly <= y0 and x1 <= lx + lw and y1 <= ly + lh, (
                f'block {name} went outside its bounds: drew '
                f'({x0:.0f},{y0:.0f})–({x1:.0f},{y1:.0f}), declared {limits}')

    # The link labels are large and lie on top of everything: overlapping
    # each other, they hide not a part but an address — the one thing the
    # whole schematic was made for.
    boxes = [(callout_box(c[0], c[1], c[4], c[5]), c[4]) for c in board.callouts]
    for i, ((x1, y1, w1, h1), n1) in enumerate(boxes):
        for (x2, y2, w2, h2), n2 in boxes[i + 1:]:
            assert not (x1 < x2 + w2 and x1 + w1 > x2 and y1 < y2 + h2 and y1 + h1 > y2), (
                f'labels "{n1}" ({x1:.0f},{y1:.0f} {w1:.0f}×{h1:.0f}) and "{n2}" '
                f'({x2:.0f},{y2:.0f} {w2:.0f}×{h2:.0f}) overlap each other')

    importlib.import_module('board.blocks.lid').render(lid)

    if board.lost:
        print('DID NOT FIT:', ', '.join(board.lost))

    for line in reserve_report(board, report):
        print(line)

    board.parts = layered(board.parts, report)
    board.parts.append(bounds_layer(board))
    board.parts.append(overlap_layer(board))
    # Слой наслоений рисунка приходит пустым: его заполняет браузер, померив
    # готовую схему. Здесь мерить нечем — у половины узлов своя система
    # координат, и разбирать её разметкой значит повторять getBBox вручную.
    board.parts.append('<g class="lyr-clash" aria-hidden="true"></g>')
    board.parts.append(grid_layer())
    return board, lid, report


# ── Координатная сетка ────────────────────────────────────────────────────
# Адресовать сам рисунок нечем: деталь — это не одна фигура, а четыре-пять
# штрихов, и номер такой фигуры ничего не скажет ни тому, кто смотрит, ни
# тому, кто правит. Сетка обходит это с другой стороны: она не называет
# деталь, она называет место. «В D4 слишком плотно» понятно обоим и не
# требует трогать ни один блок.
#
# Шаг в сто единиц выбран по размеру узла: планка памяти, сокет, блок питания
# — каждый занимает клетку или две. Мельче — и адрес перестанет отличаться от
# координаты, крупнее — и в одной клетке окажется полплаты.
GRID_STEP = 100


def grid_layer(step=GRID_STEP):
    letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    cols = int(W // step) + 1
    rows = int(H // step) + 1
    out = []
    for c in range(cols):
        for r in range(rows):
            x, y = c * step, r * step
            tag = f'{letters[c % 26]}{r + 1}'
            out.append(f'<rect class="grd-cell" data-cell="{tag}" x="{x}" y="{y}" '
                       f'width="{step}" height="{step}"/>')
            out.append(f'<text class="grd-id" x="{x + 4}" y="{y + 12}">{tag}</text>')
    return ('<g class="lyr-grid" aria-hidden="true">' + ''.join(out) + '</g>')


# ── Показ границ ──────────────────────────────────────────────────────────
# Регистр занятости — единственное место, где записано, куда какому слою
# можно. Пока он был невидим, спорить с ним приходилось вслепую: элемент не
# встаёт, а почему — неизвестно. Слой рисует то же самое, что регистр знает:
# каждый занятый прямоугольник своим цветом по виду.
#
# Лежит поверх всего и по умолчанию погашен; включается командой `bounds` в
# терминале сервисного режима. В разметке он есть всегда — иначе пришлось бы
# держать вторую сборку для отладки, а она разошлась бы с настоящей.
# Цвет, человеческое название и буква адреса. Буква нужна, чтобы на квадрат
# можно было сослаться словами: «убери R7» короче и точнее, чем «вон та
# фиолетовая штука над райзером». Номер даётся по порядку появления в
# регистре, то есть по порядку сборки, — он устойчив, пока блок не переписан.
BOUNDS_INK = {
    'board':  ('#dc322f', 'вырезы и края текстолита', 'E'),
    'reserve': ('#6c71c4', 'бронь под будущий узел', 'R'),
    'major':  ('#cb4b16', 'узлы: разъёмы, гнёзда, корпуса', 'B'),
    'part':   ('#d33682', 'крупная рассыпуха', 'D'),
    'silk':   ('#b58900', 'подписи и шелкография', 'S'),
    'minor':  ('#2aa198', 'рассыпуха', 'M'),
    'copper': ('#268bd2', 'дорожки, переходные, площадки', 'C'),
}


def bounds_layer(cv):
    out = []
    for kind, rects in cv.bounds().items():
        ink, title, letter = BOUNDS_INK.get(kind, ('#93a1a1', kind, '?'))
        body = []
        for i, (x1, y1, x2, y2, by) in enumerate(rects, 1):
            tag = f'{letter}{i}'
            body.append(
                f'<rect data-id="{tag}" data-by="{by or "?"}" x="{x1:.0f}" '
                f'y="{y1:.0f}" width="{x2 - x1:.0f}" height="{y2 - y1:.0f}"/>')
            # Подпись в левом верхнем углу — там, где у чертежа обычно стоит
            # номер зоны. В мелкие квадраты она не влезает и только мусорит,
            # поэтому им адрес остаётся в разметке, а на глаз не показывается.
            if x2 - x1 >= 26 and y2 - y1 >= 14:
                body.append(
                    f'<text class="bnd-id" x="{x1 + 3:.0f}" y="{y1 + 9:.0f}" '
                    f'fill="{ink}">{tag}</text>')
        out.append(f'<g class="bnd bnd-{kind}" data-kind="{kind}" '
                   f'data-title="{title}" data-letter="{letter}" '
                   f'data-count="{len(rects)}" '
                   f'fill="{ink}" stroke="{ink}">{"".join(body)}</g>')
    return '<g class="lyr-bounds" aria-hidden="true">' + ''.join(out) + '</g>'



# ── Наслоения ─────────────────────────────────────────────────────────────
# Границы показывают, кто где стоит, но не показывают главного: где двое
# стоят в одном месте. Внутри вида это всегда ошибка разметки — два корпуса
# не могут занимать один квадрат, две подписи не печатают одна поверх другой.
# На глаз такое видно только там, где цвета совпали удачно; чаще нижний
# квадрат просто закрыт верхним, и наслоение выглядит как один прямоугольник.
#
# Порог по доле, а не по площади: квадраты соседей часто заходят друг на друга
# кромкой на единицу-другую, и это стык, а не наслоение. Ошибка — когда меньший
# из двух квадратов накрыт больше чем на четверть.
OVERLAP_MIN = 0.25

# Что считать наслоением, решает не совпадение вида, а само правило регистра.
# Первая версия сравнивала квадраты только внутри одного вида — и молчала ровно
# там, где смотреть интереснее всего: под банками памяти, где на брони стоят и
# краска, и разъёмы, и крупная рассыпуха. Виды там разные, и слой их не видел.
#
# AVOID уже говорит, кто кому не должен мешать; наслоение — это когда сказанное
# нарушено.
#
# Правило направленное, и в этом всё дело. «Мелочь не лезет на корпус» не
# значит «корпус не лезет на мелочь»: корпус ставится позже и накрывает уже
# стоящую мелочь совершенно законно — на живой плате разъём и припаян поверх
# того, что развели под ним. Нарушение — это когда ПОЗЖЕ пришедший встал на то,
# чего обязан был избегать; он мог спросить и не спросил. Симметричная проверка
# клеймила и обратный случай: из 75 находок 40 были разрешёнными.
#
# Кто позже — знает ORDER: место в очереди сборки и есть время. Внутри одного
# блока порядка нет, и там нарушением считается запрет в любую сторону.
#
# Медь отсеивается сама собой, без списка исключений: плата многослойная, шины в
# проекции сверху пересекаются законно, и COPPER себя не избегает. А вот медь за
# кромкой текстолита правило запрещает — и её слой покажет.
def broken(a, b, by_a, by_b):
    """Нарушено ли правило тем, кто пришёл позже."""
    at_a = ORDER.index(by_a) if by_a in ORDER else -1
    at_b = ORDER.index(by_b) if by_b in ORDER else -1
    if at_a > at_b:
        return b in AVOID[a]
    if at_b > at_a:
        return a in AVOID[b]
    return b in AVOID[a] or a in AVOID[b]


def overlap_layer(cv, least=OVERLAP_MIN):
    taken = cv.bounds()
    kinds = sorted(taken)
    out = []
    for n, a in enumerate(kinds):
        for b in kinds[n:]:
            # Пара видов, где ни один не избегает другого ни при каком порядке,
            # перебирать незачем: наслоения там законны по определению.
            if b not in AVOID[a] and a not in AVOID[b]:
                continue
            ink, _title, la = BOUNDS_INK.get(a, ('#93a1a1', a, '?'))
            _ink, _t, lb = BOUNDS_INK.get(b, ('#93a1a1', b, '?'))
            body = []
            for i, (x1, y1, x2, y2, by) in enumerate(taken[a], 1):
                # Внутри одного вида пара считается один раз: список тот же, и
                # второй проход дал бы каждое наслоение дважды.
                pairs = enumerate(taken[b][i:], i + 1) if a == b else enumerate(taken[b], 1)
                for j, (u1, v1, u2, v2, who) in pairs:
                    w = min(x2, u2) - max(x1, u1)
                    h = min(y2, v2) - max(y1, v1)
                    if w <= 0 or h <= 0:
                        continue
                    least_area = min((x2 - x1) * (y2 - y1), (u2 - u1) * (v2 - v1))
                    if w * h < least_area * least:
                        continue
                    if not broken(a, b, by, who):
                        continue
                    body.append(
                        f'<rect data-pair="{la}{i}+{lb}{j}" '
                        f'data-by="{by or "?"} + {who or "?"}" x="{max(x1, u1):.0f}" '
                        f'y="{max(y1, v1):.0f}" width="{w:.0f}" height="{h:.0f}"/>')
            if body:
                out.append(f'<g class="ovl ovl-{a}-{b}" data-kind="{a}+{b}" '
                           f'data-count="{len(body)}" fill="{ink}" stroke="{ink}">'
                           + ''.join(body) + '</g>')
    return '<g class="lyr-overlap" aria-hidden="true">' + ''.join(out) + '</g>'


# ── Сверка брони с тем, что нарисовано ────────────────────────────────────
# Бронь и рисунок живут отдельно: числа брони записаны в pcb_zones руками, а
# рисует узел совсем другой блок. Ничто не заставляет их совпадать, и они
# расходятся молча — так бронь под нижний райзер оказалась в пустоте на сотню
# единиц ниже самого райзера, и заметить это удалось только глазами, когда
# границы стали видимыми.
#
# Здесь тот же вопрос задаётся числом: во сколько раз бронь больше того, что
# на её месте нарисовано, и попадает ли она в него вообще. Сборку не роняем —
# бронь законно бывает с запасом, — но говорим вслух.
def reserve_report(cv, report, fill=0.25):
    """Насколько бронь заполнена тем, ради чего её держат.

    Сравнивать бронь с габаритом блока бесполезно: блок памяти занимает всю
    свою полосу, и любая бронь внутри неё выглядит оправданной. Вопрос в
    другом — сколько внутри брони настоящих корпусов. Если четверть площади и
    меньше, бронь держит пустоту: рассыпухе и краске туда нельзя, а стоять
    там нечему.
    """
    # Объём считается весь: и узлы, и крупная рассыпуха. Пока в счёт шли только
    # узлы, бронь с дросселем внутри числилась пустой — вид у него другой, а
    # места он занимает столько же.
    bodies = list(cv.taken.get('major', ())) + list(cv.taken.get('part', ()))
    out = []
    for x1, y1, x2, y2, by in cv.taken.get('reserve', ()):
        area = max(1.0, (x2 - x1) * (y2 - y1))
        busy = 0.0
        for bx1, by1, bx2, by2, _who in bodies:
            w = min(x2, bx2) - max(x1, bx1)
            h = min(y2, by2) - max(y1, by1)
            if w > 0 and h > 0:
                busy += w * h
        доля = busy / area
        if доля < fill:
            out.append(
                f'БРОНЬ ПОЧТИ ПУСТА: {by} держит {area:.0f} единиц '
                f'({x1:.0f},{y1:.0f})–({x2:.0f},{y2:.0f}), '
                f'корпусами занято {доля * 100:.0f}%')
    return out

# ── Слои ──────────────────────────────────────────────────────────────────
# Схема была плоской: тысяча с лишним фигур лежала прямо в корне, и «что выше
# чего» задавалось единственной ручкой — местом блока в ORDER. Отсюда и
# наложения, и невозможность сказать «приглуши железо, но не подписи».
#
# Слой — это непрерывный отрезок ORDER, и это не уступка, а условие: порядок
# рисования уже выверен по блокам, и любая перетасовка ради красивого деления
# сломала бы его. Поэтому границы слоёв проходят там, где меняется роль, и
# только там.
#
# Что обязан соблюдать тот, кто будет это править:
#   · на группе слоя нет transform. Кольца прожектора меряют узлы через
#     getBBox() и кладут прямоугольники в координатах корня; своя система
#     координат у слоя увела бы их вбок;
#   · .spot-rings и бирки лежат в самом верхнем слое, поверх всех остальных;
#   · BOUNDS от обёрток не зависит: габариты считаются по фрагментам блока,
#     а у <g> своих координат нет.
LAYERS = [
    # Основание: рама, текстолит, дорожки, пассивы, рамки блоков, питание
    # ядра. Не меняется никогда — ни при разборке, ни при наведении.
    ('deck', 'vrm'),
    # Железо: всё, что вынимается, плюс набивка и кожухи над ним. Приглушается
    # при наведении и ездит при разборке.
    ('parts', 'cpu'),
    # Накладка: подписи-ссылки и обводки наведения. Живёт своей жизнью и
    # обязана оставаться читаемой, когда железо приглушено.
    ('tags', 'callouts'),
    # Приборы: выдвижная панель диагностики.
    ('probe', 'lightpath'),
]


def layered(parts, report):
    """Разложить фрагменты по слоям, не меняя порядка рисования.

    Внутри слоя каждый блок сборки заворачивается в свою группу `blk-<имя>`.
    Слой отвечает на вопрос «что выше чего», блок — на вопрос «что это»: без
    второго нельзя ни погасить память отдельно от процессоров, ни показать,
    что рассыпуха и подписи — разные вещи, хотя рисует их один файл.
    """
    drawn = {name: n for name, n, _ in report}
    # Где чьи фрагменты: блоки рисуют строго по ORDER, значит границы каждого
    # — просто нарастающая сумма.
    span, at = {}, 0
    for name in ORDER:
        span[name] = (at, at + drawn[name])
        at += drawn[name]

    out, first = [], 0
    for cls, last in LAYERS:
        stop = ORDER.index(last) + 1
        out.append(f'<g class="lyr-{cls}">')
        for name in ORDER[first:stop]:
            a, b = span[name]
            if b > a:
                out += [f'<g class="blk blk-{name}" data-blk="{name}" '
                        f'data-title="{BLOCK_RU.get(name, name)}">'] + parts[a:b] + ['</g>']
        out.append('</g>')
        first = stop
    i = at
    assert i == len(parts), f'мимо слоёв прошло {len(parts) - i} фрагментов'
    return out


# Two kinds of inserts. @block — a board unit: it has geometry, and the rule
# "a unit lives in three files of the same name" holds literally. @part — a
# piece of the page: the terminal, the screen. Those draw nothing, they have
# no .py, and they live apart so the unit rule need not be blurred with
# exceptions.
SRC_DIR = {'block': 'board/blocks', 'part': 'board/parts'}

BLOCK_MARK = re.compile(r'^([ \t]*)/\* @(block|part): ([a-z_]+) \*/[ \t]*$', re.MULTILINE)


def build_css():
    """Assemble server.css: the base plus unit and part styles in place.

    The marker `/* @block: name */` sits exactly where the unit's rules used
    to be in the single file. That is not decoration: with equal specificity
    the argument is settled by order, and moving a rule up or down changes
    the look without breaking anything in the syntax.
    """
    base = (HERE / 'board/styles/base.css').read_text(encoding='utf-8')
    used = []

    def paste(m):
        indent, kind, name = m.group(1), m.group(2), m.group(3)
        part = (HERE / f'{SRC_DIR[kind]}/{name}.css').read_text(encoding='utf-8').rstrip('\n')
        used.append((kind, name))
        return f'{indent}/* ── {name} ──────────────────────────────── */\n{part}'

    css = BLOCK_MARK.sub(paste, base)
    head = ('/* СОБРАННЫЙ ФАЙЛ — правки затрёт следующая сборка.\n'
            ' * Источники: tools/board/styles/base.css и tools/board/blocks/*.css,\n'
            ' * собирает tools/build.py. Стили узла лежат рядом с его геометрией.\n'
            ' */\n')
    (HERE.parent / 'server.css').write_text(head + css, encoding='utf-8')
    return used


JS_MARK = re.compile(r'^([ \t]*)// @(block|part): ([a-z_]+)[ \t]*$', re.MULTILINE)


def build_js():
    """Assemble server.js: the base plus unit behaviour in place.

    The pieces are inserted inside the same IIFE as the base, so the shared
    scope is preserved: a block still sees line(), rig and the rest, and the
    terminal sees its functions. Order matters just as much as in CSS — the
    code runs top to bottom, and a handler lifted above its own element
    simply will not find it in the DOM.
    """
    base = (HERE / 'board/scripts/base.js').read_text(encoding='utf-8')
    used = []

    def paste(m):
        kind, name = m.group(2), m.group(3)
        part = (HERE / f'{SRC_DIR[kind]}/{name}.js').read_text(encoding='utf-8').rstrip('\n')
        used.append((kind, name))
        return part

    js = JS_MARK.sub(paste, base)
    head = ('// СОБРАННЫЙ ФАЙЛ — правки затрёт следующая сборка.\n'
            '// Источники: tools/board/scripts/base.js и tools/board/blocks/*.js,\n'
            '// собирает tools/build.py. Поведение узла лежит рядом с его геометрией.\n')
    (HERE.parent / 'server.js').write_text(head + js, encoding='utf-8')
    return used


def tally(used):
    """Report line: how many units and how many parts the build inserted."""
    blocks = [n for k, n in used if k == 'block']
    parts = [n for k, n in used if k == 'part']
    out = f'base + {len(blocks)} units ({", ".join(blocks)})'
    if parts:
        out += f' + {len(parts)} parts ({", ".join(parts)})'
    return out


def serial(*parts):
    """Серийный номер платы — отпечаток самого чертежа.

    Из git его взять нельзя: сборка идёт до коммита, а коммит не может
    содержать собственный хэш. Раньше здесь стоял хэш HEAD — то есть номер
    ПРЕДЫДУЩЕЙ платы, и опубликованная страница всегда числилась ревизией
    назад. Отпечаток берётся от готовой разметки с заполнителем на месте
    номера, поэтому он устойчив: пересобрали без правок — номер тот же.
    """
    return hashlib.sha1(''.join(parts).encode()).hexdigest()[:7].upper()


def main():
    board, lid, report = build()
    svg, lidart = board.svg(), lid.svg()
    sn = serial(svg, lidart)
    svg, lidart = svg.replace(SN_SLOT, sn), lidart.replace(SN_SLOT, sn)
    css_blocks = build_css()
    js_blocks = build_js()

    (HERE / 'board-v17.svg.part').write_text(svg, encoding='utf-8')
    (HERE / 'board-v17-lid.svg.part').write_text(lidart, encoding='utf-8')

    # The machine's passport goes into the page in the same run as the
    # schematic — otherwise the two drift apart. Before that we check the
    # promise against the drawing: if the passport says twenty-four DIMMs
    # and the board carries twenty-three, the build must fail here rather
    # than lie to the visitor in the console.
    drawn = {'dimm': svg.count('data-dimm="'), 'fan': svg.count('data-fan="'),
             'bay': svg.count('data-unit="hdd'), 'psu': svg.count('data-psu="'),
             'riser': svg.count('data-riser="'), 'cpu': svg.count('data-cpu="')}
    for kind, want in EXPECT.items():
        assert drawn[kind] == want, (
            f'passport promises {want} ({kind}), the board draws {drawn[kind]}')

    page = HERE.parent / 'index.html'
    if page.exists():
        html = page.read_text(encoding='utf-8')
        html = re.sub(r'(<!-- BOARD:BEGIN -->).*?(<!-- BOARD:END -->)',
                      lambda m: m.group(1) + '\n' + svg + '\n' + m.group(2), html, flags=re.DOTALL)
        html = re.sub(r'(<!-- LIDART:BEGIN -->).*?(<!-- LIDART:END -->)',
                      lambda m: m.group(1) + '\n' + lidart + '\n' + m.group(2), html, flags=re.DOTALL)
        # We escape only "</": inside <script> it would close the tag early.
        spec = json.dumps(passport(), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
        # Тот же серийный номер, что и на текстолите: паспорт берёт его из
        # board.revision, а туда он попадает заполнителем — подставляем здесь,
        # иначе самотест напечатал бы заполнитель.
        spec = spec.replace(SN_SLOT, sn)
        html = re.sub(r'(<!-- SPEC:BEGIN -->).*?(<!-- SPEC:END -->)',
                      lambda m: m.group(1) + '\n<script type="application/json" id="rig-spec">'
                                + spec + '</script>\n' + m.group(2), html, flags=re.DOTALL)
        for probe in ('data-for=', 'class="die"', 'data-group="tw"', 'id="rig-spec"'):
            assert probe in html, probe
        page.write_text(html, encoding='utf-8')

    print(f'board: {len(board.parts)} fragments, {len(svg)} chars; '
          f'lid: {len(lidart)} chars')
    print(f'passport: {len(json.dumps(passport()))} chars, matches the board')
    print('styles: ' + tally(css_blocks))
    print('logic: ' + tally(js_blocks))
    return report


if __name__ == '__main__':
    main()
