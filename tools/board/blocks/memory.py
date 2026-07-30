"""память: три банка, у каждого свой ярлык.

Планка короче прежней: 292 единицы — это почти половина глубины платы, а
живая DIMM занимает от силы треть ширины шасси. Заодно освободилось поле
справа от банков, куда садится рассыпуха.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (488, 4, 360, 850)

from board.geom import (
    BANK_N,
    DIMM_SOCK_W,
    PITCH,
    SEAT,
    SEAT_WAVE2,
    SLOT_H,
    X_CORE,
    X_TAG,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
)

# Габариты планки по глубине платы. Всё остальное в разъёме считается от них:
# контакты, ключ и чипы должны сойтись при любой ширине.
SOCK_W = DIMM_SOCK_W
DIMM_W = SOCK_W - 6
from board.ink import hit, mono, silk_inverse
from board.lamps import glow
from board.revision import stamp
from board.spec import DIMM


def render(cv):
    # Планки ставят не подряд, а по каналам: сперва первый слот каждого
    # канала у обоих процессоров, потом второй. Средний банк поэтому набивают
    # с двух концов — его половины принадлежат разным процессорам.
    start, step = SEAT['dimm']

    def wave(base):
        return lambda i: f'{base + i * step:.2f}s'

    def bank(y0, n, code, label_y, first=1, delay=None):
        slots = []
        for i in range(n):
            y = y0 + i * PITCH
            # Разъём остаётся на плате, когда планку вынимают, поэтому он —
            # отдельная фигура, а не часть модуля. Внутри золочёные контакты и
            # ключ-перемычка не по центру: он и не даёт вставить планку задом.
            socket = (f'<rect x="{X_CORE-2}" y="{y-1}" width="{SOCK_W}" height="{SLOT_H+2}" rx="1" '
                      f'fill="#05090b" stroke="rgba(147,161,161,0.26)"/>'
                      + ''.join(f'<line x1="{X_CORE+8+c*6}" y1="{y+2}" x2="{X_CORE+8+c*6}" '
                                f'y2="{y+SLOT_H-2}" stroke="rgba(206,168,58,0.62)" '
                                f'stroke-width="1.4"/>'
                                for c in range(46))
                      + f'<rect x="{X_CORE+112}" y="{y+1}" width="4" height="{SLOT_H-2}" '
                        f'fill="#0f1a20"/>')
            # Планка: сверху видна её светлая кромка — торец текстолита, а под
            # ним чипы. На фото живого банка это первое, что бросается в глаза:
            # ряд светлых полос, а не чёрных.
            edge = '#3f7d76' if i % 2 else '#397169'
            # зона наведения шире самой планки и перекрывает щель до соседней:
            # иначе курсор проваливается между слотами и клик уходит в никуда
            slots.append(f'''<g class="pick dimm" data-dimm="{code}{i}" style="--seat:{delay(i)}">
          <rect class="hit" x="{X_CORE-8}" y="{y-1}" width="{SOCK_W+28}" height="{PITCH}" fill="#000" fill-opacity="0.001"/>
          {socket}
          <g class="pick-body">
            <rect x="{X_CORE}" y="{y}" width="{DIMM_W}" height="{SLOT_H}" rx="0" fill="#13323a" stroke="rgba(147,161,161,0.30)"/>
            <rect x="{X_CORE+2}" y="{y+1}" width="{DIMM_W-4}" height="3.4" rx="1" fill="{edge}"/>
            {''.join(f'<rect x="{X_CORE+12+c*44}" y="{y+5.4}" width="32" height="{SLOT_H-7}" rx="0.6" fill="#0d1519"/>' for c in range(6))}
          </g>
          <path class="latch latch-l" d="M{X_CORE-7} {y+1} h6 v{SLOT_H-2} h-6 a2 2 0 0 1 -2 -2 v{-(SLOT_H-6)} a2 2 0 0 1 2 -2 Z"/>
          <path class="latch latch-r" d="M{X_CORE+DIMM_W+1} {y+1} h6 a2 2 0 0 1 2 2 v{SLOT_H-6} a2 2 0 0 1 -2 2 h-6 Z"/>
          {glow('fault', X_CORE + DIMM_W + 12, y + SLOT_H / 2, 2.4, '#dc322f')}
          <circle class="fault" cx="{X_CORE+DIMM_W+12}" cy="{y+SLOT_H/2}" r="2.4" fill="#dc322f"/>
          {silk_inverse(X_CORE + DIMM_W + 18, y - 1, f"DIMM{first + i}", 6.5)}
          {mono(X_CORE + 24, y + SLOT_H - 4, f"{DIMM['size_gb']}GB {DIMM['kind']} {DIMM['speed']}", 5.5, anchor="start", op=0.30)}
        </g>''')
        return f'''<g class="unit" data-unit="dimm-{code}" data-group="dimm" data-href="https://blog.cosmdandy.dev">
      {hit(X_CORE-8, y0-4, SOCK_W + 42, n * PITCH + 6)}
      {''.join(slots)}
    </g>'''

    # Подпись уходит в промежуток между корпусами: полоса у кромки занята ими
    # целиком, и на прежнем месте плашка легла прямо на сетевой контроллер.
    cv.callouts.append((X_TAG - 44, Y_BANK_C + 32, X_CORE - 10, Y_BANK_C + 110,
                        "Blog", "end", "https://blog.cosmdandy.dev", "dimm",
                        "заметки", "blog"))
    half = BANK_N // 2
    cv.add(bank(Y_BANK_L, BANK_N, "L", 104, first=1, delay=wave(start)))
    # Верхняя половина среднего банка — вторые слоты CPU0, нижняя — первые
    # слоты CPU1: одни идут во второй волне, другие в первой.
    cv.add(bank(Y_BANK_C, BANK_N, "C", 430, first=9,
                delay=lambda i: (wave(SEAT_WAVE2)(i) if i < half else wave(start)(i - half))))
    cv.add(bank(Y_BANK_R, BANK_N, "R", 740, first=17, delay=wave(SEAT_WAVE2)))
    # Средний банк делят оба процессора: половина каналов уходит к одному,
    # половина к другому. По двенадцать планок на процессор — обычный расклад
    # для 1U, где на все восемь каналов места на плате уже нет.
    # Обозначение банка печатается на его рамке — см. blocks/frames.py.
    cv.add(stamp(X_CORE, Y_BANK_L - 20, "память"))
