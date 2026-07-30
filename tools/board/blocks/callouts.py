"""выноски: подписи узлов, видимые сразу.

выноски: подписи узлов, видимые сразу
"""

from board.ink import callout


def render(cv):
    cv.add('<g class="callouts">' + ''.join(callout(*c) for c in cv.callouts) + '</g>')
