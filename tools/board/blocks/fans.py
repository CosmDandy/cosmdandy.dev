"""fans: eight twin modules in a common wall.

A module is a pair of impellers under one plastic cover, so from above you
see the shell with a seam down the middle, not bare blades. The wall is
shallow: its depth used to be twice the width of a module, which does not
happen in 1U — and the excess went to the drive cage, which had nowhere to
slide out to.

Drawn after the harnesses, so the wall covers them.
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (184, 6, 244, 840)

from board.geom import (
    FAN_H,
    FAN_LAMP_DY,
    FAN_N,
    FAN_STEP,
    FAN_W,
    X_FAN,
    X_PCB,
    H,
    fan_foot_y,
    fan_seat,
)
from board.canvas import SILK
from board.ink import mono, silk_inverse
from board.lamps import fault_at, jitter
from board.palette import HOT, ROTOR_BLADE, ROTOR_EDGE, ROTOR_PAD
from board.revision import stamp
from board.rotor import HUB_R, rotor_disc, rotor_streaks, impeller
from board.spec import FAN as FAN_SPEC


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


def render(cv):
    # Площадка стены ровно по высоте текстолита: у платы кромка на 18 и на
    # H-18, и стена, стоявшая на двадцати, читалась на два поля уже — при
    # том, что в машине это одна и та же плоскость шасси.
    cv.add(f'<rect class="decor" x="{X_FAN}" y="18" width="{FAN_W}" height="{H-36}" rx="0" '
           f'fill="#0f1619" stroke="rgba(147,161,161,0.28)"/>')
    # Партномер — снизу общей площадки: там под последним модулем есть
    # свободная полоса, а сверху он стоял вплотную к первому.
    cv.add(stamp(X_FAN + 6, H - 24, "вентиляторы"))
    for i in range(FAN_N):
        y = 26 + i * FAN_STEP
        # Модуль занимает всю глубину стенки. Раньше в регистр попадали только
        # колодки у кромки платы, а сам вентилятор — нет.
        cv.busy(X_FAN, y, FAN_W, FAN_STEP - 8, pad=0)
        # The impellers are deliberately wider than their own half and overlap
        # each other: that is how twin fans stand in 1U, and the pair reads as
        # one module rather than two circles side by side. The radius is
        # derived from the depth of the wall — as a plain number it drifted
        # apart on every edit of the geometry.
        rr = FAN_W / 3.6
        rotors = []
        for k in range(2):
            cx, cy = X_FAN + FAN_W / 4 + k * (FAN_W / 2), y + (FAN_STEP - 8) / 2
            # The barrel the rotor sits in, and the gap between blade tip and
            # wall. On a live fan that gap is a millimetre, and it is what tells
            # the eye the thing spins inside something rather than being painted
            # on: without it the blades hang in an empty circle.
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr:.1f}" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>')
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr*0.99:.1f}" fill="none" '
                          f'stroke="{ROTOR_EDGE}" stroke-opacity="0.30"/>')
            # Диск стоит вне вращающейся группы и рисуется один раз навсегда:
            # он осесимметричен, поворот вокруг своего же центра не меняет ни
            # одного пикселя, а раньше он всё равно ездил внутри слоя
            # will-change, который компоновщик пересобирал каждый кадр, пока
            # стена крутится, — и так шестнадцать раз подряд ради круга,
            # которому крутиться незачем. Класс rotor-blur идёт прямо из
            # rotor_disc, так что то же появление-исчезание в fans.css его
            # по-прежнему достаёт — пропала только вращающаяся часть.
            rotors.append(rotor_disc(cx, cy, rr))
            # Лопасти и три дуги едут в одной вращающейся группе: для
            # компоновщика это один слой и одна анимация, а что из двух видно
            # — решает fill-opacity в css. Период у крыльчаток общий, а фаза
            # своя, поэтому стена не пульсирует в такт.
            #
            # Обводки у лопастей нет. Шестнадцать роторов перерисовываются на
            # каждом повороте стены, и обводить семь кривых в каждом — как раз
            # то, за что здесь не стоит платить: щель между лопастями и так
            # рисует эту грань сама.
            rotors.append(
                f'<g class="fan-blades" style="animation-delay:-{jitter(i, 0.1, 2.2, k)}s; '
                f'transform-origin:{cx}px {cy}px">'
                f'<path class="rotor-vane" d="{impeller(cx, cy, rr)}" fill="{ROTOR_BLADE}"/>'
                f'<g class="rotor-blur">{rotor_streaks(cx, cy, rr)}</g>'
                f'</g>')
            # The hub, and the maker's sticker on it. From above the sticker is
            # the brightest thing on the rotor, and on a real fan it is the one
            # place the maker signs.
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr*HUB_R:.1f}" fill="#0a1215" '
                          f'stroke="rgba(147,161,161,0.22)"/>')
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr*HUB_R*0.62:.1f}" fill="{ROTOR_PAD}" '
                          f'fill-opacity="0.55" stroke="{ROTOR_PAD}" stroke-opacity="0.45"/>')

        h = FAN_H
        # The module seat: the guides and the mating header stay in the wall
        # when the fan is pulled out. Without them the wall looked, during the
        # build, like a blind box the blocks fly into who knows where.
        cv.add(f'''<g class="decor fan-seat">
      <rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="0" fill="#070d10"
            stroke="rgba(147,161,161,0.16)" stroke-dasharray="7 5"/>
      <line x1="{X_FAN+14}" y1="{y+6}" x2="{X_FAN+14}" y2="{y+h-6}"
            stroke="rgba(147,161,161,0.12)" stroke-width="2.2"/>
      <line x1="{X_FAN+FAN_W-14}" y1="{y+6}" x2="{X_FAN+FAN_W-14}" y2="{y+h-6}"
            stroke="rgba(147,161,161,0.12)" stroke-width="2.2"/>
      <rect x="{X_FAN+FAN_W-30}" y="{y+8}" width="20" height="18" rx="2" fill="#0a1215"
            stroke="rgba(147,161,161,0.20)"/>
      {mono(X_FAN + FAN_W / 2, y + h / 2 + 3, f"FAN{i+1}", 8, op=0.16)}
    </g>''')
        # The orange tabs on the sides — the fan is pulled out live by them.
        # On a real machine they are the only spot of colour in the cage. They
        # are drawn before the body: a tab is recessed into the frame, and only
        # half of it sticks out.
        tabs = ''.join(
            # Язычок терракотовый по коду замены: вентилятор вынимают на ходу.
            f'<rect x="{tx}" y="{y+h/2-19}" width="16" height="38" rx="2" fill="{HOT}" '
            f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
            f'<rect x="{tx+4}" y="{y+h/2-13}" width="6" height="26" rx="1" fill="rgba(238,232,213,0.22)"/>'
            for tx in (X_FAN - 8, X_FAN + FAN_W - 8))
        # The vibration mounts do not sit in the corners on their own: a stud
        # runs through the module, and rubber bushings are fitted on its ends.
        # The motor is decoupled from the frame by that rubber — otherwise the
        # hum of eight fans goes into the rack.
        mounts = ''.join(
            f'<line x1="{mx}" y1="{y+7}" x2="{mx}" y2="{y+h-7}" stroke="rgba(147,161,161,0.16)" '
            f'stroke-width="2.6"/>' for mx in (X_FAN + 14, X_FAN + FAN_W - 14))
        # The bushings themselves are sand-coloured, and that is the one place
        # the module is deliberately not the colour of its own frame. Four small
        # pads carry the recognition without lighting up the wall the way a pale
        # rotor would.
        mounts += ''.join(
            f'<rect x="{mx-5}" y="{my-4}" width="10" height="8" rx="4" fill="{ROTOR_PAD}" '
            f'fill-opacity="0.55" stroke="rgba(147,161,161,0.30)"/>'
            f'<circle cx="{mx}" cy="{my}" r="2.4" fill="#070d10" stroke="rgba(147,161,161,0.22)"/>'
            for mx in (X_FAN + 14, X_FAN + FAN_W - 14) for my in (y + 7, y + h - 7))
        # Power: a header on the body, and from it a leg with a harness down to
        # the mating part on the board. The leg and the wires are part of the
        # fan: pull it and they go with it, detaching from the board. The lamp
        # stays on the board though: what lights up is not the fan but its seat.
        # The connector is in the top corner of the module, which is where it
        # stands on a real fan. The mating header on the board, however, comes
        # opposite the middle of the module: the seat lamp has to be across
        # from its own fan.
        # The ordinate of the header is computed by geom — the traces route the
        # bus to it by the same value.
        px, py = X_FAN + FAN_W - 26, y + 10
        fy, sx = fan_foot_y(i), X_PCB + 6
        wires = ''.join(
            f'<path d="M{px+16} {py+4+k*3} C{px+40} {py+4+k*3}, {sx-30} {fy+3+k*3}, {sx} {fy+3+k*3}" '
            f'fill="none" stroke="{c}" stroke-width="1.5" stroke-opacity="0.6"/>'
            for k, c in enumerate(('#dc322f', '#eee8d5', '#b58900', '#268bd2')))
        plug = (f'<rect x="{px}" y="{py}" width="18" height="16" rx="2" fill="#0a1215" '
                f'stroke="rgba(147,161,161,0.34)"/>'
                + ''.join(f'<line x1="{px+4+k*4}" y1="{py+3}" x2="{px+4+k*4}" y2="{py+13}" '
                          f'stroke="rgba(147,161,161,0.26)"/>' for k in range(4)))
        # the mating header at the end of the leg — it seats into the board
        foot = (f'<rect x="{sx-4}" y="{fy}" width="14" height="16" rx="2" fill="#101a1e" '
                f'stroke="rgba(147,161,161,0.38)"/>'
                f'<rect x="{sx-1}" y="{fy+3}" width="8" height="10" rx="1" fill="#060d10"/>'
                # Колодка подписана прямо на текстолите — так подписан на живой
                # плате каждый разъём: имя цепи и слово CONN. Без него колодка
                # у кромки читается просто чёрным прямоугольником, а на машине
                # по этой надписи и находят, куда воткнуть вентилятор.
                + held_label(cv, sx + 12, fy + 11, f'FAN{i+1} CONN', 4.5))

        # The shell: from above a real module shows a closed plastic cover with
        # a seam between the two sections, not bare impellers. It is drawn over
        # the rotors as a thin outline — that way the body reads and the
        # rotation stays visible.
        # Шов идёт двумя отрезками, а не сплошной чертой. Роторы шире своей
        # половины и заходят на середину модуля: сплошной шов ложился прямо на
        # лопасти, и вращение читалось перечёркнутым. Отрезки кончаются там,
        # где начинается крыльчатка, — считаем по её же радиусу, чтобы правка
        # геометрии не развела их снова.
        seam_x = X_FAN + FAN_W / 2
        seam_half = (rr ** 2 - (FAN_W / 4) ** 2) ** 0.5 + 3
        seam = ''.join(
            f'<line x1="{seam_x}" y1="{y1:.1f}" x2="{seam_x}" y2="{y2:.1f}" '
            f'stroke="rgba(147,161,161,0.30)" stroke-width="1.6"/>'
            for y1, y2 in ((y + 3, y + h / 2 - seam_half), (y + h / 2 + seam_half, y + h - 3)))
        shell = (f'<rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="3" fill="none" '
                 f'stroke="rgba(147,161,161,0.34)" stroke-width="1.6"/>' + seam)
        # Foam along the edges: it presses the module against the cover so the
        # air does not take a detour. It is fluffy, so it is drawn with
        # hatching rather than a fill.
        # Полосы уплотнителя укорочены с обеих сторон, и разрыв посередине —
        # это место под подписи. Раньше они шли во всю ширину, и номер модуля с
        # оборотами лежали прямо на них: читалось ни то ни другое.
        GAP = 30
        foam_w = (FAN_W - 16) / 2 - GAP
        foam = ''.join(
            f'<rect x="{fx0}" y="{fy0}" width="{foam_w:.1f}" height="5" rx="2" '
            f'fill="rgba(88,96,92,0.42)"/>'
            + ''.join(f'<line x1="{fx0+2+t*7}" y1="{fy0}" x2="{fx0+2+t*7}" y2="{fy0+5}" '
                      f'stroke="rgba(147,161,161,0.16)"/>' for t in range(int((foam_w-4)//7)))
            for fy0 in (y + 2, y + h - 7)
            for fx0 in (X_FAN + 8, X_FAN + FAN_W - 8 - foam_w))

        cv.add(f'''<g class="pick fan" data-fan="{i}" style="--seat:{fan_seat(i)}">
      <g class="pick-body">
        {tabs}
        <rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="3" fill="#0b1215" stroke="rgba(147,161,161,0.18)"/>
        {mounts}
        {''.join(rotors)}
        {shell}
        {foam}
        {plug}
        {mono(X_FAN + FAN_W / 2, y + 8, f"FAN{i+1}", 7, op=0.42)}
        {mono(X_FAN + FAN_W / 2, y + h - 2, f"{FAN_SPEC['rpm_max']} RPM", 7, op=0.30)}
        <g class="cables">{wires}</g>
        {foot}
      </g>
      {held_plate(cv, sx + 30, fy + FAN_LAMP_DY - 6, 'FAN FAULT', 6)}
      {fault_at(cv, sx + 18, fy + FAN_LAMP_DY, 5)}
    </g>''')
