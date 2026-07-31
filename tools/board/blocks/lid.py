"""гравировка на крышке.

Крышка накрывает машину от стенки вентиляторов до задней кромки. Фронт она
не закрывает вовсе: панель управления и корзина дисков выходят из шасси
вперёд, и на живой машине верхний лист до них не доходит.

Подписи — не названия железа, а то, куда ведёт узел: схема сама объясняет,
что где лежит.

Все координаты крышка берёт из geom, теми же именами, что и сами узлы. Пока
она держала свои числа, каждый переезд оставлял её накрывать пустое место —
то шесть отсеков вместо восьми, то райзер там, где его уже нет.
"""

from board.geom import (
    BANK_N,
    BAY_TOP,
    DIMM_SOCK_W,
    FAN_H,
    FAN_N,
    FAN_STEP,
    FAN_W,
    IO_BOARD,
    IO_Y,
    LID_BTN,
    PITCH,
    PSU_H,
    PSU_W,
    PSU_Y,
    RISER,
    SLOT_H,
    SOCKET_H,
    SOCKET_W,
    X_BP,
    X_CORE,
    X_FAN,
    X_IO,
    X_PCB,
    X_PCB_END,
    X_REAR,
    X_SOCK,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
    Y_CPU0,
    Y_CPU1,
    Y_PSU_BOT,
    Y_PSU_TOP,
    H,
    W,
)
from board.metal import hexgrid, rating_label, service_label, service_legend
from board.palette import COLD

# Кромка крышки: всё, что левее, остаётся открытым.
LID_X = X_BP - 2


