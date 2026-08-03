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


def outline(x, y, w, h, gap=6, step=9):
    """A contour of vias around a block: copper skirts it in a dense row."""
    ring = []
    for k in range(int(w // step) + 1):
        px = x + k * step
        ring += [(px, y - gap), (px, y + h + gap)]
    for k in range(int(h // step) + 1):
        py = y + k * step
        ring += [(x - gap, py), (x + w + gap, py)]
    return ring


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
    cv.add('<g class="decor vias" clip-path="url(#pcb-clip)">' + ''.join(
        f'<circle cx="{vx:.0f}" cy="{vy:.0f}" r="1.6" fill="none" stroke="rgba(184,115,51,0.34)" stroke-width="1.1"/>'
        for vx, vy in vias if clear(vx, vy))
        # The small ones as a single path: half a thousand separate circles
        # would cost half a thousand DOM nodes, and they all draw the same
        # grain anyway.
        + '<path fill="none" stroke="rgba(184,115,51,0.26)" stroke-width="1.5" stroke-linecap="round" d="'
        + ' '.join(f'M{sx:.0f} {sy:.0f}h0.4' for sx, sy in small_vias if clear(sx, sy)) + '"/></g>')
