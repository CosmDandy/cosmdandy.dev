"""vias.

There are thousands of them on a board, and they are the only warm spot in a
cold palette: copper is drawn into the hole, the mask does not run over it.
They are drawn before everything else — on a real board the vias go under the
packages, they do not lie on top.

The large ones sit at the bends of the traces — that is where a layer change
is needed. The fine scatter runs across the field: it stitches the ground
planes.

There is no copper under the sockets, the memory banks and the large
packages: there is either a contact field or a footprint, and there is
nothing to drill through. So the scatter goes around these zones and follows
their borders with a dense contour — that is how copper flows around a large
block on a real board.
"""

from board.canvas import COPPER
from board.geom import (
    BANK_N,
    CHIPS,
    DIMM_SOCK_W,
    PCB_H,
    PCB_W,
    PITCH,
    SLOT_H,
    SOCKET_H,
    SOCKET_W,
    X_CORE,
    X_PCB,
    X_SOCK,
    X_VRM,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
    Y_CPU0,
    Y_CPU1,
)

# Zones kept free of copper: sockets, memory banks, large packages.
KEEP_OUT = (
    [(X_SOCK - 10, y - 10, SOCKET_W + 20, SOCKET_H + 20) for y in (Y_CPU0, Y_CPU1)]
    # Банк занимает семь шагов плюс высоту последней плашки, а не восемь шагов:
    # по восьми контур меди уходил на шаг ниже банка, а у нижнего — за кромку
    # текстолита.
    + [(X_CORE - 12, y - 8, DIMM_SOCK_W + 24, (BANK_N - 1) * PITCH + SLOT_H + 16)
       for y in (Y_BANK_L, Y_BANK_C, Y_BANK_R)]
    + [(x - 8, y - 8, w + 16, h + 16) for _n, _s, x, y, w, h in CHIPS]
)


def clear(px, py):
    """Is the spot free for copper — that is, did we land in another block."""
    return not any(x <= px <= x + w and y <= py <= y + h for x, y, w, h in KEEP_OUT)


