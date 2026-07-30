"""шасси.

шасси
"""

from board.geom import X_FRONT, H, W
from board.lamps import glow_defs

EAR_D, EAR_OUT = 58, 26   # глубина ушка и его вылет за боковую стенку
RAIL_X = (250, 452, 654, 856)   # где на боковине сидят штыри салазок


def rack_ears():
    """Уши стойки: на фронте, но вылетают вбок, а не вперёд.

    Ухо крепится к боковине шасси и уходит за её габарит — иначе ему не
    достать до стойки, которая стоит по бокам от машины. Прежде они торчали
    вперёд, в ту же сторону, куда выезжают диски: так 1U не держится ни в
    одной стойке.

    Вид сверху: открытая сторона П-профиля, овальное отверстие под винт в
    вылете и откидная защёлка на шарнире с точкой нажима.
    """

    def one(top):
        s = -1 if top else 1                 # куда растёт ухо от кромки
        y_edge = 4 if top else H - 4         # боковая стенка шасси
        y_out = y_edge + s * EAR_OUT         # дальняя грань уха
        y_lo, y_hi = sorted((y_out, y_edge + s * -18))
        # Винт и защёлка делят ухо по глубине: слот под винт ближе к фронту,
        # рычаг — к шасси. Пока они стояли друг на друге, рычаг перечёркивал
        # слот и читался царапиной по пластине.
        hinge_x, hinge_y = X_FRONT + EAR_D - 12, y_edge + s * -8
        tip_x, tip_y = X_FRONT + EAR_D - 24, y_out + s * -6
        return f'''<g class="decor rack-ear">
  <rect x="{X_FRONT - 2}" y="{y_lo}" width="{EAR_D}" height="{y_hi - y_lo}" rx="3"
        fill="#1b2429" stroke="rgba(147,161,161,0.30)"/>
  <rect x="{X_FRONT + 5}" y="{y_lo + 5}" width="{EAR_D - 14}" height="{y_hi - y_lo - 10}" rx="2"
        fill="#0f1619" stroke="rgba(147,161,161,0.20)"/>
  <ellipse cx="{X_FRONT + 15}" cy="{y_out + s * -11}" rx="8" ry="5.5"
           fill="#0a1417" stroke="rgba(147,161,161,0.36)" stroke-width="1.4"/>
  <circle cx="{hinge_x}" cy="{hinge_y}" r="3.2" fill="#0a1417" stroke="rgba(147,161,161,0.34)"/>
  <path d="M{hinge_x} {hinge_y} L{tip_x} {tip_y}" stroke="rgba(147,161,161,0.10)"
        stroke-width="10" stroke-linecap="round"/>
  <path d="M{hinge_x} {hinge_y} L{tip_x} {tip_y}" fill="none"
        stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>
  <circle cx="{tip_x}" cy="{tip_y}" r="5.5" fill="#222d33" stroke="rgba(147,161,161,0.40)"/>
  <circle cx="{tip_x}" cy="{tip_y}" r="2.2" fill="rgba(147,161,161,0.28)"/>
</g>'''

    return one(True) + one(False)


def rails():
    """Штыри салазок на боковинах: ими шасси и висит на выдвижных рельсах.

    На салазках под них прорезаны замочные скважины: шасси кладут, сдвигают
    назад, и штыри садятся в узкую часть выреза. Без них машина в стойке
    держится только ушами на фронте, а это половина крепежа.
    """
    studs = []
    for x in RAIL_X:
        for top in (True, False):
            s = -1 if top else 1
            y_edge = 4 if top else H - 4
            studs.append(
                f'<rect x="{x - 9}" y="{y_edge + (-11 if top else -2)}" width="18" height="13" '
                f'rx="3" fill="#222d33" stroke="rgba(147,161,161,0.34)"/>'
                f'<circle cx="{x}" cy="{y_edge + s * 5}" r="2.6" fill="#0a1417" '
                f'stroke="rgba(147,161,161,0.30)"/>')
    return '<g class="decor rack-rail">' + ''.join(studs) + '</g>'


def render(cv):
    # Градиенты свечения ламп — общие на всю схему, поэтому объявляем их в
    # самом первом блоке: дальше на них ссылаются все, кто ставит лампу.
    cv.add(glow_defs())
    cv.add(f'<rect x="4" y="4" width="{W-8}" height="{H-8}" rx="14" fill="#141c20" stroke="rgba(147,161,161,0.30)"/>')
    cv.add(rails())
    cv.add(rack_ears())
