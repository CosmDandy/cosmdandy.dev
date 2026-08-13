"""silkscreen: what makes a real board different from a drawing.

Traces, footprints for the small parts, test points, position designators.
All of it is background — it only reads up close, but without it the board
looks empty.
"""

from board.blocks.frames import FIELD_FRAMES, title_box
from board.canvas import COVER, RESERVE
from board.geom import (
    BANK_N,
    CHIPS,
    FAN_N,
    IO_BOARD,
    IO_FREE,
    LID_BTN,
    SVC_SW,
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
    SAS_H,
    SAS_W,
    X_SAS,
    fan_foot_y,
    fan_gaps,
)


def render(cv):
    # Заголовки рамок функциональных блоков. Рамка рисуется поздно и поверх
    # рассыпухи, но подпись её — краска, и мелочь под ней читается грязью.
    #
    # Место держится как корпус, а не как бронь: обозначения узлов ставятся
    # видом «корпус», а корпус бронь не избегает — он в неё как раз и встаёт.
    # Из-за этого плашка «PLATFORM I/O» ложилась прямо на заголовок своей же
    # рамки, а «L10-L21» — на заголовок питания ядра.
    for frame in FIELD_FRAMES:
        cv.busy(*title_box(frame))

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
        cv.busy(X_CORE - 16, by - 10, 358, BANK_N * PITCH + 12, kind=COVER)
    # Сокеты. Брони под ними не было ни одной — при том, что это два самых
    # крупных узла платы и вокруг них забронировано всё остальное: и банки
    # памяти, и питание ядра, и обвязка. Место под гнездо держалось само собой,
    # потому что рисующий его блок идёт последним и никто туда не целился, —
    # но «никто не целился» это не бронь, а везение. Под ILM и рамкой гнезда на
    # живой плате не стоит ничего: там контактное поле и четыре стойки.
    for y0 in (Y_CPU0, Y_CPU1):
        cv.busy(X_SOCK - 8, y0 - 8, SOCKET_W + 62, SOCKET_H + 16, kind=COVER)
    # Large packages: their places are declared in geom and claimed here, before
    # everyone else — the headers at the edge are placed by the same scan and
    # would otherwise land right on top of a chip.
    # Бронь по габариту корпуса с выводами, не шире. Прежние восемь единиц
    # запаса с каждой стороны отталкивали от чипа его же развязку: конденсатор
    # обязан стоять у самого вывода питания, иначе он не работает, — а места
    # ближе брони ему не оставалось, и ряды не вставали вовсе.
    for _n, _s, x, y, w, h in CHIPS:
        cv.busy(x - 5, y - 5, w + 10, h + 10, kind=RESERVE)
    # Core power: a row of chokes, a heatsink bar and two electrolytic cans. It
    # is drawn after the discrete components and does not ask for space, so we
    # hold it here — otherwise the crystals and the small chokes end up under
    # the cans.
    for y0 in (Y_CPU0, Y_CPU1):
        cv.busy(X_VRM - 46, y0 - 20, 70, SOCKET_H + 30, kind=COVER)
    # Fan headers: the feet come down onto the board right at the edge, and next
    # to each one stands a lamp labelled FAN FAULT. They are drawn after the
    # discrete components, so the space is held here — but only their own. A
    # solid strip over the full height left the edge empty: one more row of
    # small parts fits between the headers, yet everything was taken.
    for i in range(FAN_N):
        cv.busy(X_PCB, fan_foot_y(i) - 8, 82, 34, kind=COVER)
    # SlimSAS к бэкплейну: три разъёма у самой кромки, каждый против своего
    # просвета в стене. Место держится здесь, а не в блоке, который их рисует:
    # тот идёт после рассыпухи, и к его очереди у кромки уже стояла бы мелочь.
    for gy in fan_gaps():
        cv.busy(X_SAS - 4, gy - SAS_H / 2 - 4, SAS_W + 8, SAS_H + 8, kind=COVER)
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
        cv.busy(X_REAR + 12, ry - 6, X_PCB_END - 18 - X_REAR, rh + 12, kind=COVER)
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
        cv.busy(X_REAR, by, X_PCB_END - X_REAR, bh, kind=COVER)
    # Служебная колонка: полосы под её узлы, а не один квадрат на всю зону.
    #
    # Держатся они бронью, и это не то же самое, что корпус. Бронь говорит
    # «сюда придёт узел»: рассыпуху и крупные корпуса она не пускает — иначе к
    # своей очереди служебные разъёмы не нашли бы места вовсе, — а краску
    # пускает, потому что печатают её на голый текстолит до монтажа.
    #
    # Корпусами разъёмы отмечает сам `service`, по тем же числам, по которым
    # рисует. Пока полосы стояли корпусами, они держали не разъём, а всю
    # полосу целиком, и обозначению негде было встать даже между двумя
    # колодками: из семи номеров на плату попадал один. А без брони вовсе
    # надписи ложились прямо на разъёмы — «P2» поверх колодки, refdes поперёк
    # батарейки. Оба запрета нужны, но у разных вещей: полоса не пускает
    # объём, корпус не пускает краску.
    for bx, by, bw, bh in ((X_SVC + 16, 22, 140, 64),    # отладочные гребёнки и лампы платы
                           (X_SVC + 6, 108, 146, 46),    # P1/P2
                           (X_SVC + 16, 232, 140, 40),   # наклейка с MAC
                           (X_SVC + 16, 352, 140, 44),   # перемычка J147 и её легенда
                           (X_SVC + 16, 438, 140, 28),   # что делают переключатели
                           # Полоса, где стоял SlimSAS, освободилась: разъёмы
                           # уехали к передней кромке платы, ближе к корзине.
                           # Бронь снята вместе с ними — иначе сборка держала бы
                           # пустой карман в самом плотном месте платы, и
                           # рассыпухе туда было бы нельзя.
                           (X_SVC + 6, 272, 150, 74),    # CMOS and microSD
                           (X_SVC + 6, 392, 146, 48),    # SW3/SW4
                           (X_SVC + 130, 296, 46, 388),  # silkscreen along the edge
                           (X_SVC + 2, 466, 154, 84)):   # jumper table
        cv.busy(bx, by, bw, bh, kind=RESERVE)
    # Кнопки — корпус, а не бронь: они непрозрачные, и краска на них не
    # печатается. Числа берутся из geom, а не пишутся здесь вторыми: прежние
    # 500 разошлись с настоящими 712 на две сотни, и наклейка FRU встала прямо
    # под кнопку. Та же ошибка, что была у брони райзеров, и находится она так
    # же — глазами.
    cv.busy(LID_BTN[0] - 6, LID_BTN[1], LID_BTN[2] + 12, LID_BTN[2] + 6)
    cv.busy(SVC_SW[0] - 4, SVC_SW[1] - 10, SVC_SW[2] + 8, SVC_SW[3] + 52)