def outline(x, y, w, h, gap=6, step=13):
    """Отверстия вдоль блока: медь обходит его, но не частоколом.

    Ровный ряд с постоянным шагом по всему периметру читался не медью, а
    перфорацией: одинаковые кольца через равные промежутки вдоль всей кромки
    банка памяти. На живой плате переходные идут группами — где цепи выходят
    из-под блока, там их пучок, а между пучками пусто.

    Пропуск берётся из координаты, а не из счётчика: так он не образует
    периода, и при пересборке рисунок тот же.
    """
    ring = []
    def dense(px, py):
        # Три числа в свёртке: без третьего сетка давала полосы по диагонали.
        return (int(px) * 73 + int(py) * 149 + int(px * py) % 17) % 100 < 62
    for k in range(int(w // step) + 1):
        px = x + k * step
        for py in (y - gap, y + h + gap):
            if dense(px, py):
                ring.append((px, py))
    for k in range(int(h // step) + 1):
        py = y + k * step
        for px in (x - gap, x + w + gap):
            if dense(px, py):
                ring.append((px, py))
    return ring


def fanout(x, y, w, h, pitch=7, rows=3):
    """Веер из-под корпуса: ряды отверстий, выходящие из контактного поля.

    У BGA выводы стоят сеткой под самим корпусом, и вывести их наружу можно
    только вниз — по переходному отверстию на каждый. Поэтому вокруг такого
    корпуса на живой плате не россыпь, а правильная решётка, и она начинается
    прямо под ним и на несколько рядов выходит за кромку.

    Это единственное место, где медь идёт СКВОЗЬ корпус, а не в обход, — и
    именно поэтому зоны KEEP_OUT здесь не спрашиваются: их запрет про то,
    что под сокет и под гнездо памяти сверлить нечего, а под шариковым
    корпусом сверлят как раз всюду.
    """
    out = []
    for r in range(rows):
        step = pitch + r * 1.5           # дальше от корпуса — реже
        far = 4 + r * pitch
        for k in range(int(w // step) + 1):
            px = x + k * step
            out.append((px, y - far))
            out.append((px, y + h + far))
        for k in range(int(h // step) + 1):
            py = y + k * step
            out.append((x - far, py))
            out.append((x + w + far, py))
    # Поле под самим корпусом: шаг вдвое крупнее шариков — отверстие ставят не
    # под каждый, а под каждый второй, иначе плату не развести.
    for kx in range(1, int(w // (pitch * 1.6))):
        for ky in range(1, int(h // (pitch * 1.6))):
            out.append((x + kx * pitch * 1.6, y + ky * pitch * 1.6))
    return out


def thermal(x, y, w, h):
    """Рыжая площадка теплоотвода: медь, с которой снята маска.

    Под силовым корпусом её делают широкой нарочно — тепло уходит в плату
    через неё, а не через выводы, — и решето отверстий в ней уводит его на
    внутренние слои. На живой плате это самое крупное рыжее пятно.
    """
    holes = ''.join(f'<circle cx="{x + 5 + kx * 6:.0f}" cy="{y + 5 + ky * 6:.0f}" r="1.2" '
                    f'fill="none" stroke="rgba(184,115,51,0.5)" stroke-width="1"/>'
                    for kx in range(int((w - 6) // 6)) for ky in range(int((h - 6) // 6)))
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" '
            f'fill="rgba(184,115,51,0.20)" stroke="rgba(184,115,51,0.42)" '
            f'stroke-width="0.8"/>{holes}')


KAPPA = 4 / 3 * (2 ** 0.5 - 1)  # смещение опорной точки для кубической дуги в четверть круга


def via_ring(points, r):
    """Кружки одной группы одним путём — не по кружку на штуку.

    Кружок без <circle>: четыре кубические дуги по кругу — тот же контур, но
    подпуть в общем `d`, а не свой узел DOM с заливкой и обводкой.

    Дуги строим кривыми Безье (C), а не командой `a`: раскладку эллиптической
    дуги в кривые растеризатор для `a` и для готового `<circle>` делает не
    одинаково — на кружке радиусом полтора пикселя кромка съезжала на другие
    пиксели, до 10 единиц из 255 (мерено побайтовым сравнением растра). С тем
    же коэффициентом смещения (KAPPA), каким рисует дугу сам браузер, разницы
    нет вовсе.

    Опорная точка — абсолютная и округлена той же целой, какой была старая
    `cx="{:.0f}"`: сдвиг на радиус даёт единственную лишнюю десятую, а не
    копится по сотым, и кромка отверстия остаётся на тех же пикселях. Сам же
    контур после неё — относительными шагами: это не хвост, копящий ошибку
    через сотни кружков подряд, как у сот в hexgrid, а форма ровно одного
    кружка, которая от центра не зависит и потому у всех кружков буквально
    одна и та же строка байт — brotli её жмёт почти в ноль, а абсолютной
    записью та же форма выходила разной на каждый кружок и раздувала вес.
    """
    def n(v):
        return f'{v:.1f}'.removesuffix('.0')

    kr = r * KAPPA
    # Форма кружка радиусом r, каждая точка — смещение от предыдущей.
    ring = (f'c0 {n(kr)} {n(kr - r)} {n(r)} {n(-r)} {n(r)}'
            f'c{n(-kr)} 0 {n(-r)} {n(-(r - kr))} {n(-r)} {n(-r)}'
            f'c0 {n(-kr)} {n(r - kr)} {n(-r)} {n(r)} {n(-r)}'
            f'c{n(kr)} 0 {n(r)} {n(r - kr)} {n(r)} {n(r)}Z')
    d = []
    for x, y in points:
        cx, cy = round(x), round(y)
        d.append(f'M{n(cx + r)} {n(cy)}{ring}')
    return ''.join(d)


def via_groups(points, min_gap):
    """Раскладывает кружки по группам так, чтобы внутри группы они не касались.

    В один путь нельзя валить кружки, чьи обводки соприкасаются: у отдельных
    элементов их полупрозрачные кольца в месте пересечения красятся дважды
    (каждый — своя заливка поверх предыдущей), а у слитого в один путь —
    один раз, одной заливкой. На девяти сотнях отверстий такие соседства
    редкие, но есть — и там, где кольца не пересекаются, слияние в один
    путь ничего не меняет: общих пикселей нет, красить одним вызовом или
    несколькими — тот же результат.

    Поэтому кружок ищет первую группу, где рядом (по сетке с шагом min_gap)
    ни одной точки ближе этого шага, и садится туда; если такой группы нет —
    заводит новую. Групп выходит мало — по числу соседств, а не по числу
    кружков.
    """
    groups = []  # каждая — [(x, y), ...] и своя сетка {(gx, gy): [(x, y)]}
    grids = []
    gap2 = min_gap * min_gap
    for x, y in points:
        gx, gy = int(x // min_gap), int(y // min_gap)
        for pts, grid in zip(groups, grids):
            near = False
            for dgx in (-1, 0, 1):
                for dgy in (-1, 0, 1):
                    for ox, oy in grid.get((gx + dgx, gy + dgy), ()):
                        if (ox - x) ** 2 + (oy - y) ** 2 < gap2:
                            near = True
                            break
                    if near:
                        break
                if near:
                    break
            if not near:
                pts.append((x, y))
                grid.setdefault((gx, gy), []).append((x, y))
                break
        else:
            groups.append([(x, y)])
            grids.append({(gx, gy): [(x, y)]})
    return groups


def thin(points, cell):
    """Прореживание по сетке: не больше одной точки на ячейку.

    Точки раскладываются по модулю от индекса, и модуль этот регулярно даёт
    совпадения — отверстия слипались кучками по три-четыре в одном месте, а
    рядом оставалось пустое поле. Сетка не двигает точку, а выбрасывает
    лишнюю: рисунок остаётся тем же, но перестаёт комковаться.
    """
    seen, out = set(), []
    for x, y in points:
        key = (int(x // cell), int(y // cell))
        if key in seen:
            continue
        seen.add(key)
        out.append((x, y))
    return out


def render(cv):
    vias = [(x, y) for x, y in cv.share['knots'] if clear(x, y)]
    for x, y, w, h in KEEP_OUT:
        vias.extend(outline(x, y, w, h))
    # Веер из-под каждого шарикового корпуса. Его отверстия не фильтруются
    # зонами: там, где у сокета контактное поле, у BGA как раз и сверлят.
    fans = []
    for _n, _s, x, y, w, h in CHIPS:
        fans.extend(fanout(x, y, w, h))
    field = []
    for i in range(430):
        # three manners: in rows along traces, in clumps by packages, at random
        mode = i % 3
        if mode == 0:
            bx = X_PCB + 20 + (i * 53) % (PCB_W - 60)
            by = 30 + (i * 97) % (PCB_H - 40)
            field.extend((bx + k * 5, by) for k in range(4))
        elif mode == 1:
            bx = X_PCB + 24 + (i * 131) % (PCB_W - 70)
            by = 34 + (i * 61) % (PCB_H - 50)
            field.extend((bx + (k % 2) * 6, by + (k // 2) * 6) for k in range(3))
        else:
            field.append((X_PCB + 18 + (i * 197) % (PCB_W - 40),
                          26 + (i * 149) % (PCB_H - 30)))
    vias.extend(thin(field, 13))

    # The small ones are half the diameter and there are twice as many: rows
    # along the trunks and the stitching of the planes between them.
    small_vias = []
    for i in range(560):
        if i % 4:
            sx = X_PCB + 16 + (i * 89) % (PCB_W - 34)
            sy = 24 + (i * 157) % (PCB_H - 26)
        else:
            kx, ky = cv.share['knots'][i % len(cv.share['knots'])]
            sx, sy = kx + (i % 5) * 4 - 8, ky + ((i // 5) % 3) * 4 - 4
        small_vias.append((sx, sy))
    small_vias = thin(small_vias, 8)
    # Обрезка по контуру текстолита. Медь есть только там, где есть плата:
    # контур вокруг блока считается с запасом и у крайних банков выходил за
    # кромку — переходные отверстия оказывались нарисованными на шасси.
    big_vias = [(vx, vy) for vx, vy in vias if clear(vx, vy)] + fans
    # Диаметр кольца — 2×радиус плюс толщина обводки: ближе этого соседние
    # отверстия уже перекрываются, и их нельзя сливать в один путь (см.
    # via_groups).
    # Медь отмечается в регистре клетками, а не отверстие за отверстием: их
    # почти тысяча, и тысяча записей раздула бы и регистр, и показ границ, где
    # каждая рисуется прямоугольником. Клетка говорит ровно то, что нужно
    # знать соседям: «здесь медь», — а точное место каждого кольца видно на
    # самой плате.
    #
    # Клетки одной строки, идущие подряд, пишутся одной полосой: отверстия
    # покрывают плату почти сплошь, и поштучно это четыре сотни записей —
    # регистр превращается в миллиметровку, на которой не видно ничего, кроме
    # самой миллиметровки. Полоса говорит ровно то же самое и занимает ровно
    # то же место.
    CELL = 36
    busy = set()
    for vx, vy in big_vias + small_vias:
        busy.add((int(vx // CELL), int(vy // CELL)))
    for gy in sorted({gy for _gx, gy in busy}):
        row = sorted(gx for gx, y in busy if y == gy)
        start = prev = row[0]
        for gx in row[1:] + [None]:
            if gx == prev + 1:
                prev = gx
                continue
            cv.busy(start * CELL, gy * CELL, (prev - start + 1) * CELL, CELL,
                    pad=0, kind=COPPER)
            start = prev = gx

    # Площадки теплоотвода у питания ядра. Рисуются здесь, а не в vrm: это
    # медь на текстолите, и лежать она обязана под деталью, а не поверх неё —
    # блок питания ядра идёт много позже и накрывает их своими дросселями.
    pads = ''.join(thermal(X_VRM - 4, y0 + 2, 26, SOCKET_H) for y0 in (Y_CPU0, Y_CPU1))

    ring_groups = via_groups(big_vias, 2 * 1.6 + 1.1)
    cv.add('<g class="decor vias" clip-path="url(#pcb-clip)">' + pads
        + ''.join(f'<path class="via-ring" fill="none" stroke="rgba(184,115,51,0.34)" '
                  f'stroke-width="1.1" d="{via_ring(g, 1.6)}"/>' for g in ring_groups)
        # The small ones as a single path: half a thousand separate circles
        # would cost half a thousand DOM nodes, and they all draw the same
        # grain anyway.
        + '<path fill="none" stroke="rgba(184,115,51,0.26)" stroke-width="1.5" stroke-linecap="round" d="'
        + ' '.join(f'M{sx:.0f} {sy:.0f}h0.4' for sx, sy in small_vias if clear(sx, sy)) + '"/></g>')
