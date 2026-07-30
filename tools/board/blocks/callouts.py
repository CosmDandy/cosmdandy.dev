"""выноски: подписи узлов, видимые сразу.

Собираются последними и лежат поверх всего: это единственное на схеме, что
обязано читаться сразу и без наведения.
"""

from board.ink import callout


def render(cv):
    cv.add('<g class="callouts">'
           + ''.join(callout(*c, order=i) for i, c in enumerate(cv.callouts))
           + '</g>')
