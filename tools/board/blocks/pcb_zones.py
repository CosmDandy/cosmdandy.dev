"""silkscreen: what makes a real board different from a drawing.

Traces, footprints for the small parts, test points, position designators.
All of it is background — it only reads up close, but without it the board
looks empty.
"""

from board.blocks.frames import FIELD_FRAMES, title_box
from board.canvas import RESERVE
from board.geom import (
    BANK_N,
    CHIPS,
    FAN_N,
    IO_BOARD,
    IO_FREE,
    PITCH,
    RISER,
    SOCKET_H,
    SOCKET_W,
    X_CORE,
    X_PCB,
    X_PCB_END,
    X_REAR,
    X_SOCK,
    X_SVC,
    X_VRM,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
    Y_CPU0,
    Y_CPU1,
    Y_PSU_BOT,
    Y_PSU_TOP,
    H,
    fan_foot_y,
)


def render(cv):
    # Заголовки рамок функциональных блоков. Рамка рисуется поздно и поверх
    # рассыпухи, но подпись её — краска, и мелочь под ней читается грязью.
    for frame in FIELD_FRAMES:
        cv.busy(*title_box(frame), kind=RESERVE)

    # Large zones are claimed in advance so that the small parts do not land on
    # them. The reservations follow the actual dimensions: a generous margin ate
    # up all the free area, and the large parts were left with nowhere to sit —
    # neither a choke nor a heatsink.
    # Память бронируется по банкам, а не одним квадратом на все три. Квадрат
    # держал триста тысяч единиц площади, а корпусами внутри было занято
    # семнадцать процентов: остальное — проходы между банками, куда на живой
    # плате идут и дорожки, и шелкография, и рассыпуха. Банк же ровно то, что
    # он есть: полоса слотов.
    for by in (Y_BANK_L, Y_BANK_C, Y_BANK_R):
        cv.busy(X_CORE - 16, by - 10, 358, BANK_N * PITCH + 12, kind=RESERVE)
    # Сокеты. Брони под ними не было ни одной — при том, что это два самых
    # крупных узла платы и вокруг них забронировано всё остальное: и банки
    # памяти, и питание ядра, и обвязка. Место под гнездо держалось само собой,
    # потому что рисующий его блок идёт последним и никто туда не целился, —
    # но «никто не целился» это не бронь, а везение. Под ILM и рамкой гнезда на
    # живой плате не стоит ничего: там контактное поле и четыре стойки.
    for y0 in (Y_CPU0, Y_CPU1):
        cv.busy(X_SOCK - 8, y0 - 8, SOCKET_W + 16, SOCKET_H + 16, kind=RESERVE)
    # Large packages: their places are declared in geom and claimed here, before
    # everyone else — the headers at the edge are placed by the same scan and
    # would otherwise land right on top of a chip.
    for _n, _s, x, y, w, h in CHIPS:
        cv.busy(x - 8, y - 8, w + 16, h + 16, kind=RESERVE)
    # Core power: a row of chokes, a heatsink bar and two electrolytic cans. It
    # is drawn after the discrete components and does not ask for space, so we
    # hold it here — otherwise the crystals and the small chokes end up under
    # the cans.
    for y0 in (Y_CPU0, Y_CPU1):
        cv.busy(X_VRM - 46, y0 - 20, 70, SOCKET_H + 30, kind=RESERVE)
    # Fan headers: the feet come down onto the board right at the edge, and next
    # to each one stands a lamp labelled FAN FAULT. They are drawn after the
    # discrete components, so the space is held here — but only their own. A
    # solid strip over the full height left the edge empty: one more row of
    # small parts fits between the headers, yet everything was taken.
    for i in range(FAN_N):
        cv.busy(X_PCB, fan_foot_y(i) - 8, 82, 34, kind=RESERVE)
    # Riser brackets: they are drawn much later, but claim their space now —
    # otherwise a large package lands in the pocket between the power supplies
    # and hides under the steel of the bracket. That is how the BMC went missing
    # under the plate.
    # Бронь берётся из тех же координат, по которым райзеры и рисуются. Пока
    # числа стояли здесь своими, они разошлись с ними до неузнаваемости:
    # первая бронь была сдвинута вниз относительно верхнего райзера, а вторая
    # висела в пустоте на сотню единиц ниже нижнего — то есть нижний слот не
    # был забронирован вовсе, а место под ним занимала бронь ни для чего.
    for ry, rh in RISER:
        cv.busy(X_REAR + 12, ry - 6, X_PCB_END - 18 - X_REAR, rh + 12, kind=RESERVE)
    # Rear jacks: their magnetics and solder tabs, and the field where the
    # vendor mark is set. Both are drawn much later — by rear_io and by the
    # scatter's own tail — and both would otherwise be sprinkled with passives
    # placed before them.
    cv.busy(*IO_BOARD, kind=RESERVE)
    cv.busy(*IO_FREE, kind=RESERVE)
    # There is no board under the power supplies: those are cutouts. Small parts
    # and position designators used to land in these pockets and slide under the
    # steel of the chassis.
    for by, bh in ((0, Y_PSU_TOP), (Y_PSU_BOT, H - Y_PSU_BOT)):
        cv.busy(X_REAR, by, X_PCB_END - X_REAR, bh, kind=RESERVE)
    # service zone: the blocks and their labels, not a whole-area rectangle
    for bx, by, bw, bh in ((X_SVC + 6, 108, 146, 46),    # P1/P2
                           (X_SVC + 2, 180, 150, 62),    # SlimSAS to the backplane
                           (X_SVC + 6, 272, 150, 74),    # CMOS and microSD
                           (X_SVC + 6, 392, 146, 48),    # M.2
                           (X_SVC + 130, 296, 46, 388),  # silkscreen along the edge
                           (X_SVC + 18, 500, 104, 104),  # "fit the cover" button
                           (X_SVC + 2, 438, 154, 62),   # jumper table
                           (X_SVC + 6, 612, 130, 100)):  # SERVICE toggle
        cv.busy(bx, by, bw, bh, kind=RESERVE)