def render(cv):
    def frame(x, y, w, h, rx=0, op=0.28):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="none" '
                f'stroke="rgba(147,161,161,{op})" stroke-width="1.4"/>')

    def label(x, y, t, size=11, anchor_="middle", op=0.42, turn=False):
        spin = f' transform="rotate(-90 {x} {y})"' if turn else ''
        return (f'<text x="{x}" y="{y}"{spin} text-anchor="{anchor_}" fill="rgba(147,161,161,{op})" '
                f'font-family="ui-monospace, Menlo, monospace" font-size="{size}" letter-spacing="0.1em">{t}</text>')

    # Тело крышки: лист от стенки вентиляторов до задней кромки. Фронт открыт
    # целиком — и кнопка питания, и корзина, из которой диск выезжает наружу.
    cv.add(f'<rect x="{LID_X}" y="4" width="{W - 4 - LID_X}" height="{H-8}" rx="4" '
           f'fill="#161f24" stroke="rgba(147,161,161,0.30)" stroke-width="1.4"/>')

    # Вентиляционные поля: две продольные полосы перфорации той же сеткой,
    # что у корзины и панели управления. Воздух в 1U идёт спереди назад, но
    # над горячими зонами лист всё равно дырявят — и заодно это то, что
    # отличает крышку от глухой пластины.
    for vy in (128, H - 176):
        cv.add(f'<g class="decor" opacity="0.45">'
               f'{hexgrid(X_FAN + 60, vy, W - 130 - X_FAN, 48, s=6, gap=5)}</g>')

    # стенка вентиляторов
    cv.add(frame(X_FAN, 20, FAN_W, H - 40, 0, 0.26))
    for i in range(FAN_N):
        y = 26 + i * FAN_STEP
        cv.add(frame(X_FAN + 4, y, FAN_W - 8, FAN_H, 0, 0.18))
        for k in range(2):
            cv.add(f'<circle cx="{X_FAN + FAN_W / 4 + k * (FAN_W / 2)}" cy="{y + FAN_H / 2:.1f}" '
                   f'r="{FAN_W / 3.6:.1f}" fill="none" '
                   f'stroke="rgba(147,161,161,0.18)" stroke-width="1.3"/>')

    # плата
    cv.add(f'<path d="M{X_PCB} 18 H{X_REAR-4} V{Y_PSU_TOP} H{X_PCB_END} V{Y_PSU_BOT} H{X_REAR-4} V{H-18} H{X_PCB} Z" '
           f'fill="none" stroke="rgba(147,161,161,0.26)" stroke-width="1.4"/>')

    # память и процессоры — с назначением, а не с маркировкой
    for y0 in (Y_BANK_L, Y_BANK_C, Y_BANK_R):
        cv.add(frame(X_CORE - 6, y0 - 4, DIMM_SOCK_W + 12, BANK_N * PITCH + 6, 0, 0.26))
        for i in range(BANK_N):
            yy = y0 + i * PITCH + SLOT_H / 2
            cv.add(f'<line x1="{X_CORE+6}" y1="{yy}" x2="{X_CORE + DIMM_SOCK_W - 6}" y2="{yy}" '
                   f'stroke="rgba(147,161,161,0.14)" stroke-width="1.2"/>')
    cv.add(label(X_CORE + DIMM_SOCK_W / 2, Y_BANK_C + BANK_N * PITCH / 2 + 5, "Blog", 15))

    for y in (Y_CPU0, Y_CPU1):
        cv.add(frame(X_SOCK, y, SOCKET_W, SOCKET_H, 4, 0.30))
        cv.add(frame(X_SOCK + 14, y + 14, SOCKET_W - 28, SOCKET_H - 28, 2, 0.20))
        cv.add(label(X_SOCK + SOCKET_W / 2, y + SOCKET_H / 2 + 5, "CV", 15))

    # Блоки питания. Всё, что на них написано, идёт вдоль модуля, а не
    # поперёк: на живом блоке шильдик наклеен по длинной стороне, и читают
    # его, повернув голову.
    for n, y in enumerate(PSU_Y):
        cv.add(frame(X_REAR, y, PSU_W, PSU_H, 0, 0.26))
        cy = y + PSU_H / 2
        cv.add(f'<g transform="rotate(-90 {X_REAR + 66} {cy})">'
               + rating_label(X_REAR + 66 - 68, cy - 21, n + 1) + '</g>')
        cv.add(label(X_REAR + 214, cy, "POWER", 12, op=0.34, turn=True))

    # райзеры и обвязка задних гнёзд
    for y, hh in RISER:
        cv.add(frame(X_REAR + 12, y, X_PCB_END - 18 - X_REAR, hh, 6, 0.22))
    # Рамка обводит то, что стоит на плате за гнёздами: магнитопроводы, PHY и
    # лапки кожухов. Прежний габарит в 234 единицы повторял выдуманную плату
    # встроенных интерфейсов, и после её сноса крышка обводила бы пустое место.
    cv.add(frame(*IO_BOARD, 3, 0.24))

    # Ссылки стоят там же, где выноски на самой схеме: гнёзда SFP+ — на торце
    # карты в верхнем райзере, остальное — на модуле интерфейсов.
    cv.add(label(X_IO - 30, RISER[0][0] + 44, "LinkedIn", 12, anchor_="end"))
    cv.add(label(X_IO - 30, IO_Y + 26, "Telegram", 12, anchor_="end"))
    cv.add(label(X_IO - 30, IO_Y + 74, "Twitter", 12, anchor_="end"))
    cv.add(label(X_IO - 30, IO_Y + 118, "Email", 12, anchor_="end"))

    # Сервисные наклейки. Каждая лежит в одной из двух узких полос, которые
    # на крышке ничем не заняты: между стенкой вентиляторов и банком памяти,
    # и между банком/сокетами и отсеками БП. Наклейка про диски и легенда —
    # в первой (диски сами живут во фронтальной части, крышка её не
    # накрывает, так что это ближайшее к ним свободное место); память,
    # процессоры и БП — во второй, каждая на высоте своего узла, чтобы читать
    # её можно было не гадая, к чему она относится.
    front_x = X_FAN + FAN_W + 8
    front_w = X_CORE - 14 - front_x
    back_x = X_CORE + DIMM_SOCK_W + 6 + 8
    back_w = X_REAR - 8 - back_x

    # Легенда — про сам цветовой код, без неё шапки остальных наклеек нечем
    # прочесть, поэтому она стоит первой и ничему конкретному не подчинена.
    cv.add(service_legend(front_x, 14, front_w, 100))

    # Диски: горячая замена, поэтому терракотовая шапка. Стрелка — куда
    # каддик едет наружу, то есть к фронту, а фронт у нас слева по глубине.
    cv.add(service_label(front_x, BAY_TOP - 8, front_w, SOCKET_H, "HOT-SWAP HDD",
                         ["① откинуть ручку каддика",
                          "② вынуть каддик наружу"],
                         arrow="left"))

    # Память: своя высота — та же, что у рамки банка L, посчитанная теми же
    # BANK_N и PITCH, что и сама рамка чуть выше.
    cv.add(service_label(back_x, Y_BANK_L - 4, back_w, BANK_N * PITCH + 6, "MEMORY",
                         ["① развести защёлки",
                          "② вынуть планку",
                          "NOTE: сначала по слоту на канал"],
                         head=COLD))

    # Процессоры: обесточив, поэтому голубая шапка. Attention — про то, что
    # ножки сокета живые и гнутся, если рычаг откидывать неаккуратно.
    cv.add(service_label(back_x, Y_CPU0, back_w, SOCKET_H, "PROCESSOR",
                         ["① снять радиатор",
                          "② откинуть рычаг сокета",
                          "③ вынуть процессор",
                          "Attention: контакты сокета гнутся"],
                         head=COLD))

    # Блоки питания: горячая замена, наклейка стоит вровень с нижним отсеком —
    # PSU_Y и PSU_H те же, что и у самой рамки блока.
    cv.add(service_label(back_x, PSU_Y[1], back_w, PSU_H, "POWER SUPPLY",
                         ["① зажать фиксатор",
                          "② потянуть за ручку"]))

    cv.add(label((LID_X + W) / 2, H - 26, "CD93-FS1  ·  SERVICE COVER", 11, op=0.26))
    # кнопка снятия — на крышке, в тех же координатах, что кнопка «надеть» на
    # плате: место не прыгает, меняется только надпись
    bx, by, bs = LID_BTN
    # Рисунок пересчитан от стороны квадрата: кнопка выросла, и отступы обязаны
    # вырасти вместе с ней — иначе стрелка с подписью останутся в прежнем углу
    # увеличенной рамки, а на плате точно такая же кнопка нарисована по тем же
    # долям, и разъезжаться им нельзя.
    k = bs / 86
    cv.add(f'<g id="lid-remove" class="lid-btn-svg" role="button" tabindex="0" aria-label="Снять крышку">'
           f'<rect x="{bx}" y="{by}" width="{bs}" height="{bs}" rx="4" fill="#1b2429" '
           f'stroke="rgba(147,161,161,0.5)" stroke-width="1.6"/>'
           f'<path d="M{bx+26*k:.0f} {by+46*k:.0f} h{34*k:.0f} M{bx+43*k:.0f} {by+58*k:.0f} '
           f'v{-24*k:.0f} m{-8*k:.0f} {8*k:.0f} l{8*k:.0f} {-8*k:.0f} {8*k:.0f} {8*k:.0f}" fill="none" '
           f'stroke="rgba(147,161,161,0.6)" stroke-width="{2*k:.1f}"/>'
           + label(bx + 43 * k, by + 74 * k, "СНЯТЬ", 10 * k, op=0.7)
           + label(bx + 43 * k, by + 86 * k, "КРЫШКУ", 10 * k, op=0.7) + '</g>')
