"""жгуты SlimSAS: три пучка в обход, а не напрямик.

На фото кабели не идут кратчайшим путём: они прижаты к стенкам корзины и
к середине, чтобы не мешать продуву. Рисуем до вентиляторов — стенка их
перекрывает, и жгут «ныряет» под модули.
"""

from board.geom import BAY_TOP, H, X_BP, X_FAN, X_PCB


def render(cv):
    cables = []
    ROUTES = [(0, 34), (1, 34), (2, H / 2), (3, H / 2), (4, H - 34), (5, H - 34)]
    for i, (n, via) in enumerate(ROUTES):
        y0 = BAY_TOP + 40 + n * (H - 12 - BAY_TOP - 80) / 5
        y1 = 108 + n * 122
        x1 = X_PCB + 26
        d = (f'M{X_BP+18} {y0} C{X_BP+52} {y0}, {X_FAN-14} {via}, {X_FAN+70} {via} '
             f'S{x1-70} {y1}, {x1} {y1}')
        for (wid, op) in ((7, 0.32), (3, 0.16)):
            cables.append(f'<path d="{d}" fill="none" stroke="rgba(42,161,152,{op})" '
                          f'stroke-width="{wid}" stroke-linecap="round"/>')
    cv.add('<g class="decor cables">' + ''.join(cables) + '</g>')
