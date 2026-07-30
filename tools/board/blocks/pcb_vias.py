"""переходные отверстия.

Их на плате тысячи, и это единственное тёплое пятно в холодной палитре:
в отверстие затянута медь, маска на него не заходит. Рисуем прежде всего
остального — на живой плате via уходят под корпуса, а не лежат поверх.

Крупные сидят на изломах дорожек — там переход между слоями и нужен.
Мелкая россыпь идёт полем: ею прошивают полигоны земли.

Под сокетами, банками памяти и крупными корпусами меди нет: там либо
контактное поле, либо посадочное место, и сверлить его нечем. Поэтому
россыпь эти зоны обходит, а по их границам идёт частым контуром — так на
живой плате медь и обтекает крупный узел.
"""

from board.geom import (
    BANK_N,
    CHIPS,
    DIMM_SOCK_W,
    PCB_H,
    PCB_W,
    PITCH,
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

# Зоны, свободные от меди: сокеты, банки памяти, крупные корпуса.
KEEP_OUT = (
    [(X_SOCK - 10, y - 10, SOCKET_W + 20, SOCKET_H + 20) for y in (Y_CPU0, Y_CPU1)]
    + [(X_CORE - 12, y - 8, DIMM_SOCK_W + 24, BANK_N * PITCH + 16)
       for y in (Y_BANK_L, Y_BANK_C, Y_BANK_R)]
    + [(x - 8, y - 8, w + 16, h + 16) for _n, _s, x, y, w, h in CHIPS]
)


def clear(px, py):
    """Свободно ли место под медь — то есть не попали ли мы в чужой узел."""
    return not any(x <= px <= x + w and y <= py <= y + h for x, y, w, h in KEEP_OUT)


def outline(x, y, w, h, gap=6, step=9):
    """Контур из отверстий вокруг узла: медь обходит его частым рядом."""
    ring = []
    for k in range(int(w // step) + 1):
        px = x + k * step
        ring += [(px, y - gap), (px, y + h + gap)]
    for k in range(int(h // step) + 1):
        py = y + k * step
        ring += [(x - gap, py), (x + w + gap, py)]
    return ring


def render(cv):
    vias = [(x, y) for x, y in cv.share['knots'] if clear(x, y)]
    for x, y, w, h in KEEP_OUT:
        vias.extend(outline(x, y, w, h))
    for i in range(430):
        # три манеры: рядами вдоль дорожек, кучками у корпусов и вразнобой
        mode = i % 3
        if mode == 0:
            bx = X_PCB + 20 + (i * 53) % (PCB_W - 60)
            by = 30 + (i * 97) % (PCB_H - 40)
            vias.extend((bx + k * 5, by) for k in range(4))
        elif mode == 1:
            bx = X_PCB + 24 + (i * 131) % (PCB_W - 70)
            by = 34 + (i * 61) % (PCB_H - 50)
            vias.extend((bx + (k % 2) * 6, by + (k // 2) * 6) for k in range(3))
        else:
            vias.append((X_PCB + 18 + (i * 197) % (PCB_W - 40),
                         26 + (i * 149) % (PCB_H - 30)))

    # Мелочь — вдвое меньше диаметром, и её вдвое больше: ряды вдоль магистралей
    # и прошивка полигонов между ними.
    small_vias = []
    for i in range(560):
        if i % 4:
            sx = X_PCB + 16 + (i * 89) % (PCB_W - 34)
            sy = 24 + (i * 157) % (PCB_H - 26)
        else:
            kx, ky = cv.share['knots'][i % len(cv.share['knots'])]
            sx, sy = kx + (i % 5) * 4 - 8, ky + ((i // 5) % 3) * 4 - 4
        small_vias.append((sx, sy))
    cv.add('<g class="decor vias">' + ''.join(
        f'<circle cx="{vx:.0f}" cy="{vy:.0f}" r="1.6" fill="none" stroke="rgba(184,115,51,0.34)" stroke-width="1.1"/>'
        for vx, vy in vias if clear(vx, vy))
        # Мелочь одним путём: полтысячи отдельных кружков стоили бы полтысячи
        # узлов DOM, а рисуют они одно и то же зерно.
        + '<path fill="none" stroke="rgba(184,115,51,0.26)" stroke-width="1.5" stroke-linecap="round" d="'
        + ' '.join(f'M{sx:.0f} {sy:.0f}h0.4' for sx, sy in small_vias if clear(sx, sy)) + '"/></g>')
