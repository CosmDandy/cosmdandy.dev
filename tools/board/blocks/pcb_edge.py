"""connectors along the edge.

The ribbon headers run along the left edge of the board, behind the strip of
harnesses: flat cables leave them towards the front — to the power button, to
the USB, to the intrusion sensor. We place them before the discrete
components: those take up almost the whole board, and anything that did not
claim its place in advance no longer fits afterwards.
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (412, 230, 74, 620)

from board.geom import X_CORE
from board.metal import idc_header, power_header


def render(cv):
    edge = []
    HEADERS = [(10, "FP_PANEL"), (8, "FP_USB"), (6, "INTRUSION"), (10, "SATA_PWR")]
    # The ordinates are picked from the gaps between packages: the strip along
    # the edge is narrow, and a header that landed by the placement scan ended
    # up on the pins of the neighbouring chip.
    for (pins, label), hy in zip(HEADERS, (240, 440, 580, 760)):
        hx = X_CORE - 74
        if cv.put(hx - 3, hy - 3, 26, (pins // 2) * 4.4 + 16):
            edge.append(idc_header(hx, hy, pins, label, vertical=True))

    # Power header: 12 volts to the drive backplane. It stands on the cage
    # side — nobody would run a power harness across the whole machine.
    for hx, hy in ((X_CORE - 52, 806), (X_CORE - 52, 340), (X_CORE - 52, 500)):
        if cv.put(hx - 4, hy - 6, 34, 40):
            edge.append(power_header(hx, hy))
            break
    cv.add('<g class="decor">' + ''.join(edge) + '</g>')
