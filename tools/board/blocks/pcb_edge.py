"""разъёмы у кромки.

Гребёнки шлейфов идут вдоль левой кромки платы, за полосой жгутов: от них
плоские шлейфы уходят на фронт — к кнопке питания, к USB, к датчику
вскрытия. Ставим их до рассыпухи: она занимает плату почти целиком, и
всё, что не заняло место заранее, потом уже не помещается.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (412, 230, 74, 620)

from board.geom import X_CORE
from board.metal import idc_header, power_header


def render(cv):
    edge = []
    HEADERS = [(10, "FP_PANEL"), (8, "FP_USB"), (6, "INTRUSION"), (10, "SATA_PWR")]
    # Ординаты выбраны по промежуткам между корпусами: полоса у кромки узкая,
    # и гребёнка, севшая по обходу, оказывалась на выводах соседнего чипа.
    for (pins, label), hy in zip(HEADERS, (240, 440, 580, 760)):
        hx = X_CORE - 74
        if cv.put(hx - 3, hy - 3, 26, (pins // 2) * 4.4 + 16):
            edge.append(idc_header(hx, hy, pins, label, vertical=True))

    # Силовой хедер: 12 вольт на backplane дисков. Стоит со стороны корзины —
    # тянуть силовой жгут через всю машину никто не станет.
    for hx, hy in ((X_CORE - 52, 806), (X_CORE - 52, 340), (X_CORE - 52, 500)):
        if cv.put(hx - 4, hy - 6, 34, 40):
            edge.append(power_header(hx, hy))
            break
    cv.add('<g class="decor">' + ''.join(edge) + '</g>')
