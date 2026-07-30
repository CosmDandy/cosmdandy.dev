"""рамки функциональных блоков.

Приём с живой платы: узел обводят пунктиром по текстолиту и рядом печатают
его обозначение и перечень позиций. По такой рамке видно, где кончается
один блок и начинается другой, — без неё плата читается сплошной россыпью.

Рамка сокета и рамки банков подписаны так же, как маркируют каналы памяти:
каждый банк принадлежит своему процессору, и это написано прямо на нём.
"""

from board.geom import (
    BANK_N,
    DIMM_SOCK_W,
    PITCH,
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

BANK_H = BANK_N * PITCH


def render(cv):
    frames = [
        block_frame(X_SVC - 4, 92, 166, 262, "PLATFORM I/O", "U12 U18 C120-C138 R240-R262"),
        block_frame(428, 34, 62, 148, "BMC", "U79 U31 C300-C318"),
        # Заголовок сокета уводим к середине: у левой кромки рамки стоит
        # партномер-ссылка, и на прежнем месте плашка садилась прямо на него.
        block_frame(X_SOCK - 8, Y_CPU0 - 8, SOCKET_W + 16, SOCKET_H + 16,
                    "CPU0 · LGA 4677", "U1 · VR L10-L21", title_dx=110),
        block_frame(X_SOCK - 8, Y_CPU1 - 8, SOCKET_W + 16, SOCKET_H + 16,
                    "CPU1 · LGA 4677", "U2 · VR L30-L41", title_dx=110),
        # Ряд дросселей узкий: заголовок в три знака — всё, что в него влезает.
        block_frame(X_CORE - 30, Y_CPU0 - 6, 30, SOCKET_H + 12, "VR0", "L10-L21"),
        block_frame(X_CORE - 30, Y_CPU1 - 6, 30, SOCKET_H + 12, "VR1", "L30-L41"),
    ]
    # Банки: рамка обнимает сами разъёмы, но не подписи DIMM справа от них —
    # иначе пунктир проходит ровно по строкам.
    for y0, title, refs in ((Y_BANK_L, "CPU0 · A0–H0", "DIMM1-8"),
                            (Y_BANK_C, "CPU0 · A1–D1  /  CPU1 · A0–D0", "DIMM9-16"),
                            (Y_BANK_R, "CPU1 · A1–H1", "DIMM17-24")):
        frames.append(block_frame(X_CORE - 10, y0 - 6, DIMM_SOCK_W + 16, BANK_H + 12,
                                  title, refs))
    cv.add('<g class="decor">' + ''.join(frames) + '</g>')
