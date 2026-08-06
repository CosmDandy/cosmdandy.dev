"""frames of the functional blocks.

A trick from a real board: the block is outlined with a dashed line on the
laminate and its designation and list of positions are printed next to it.
Such a frame shows where one block ends and the next one begins — without it
the board reads as one continuous scatter.

The socket frame and the bank frames are labelled the way memory channels are
marked: each bank belongs to its own processor, and that is written right on
it.
"""

from board.geom import (
    BANK_N,
    DIMM_SOCK_W,
    PITCH,
    SLOT_H,
    SOCKET_H,
    SOCKET_W,
    X_CORE,
    X_SOCK,
    X_SVC,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
    Y_CPU0,
    Y_CPU1,
)
from board.ink import block_frame
from board.spec import CPU, DIMM

# Высота банка — это то, что он занимает на самом деле: семь шагов плюс
# высота последней плашки. По BANK_N * PITCH рамка выходила на шаг ниже
# последнего модуля, и у нижнего банка её перечень позиций оказывался уже за
# кромкой текстолита.
BANK_H = (BANK_N - 1) * PITCH + SLOT_H

# Рамки, стоящие в поле рассыпухи. Их заголовки печатаются прямо на кромке, и
# мелочь не должна садиться под них — а бронировать место успевает только
# pcb_zones, он проходит раньше всех. Поэтому координаты объявлены здесь, а
# берёт их оттуда сосед: рамка и её бронь обязаны быть одним числом.
FIELD_FRAMES = (
    (X_SVC - 4, 92, 166, 262, "PLATFORM I/O", "U12 U18 C120-C138 R240-R262", 6),
    # Заголовок отодвинут вправо, за корпус: слева от него гребёнка выводов
    # AST2600, и подпись ложилась прямо на неё. Рамка опущена на десяток
    # единиц: её кромка шла вплотную под плашкой RISER_1, и слово «BMC»
    # читалось продолжением той плашки, а не заголовком своей зоны. Ниже её
    # опускать нельзя — там лампа HB, и заголовок садится прямо на неё.
    (1016, 282, 116, 74, "BMC", "U79 C300-C312", 80),
    (428, 108, 62, 74, "PCH", "U31 C314-C318", 6),
)


def title_box(frame):
    """Габарит заголовка рамки: где стоит его плашка."""
    x, y, _w, _h, title, _refs, dx = frame
    return (x + dx - 2, y - 6, len(title) * 6 * 0.62 + 11, 12)


def render(cv):
    frames = [
        # BMC и чипсет стояли в левой кромке рядом и делили одну рамку. Теперь
        # контроллер управления сидит в кармане между райзерами, и на две
        # половины платы рамка не растягивается: у каждого своя, иначе обведён
        # чипсет, а подписано это BMC.
        *(block_frame(x, y, w, h, title, refs, dx)
          for x, y, w, h, title, refs, dx in FIELD_FRAMES),
        # The socket title is pulled towards the middle: the part-number link
        # sits at the left edge of the frame, and in its old place the plate
        # landed right on top of it.
        block_frame(X_SOCK - 8, Y_CPU0 - 8, SOCKET_W + 16, SOCKET_H + 16,
                    f"CPU0 · {CPU['socket']}", "U1 · VR L10-L21", title_dx=110),
        block_frame(X_SOCK - 8, Y_CPU1 - 8, SOCKET_W + 16, SOCKET_H + 16,
                    f"CPU1 · {CPU['socket']}", "U2 · VR L30-L41", title_dx=110),
        # The choke row is narrow: a three-character title is all that fits.
        block_frame(X_CORE - 30, Y_CPU0 - 6, 30, SOCKET_H + 12, "VR0", "L10-L21"),
        block_frame(X_CORE - 30, Y_CPU1 - 6, 30, SOCKET_H + 12, "VR1", "L30-L41"),
    ]
    # Banks: the frame hugs the sockets themselves, but not the DIMM labels to
    # the right of them — otherwise the dashes run exactly across the lines.
    # A bank's title is its channels, and they come from the spec sheet: twelve
    # per processor, the middle bank is shared by two. While the channels were
    # written here by hand, they claimed eight — as many as the console made up.
    for y0, b in zip((Y_BANK_L, Y_BANK_C, Y_BANK_R), DIMM['banks']):
        owner = 'CPU0 / CPU1' if b['cpu'] == 'split' else f"CPU{b['cpu']}"
        # В перечне позиций — обозначения разъёмов, а не каналы: каналы уже
        # названы в заголовке рамки, и второй раз они ничего не добавляют. Сами
        # слоты подписаны буквами своих каналов, поэтому «DIMM1-8» рядом с ними
        # читалось как другая, противоречащая нумерация.
        title, refs = f"{owner} · {b['ch']}", f"J{b['first']}-J{b['first'] + b['n'] - 1}"
        # Заголовок сдвинут от левой кромки. Слева над банком проходит нижняя
        # грань рамки процессора со своим перечнем позиций, и два заголовка
        # вставали в две строки впритык: подпись банка читалась подписью
        # процессора, съехавшей вниз. Сто семьдесят единиц выводят её за
        # правый край того перечня и оставляют над своими же гнёздами.
        frames.append(block_frame(X_CORE - 10, y0 - 6, DIMM_SOCK_W + 16, BANK_H + 12,
                                  title, refs, title_dx=170))
    cv.add('<g class="decor">' + ''.join(frames) + '</g>')
