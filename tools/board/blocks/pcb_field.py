"""board: a rectangle with two cutouts for the PSUs.

The fill is darker than it used to be: the traces are laid over it in a light
tone, and if the background stayed as it was, they would not show up on it.
"""

from board.canvas import BOARD
from board.geom import X_PCB, X_PCB_END, X_REAR, Y_PSU_BOT, Y_PSU_TOP, H


def render(cv):
    # Тон текстолита задан здесь, а не берётся из палитры: дорожки кладутся
    # поверх светлым, и общий PCB тона палитры для них слишком блёклый.
    PCB_DARK = "#0a3037"
    PCB_PATH = (f'M{X_PCB} 18 H{X_REAR-4} V{Y_PSU_TOP} H{X_PCB_END} V{Y_PSU_BOT} '
                f'H{X_REAR-4} V{H-18} H{X_PCB} Z')
    cv.add(f'<path d="{PCB_PATH}" fill="{PCB_DARK}" stroke="rgba(133,153,0,0.22)" stroke-width="1.4"/>')
    # The same outline clips the traces: a bundle that runs past the edge would
    # otherwise stretch across the chassis, and there is no copper beyond the
    # edge of the laminate.
    cv.add(f'<clipPath id="pcb-clip"><path d="{PCB_PATH}"/></clipPath>')

    # ── Где платы нет ────────────────────────────────────────────────────
    # Обрезка по контуру спасает только то, что рисуется путями: всё
    # остальное — подписи, корпуса, рассыпуха — про кромку не знало вовсе, и
    # регистр занятости считал заоконное поле свободным. Отсюда и ноль у вида
    # «вырезы»: запрета не было, просто никто туда пока не целился.
    #
    # Помечаем два выреза под блоки питания и рамку вокруг текстолита. Это
    # единственный вид, который избегают все без исключения: за кромкой не
    # бывает ни меди, ни краски — там воздух и шасси.
    EDGE = 40                     # ширина запретной рамки снаружи платы
    cut_x = X_REAR - 4            # правее этой линии плата только между БП
    cut_w = X_PCB_END - cut_x
    for y, h in ((18, Y_PSU_TOP - 18), (Y_PSU_BOT, H - 18 - Y_PSU_BOT)):
        cv.busy(cut_x, y, cut_w, h, pad=0, kind=BOARD)
    cv.busy(X_PCB - EDGE, 18 - EDGE, EDGE, H - 36 + EDGE * 2, pad=0, kind=BOARD)
    cv.busy(X_PCB_END, 18 - EDGE, EDGE, H - 36 + EDGE * 2, pad=0, kind=BOARD)
    cv.busy(X_PCB - EDGE, 18 - EDGE, X_PCB_END - X_PCB + EDGE * 2, EDGE,
            pad=0, kind=BOARD)
    cv.busy(X_PCB - EDGE, H - 18, X_PCB_END - X_PCB + EDGE * 2, EDGE,
            pad=0, kind=BOARD)
