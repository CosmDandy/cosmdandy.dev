"""backplane.

backplane
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (212, 0, 34, 740)

from board.geom import BAY_N, BAY_TOP, H, X_BP


def render(cv):
    bp = [f'<rect x="{X_BP}" y="8" width="18" height="{H-16}" rx="0" fill="#0e3a40" stroke="rgba(133,153,0,0.24)"/>']
    for i in range(BAY_N):
        y = BAY_TOP + 30 + i * (H - 12 - BAY_TOP - 70) / BAY_N
        bp.append(f'<rect x="{X_BP+3}" y="{y}" width="12" height="46" rx="0" fill="#0a1417"/>')
    cv.add('<g class="decor">' + ''.join(bp) + '</g>')
