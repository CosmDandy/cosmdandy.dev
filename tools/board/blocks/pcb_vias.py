"""переходные отверстия.

Их на плате тысячи, и это единственное тёплое пятно в холодной палитре:
в отверстие затянута медь, маска на него не заходит. Рисуем прежде всего
остального — на живой плате via уходят под корпуса, а не лежат поверх.

Крупные сидят на изломах дорожек — там переход между слоями и нужен.
Мелкая россыпь идёт полем: ею прошивают полигоны земли.
"""

from board.geom import PCB_H, PCB_W, X_PCB


def render(cv):
    vias = [(x, y) for x, y in cv.share['knots']]
    for i in range(430):
        # три манеры: рядами вдоль дорожек, кучками у корпусов и вразнобой
        mode = i % 3
        if mode == 0:
            bx = X_PCB + 20 + (i * 53) % (PCB_W - 60)
            by = 30 + (i * 97) % (PCB_H - 40)
            for k in range(4):
                vias.append((bx + k * 5, by))
        elif mode == 1:
            bx = X_PCB + 24 + (i * 131) % (PCB_W - 70)
            by = 34 + (i * 61) % (PCB_H - 50)
            for k in range(3):
                vias.append((bx + (k % 2) * 6, by + (k // 2) * 6))
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
        f'<circle cx="{vx}" cy="{vy}" r="1.6" fill="none" stroke="rgba(184,115,51,0.34)" stroke-width="1.1"/>'
        for vx, vy in vias)
        # Мелочь одним путём: полтысячи отдельных кружков стоили бы полтысячи
        # узлов DOM, а рисуют они одно и то же зерно.
        + '<path fill="none" stroke="rgba(184,115,51,0.26)" stroke-width="1.5" stroke-linecap="round" d="'
        + ' '.join(f'M{sx:.0f} {sy:.0f}h0.4' for sx, sy in small_vias) + '"/></g>')
