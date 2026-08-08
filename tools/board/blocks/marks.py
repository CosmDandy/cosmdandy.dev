"""block designations: what is really printed next to the connectors.

Laid down at the end, on top of everything, and only where there really is
free space — the occupancy registry already knows where the parts stand.
"""

from board.canvas import BOARD, MAJOR, PART, SILK
from board.geom import (IO_Y, JACK_H, JACK_PITCH, RISER, X_IO, X_PCB, X_REAR, X_SVC,
                        Y_BANK_C, Y_BANK_L, Y_BANK_R, H)
from board.ink import silk_frame
from board.spec import PORTS


# Чего избегает обозначение узла: всё, что избегает корпус, плюс чужая краска.
НЕ_ЛЕЗЕМ = (BOARD, MAJOR, PART, SILK)


def render(cv):
    marks = []
    # The fourth field means "stands lengthwise". We turn the label where it is
    # longer than the space: at the rear wall there are only eighty-odd units
    # from the board edge to the end, and "OCP_3.0 · 2× 10G SFP+" takes up
    # almost as much — across, it ran into the sockets. Along the wall there is
    # as much room as you like.
    CANDIDATES = [
        # Обозначения верхнего банка тут нет нарочно. Оно стояло на y = 18,
        # то есть ровно на кромке текстолита, и половина букв оказывалась за
        # платой. Места между кромкой и первым гнездом нет: банк начинается на
        # 34, а строка занимает одиннадцать с полями. Соседние два банка
        # подписаны, и по ним верхний читается без своей строки.
        (X_PCB + 60, Y_BANK_C - 16, "DIMM_CPU0_A1 / CPU1_A0"),
        (X_PCB + 60, Y_BANK_R - 16, "DIMM_CPU1_A1"),
        (X_SVC + 8, 96, "PWR_CONN"),
        (X_SVC + 8, 250, "SLIMSAS_0-2", True),
        (X_SVC + 8, 360, "BAT1 · CR2032"),
        (X_SVC + 8, 468, "M.2_M-KEY"),
        # Гребёнки TPM здесь нет нарочно: модуль доверенной платформы на этой
        # плате распаян микросхемой SLB9673 у второго сокета. Либо чип, либо
        # съёмный модуль на гребёнке — но не оба сразу, как было.
        (X_SVC + 8, 556, "USB_INT", True),
        (X_SVC + 8, 600, "NMI_SW"),
        (X_REAR + 14, RISER[0][0], "RISER_1 · PCIE_G5", True),
        (X_REAR + 14, RISER[1][0] + RISER[1][1] + 4, "RISER_2 · PCIE_G5", True),
        # Не OCP: отдельного отсека под сетевую мезонину в этой машине нет, и
        # карта нарисована обычной PCIe-картой на кронштейне верхнего райзера.
        # Обозначение врало ровно про то, по чему разъём и опознают.
        (X_IO - 96, 176, f"RISER_1_CARD · {PORTS['sfp']}", True),
        # Подписи стоят напротив своих гнёзд и считаются от того же IO_Y и
        # того же шага, что и сами гнёзда: прежние 330 и 464 были записаны
        # руками и при первой же перекладке панели повисли между портами.
        # Повёрнутая строка ведётся от нижней кромки, поэтому к началу гнезда
        # прибавляется его высота.
        (X_IO - 96, IO_Y + JACK_PITCH + JACK_H, f"LAN_1/2 · {PORTS['eth']}", True),
        (X_IO - 96, IO_Y + 2 * JACK_PITCH + JACK_H, "MLAN · IPMI 2.0", True),
    ]
    for cand in CANDIDATES:
        x, y, text = cand[0], cand[1], cand[2]
        turn = len(cand) > 3 and cand[3]
        w = len(text) * 4.4 + 10
        # A turned label takes up the same amount of space, only along the
        # other axis: the occupancy registry has to be told about that, or the
        # label lands on a part.
        box = (x - 4, y - 11 - w, 15, w) if turn else (x, y - 12, w, 15)
        # Плашка узла — краска, но ставится она видом «корпус»: место под ней
        # должно быть неприкосновенным, иначе рассыпуха ляжет сверху. А вот
        # сама она на чужую краску залезать не должна — «корпус» шелкографию не
        # избегает, и плашки садились на подпись «FAN FAULT» и на обозначения.
        if not cv.put(*box, avoid=НЕ_ЛЕЗЕМ):
            continue
        marks.append(silk_frame(x, y - 11, text, 7, turn=turn))

    # Заглушек «мелочь по свободным карманам» здесь больше нет.
    #
    # Их было сорок семь: серый прямоугольник, кружок и прямоугольник с
    # рамкой, разбросанные псевдослучайно по всей плате. Ни одна не изображала
    # ничего — ни детали с выводами, ни отверстия, ни площадки, — и читались
    # они ровно тем, чем были: дырками. Лезли при этом всюду, включая поле под
    # процессором и надписи гнёзд памяти.
    #
    # Настоящая рассыпуха рисуется в pcb_scatter: у неё есть корпус, площадки
    # под пайку и своё место у той микросхемы, которую она обвязывает. Эти же
    # заглушки её только глушили — на плате становилось не гуще, а грязнее.
    cv.add('<g class="decor silk">' + ''.join(marks) + '</g>')
