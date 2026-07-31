"""board: a rectangle with two cutouts for the PSUs.

The fill is darker than it used to be: the traces are laid over it in a light
tone, and if the background stayed as it was, they would not show up on it.
"""

from board.geom import H, X_PCB, X_PCB_END, X_REAR, Y_PSU_BOT, Y_PSU_TOP
from board.palette import PCB_DARK


def render(cv):
    PCB_DARK = "#0a3037"
    PCB_PATH = (f'M{X_PCB} 18 H{X_REAR-4} V{Y_PSU_TOP} H{X_PCB_END} V{Y_PSU_BOT} '
                f'H{X_REAR-4} V{H-18} H{X_PCB} Z')
    cv.add(f'<path d="{PCB_PATH}" fill="{PCB_DARK}" stroke="rgba(133,153,0,0.22)" stroke-width="1.4"/>')
    # The same outline clips the traces: a bundle that runs past the edge would
    # otherwise stretch across the chassis, and there is no copper beyond the
    # edge of the laminate.
    cv.add(f'<clipPath id="pcb-clip"><path d="{PCB_PATH}"/></clipPath>')
