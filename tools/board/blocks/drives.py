"""фронт: восемь отсеков 2.5″ четырьмя группами по два.

Диски в 1U ходят парами: два каддика в группе, между группами — стойка
корзины. Каддик занимает не всю глубину фронта: за ним видно нутро
корзины — направляющие и ответный разъём. Туда же диск и уезжает, когда
его вынимают, поэтому пустое место под ним не пустота, а посадочное место.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
# Слева выходит за габарит шасси: вынутый диск выезжает наружу, как в жизни.
BOUNDS = (-120, 194, 292, 664)

from board.geom import (
    BAY_DEPTH, BAY_N, BAY_TOP, BAY_W, CAP, FRONT_W, GROUP_GAP, GROUP_H, H, X_FRONT,
)
from board.metal import hexgrid
from board.ink import mono, silk_frame
from board.lamps import act_led, glow
from board.revision import stamp


def bay_filler(x, y, w, h):
    """Заглушка отсека: рамка каддика без диска, без ламп и без шильдика.

    Ручка та же, что у соседей, но глухая — вынимать из неё нечего. Полностью
    забитая корзина выдаёт рендер, на живой машине заглушка всегда найдётся.
    """
    CAP = 46
    ribs = ''.join(
        f'<line x1="{x+6}" y1="{y+CAP+16+r*16}" x2="{x+w-6}" y2="{y+CAP+16+r*16}" '
        f'stroke="rgba(147,161,161,0.14)" stroke-width="1.4"/>'
        for r in range(int((h - CAP - 24) // 16)))
    return f'''<g class="decor bay-filler">
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#1b2429" stroke="rgba(147,161,161,0.24)"/>
    <path d="M{x} {y} H{x+w} V{y+CAP} L{x+w-5} {y+CAP+7} H{x+5} L{x} {y+CAP} Z"
          fill="#0d1317" stroke="rgba(147,161,161,0.24)"/>
    {ribs}
    {mono(x + w/2, y + h/2 + 3, "FILLER", 7, op=0.30)}
</g>'''


def render(cv):
    # Нутро корзины: перфорированная стенка, направляющие и ответные разъёмы.
    # Рисуем до каддиков, поэтому вставленный диск её закрывает, а вынутый —
    # открывает. Перфорация та же, что на кронштейне райзера: через неё
    # вентиляторы и тянут воздух через диски.
    inner_x = X_FRONT + BAY_DEPTH
    inner_w = FRONT_W - BAY_DEPTH
    cv.add(f'''<g class="decor bay-inner">
    <rect x="{inner_x}" y="{BAY_TOP - 4}" width="{inner_w}" height="{H - 8 - BAY_TOP}"
          fill="#0a1013" stroke="rgba(147,161,161,0.20)"/>
    <g opacity="0.5">{hexgrid(inner_x + 4, BAY_TOP + 2, inner_w - 8, H - 16 - BAY_TOP, s=6, gap=5)}</g>
</g>''')

    for i in range(BAY_N):
        g, k = i // 2, i % 2
        x = X_FRONT + k * BAY_W
        slot_y = y = BAY_TOP + g * (GROUP_H + GROUP_GAP)
        h = GROUP_H
        # Каддик занимает отсек целиком: посадочное место ровно под ним, и
        # видно его только когда диск вынут. Рамка короче гнезда читалась как
        # деталь, торчащая из чужого места, а не как вставленный диск.
        w = BAY_W - 3

        # Направляющая и ответный разъём — то, что видно на месте вынутого
        # диска. Без них «вынуто» читается как дырка в корпусе.
        cv.add(f'''<g class="decor bay-slot">
      <rect x="{x}" y="{slot_y}" width="{BAY_W - 3}" height="{GROUP_H}" rx="1" fill="#0c1216"
            stroke="rgba(147,161,161,0.16)"/>
      <line x1="{x + 3}" y1="{slot_y + 5}" x2="{x + BAY_W - 6}" y2="{slot_y + 5}"
            stroke="rgba(147,161,161,0.20)" stroke-width="2"/>
      <line x1="{x + 3}" y1="{slot_y + GROUP_H - 5}" x2="{x + BAY_W - 6}" y2="{slot_y + GROUP_H - 5}"
            stroke="rgba(147,161,161,0.20)" stroke-width="2"/>
      <rect x="{x + BAY_W - 19}" y="{slot_y + GROUP_H / 2 - 20}" width="10" height="40" rx="1"
            fill="#14202a" stroke="rgba(42,161,152,0.30)"/>
    </g>''')

        # Каддик: салазки с рёбрами, шильдик и лампы стопкой у одной кромки —
        # на живом диске они стоят рядом, а не разнесены по углам.
        sled = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#28323a" '
                f'stroke="rgba(147,161,161,0.26)"/>']
        # Шильдик занимает то, что осталось от рамки под ручкой. Считаем от
        # фактической высоты каддика: она задаётся долей от шага корзины, и
        # прежние числа ушли в минус, как только рамку сузили.
        ly = y + CAP + 6
        lh = max(18, h - CAP - 22)
        sled.append(f'<rect x="{x+3}" y="{ly}" width="{w-6}" height="{lh}" rx="1" '
                    f'fill="#e8e3d5" fill-opacity="0.09" stroke="rgba(147,161,161,0.24)"/>')
        tx, ty = x + w / 2, ly + lh / 2
        # в одном слоте — Optane: самый дорогой и узнаваемый накопитель в парке
        kind, size = ("Optane", "P5800X") if i == 2 else ("NVMe U.2", "3.84 TB")
        # Подпись идёт вдоль каддика, а не поперёк: он узкий, и поперёк строка
        # вылезала за рамку на соседей.
        for dx, text, size_pt, op in ((-4, kind, 7.5, 0.55), (7, size, 7.5, 0.4)):
            sled.append(f'<text x="{tx+dx:.1f}" y="{ty:.1f}" '
                        f'transform="rotate(-90 {tx+dx:.1f} {ty:.1f})" text-anchor="middle" '
                        f'fill="rgba(147,161,161,{op})" '
                        f'font-family="ui-monospace, Menlo, monospace" '
                        f'font-size="{size_pt}">{text}</text>')
        sled.append(act_led(i, x + 7, y + h - 8, 3, "#2aa198"))
        sled.append(f'{glow("led", x + 17, y + h - 8, 3, "#859900")}'
                    f'<circle class="led" cx="{x+17}" cy="{y + h - 8}" r="3" fill="#859900"/>')

        # Ручка — отдельная деталь: сначала отщёлкивается она, и только потом
        # диск идёт наружу. Терракотовая планка по кромке — та самая защёлка,
        # которую нажимают большим пальцем.
        # Тело ручки — дуга: на живом каддике она выгнута, а не плоская.
        # Внутри крупные вентиляционные окна, через них и идёт воздух к диску.
        handle = (f'<path d="M{x} {y} H{x+w} V{y+CAP} Q{x+w/2} {y+CAP+9} {x} {y+CAP} Z" '
                  f'fill="#0d1317" stroke="rgba(147,161,161,0.30)" stroke-width="1.2"/>')
        # Окон столько, сколько влезает: каддик 2,5″ узкий, и на трёх окнах
        # формула уходила в минус — браузер ругался на отрицательную ширину.
        free_w = w - 16
        cols = max(1, int(free_w // 9))
        win_w = free_w / cols - 3
        for c in range(cols):
            wx = x + 11 + c * (free_w / cols)
            handle += (f'<rect x="{wx:.1f}" y="{y+8}" width="{win_w:.1f}" height="{CAP-18}" '
                       f'rx="1.5" fill="#05090b" stroke="rgba(147,161,161,0.16)"/>')
        # Терракотовая защёлка узкой полосой по кромке — её и жмут пальцем.
        handle += (f'<rect x="{x+2}" y="{y+3}" width="6" height="{CAP-6}" rx="1.5" fill="#cb4b16" '
                   f'stroke="rgba(238,232,213,0.45)" stroke-width="1"/>')
        # Наклейка с типом и объёмом — она на самой ручке, а не на салазках.
        handle += (f'<rect x="{x+w-11:.1f}" y="{y+6}" width="8" height="{CAP-12}" rx="1" '
                   f'fill="#e8e3d5" fill-opacity="0.16" stroke="rgba(147,161,161,0.22)"/>')

        # Номер отсека — на корзине, а не на каддике: каддик уезжает с диском,
        # нумерация должна остаться на месте.
        cv.add(f'<g class="decor">{silk_frame(inner_x + 6, slot_y + GROUP_H / 2 - 7, str(i), 7, 0.5)}</g>')
        if i == BAY_N - 1:
            cv.add(bay_filler(x, y, w, h))
            continue
        cv.add(f'''<g class="unit pick bay" data-unit="hdd{i}" data-group="hdd" data-href="https://github.com/cosmdandy">
      <g class="pick-body">{''.join(sled)}</g>
      <g class="bay-handle">{handle}</g>
    </g>''')
    # выноска корзины — одна на все отсеки
    cv.callouts.append((X_FRONT + FRONT_W + 30, BAY_TOP + 46, X_FRONT + FRONT_W - 10, BAY_TOP + 24,
                     "GitHub", "start", "https://github.com/cosmdandy", "hdd"))

    cv.add(stamp(X_FRONT + 4, H - 18, "фронт: восемь отсеков"))
