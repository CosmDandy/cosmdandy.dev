"""память: три банка, у каждого свой ярлык.

память: три банка, у каждого свой ярлык
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (488, 12, 352, 812)

from board.geom import PITCH, SLOT_H, X_CORE, X_TAG, Y_BANK_C, Y_BANK_L, Y_BANK_R
from board.ink import hit, silk_inverse
from board.lamps import glow
from board.revision import stamp


def render(cv):
    LETTERS = "ABCDEFGH"

    def bank(y0, n, code, label_y, first=1):
        slots = []
        for i in range(n):
            y = y0 + i * PITCH
            # чередование чёрный/синий — как на плате
            outer = '#16314a' if i % 2 else '#101a1f'
            inner = '#0c2033' if i % 2 else '#0a1013'
            # зона наведения шире самой планки и перекрывает щель до соседней:
            # иначе курсор проваливается между слотами и клик уходит в никуда
            slots.append(f'''<g class="pick dimm" data-dimm="{code}{i}">
          <rect class="hit" x="{X_CORE-8}" y="{y-1}" width="326" height="{PITCH}" fill="#000" fill-opacity="0.001"/>
          <g class="pick-body">
            <rect x="{X_CORE}" y="{y}" width="292" height="{SLOT_H}" rx="0" fill="{outer}" stroke="rgba(147,161,161,0.30)"/>
            <rect x="{X_CORE+6}" y="{y+3}" width="280" height="{SLOT_H-6}" rx="0" fill="{inner}"/>
            <rect class="latch-fix" x="{X_CORE-5}" y="{y+1}" width="5" height="{SLOT_H-2}" rx="1"/>
            <rect class="latch" x="{X_CORE+292}" y="{y+1}" width="7" height="{SLOT_H-2}" rx="1"/>
          </g>
          {glow('fault', X_CORE + 304, y + SLOT_H / 2, 2.4, '#dc322f')}
          <circle class="fault" cx="{X_CORE+304}" cy="{y+SLOT_H/2}" r="2.4" fill="#dc322f"/>
          {silk_inverse(X_CORE + 310, y - 1, f"DIMM{first + i}", 6.5)}
        </g>''')
        return f'''<g class="unit" data-unit="dimm-{code}" data-group="dimm" data-href="https://blog.cosmdandy.dev">
      {hit(X_CORE-8, y0-4, 340, n * PITCH + 6)}
      {''.join(slots)}
    </g>'''

    cv.callouts.append((X_TAG - 6, Y_BANK_C + 110, X_CORE - 10, Y_BANK_C + 110, "Blog", "end", "https://blog.cosmdandy.dev", "dimm"))
    cv.add(bank(Y_BANK_L, 8, "L", 104, first=1))
    cv.add(bank(Y_BANK_C, 16, "C", 430, first=9))
    cv.add(bank(Y_BANK_R, 8, "R", 740, first=25))
    cv.add(silk_inverse(X_CORE + 96, Y_BANK_L - 18, "CPU0 · A0–H0", 8))
    cv.add(stamp(X_CORE, Y_BANK_L - 20, "память"))
    cv.add(silk_inverse(X_CORE + 42, Y_BANK_C - 18, "CPU0 · A1–H1  /  CPU1 · A0–H0", 8))
    cv.add(silk_inverse(X_CORE + 96, Y_BANK_R - 18, "CPU1 · A1–H1", 8))
