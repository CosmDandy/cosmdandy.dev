"""fans: six single modules in a common wall.

A module is what the hand takes hold of: one orange handle, and under it one
60 mm fan. The handle is the part, and it is the module that goes in and out of
the wall. Hence six hot-swap units over six impellers.

Twin 40 mm modules stood here while the machine was 1U: a 60 mm impeller does
not fit that height, so the airflow was made up with the number of wheels and
the revs. In 2U the bay is twice as tall, one wheel gives the same flow at
lower revs, and the wall comes out simpler — six things that turn instead of
sixteen.

The wall laps onto the board with its far edge. The cage stands higher than
the laminate and covers its front strip along with the passives on it; the
passives stay where they are, they are simply out of sight — which is why this
block is drawn after them.

Drawn after the harnesses, so the wall covers them.
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (200, 6, 268, 840)

from board.canvas import SILK
from board.geom import (
    FAN_H,
    FAN_LAMP_DY,
    FAN_N,
    FAN_PER_MOD,
    FAN_ROTORS,
    FAN_W,
    H,
    X_FAN,
    X_PCB,
    fan_foot_y,
    fan_seat,
    fan_y,
)
from board.ink import mono, silk_inverse
from board.lamps import fault, jitter
from board.palette import HOT, ROTOR_BLADE, ROTOR_EDGE, ROTOR_PAD
from board.revision import stamp
from board.rotor import HUB_R, impeller, rotor_disc, rotor_streaks
from board.spec import FAN as FAN_SPEC

# Ручка и планка съедают глубину модуля, и обе — не украшение: за одну модуль
# вынимают, за другую придерживают с дальней стороны. Что осталось между ними,
# то и есть поле крыльчаток, и радиус считается от него, а не от габарита
# стены: иначе колёса вылезали бы под ручку.
HANDLE_W = 22     # оранжевая ручка вдоль передней кромки модуля
RAIL_W = 14       # чёрная планка с прорезями вдоль дальней кромки

BODY_X0 = X_FAN + HANDLE_W
BODY_X1 = X_FAN + FAN_W - RAIL_W
BODY_W = BODY_X1 - BODY_X0
# Колесо занимает отсек целиком, и упирается оно в ту сторону, которой меньше:
# в глубину модуля между ручкой и планкой или в его высоту. У шестидесятки
# рамка квадратная, и по обеим сторонам она садится с одинаковым зазором —
# отсюда и min, а не деление глубины на постоянное число.
FAN_CLEAR = 6     # зазор между кромкой рамки и стенкой отсека
ROTOR_R = min(BODY_W / (2 * FAN_ROTORS), FAN_H / 2) - FAN_CLEAR
# Насколько вентиляторы модуля сдвинуты друг к другу от своих четвертей.
#
# Не на глаз и не константой: сдвиг такой, при котором три просвета модуля
# равны — поле сверху, поле между колёсами и поле снизу. Это и есть «колёса
# центрованы между кромками», сказанное числом, и решается оно одним
# уравнением: поле сверху q + p − r равно полю между колёсами 2q − 2p − 2r,
# откуда p = (q − r) / 3, где q — четверть модуля, r — радиус колеса.
#
# В модуле с одним вентилятором сдвигать нечего: колесо стоит по середине
# отсека, и любой сдвиг увёл бы его к кромке.
FAN_PINCH = (FAN_H / 4 - ROTOR_R) / 3 if FAN_PER_MOD > 1 else 0

# Наклейка на ручке. На живой машине она говорит, какого класса вентилятор
# стоит, и по ней же в сервисе понимают, что модуль не перепутан с обычным.
GRADE_TOP = "HIGH PERFORMANCE"
GRADE_BOT = "Gold Grade"


def held_label(cv, x, y, text, size):
    """Строка на текстолите, которая занимает своё место.

    mono() только рисует; чтобы поверх не легло обозначение узла, место надо
    ещё и взять — регистр об отрисованном не знает ничего.
    """
    w = len(text) * size * 0.6
    cv.busy(x, y - size, w, size + 3, pad=1, kind=SILK)
    return mono(x, y, text, size, anchor="start", op=0.34)


def held_plate(cv, x, y, text, size):
    """Подпись на плате, чьё место надо удержать.

    silk_inverse рисует плашку с текстом, но в регистр не пишет ничего, и
    «FAN FAULT» оказывалась под плашкой обозначения узла: та ставится позже и
    про чужую краску знает только из регистра.
    """
    w = len(text) * size * 0.62 + 10
    cv.busy(x, y, w, size + 6, pad=1, kind=SILK)
    return silk_inverse(x, y, text, size)


def reserve_lamp(cv, cx, cy, r):
    """Место под лампу отсека. Возвращает пустую строку: рисует её fault()."""
    cv.busy(cx - r - 4, cy - r - 4, 2 * r + 8, 2 * r + 8)
    return ''


def rotor(cx, cy, i, k):
    """Одно колесо целиком: ствол, зазор, диск, лопасти, ступица.

    Диск стоит вне вращающейся группы и рисуется один раз навсегда: он
    осесимметричен, поворот вокруг своей оси не меняет ни одного пикселя, а
    внутри слоя will-change компоновщик пересобирал бы его каждый кадр —
    шестнадцать раз подряд ради круга, которому крутиться незачем.
    """
    rr = ROTOR_R
    return (
        # Ствол, в котором сидит ротор, и зазор между кромкой лопасти и стенкой.
        # На живом вентиляторе этот зазор — миллиметр, и именно он говорит
        # глазу, что колесо крутится внутри чего-то, а не нарисовано на плоском.
        f'<circle cx="{cx}" cy="{cy}" r="{rr:.1f}" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{rr * 0.99:.1f}" fill="none" '
        f'stroke="{ROTOR_EDGE}" stroke-opacity="0.30"/>'
        + rotor_disc(cx, cy, rr)
        # Лопасти и три дуги едут в одной вращающейся группе: для компоновщика
        # это один слой и одна анимация, а что из двух видно — решает
        # fill-opacity в css. Период у крыльчаток общий, фаза своя, поэтому
        # стена не пульсирует в такт.
        + f'<g class="fan-blades" style="animation-delay:-{jitter(i, 0.1, 2.2, k)}s; '
          f'transform-origin:{cx}px {cy}px">'
          f'<path class="rotor-vane" d="{impeller(cx, cy, rr)}" fill="{ROTOR_BLADE}"/>'
          f'<g class="rotor-blur">{rotor_streaks(cx, cy, rr)}</g>'
          f'</g>'
        # Ступица и наклейка изготовителя на ней. Сверху наклейка — самое
        # светлое, что есть на колесе, и на живом вентиляторе это единственное
        # место, где изготовитель расписывается.
        + f'<circle cx="{cx}" cy="{cy}" r="{rr * HUB_R:.1f}" fill="#0a1215" '
          f'stroke="rgba(147,161,161,0.22)"/>'
        + f'<circle cx="{cx}" cy="{cy}" r="{rr * HUB_R * 0.62:.1f}" fill="{ROTOR_PAD}" '
          f'fill-opacity="0.55" stroke="{ROTOR_PAD}" stroke-opacity="0.45"/>'
    )


def handle(x, y, h, n):
    """Оранжевая ручка модуля: за неё его и вынимают.

    Трапеция, а не прямоугольник: наружная кромка короче внутренней, углы
    срезаны — так её и отливают, чтобы модуль заходил в направляющие не
    цепляясь. Две лапы наружу посередине — то место, куда ложатся пальцы.
    """
    x1 = x + HANDLE_W
    cut = 9
    ear_y = (y + h * 0.42, y + h * 0.58)
    out = [
        (f'<path d="M{x + 3} {y + cut} L{x1} {y} L{x1} {y + h} L{x + 3} {y + h - cut} Z" '
         f'fill="{HOT}" stroke="rgba(238,232,213,0.45)" stroke-width="1.1"/>'),
    ]
    # Лапы: короткие приливы наружу, за них тянут.
    for ey in ear_y:
        out.append(f'<path d="M{x + 3} {ey - 7} L{x - 6} {ey - 4} L{x - 6} {ey + 4} '
                   f'L{x + 3} {ey + 7} Z" fill="{HOT}" '
                   f'stroke="rgba(238,232,213,0.35)" stroke-width="0.9"/>')
    # Окошко с номером модуля: белая наклейка со значком вентилятора.
    wx, wy, ww, wh = x + 5, y + 9, HANDLE_W - 9, 30
    out.append(f'<rect x="{wx}" y="{wy}" width="{ww}" height="{wh}" rx="1.4" '
               f'fill="#e8e6dd" stroke="rgba(0,0,0,0.35)" stroke-width="0.7"/>')
    # Значок вентилятора: кольцо и три лопасти. Одним кольцом он читался нулём
    # перед номером — «01», «02», — то есть ровно тем, чем не является.
    gx, gy = wx + ww / 2, wy + 8
    out.append(f'<circle cx="{gx:.1f}" cy="{gy}" r="3.4" fill="none" '
               f'stroke="#1a1a18" stroke-width="0.8"/>')
    out.append(''.join(
        f'<path d="M{gx:.1f} {gy} q{2.4 * dx:.1f} {2.4 * dy:.1f} {3.1 * dx:.1f} '
        f'{-0.6 * dx + 3.1 * dy:.1f}" fill="none" stroke="#1a1a18" stroke-width="0.9"/>'
        for dx, dy in ((0, -1), (0.87, 0.5), (-0.87, 0.5))))
    out.append(f'<text x="{wx + ww / 2:.1f}" y="{wy + 24}" text-anchor="middle" '
               f'fill="#1a1a18" font-family="ui-monospace, Menlo, monospace" '
               f'font-size="13" font-weight="700">{n}</text>')
    # Жёлтая наклейка класса. Текст вдоль ручки, как он и напечатан.
    sx, sy, sw, sh = x + 5, wy + wh + 6, HANDLE_W - 9, 118
    out.append(f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="1.2" '
               f'fill="#d8bf72" stroke="rgba(0,0,0,0.30)" stroke-width="0.6"/>')
    out.append(f'<path d="M{sx + sw / 2:.1f} {sy + 4} l3.4 6 h-6.8 Z" fill="none" '
               f'stroke="#241f10" stroke-width="0.9"/>')
    # Кегль подобран под длину строки, а не наоборот: моноширинный знак идёт на
    # 0.6 em, шестнадцать знаков при 5.6 — это 54 единицы, и они укладываются
    # между треугольником и тёмной плашкой. При 6.4 строка вылезала за наклейку
    # и обрывалась на «HIGH PERFORM».
    tx, ty = sx + sw / 2, sy + 14
    out.append(f'<g transform="rotate(90 {tx:.1f} {ty})">'
               f'<text x="{tx:.1f}" y="{ty + 2.1:.1f}" text-anchor="start" fill="#241f10" '
               f'font-family="ui-monospace, Menlo, monospace" font-size="5.6" '
               f'letter-spacing="0.3">{GRADE_TOP}</text></g>')
    px, py = sx + 1, sy + sh - 46
    out.append(f'<rect x="{px}" y="{py}" width="{sw - 2}" height="44" rx="1" fill="#241f10"/>')
    out.append(f'<g transform="rotate(90 {px + sw / 2:.1f} {py + 4})">'
               f'<text x="{px + sw / 2:.1f}" y="{py + 6.4:.1f}" text-anchor="start" '
               f'fill="#d8bf72" font-family="ui-monospace, Menlo, monospace" '
               f'font-size="5.0" font-weight="700">{GRADE_BOT}</text></g>')
    return ''.join(out)


def rail(x, y, h):
    """Ручка с дальней стороны модуля: за неё придерживают второй рукой.

    Форма та же трапеция, что и у передней, только уже: обе отлиты одинаково,
    и разница между ними — не в очертании, а в том, что одна ведущая, а вторая
    придерживает. Прямоугольником эта читалась планкой кожуха, то есть частью
    стены, а не частью модуля, который из неё вынимают.

    Прорези вдоль и стрелки потока остаются: их читают не глазами, а пальцем.
    """
    x1 = x + RAIL_W
    cut = 7
    out = [(f'<path d="M{x} {y} L{x1 - 3} {y + cut} L{x1 - 3} {y + h - cut} L{x} {y + h} Z" '
            f'fill="#0a0f11" stroke="rgba(147,161,161,0.26)" stroke-width="0.9"/>')]
    slots = 6
    step = (h - 24) / slots
    for k in range(slots):
        sy = y + 12 + k * step
        out.append(f'<rect x="{x + 3.5}" y="{sy:.1f}" width="{RAIL_W - 8.5}" '
                   f'height="{step * 0.55:.1f}" rx="1.6" fill="#05090a" '
                   f'stroke="rgba(147,161,161,0.16)" stroke-width="0.6"/>')
    for ay in (y + h * 0.28, y + h * 0.72):
        out.append(f'<path d="M{x + RAIL_W / 2 - 3.9:.1f} {ay - 4:.1f} '
                   f'l6.8 4 l-6.8 4 Z" fill="rgba(147,161,161,0.34)"/>')
    return ''.join(out)


def render(cv):
    # Площадка стены ровно по высоте текстолита: у платы кромка на 18 и на
    # H-18, и стена, стоявшая на двадцати, читалась на два поля уже — при
    # том, что в машине это одна и та же плоскость шасси.
    # Кончается она на кромке платы, а не на дальней кромке модулей. Кожух
    # стены стоит НИЖЕ текстолита — плата лежит на нём, а не он на плате, — и
    # закрашивать ею край платы вместе с рассыпухой значит перевернуть машину.
    # На плату заходят только ручки модулей: они выше, они и накрывают.
    cv.add(f'<rect class="decor" x="{X_FAN}" y="18" width="{X_PCB - X_FAN}" '
           f'height="{H - 36}" rx="0" fill="#0f1619" stroke="rgba(147,161,161,0.28)"/>')
    # Партномер — снизу общей площадки: там под последним модулем есть
    # свободная полоса, а сверху он стоял вплотную к первому.
    cv.add(stamp(X_FAN + 6, H - 24, "вентиляторы"))
    # Ручка модуля выходит за подложку — на плату, — и это единственная его
    # часть, которая там оказывается. Отмечаем это место как занятое: краска и
    # мелочь под ручкой не видны, значит и печатать их там нечего.
    cv.busy(X_PCB, 18, FAN_W - (X_PCB - X_FAN), H - 36, pad=0)
    for i in range(FAN_N):
        y = fan_y(i)
        h = FAN_H
        # Модуль занимает всю глубину стенки. Раньше в регистр попадали только
        # колодки у кромки платы, а сам вентилятор — нет.
        cv.busy(X_FAN, y, X_PCB - X_FAN, h, pad=0)

        rotors = []
        for f in range(FAN_PER_MOD):
            cy = y + h * (2 * f + 1) / (2 * FAN_PER_MOD) + (-FAN_PINCH if f else FAN_PINCH)
            for k in range(FAN_ROTORS):
                cx = BODY_X0 + BODY_W * (2 * k + 1) / (2 * FAN_ROTORS)
                rotors.append(rotor(cx, cy, i * FAN_PER_MOD + f, k))

        # Перемычка между двумя вентиляторами модуля: тонкая, штампованная. На
        # фотографии живой машины именно она отличает границу внутри модуля от
        # границы между модулями — та вдвое толще. В модуле с одним
        # вентилятором делить нечего, и полоса поперёк рамки читалась бы швом
        # там, где у живой шестидесятки сплошной корпус.
        my = y + h / 2
        divider = (f'<rect x="{BODY_X0}" y="{my - 2}" width="{BODY_W}" height="4" rx="1" '
                   f'fill="#0a1215" stroke="rgba(147,161,161,0.22)" stroke-width="0.8"/>'
                   if FAN_PER_MOD > 1 else '')

        # The module seat: the guides and the mating header stay in the wall
        # when the fan is pulled out. Without them the wall looked, during the
        # build, like a blind box the blocks fly into who knows where.
        cv.add(f'''<g class="decor fan-seat">
      <rect x="{X_FAN + 4}" y="{y}" width="{X_PCB - X_FAN - 8}" height="{h}" rx="0" fill="#070d10"
            stroke="rgba(147,161,161,0.16)" stroke-dasharray="7 5"/>
      <line x1="{BODY_X0 + 10}" y1="{y + 6}" x2="{BODY_X0 + 10}" y2="{y + h - 6}"
            stroke="rgba(147,161,161,0.12)" stroke-width="2.2"/>
      <line x1="{BODY_X1 - 10}" y1="{y + 6}" x2="{BODY_X1 - 10}" y2="{y + h - 6}"
            stroke="rgba(147,161,161,0.12)" stroke-width="2.2"/>
      {mono((X_FAN + X_PCB) / 2, y + h / 2 + 3, f"FAN{i + 1}", 8, op=0.16)}
    </g>''')

        # The vibration mounts do not sit in the corners on their own: a stud
        # runs through the module, and rubber bushings are fitted on its ends.
        # The motor is decoupled from the frame by that rubber — otherwise the
        # hum of six fans goes into the rack.
        mounts = ''.join(
            f'<line x1="{mx}" y1="{y + 7}" x2="{mx}" y2="{y + h - 7}" '
            f'stroke="rgba(147,161,161,0.16)" stroke-width="2.6"/>'
            for mx in (BODY_X0 + 10, BODY_X1 - 10))
        # The bushings themselves are sand-coloured, and that is the one place
        # the module is deliberately not the colour of its own frame.
        mounts += ''.join(
            f'<rect x="{mx - 5}" y="{my2 - 4}" width="10" height="8" rx="4" fill="{ROTOR_PAD}" '
            f'fill-opacity="0.55" stroke="rgba(147,161,161,0.30)"/>'
            f'<circle cx="{mx}" cy="{my2}" r="2.4" fill="#070d10" stroke="rgba(147,161,161,0.22)"/>'
            for mx in (BODY_X0 + 10, BODY_X1 - 10)
            # Втулок на шпильке столько, сколько у неё опор: по одной на каждую
            # кромку рамки. Средняя держала стык двух рамок в сдвоенном модуле —
            # у одиночной шестидесятки стыка нет, и втулка повисла бы посреди
            # ровного корпуса.
            for my2 in ((y + 7, y + h / 2, y + h - 7) if FAN_PER_MOD > 1
                        else (y + 7, y + h - 7)))

        # Power: a header on the body, and from it a leg with a harness down to
        # the mating part on the board. The leg and the wires are part of the
        # module: pull it and they go with it, detaching from the board. The
        # lamp stays on the board though: what lights up is not the fan but its
        # seat.
        #
        # Колодка на плате стоит за стеной, а не под ней: стена теперь заходит
        # на текстолит, и разъём, оставленный на прежнем месте, оказался бы
        # накрыт кожухом вместе с надписью рядом.
        px, py = BODY_X1 - 24, y + 10
        # Колодка, лампа и плашка стоят от одной точки. Прежде лампу ставил
        # fault_at — он ищет себе место сам и уезжает, когда занято, — и
        # подпись с лампой расходились по высоте. Место лампе держим здесь, и
        # тогда искать ей нечего.
        fy, sx = fan_foot_y(i), X_PCB + 18
        wires = ''.join(
            f'<path d="M{px + 16} {py + 4 + k * 3} C{px + 34} {py + 4 + k * 3}, '
            f'{sx - 26} {fy + 3 + k * 3}, {sx} {fy + 3 + k * 3}" '
            f'fill="none" stroke="{c}" stroke-width="1.5" stroke-opacity="0.6"/>'
            for k, c in enumerate(('#dc322f', '#eee8d5', '#b58900', '#268bd2')))
        plug = (f'<rect x="{px}" y="{py}" width="18" height="16" rx="2" fill="#0a1215" '
                f'stroke="rgba(147,161,161,0.34)"/>'
                + ''.join(f'<line x1="{px + 4 + k * 4}" y1="{py + 3}" x2="{px + 4 + k * 4}" '
                          f'y2="{py + 13}" stroke="rgba(147,161,161,0.26)"/>' for k in range(4)))
        # the mating header at the end of the leg — it seats into the board
        foot = (f'<rect x="{sx - 4}" y="{fy}" width="14" height="16" rx="2" fill="#101a1e" '
                f'stroke="rgba(147,161,161,0.38)"/>'
                f'<rect x="{sx - 1}" y="{fy + 3}" width="8" height="10" rx="1" fill="#060d10"/>'
                # Колодка подписана прямо на текстолите — так подписан на живой
                # плате каждый разъём: имя цепи и слово CONN.
                + held_label(cv, sx + 12, fy + 11, f'FAN{i + 1} CONN', 4.5))

        # The shell: from above a real module shows a closed plastic cover with
        # a seam between the two sections, not bare impellers.
        # Шов идёт двумя отрезками, а не сплошной чертой: колёса шире своей
        # половины и заходят на середину, и сплошной шов ложился бы прямо на
        # лопасти.
        seam_x = (BODY_X0 + BODY_X1) / 2
        seam_half = (ROTOR_R ** 2 - (BODY_W / 4) ** 2) ** 0.5 + 3
        seam = ''.join(
            f'<line x1="{seam_x}" y1="{y1:.1f}" x2="{seam_x}" y2="{y2:.1f}" '
            f'stroke="rgba(147,161,161,0.30)" stroke-width="1.6"/>'
            for cy in (y + h / 4 + FAN_PINCH, y + 3 * h / 4 - FAN_PINCH)
            for y1, y2 in ((max(y + 3, cy - h / 4 + 3), cy - seam_half),
                           (cy + seam_half, min(y + h - 3, cy + h / 4 - 3))))
        shell = (f'<rect x="{BODY_X0}" y="{y}" width="{BODY_W}" height="{h}" rx="3" fill="none" '
                 f'stroke="rgba(147,161,161,0.34)" stroke-width="1.6"/>' + seam)
        # Foam along the edges: it presses the module against the cover so the
        # air does not take a detour. It is fluffy, so it is drawn with
        # hatching rather than a fill.
        GAP = 26
        foam_w = (BODY_W - 12) / 2 - GAP
        foam = ''.join(
            f'<rect x="{fx0}" y="{fy0}" width="{foam_w:.1f}" height="5" rx="2" '
            f'fill="rgba(88,96,92,0.42)"/>'
            + ''.join(f'<line x1="{fx0 + 2 + t * 7}" y1="{fy0}" x2="{fx0 + 2 + t * 7}" '
                      f'y2="{fy0 + 5}" stroke="rgba(147,161,161,0.16)"/>'
                      for t in range(int((foam_w - 4) // 7)))
            for fy0 in (y + 2, y + h - 7)
            for fx0 in (BODY_X0 + 6, BODY_X1 - 6 - foam_w))

        cv.add(f'''<g class="pick fan" data-fan="{i}" style="--seat:{fan_seat(i)}">
      <g class="pick-body">
        <rect x="{BODY_X0}" y="{y}" width="{BODY_W}" height="{h}" rx="3" fill="#0b1215"
              stroke="rgba(147,161,161,0.18)"/>
        {mounts}
        {''.join(rotors)}
        {divider}
        {shell}
        {foam}
        {rail(BODY_X1, y, h)}
        {handle(X_FAN, y, h, i + 1)}
        {plug}
        {mono(seam_x, y + 8, f"FAN{i + 1}", 7, op=0.42)}
        {mono(seam_x, y + h - 2, f"{FAN_SPEC['rpm_max']} RPM", 7, op=0.30)}
        <g class="cables">{wires}</g>
      </g>
      {foot}
      {reserve_lamp(cv, sx + 15, fy + FAN_LAMP_DY, 5)}{held_plate(cv, sx + 26, fy + FAN_LAMP_DY - 8, 'FAN FAULT', 5.6)}
      {fault(sx + 15, fy + FAN_LAMP_DY, 5)}
    </g>''')
