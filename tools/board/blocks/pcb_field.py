"""плата: прямоугольник с двумя вырезами под БП.

Заливка темнее прежней: поверх неё ложится разводка светлым тоном, и если
оставить фон как был, дорожки на нём не проявятся.
"""

from board.geom import H, X_PCB, X_PCB_END, X_REAR, Y_PSU_BOT, Y_PSU_TOP
from board.palette import PCB_DARK


def render(cv):
    PCB_DARK = "#0a3037"
    PCB_PATH = (f'M{X_PCB} 18 H{X_REAR-4} V{Y_PSU_TOP} H{X_PCB_END} V{Y_PSU_BOT} '
                f'H{X_REAR-4} V{H-18} H{X_PCB} Z')
    cv.add(f'<path d="{PCB_PATH}" fill="{PCB_DARK}" stroke="rgba(133,153,0,0.22)" stroke-width="1.4"/>')
    # Тем же контуром режем разводку: пучок, уходящий за кромку, иначе тянется
    # по шасси, а медь за краем текстолита не бывает.
    cv.add(f'<clipPath id="pcb-clip"><path d="{PCB_PATH}"/></clipPath>')
