"""фронт: блок управления.

Панель ужата: только питание, лампа неисправности, опознание и язычок
диагностики. USB убран — место нужнее отсекам.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (0, 0, 168, 150)

from board.geom import FRONT_W, X_FRONT, Y_PANEL
from board.ink import hit, mono
from board.lamps import glow
from board.metal import hexgrid


def render(cv):
    cv.add(f'''<g class="decor">
  <rect x="{X_FRONT}" y="6" width="{FRONT_W}" height="{Y_PANEL-14}" rx="4" fill="#151d21" stroke="rgba(147,161,161,0.28)"/>
  <line x1="{X_FRONT+10}" y1="94" x2="{X_FRONT+FRONT_W-10}" y2="94" stroke="rgba(147,161,161,0.14)" stroke-width="1"/>
</g>''')

    # Гнездо VGA: на серверах оно доживает там, где давно нет ни одного другого
    # аналогового порта — им подключают тележку с монитором прямо в стойке.
    # Трапеция D-Sub с двумя винтовыми стойками по бокам.
    VGA_X, VGA_Y, VGA_W, VGA_H = X_FRONT + 14, 100, 54, 20
    cv.add(f'''<g class="decor">
  <path d="M{VGA_X+3} {VGA_Y} H{VGA_X+VGA_W-3} L{VGA_X+VGA_W} {VGA_Y+VGA_H} H{VGA_X} Z"
        fill="#12303f" stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>
  {''.join(f'<circle cx="{VGA_X+9+c*6.4:.1f}" cy="{VGA_Y+6+r*6}" r="1.2" fill="rgba(147,161,161,0.34)"/>'

           for r in range(2) for c in range(6 if r == 0 else 5))}
  {''.join(f'<circle cx="{sx}" cy="{VGA_Y+VGA_H/2}" r="3.4" fill="#1b2429" stroke="rgba(147,161,161,0.30)"/>'

           for sx in (VGA_X - 6, VGA_X + VGA_W + 6))}
  {mono(VGA_X + VGA_W / 2, VGA_Y + VGA_H + 11, "VGA", 7, op=0.4)}
</g>''')

    # Воздухозаборник: между блоком управления и отсеками фронт перфорирован —
    # через эти соты вентиляторы и тянут воздух. Сетка мелкая, иначе панель
    # теряет жёсткость.
    cv.add(f'<g class="decor" opacity="0.5">{hexgrid(X_FRONT + 80, 98, 68, 44, s=4, gap=3)}</g>')

    cv.add(f'''<g class="power-btn" id="power" role="button" tabindex="0" aria-label="Питание">
  {hit(X_FRONT+4, 16, 68, 76)}
  <circle cx="{X_FRONT+38}" cy="50" r="21" fill="#0f1619" stroke="rgba(147,161,161,0.34)"/>
  <circle class="pwr-ring" cx="{X_FRONT+38}" cy="50" r="12" fill="none" stroke="#586e75" stroke-width="2.2"/>
  <line x1="{X_FRONT+38}" y1="38" x2="{X_FRONT+38}" y2="48" stroke="#586e75" stroke-width="2.2" stroke-linecap="round"/>
  <circle class="pwr-led" cx="{X_FRONT+38}" cy="50" r="25" fill="none" stroke="#859900" stroke-width="2.2"/>
  {mono(X_FRONT+38, 86, "POWER", 7, op=0.42)}
</g>''')

    cv.add(f'''<g class="decor">
  <circle cx="{X_FRONT+88}" cy="48" r="10" fill="#0f1619" stroke="rgba(147,161,161,0.26)"/>
  {glow('fault-sys', X_FRONT+88, 48, 6.5, '#b58900')}
  <circle class="fault-sys" cx="{X_FRONT+88}" cy="48" r="6.5" fill="#b58900"/>
  {mono(X_FRONT+88, 86, "FAULT", 7, op=0.42)}
</g>''')

    cv.add(f'''<g class="id-btn" id="id-btn" role="button" tabindex="0" aria-label="Опознание в стойке">
  {hit(X_FRONT+112, 18, 48, 72)}
  <circle cx="{X_FRONT+134}" cy="48" r="12" fill="#0f1619" stroke="rgba(147,161,161,0.32)"/>
  {glow('led-id', X_FRONT+134, 48, 7.5, '#268bd2')}
  <circle class="led-id" cx="{X_FRONT+134}" cy="48" r="7.5" fill="#268bd2"/>
  {mono(X_FRONT+134, 86, "ID", 7, op=0.42)}
</g>''')

    cv.add(f'''<g class="lp-tab" id="lp-tab" role="button" tabindex="0" aria-label="Панель диагностики">
  {hit(X_FRONT+6, 100, FRONT_W-12, 40)}
  <rect x="{X_FRONT+12}" y="104" width="{FRONT_W-24}" height="22" rx="2" fill="#0f1619" stroke="rgba(147,161,161,0.3)"/>
  <line x1="{X_FRONT+24}" y1="110" x2="{X_FRONT+FRONT_W-24}" y2="110" stroke="rgba(147,161,161,0.3)" stroke-width="2"/>
  <line x1="{X_FRONT+24}" y1="115" x2="{X_FRONT+FRONT_W-24}" y2="115" stroke="rgba(147,161,161,0.3)" stroke-width="2"/>
  <line x1="{X_FRONT+24}" y1="120" x2="{X_FRONT+FRONT_W-24}" y2="120" stroke="rgba(147,161,161,0.3)" stroke-width="2"/>
  {mono(X_FRONT+FRONT_W/2, 140, "LIGHT PATH", 7, op=0.34)}
</g>''')
