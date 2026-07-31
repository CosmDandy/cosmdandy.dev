"""callouts: block labels, readable at once.

Assembled last and drawn on top of everything: they are the only thing on the
diagram that has to read immediately, without hovering.
"""

from board.ink import callout


def render(cv):
    cv.add('<g class="callouts">'
           + ''.join(callout(*c, order=i) for i, c in enumerate(cv.callouts))
           + '</g>')
