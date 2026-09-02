"""front: the control block.

On the left, along the whole edge, is the face of the diagnostics panel: it
is what the panel is pulled out by, and it also carries the lamps you can see
without pulling anything out. That is how the operator information panel of a
real machine is arranged: indication on the fixed part, the details on the
sliding one.

Further right there remain power and VGA. USB is gone — the bays need the
space more.
"""

# Own rectangle: the build checks that the block did not leave it.
# Во всю высоту машины: фронт — это не только панель с кнопками, но и лист,
# на котором она стоит, а лист уходит вдоль всей корзины.
BOUNDS = (0, 0, 168, 863)

from board.geom import BAY_DEPTH, BAY_TOP, FRONT_W, X_FRONT, H
from board.ink import hit, mono
from board.lamps import act_led, fault_mark, glow, id_mark, square_led
from board.metal import hexgrid
from board.palette import GLOW_TINT

# The face of the diagnostics panel. Its height matches the sliding part: it is
# one piece, you simply see its end face. The width is taken from the cage —
# the panel is exactly two bays wide, as on a real machine, and it stands right
# above them.
# Панель отступает от кромки листа так же, как модуль питания отступает от
# правой: слева у неё был нулевой зазор, и она читалась не прибором на листе, а
# краем самого листа.
TAB_X, TAB_Y, TAB_W, TAB_H = X_FRONT + 8, 20, BAY_DEPTH - 12, 150

# Лист фронта — одна штампованная деталь буквой Г: широкая часть под приборами
# и узкая полоса, уходящая вдоль корзины за каддиками. Раньше это были две
# решётки со своими подложками и обводками — панель отдельно, нутро корзины
# отдельно, — и между ними шла глухая перемычка: фронт читался составным,
# хотя на живой машине его штампуют целиком.
#
# Контур с скруглениями по внешним углам и прямым внутренним: плечо — это рез,
# а не сгиб.
SHEET_D = (f'M{X_FRONT+4} 6 H{X_FRONT+FRONT_W-4} a4 4 0 0 1 4 4 V{H-12} '
           f'a4 4 0 0 1 -4 4 H{X_FRONT+BAY_DEPTH} V{BAY_TOP} H{X_FRONT+4} '
           f'a4 4 0 0 1 -4 -4 V10 a4 4 0 0 1 4 -4 Z')


