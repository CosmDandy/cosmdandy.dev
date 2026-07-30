"""шасси.

шасси
"""

from board.geom import H, W
from board.geom import X_FRONT


def rack_ears():
    """Уши стойки на фронте: сверху и снизу, торчат за габарит шасси.

    Вид сверху — открытая сторона П-профиля, овальное отверстие под винт и
    откидная защёлка на шарнире с точкой нажима. Ими 1U и держится в стойке.
    """
    EAR_W, EAR_H = 46, 74

    def one(y0, flip):
        x_out = X_FRONT - EAR_W
        x_in = X_FRONT + 8
        yc = y0 + EAR_H / 2
        hinge_x, hinge_y = x_in - 6, y0 + (10 if not flip else EAR_H - 10)
        tip_x, tip_y = x_out + 8, y0 + (EAR_H - 16 if not flip else 16)
        return f'''<g class="decor rack-ear">
  <rect x="{x_out}" y="{y0}" width="{x_in-x_out}" height="{EAR_H}" rx="3"
        fill="#1b2429" stroke="rgba(147,161,161,0.30)"/>
  <rect x="{x_out+6}" y="{y0+7}" width="{x_in-x_out-16}" height="{EAR_H-14}" rx="2"
        fill="#0f1619" stroke="rgba(147,161,161,0.20)"/>
  <ellipse cx="{x_out+15}" cy="{yc}" rx="6" ry="13"
           fill="#0a1417" stroke="rgba(147,161,161,0.36)" stroke-width="1.4"/>
  <circle cx="{hinge_x}" cy="{hinge_y}" r="3.2" fill="#0a1417" stroke="rgba(147,161,161,0.34)"/>
  <path d="M{hinge_x} {hinge_y} L{tip_x+6} {tip_y}" stroke="rgba(147,161,161,0.10)"
        stroke-width="10" stroke-linecap="round"/>
  <path d="M{hinge_x} {hinge_y} L{tip_x+6} {tip_y}" fill="none"
        stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>
  <circle cx="{tip_x}" cy="{tip_y}" r="5.5" fill="#222d33" stroke="rgba(147,161,161,0.40)"/>
  <circle cx="{tip_x}" cy="{tip_y}" r="2.2" fill="rgba(147,161,161,0.28)"/>
</g>'''

    return one(6, False) + one(H - 6 - EAR_H, True)


def render(cv):
    cv.add(f'<rect x="4" y="4" width="{W-8}" height="{H-8}" rx="14" fill="#141c20" stroke="rgba(147,161,161,0.30)"/>')
    cv.add(rack_ears())
