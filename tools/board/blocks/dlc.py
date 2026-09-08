"""контур жидкостного охлаждения: трубки от водоблоков к задней стенке.

Водоблоки рисует `cpu` — они сидят на процессорах и уезжают вместе с ними в
своей группе. Здесь то, что их соединяет: перемычка между блоками и две
магистрали к задней стенке.

Контур последовательный, и порядок в нём читается по трассе: подача входит в
правый штуцер первого блока, перемычка уводит жидкость к левому штуцеру
второго, обратка уходит от него назад. Параллельно оба блока не подключают —
второй получал бы холодную жидкость, а первый грелся бы вдвое.

Перемычка идёт слева, вдоль кромки памяти, а не напрямую между блоками:
между ними стоит средний банк, и труба через него прошла бы сквозь плашки.
На живой машине она обходит банк ровно так же — это и видно на фотографиях
двухпроцессорных сборок с DLC.

Трубки лежат поверх платы: они выше всего, что на ней распаяно, и прижаты к
ней клипсами. Поэтому блок рисуется после процессоров — накрывать он вправе.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (470, 88, 840, 640)

import math

from board.geom import RISER, SOCKET_H, SOCKET_W, X_IO, X_SOCK, Y_CPU0, Y_CPU1
from board.ink import mono
from board.palette import COLD, STEEL, TUBE as TUBE_COLOR, TUBE_LIT

# Наружный диаметр трубки. Толще, чем кажется нужным: по контуру идёт вода под
# давлением, и шланг у неё армированный — тонкая линия читалась бы проводом,
# а провода на этой плате уже есть.
TUBE = 18
TUBE_EDGE = 'rgba(147,161,161,0.26)'

# Коридор, которым магистрали уходят назад. Между процессорами и служебной
# зоной остаётся полоса, и это единственное место, где труба проходит, не
# наступая ни на память, ни на сокеты.
X_TRUNK_HI = 800           # вертикаль подачи
X_TRUNK_LO = 824           # вертикаль обратки, рядом со своей соседкой
# Высоты, на которых магистрали поворачивают к стенке. Обе целятся в проём
# второго слота: кронштейна там нет, его место занял вывод контура. Разведены
# они на диаметр разъёма — сойдись ближе, и две гайки не затянуть порознь.
Y_OUT_HI = RISER[1][0] + 24
Y_OUT_LO = RISER[1][0] + 60
X_OUT = X_IO + 26        # до кромки гнезда: дальше видно само кольцо разъёма

# Перемычка обходит средний банк слева. Вертикаль стоит между рассыпухой,
# которая кончается на 482, и кромкой памяти на 504.
X_BRIDGE = 493


def bent(points, r=34):
    """Путь по ломаной со скруглёнными углами постоянного радиуса.

    Шланг ведут не кривой Безье, а прямыми участками и коротким изгибом на
    повороте: у армированного рукава есть свой радиус, меньше которого он
    пережимается, и больше которого его никто не гнёт — лишняя длина в машине
    не нужна. Отсюда и рисунок: прямая, дуга, прямая, а не растянутая волна.

    Отступ от угла считается вдоль самого колена, а не по осям: колена здесь
    бывают косые — на плите шланг идёт наискось, — и осевая формула на них
    уводила дугу в сторону.
    """
    def unit(ax, ay, bx, by):
        dx, dy = bx - ax, by - ay
        length = (dx * dx + dy * dy) ** 0.5 or 1
        return dx / length, dy / length, length

    d = [f'M{points[0][0]:.0f} {points[0][1]:.0f}']
    for i in range(1, len(points) - 1):
        (x0, y0), (x1, y1), (x2, y2) = points[i - 1], points[i], points[i + 1]
        ux1, uy1, len1 = unit(x1, y1, x0, y0)
        ux2, uy2, len2 = unit(x1, y1, x2, y2)
        rr = min(r, len1 / 2, len2 / 2)
        ax, ay = x1 + ux1 * rr, y1 + uy1 * rr
        bx, by = x1 + ux2 * rr, y1 + uy2 * rr
        cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1)
        d.append(f'L{ax:.0f} {ay:.0f} A{rr:.0f} {rr:.0f} 0 0 {1 if cross > 0 else 0} {bx:.0f} {by:.0f}')
    d.append(f'L{points[-1][0]:.0f} {points[-1][1]:.0f}')
    return ' '.join(d)


def tube(d, w=None):
    """Один шланг: тело, кромка и блик по верхней образующей.

    Три пути на одну трубу, а не один с толстой обводкой: у шланга видно
    именно кромку — тёмное тело, светлая граница, — и нарисовать это одной
    линией нечем.
    """
    w = w or TUBE
    common = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
    return (f'<path d="{d}" {common} stroke="{TUBE_EDGE}" stroke-width="{w + 2}"/>'
            f'<path d="{d}" {common} stroke="{TUBE_COLOR}" stroke-width="{w}"/>'
            f'<path d="{d}" {common} stroke="{TUBE_LIT}" stroke-width="{w * 0.22:.1f}" '
            f'transform="translate(0,-{w * 0.22:.1f})"/>')


def ferrule(cx, cy, deg=0):
    """Обжимная муфта: ею шланг посажен на штуцер.

    Она короткая и чуть шире шланга — на живой машине это единственное место,
    где рукав перестаёт быть гладким, и по ней глаз находит стык.

    Угол берётся от самого шланга, а не от осей: на плите он уходит наискось, и
    муфта, поставленная по оси, читалась квадратом, лежащим рядом с трубой, а
    не надетым на неё.
    """
    w, h = 26, TUBE + 5
    return (f'<rect x="{cx - w / 2:.1f}" y="{cy - h / 2:.1f}" width="{w}" height="{h}" rx="2.5" '
            f'fill="#2f2820" stroke="rgba(147,161,161,0.34)" stroke-width="0.8" '
            f'transform="rotate({deg:.0f} {cx:.1f} {cy:.1f})"/>')


def along(frm, to, dist):
    """Точка на отрезке в `dist` от начала, и угол этого отрезка в градусах."""
    dx, dy = to[0] - frm[0], to[1] - frm[1]
    length = math.hypot(dx, dy) or 1
    return (frm[0] + dx / length * dist, frm[1] + dy / length * dist,
            math.degrees(math.atan2(dy, dx)))


def clip(cx, cy, vertical=False):
    """Клипса: скоба, которой шланг прижат к плате.

    Без них труба висит над платой сама по себе. На живой машине их ставят
    через ладонь — иначе шланг уходит в вентилятор.
    """
    w, h = (TUBE + 9, 7) if not vertical else (7, TUBE + 9)
    return (f'<rect x="{cx - w / 2:.1f}" y="{cy - h / 2:.1f}" width="{w}" height="{h}" rx="2" '
            f'fill="#131c21" stroke="rgba(147,161,161,0.34)" stroke-width="0.8"/>')


def render(cv):
    # Фланцы водоблоков: те же трети длинной оси, из которых их рисует `cpu`.
    hub_in0 = (X_SOCK + SOCKET_W * 2 / 3, Y_CPU0 + SOCKET_H / 2)
    hub_out0 = (X_SOCK + SOCKET_W / 3, Y_CPU0 + SOCKET_H / 2)
    hub_in1 = (X_SOCK + SOCKET_W / 3, Y_CPU1 + SOCKET_H / 2)
    hub_out1 = (X_SOCK + SOCKET_W * 2 / 3, Y_CPU1 + SOCKET_H / 2)
    Y_OVER = Y_CPU0 - 96       # коридор поверх верхнего банка

    # Обе трубки верхней плиты уходят вверх, наискось через саму плиту: так они
    # и лежат на живой машине, и причина не в красоте — фланцы смотрят вдоль
    # плиты, а уходить шлангам некуда, кроме как поверх банка памяти. Вбок от
    # плиты они выйти не могут: там сокет соседа и стойка корзины.

    # Подача: от разъёма в стенке вперёд, вверх, над банком влево и наискось
    # вниз — в правый фланец.
    feed = bent([(X_OUT, Y_OUT_HI), (X_TRUNK_HI, Y_OUT_HI), (X_TRUNK_HI, Y_OVER),
                 (hub_in0[0] + 74, Y_OVER), hub_in0], r=30)

    # Перемычка: из левого фланца наискось вверх, над банком влево, и вниз в
    # проход левее памяти — к нижней плите. Через средний банк ей хода нет.
    bridge = bent([hub_out0, (hub_out0[0] - 74, Y_OVER), (X_BRIDGE, Y_OVER),
                   (X_BRIDGE, hub_in1[1]), hub_in1], r=30)

    # Обратка: из правого фланца нижней плиты назад к стенке.
    ret = bent([hub_out1, (X_TRUNK_LO, hub_out1[1]),
                (X_TRUNK_LO, Y_OUT_LO), (X_OUT, Y_OUT_LO)])

    # Датчик протечки. Тонкая трубка идёт от нижней плиты к своей колодке на
    # плате: по ней жидкость доходит до датчика раньше, чем до чего-нибудь
    # дорогого. В паспорте контура он значится, и не нарисовать его значило бы
    # обещать датчик, которого на схеме нет.
    # Колодка датчика стоит сбоку от плиты, а не под ней: снизу к плите вплотную
    # подходит банк памяти, и всё, что туда поставлено, встаёт на плашки.
    sx, sy = X_SOCK + SOCKET_W + 18, Y_CPU1 + SOCKET_H - 54
    leak = bent([(X_SOCK + SOCKET_W - 24, Y_CPU1 + SOCKET_H - 6),
                 (X_SOCK + SOCKET_W - 24, sy + 18), (sx, sy + 18)], r=12)
    sensor = (f'<rect x="{sx - 4}" y="{sy + 6}" width="30" height="24" rx="2" '
              f'fill="#c9c3ae" fill-opacity="0.22" stroke="rgba(223,232,234,0.26)"/>'
              f'<rect x="{sx + 2}" y="{sy + 12}" width="18" height="12" rx="1.5" '
              f'fill="#1a1611" stroke="rgba(147,161,161,0.34)"/>')

    # Муфты садятся на шланг там, где он сходит со штуцера, и поворачиваются
    # вместе с ним: у верхней плиты выходы косые, у нижней вдоль оси.
    fx_in0 = along(hub_in0, (hub_in0[0] + 74, Y_OVER), 34)
    fx_out0 = along(hub_out0, (hub_out0[0] - 74, Y_OVER), 34)
    ferrules = ''.join((
        ferrule(fx_in0[0], fx_in0[1], fx_in0[2]),
        ferrule(fx_out0[0], fx_out0[1], fx_out0[2]),
        ferrule(hub_in1[0] - 30, hub_in1[1]),
        ferrule(hub_out1[0] + 30, hub_out1[1]),
        ferrule(X_OUT - 34, Y_OUT_HI),
        ferrule(X_OUT - 34, Y_OUT_LO),
    ))

    clips = ''.join((
        clip(X_BRIDGE, (hub_out0[1] + hub_in1[1]) / 2 - 70, vertical=True),
        clip(X_BRIDGE, (hub_out0[1] + hub_in1[1]) / 2 + 70, vertical=True),
        clip(X_TRUNK_HI, hub_in0[1] + 40, vertical=True),
        clip(X_BRIDGE + 90, Y_CPU0 - 96),
        clip(X_TRUNK_LO, hub_out1[1] - 90, vertical=True),
    ))

    # Бронь идёт по самому коридору трубы, а не по габариту её дуги.
    cv.busy(X_BRIDGE - TUBE / 2, hub_out0[1] + 40, TUBE, hub_in1[1] - hub_out0[1] - 80, pad=0)
    cv.busy(X_TRUNK_HI - TUBE / 2, Y_CPU0 - 96, TUBE, Y_OUT_HI - Y_CPU0 + 96, pad=0)
    cv.busy(X_BRIDGE, Y_CPU0 - 96 - TUBE / 2, X_TRUNK_HI - X_BRIDGE, TUBE, pad=0)
    cv.busy(X_TRUNK_LO - TUBE / 2, Y_OUT_LO + 40, TUBE, hub_out1[1] - Y_OUT_LO - 80, pad=0)
    cv.busy(X_TRUNK_HI + 40, Y_OUT_HI - TUBE / 2, X_OUT - X_TRUNK_HI - 40, TUBE, pad=0)
    cv.busy(X_TRUNK_LO + 40, Y_OUT_LO - TUBE / 2, X_OUT - X_TRUNK_LO - 40, TUBE, pad=0)
    cv.busy(sx - 4, sy + 6, 30, 24, pad=0)

    # Пластина вывода кладётся раньше трубок: шланг подходит к штуцеру со
    # стороны платы и виден поверх стенки, а не ныряет под неё.
    cv.add(f'<g class="dlc-panel decor">{outlet()}</g>')
    cv.add('<g class="dlc-loop decor">'
           + sensor
           + tube(leak, w=6)
           + tube(feed) + tube(bridge) + tube(ret)
           + ferrules + clips
           + mono(X_TRUNK_HI + 46, Y_OUT_HI - 16, "SUPPLY", 6, anchor="start", op=0.42)
           + mono(X_TRUNK_LO + 46, Y_OUT_LO + 20, "RETURN", 6, anchor="start", op=0.42)
           + mono(sx + 34, sy + 24, "LEAK", 5, anchor="start", op=0.4)
           + '</g>')


def outlet():
    """Вывод контура в задней стенке: пластина и два быстроразъёма.

    Стоит он в проёме второго слота — на живой машине DLC отбирает слот у
    расширения ровно так же. Оба разъёма одинаковые: у сухоразъёмного
    соединения половинки не различаются ничем, кроме того, куда они врезаны, и
    подписаны они поэтому не цветом, а словом и стрелкой.

    Голубой поясок — тот же код, что у райзера и памяти: контур разъединяют на
    обесточенной машине, а не на ходу.
    """
    y, hh = RISER[1]
    out = [f'<rect x="{X_IO}" y="{y + 6}" width="86" height="{hh - 12}" rx="3" fill="{STEEL}" '
           f'stroke="rgba(147,161,161,0.30)"/>']
    for cy, label, into in ((Y_OUT_HI, "IN", True), (Y_OUT_LO, "OUT", False)):
        cx = X_IO + 40
        out.append(
            # Гнездо: корпус, накидная гайка, поясок и зев.
            f'<circle cx="{cx}" cy="{cy}" r="14" fill="#131c21" '
            f'stroke="rgba(147,161,161,0.38)" stroke-width="1.2"/>'
            f'<circle cx="{cx}" cy="{cy}" r="10.5" fill="none" stroke="{COLD}" '
            f'stroke-opacity="0.55" stroke-width="2"/>'
            f'<circle cx="{cx}" cy="{cy}" r="6" fill="#070d10" '
            f'stroke="rgba(147,161,161,0.30)"/>'
            # Стрелка: внутрь машины у подачи, наружу у обратки.
            + (f'<path d="M{cx - 26} {cy} h12 m-4 -4 l4 4 -4 4" fill="none" '
               f'stroke="rgba(147,161,161,0.55)" stroke-width="1.4" stroke-linecap="round"/>'
               if into else
               f'<path d="M{cx + 14} {cy} h12 m-4 -4 l4 4 -4 4" fill="none" '
               f'stroke="rgba(147,161,161,0.55)" stroke-width="1.4" stroke-linecap="round"/>')
            + mono(cx + (14 if into else -14), cy + 24, label, 5.4,
                   anchor="middle", op=0.44))
    return ''.join(out)
