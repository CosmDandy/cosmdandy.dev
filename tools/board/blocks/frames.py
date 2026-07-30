"""рамки функциональных блоков.

рамки функциональных блоков
"""

from board.geom import SOCKET_H, X_CORE, X_SVC, Y_CPU0, Y_CPU1
from board.ink import block_frame


def render(cv):
    cv.add('<g class="decor">' + ''.join([
        block_frame(X_SVC - 4, 92, 166, 262, "PLATFORM I/O", "U12 U18 C120-C138 R240-R262"),
        block_frame(428, 34, 62, 148, "BMC", "U79 U31 C300-C318"),
        block_frame(X_CORE - 30, Y_CPU0 - 6, 30, SOCKET_H + 12, "VR CPU0", "L10-L21 Q40-Q62"),
        block_frame(X_CORE - 30, Y_CPU1 - 6, 30, SOCKET_H + 12, "VR CPU1", "L30-L41 Q70-Q92"),
    ]) + '</g>')
