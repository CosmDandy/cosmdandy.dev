"""The impeller. One shape for every fan on the schematic.

It lives down here beside `lamps` and `metal` rather than inside the fan wall
for the same reason indication does: two blocks draw a rotor — the wall and
the power supply — and blocks in this project do not import each other. The
moment the wall kept the shape to itself, the supply would go on spinning the
old two-diamond propeller, and one machine would have two kinds of fan in it.

What makes it read as a fan rather than a propeller is the backsweep: both
edges of a blade bow away from the direction of travel, and the tips very
nearly close the circle without touching.
"""

from math import cos, radians, sin

from board.palette import ROTOR_BLADE, ROTOR_EDGE

# Blades on a rotor. Seven, and odd on purpose: with an even count every blade
# passes its strut at the same instant as the one opposite it, and the fan
# sings. Nobody builds them even, so neither do we.
BLADE_N = 7
# How far a blade leans back between hub and rim, and how much of the circle it
# covers at either end. Seven of them at thirty-eight degrees nearly close the
# circle at the rim but not quite: what is left between the tips is the dark
# slot the air goes through, and without it a rotor reads as a solid disc with
# lines scratched on it.
BLADE_TWIST = 26
BLADE_WIDE = 38
BLADE_NARROW = 52
# The hub takes a third of the diameter — the motor is in there. Draw it any
# smaller and the blades read as spokes.
HUB_R = 0.34


def _pt(cx, cy, r, deg):
    a = radians(deg)
    return f'{cx + r * cos(a):.1f} {cy + r * sin(a):.1f}'


def impeller(cx, cy, r):
    """The whole rotor as one path: seven backswept blades from hub to rim.

    One path rather than seven is what keeps a wall of these affordable. The
    rotors animate, and the price of the scene follows the number of animated
    elements, not the number of curves inside them — so the blades can be as
    detailed as they like, as long as they arrive together.

    A blade is drawn between four corners: the leading edge out from the hub,
    an arc along the rim, the trailing edge back in, an arc along the hub.
    Both edges bow backwards, and that bow is the whole difference between a
    blade and a paddle.
    """
    hub, rim, mid = r * HUB_R, r * 0.94, r * (HUB_R + 0.94) / 2
    return ' '.join(
        f'M{_pt(cx, cy, hub, a)} '
        f'Q{_pt(cx, cy, mid, a + BLADE_TWIST * 0.3)} {_pt(cx, cy, rim, a + BLADE_TWIST)} '
        f'A{rim:.1f} {rim:.1f} 0 0 1 {_pt(cx, cy, rim, a + BLADE_TWIST + BLADE_WIDE)} '
        f'Q{_pt(cx, cy, mid, a + BLADE_NARROW + (BLADE_TWIST + BLADE_WIDE - BLADE_NARROW) * 0.35)} '
        f'{_pt(cx, cy, hub, a + BLADE_NARROW)} '
        f'A{hub:.1f} {hub:.1f} 0 0 0 {_pt(cx, cy, hub, a)} Z'
        for a in (b * 360 / BLADE_N for b in range(BLADE_N)))


# How the blur is built up across the radius: nothing at the hub, densest just
# inside the rim where the blades are widest, falling away at the very edge.
# That is where a smeared impeller actually puts its mass.
BLUR_STOPS = ((0, 0), (34, 0), (52, 0.55), (86, 0.85), (97, 0.5), (100, 0))


def blur_defs():
    """The gradient the smeared disc is filled with. One for the whole board.

    Declared in objectBoundingBox units, so a single gradient serves both the
    rotors in the wall and the smaller one inside a power supply.
    """
    stops = ''.join(f'<stop offset="{off}%" stop-color="{ROTOR_BLADE}" stop-opacity="{op}"/>'
                    for off, op in BLUR_STOPS)
    return f'<defs><radialGradient id="rotor-blur">{stops}</radialGradient></defs>'


def rotor_disc(cx, cy, r):
    """Один диск — та часть работающего вентилятора, которую поворот не меняет.

    Измерено, а не на глаз: шестнадцать вентиляторов на полных оборотах несли
    шестнадцать копий этого круга внутри слоя will-change, который
    компоновщик пересобирал каждый кадр, вечно, — и каждая пересборка уходила
    на фигуру, одинаковую при любом угле: обычный радиальный градиент вокруг
    собственной оси. `fans.py` держит его вне вращающейся группы целиком, но
    появление-исчезание оставляет тем же классом `rotor-blur` — крутится
    только то, чему есть от этого польза.
    """
    outer = r * 0.94
    return f'<circle class="rotor-blur" cx="{cx}" cy="{cy}" r="{outer:.1f}" fill="url(#rotor-blur)"/>'


def rotor_streaks(cx, cy, r):
    """Три дуги и кольцо ступицы, которое лежит внутри них.

    Дуги — единственная часть размытого диска, не симметричная относительно
    оси: весь эффект «стена не читается замершей» держится на них одних, и
    только их вращение того стоит. Кольцо тоже осесимметрично и могло бы
    уйти вместе с диском в `rotor_disc`, но это одна тонкая линия обводки, а
    не залитая фигура — заводить ради неё вторую точку вызова было не за что.
    Контраст у дуг нарочно низкий: ступенчатый поворот виден именно на
    контрасте, а показывать здесь нечему.
    """
    inner = r * HUB_R
    streaks = ''.join(
        f'<path d="M{_pt(cx, cy, r * 0.72, a)} A{r * 0.72:.1f} {r * 0.72:.1f} 0 0 1 '
        f'{_pt(cx, cy, r * 0.72, a + 84)}" fill="none" stroke="{ROTOR_EDGE}" '
        f'stroke-opacity="0.16" stroke-width="{r * 0.30:.1f}"/>'
        for a in (0, 120, 240))
    return streaks + (f'<circle cx="{cx}" cy="{cy}" r="{inner:.1f}" fill="none" '
                       f'stroke="{ROTOR_EDGE}" stroke-opacity="0.10" stroke-width="1"/>')


def blur_disc(cx, cy, r):
    """What a running fan actually looks like: a disc, not blades.

    Past a few thousand rpm a blade crosses any given point faster than the
    eye takes it in, and what is left is a translucent disc with faint streaks
    in it. So this is not a stylisation of the blades — the blades are the
    stylisation, and this is the honest view; it is simply the one we cannot
    show at rest, when the machine is off and the impeller stands still.

    Здесь функция оставлена целиком ради `psu.py` — там один-единственный
    вентилятор, дробить его ради этого не за чем, и он по-прежнему заворачивает
    результат в одну вращающуюся группу, как раньше делала стена. `fans.py`
    вызывает `rotor_disc` и `rotor_streaks` порознь — почему, см. там.
    """
    return rotor_disc(cx, cy, r) + rotor_streaks(cx, cy, r)