def render(cv):
    # Перфорация у обеих частей — из одной сетки: шаг колонки 14, ряда 7.36,
    # первая ячейка в (24, 16.64). Полоса начинается с двадцать шестого ряда
    # (y 202.03 + 6): ряд чётный, поэтому смещение сот продолжает ряд широкой
    # части, а не начинает свой. Числа некруглые оттого, что их задаёт сота, а
    # не глаз.
    #
    # Обрезка по контуру листа обязательна: у плеча ряд приходится ровно на
    # кромку, и без обрезки соты свисали бы с неё в корзину.
    cv.add(f'''<g class="decor">
  <path d="{SHEET_D}" fill="#0a1013" stroke="rgba(147,161,161,0.28)"/>
  <clipPath id="front-sheet"><path d="{SHEET_D}"/></clipPath>
  <g opacity="0.5" clip-path="url(#front-sheet)">
    {hexgrid(18, 10.64, 144, 198, s=6, gap=5)}
    {hexgrid(88, 202.03, 70, H - 218, s=6, gap=5)}
  </g>
</g>''')

    # Модуль питания: кнопка и VGA стоят на своей плашке, как панель
    # диагностики — на своей. Два прибора на общем листе, а не дырки в нём.
    # Плашка встаёт вровень с панелью: та же верхняя кромка, та же нижняя.
    # Разная высота читалась не как две детали, а как вторая, приклеенная криво.
    MOD_X, MOD_W = X_FRONT + 90, 58
    cv.add(f'<g class="decor"><rect x="{MOD_X}" y="{TAB_Y}" width="{MOD_W}" height="{TAB_H}" rx="3" '
           f'fill="#151d21" stroke="rgba(147,161,161,0.26)"/></g>')

    # The VGA socket: on servers it lives on where not a single other analogue
    # port is left — a monitor cart is plugged into it right in the rack.
    #
    # It is a DE-15, and the number is the whole point: fifteen contacts in
    # three rows of five, the middle row offset half a pitch. Eleven in two rows
    # is a different connector altogether — that is a serial port, and anyone
    # who has ever plugged a crash cart in reads the difference at a glance.
    #
    # A socket is not a flat trapezoid either: what faces you is the rim of a
    # metal shell, inside it a dark cavity, and only then the plastic insert the
    # contacts sit in. Screw posts on the sides are knurled — they are turned by
    # hand, without a screwdriver.
    #
    # The socket is turned across the panel: on a strip this narrow its long
    # side would not fit along the edge.
    VGA_CX, VGA_CY, VGA_W, VGA_H = X_FRONT + 118, 126, 54, 26
    vx, vy = VGA_CX - VGA_W / 2, VGA_CY - VGA_H / 2
    ink = 'rgba(147,161,161,'

    def trapezoid(inset):
        """Тот же профиль D-Sub, ужатый внутрь на заданный отступ."""
        return (f'M{vx + 3 + inset * 1.4:.1f} {vy + inset:.1f} '
                f'H{vx + VGA_W - 3 - inset * 1.4:.1f} '
                f'L{vx + VGA_W - inset:.1f} {vy + VGA_H - inset:.1f} '
                f'H{vx + inset:.1f} Z')

    pins = ''.join(
        f'<circle cx="{vx + 11 + c * 8 + (4 if r == 1 else 0):.1f}" '
        f'cy="{vy + 8 + r * 5.4:.1f}" r="1.5" fill="#0a1013" stroke="{ink}0.42)" '
        f'stroke-width="0.6"/>'
        for r in range(3) for c in range(5 if r != 1 else 4))
    posts = ''.join(
        f'<circle cx="{sx}" cy="{vy + VGA_H / 2:.1f}" r="4" fill="#1b2429" stroke="{ink}0.34)"/>'
        + ''.join(f'<line x1="{sx - 3}" y1="{vy + VGA_H / 2 - 2 + k * 2:.1f}" '
                  f'x2="{sx + 3}" y2="{vy + VGA_H / 2 - 2 + k * 2:.1f}" '
                  f'stroke="{ink}0.26)" stroke-width="0.7"/>' for k in range(3))
        for sx in (vx - 7, vx + VGA_W + 7))
    cv.add(f'''<g class="decor" transform="rotate(90 {VGA_CX} {VGA_CY})">
  <path d="{trapezoid(0)}" fill="#39444a" stroke="{ink}0.40)" stroke-width="1.2"/>
  <path d="{trapezoid(2.5)}" fill="#0b1114" stroke="{ink}0.20)"/>
  <path d="{trapezoid(5)}" fill="#12303f" stroke="rgba(42,161,152,0.22)"/>
  {pins}
  {posts}
</g>
<g class="decor">{mono(VGA_CX, VGA_CY + 42, "VGA", 7, op=0.4)}</g>''')

    # Кнопка — по середине своей плашки, и слегка мельче прежней: на фронте
    # круг в двадцать одну единицу забирал полплашки и спорил с панелью
    # диагностики за внимание.
    #
    # Кольцо состояния лежит между знаком и обводкой: радиус 14.5 — ровно
    # посередине, по 2.9 зазора в обе стороны. Раньше оно было снаружи кнопки
    # (r 22, толщиной 2.2) и читалось не индикатором, а вторым ободом: широкая
    # дуга поверх плашки спорила с самой кнопкой, и по ней не было понятно,
    # включена машина или нет. Тонкая полоса внутри — то, как это сделано на
    # живой кнопке: светится ободок вокруг знака, а не сама кнопка.
    #
    # Ореол — не обводка, а диск с радиальным градиентом: у обводки свечение
    # пришлось бы рисовать вторым, широким и полупрозрачным кольцом, то есть
    # ровно теми концентрическими кругами, от которых индикация уже ушла.
    # Градиент гаснет к 62% радиуса и к самому краю, поэтому свет не доходит
    # ни до знака, ни до обводки — кольцо остаётся отдельной деталью.
    PWR_X = MOD_X + MOD_W / 2
    tint = GLOW_TINT['#859900']
    cv.add(f'''<g class="power-btn" id="power" role="button" tabindex="0" aria-label="Питание">
  {hit(PWR_X-28, 18, 56, 72)}
  <defs><radialGradient id="pwr-glow">
    <stop offset="62%" stop-color="rgba({tint},0)"/>
    <stop offset="74%" stop-color="rgba({tint},0.14)"/>
    <stop offset="83%" stop-color="rgba({tint},0.36)"/>
    <stop offset="92%" stop-color="rgba({tint},0.12)"/>
    <stop offset="100%" stop-color="rgba({tint},0)"/>
  </radialGradient></defs>
  <circle cx="{PWR_X}" cy="50" r="18" fill="#0f1619" stroke="rgba(147,161,161,0.34)"/>
  <circle class="pwr-halo" cx="{PWR_X}" cy="50" r="17.4" fill="url(#pwr-glow)"/>
  <circle class="pwr-led" cx="{PWR_X}" cy="50" r="14.5" fill="none" stroke="#859900" stroke-width="3.2"/>
  <circle class="pwr-ring" cx="{PWR_X}" cy="50" r="10" fill="none" stroke="#586e75" stroke-width="2"/>
  <line x1="{PWR_X}" y1="40" x2="{PWR_X}" y2="48" stroke="#586e75" stroke-width="2" stroke-linecap="round"/>
  {mono(PWR_X, 84, "POWER", 7, op=0.42)}
</g>''')

    # ── diagnostics panel face ──────────────────────────────────────────
    # Grip zone on the left, lamps on the right: the panel has become two bays
    # wide, and all of it in a single column would look like a forgotten strip.
    gx, cx = TAB_X + 18, TAB_X + TAB_W - 26
    # Knurling with an arrow: you take hold of it with a finger and pull the
    # panel towards you.
    grip = ''.join(f'<line x1="{gx-8+k*4.5}" y1="{TAB_Y+20}" x2="{gx-8+k*4.5}" y2="{TAB_Y+44}" '
                   f'stroke="rgba(147,161,161,0.5)" stroke-width="2"/>' for k in range(5))
    # The arrow shows where the panel goes: outwards, that is, to the left.
    grip += (f'<path d="M{gx+8} {TAB_Y+58} h-10 m0 -5 l-6 5 6 5 z" fill="rgba(38,139,210,0.75)" '
             f'stroke="rgba(38,139,210,0.75)" stroke-width="1.6" stroke-linejoin="round"/>')

    # System fault: a yellow square with an exclamation mark.
    err_y = TAB_Y + 22
    # Identification in the rack: a blue square with a beacon. It is a button
    # too — it gets pressed to find the machine in a row of identical ones.
    id_y = err_y + 28

    cv.add(f'''<g class="lp-tab" id="lp-tab" role="button" tabindex="0" aria-label="Панель диагностики">
  {hit(TAB_X, TAB_Y, TAB_W - 40, TAB_H)}
  <rect x="{TAB_X}" y="{TAB_Y}" width="{TAB_W}" height="{TAB_H}" rx="2" fill="#0f1619" stroke="rgba(147,161,161,0.3)"/>
  {grip}
  <g class="decor">
    {square_led(cx - 8, err_y, 'fault-sys', '#b58900', fault_mark(cx - 8, err_y))}
    {glow('fault-sys', cx, err_y + 8, 8, '#b58900')}
  </g>
</g>''')

    cv.add(f'''<g class="id-btn" id="id-btn" role="button" tabindex="0" aria-label="Опознание в стойке">
  {hit(cx-13, id_y-3, 26, 22)}
  {square_led(cx - 8, id_y, 'led-id', '#268bd2', id_mark(cx - 8, id_y))}
  {glow('led-id', cx, id_y + 8, 8, '#268bd2')}
</g>''')

    # Индикатор сети: по лампе на каждый встроенный интерфейс — два гигабита и
    # порт управления. Карта в райзере сюда не входит: панель показывает то,
    # что распаяно на плате и никуда не девается, а карту можно вынуть.
    #
    # Мигают все три, и мигают активностью, а не линком: этот ряд повторяет то,
    # что видно на розетках сзади, а там мигает трафик. Управление янтарное и
    # мигает даже на выключенной машине — оно живёт на дежурке, и именно этим
    # отличается от остальных портов.
    net_y = id_y + 30
    icon_y = net_y + 7
    net = [(f'<path d="M{cx-13} {icon_y+1} h6 M{cx-10} {icon_y+1} v10 M{cx-10} {icon_y+6} h6 '
            f'M{cx-10} {icon_y+11} h6" '
            f'fill="none" stroke="rgba(147,161,161,0.38)" stroke-width="1.1"/>')]
    for p, (color, aux) in enumerate((("#859900", False), ("#859900", False),
                                      ("#b58900", True))):
        net.append(act_led(p + 21, cx + 2, net_y + 2 + p * 11, 1.9, color, salt=3, aux=aux))
    cv.add(f'<g class="decor">{"".join(net)}'
           f'{mono(TAB_X + TAB_W / 2, TAB_Y + TAB_H - 8, "LIGHT PATH", 6.5, op=0.34)}</g>')
