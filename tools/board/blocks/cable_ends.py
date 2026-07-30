"""ответные разъёмы жгутов.

ответные разъёмы жгутов
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (398, 86, 46, 700)

from board.geom import X_PCB
from board.ink import mono


def render(cv):
    conn = []
    for i in range(6):
        y = 96 + i * 122
        x = X_PCB + 26
        rot = -6 if i % 2 else 5      # разъёмы на плате стоят не идеально ровно
        # Над колодкой приклёпан жестяной уголок: он и направляет разъём при
        # вставке вслепую, и прикрывает контакты сверху. Полка уходит вбок,
        # к ней же крепится хомут жгута.
        conn.append(f'<g transform="rotate({rot} {x+11} {y+26})">'
                    f'<rect x="{x}" y="{y}" width="22" height="52" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.32)"/>'
                    f'<rect x="{x+4}" y="{y+6}" width="14" height="40" rx="1" fill="#0a1417"/>'
                    f'<path d="M{x-6} {y-4} H{x+28} V{y+10} H{x+24} V{y} H{x-6} Z" '
                    f'fill="#2b363c" stroke="rgba(147,161,161,0.34)" stroke-width="1.1"/>'
                    f'<circle cx="{x-1}" cy="{y+3}" r="1.8" fill="#0a1417" stroke="rgba(147,161,161,0.28)"/>'
                    f'<circle cx="{x+23}" cy="{y+3}" r="1.8" fill="#0a1417" stroke="rgba(147,161,161,0.28)"/>'
                    f'</g>')
        conn.append(mono(x + 11, y + 68, f"J{i+1}", 6, op=0.34))
        cv.busy(x - 6, y - 6, 34, 82)
    cv.add('<g class="decor">' + ''.join(conn) + '</g>')
