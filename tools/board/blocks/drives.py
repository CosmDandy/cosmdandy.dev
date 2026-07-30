"""фронт: восемь отсеков 2.5″ четырьмя группами по два.

Диски в 1U ходят парами: два каддика в группе, между группами — стойка
корзины. Каддик занимает не всю глубину фронта: за ним видно нутро
корзины — направляющие и ответный разъём. Туда же диск и уезжает, когда
его вынимают, поэтому пустое место под ним не пустота, а посадочное место.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
# Слева выходит за габарит шасси: вынутый диск выезжает наружу, как в жизни.
BOUNDS = (-120, 148, 350, 710)

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
        y = BAY_TOP + g * (GROUP_H + GROUP_GAP)
        w, h = BAY_W - 3, GROUP_H

        # Направляющая и ответный разъём — то, что видно на месте вынутого
        # диска. Без них «вынуто» читается как дырка в корпусе.
        cv.add(f'''<g class="decor bay-slot">
      <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#0c1216"
            stroke="rgba(147,161,161,0.16)"/>
      <line x1="{x + 3}" y1="{y + 6}" x2="{x + w - 3}" y2="{y + 6}"
            stroke="rgba(147,161,161,0.20)" stroke-width="2"/>
      <line x1="{x + 3}" y1="{y + h - 6}" x2="{x + w - 3}" y2="{y + h - 6}"
            stroke="rgba(147,161,161,0.20)" stroke-width="2"/>
      <rect x="{x + w - 16}" y="{y + h / 2 - 20}" width="10" height="40" rx="1"
            fill="#14202a" stroke="rgba(42,161,152,0.30)"/>
    </g>''')

        # Каддик: салазки с рёбрами, шильдик и лампы стопкой у одной кромки —
        # на живом диске они стоят рядом, а не разнесены по углам.
        sled = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#28323a" '
                f'stroke="rgba(147,161,161,0.26)"/>']
        for c in range(3):
            cy = y + CAP + 14 + c * 16
            sled.append(f'<rect x="{x+4}" y="{cy}" width="{w-8}" height="9" rx="1" fill="#131b20" '
                        f'stroke="rgba(147,161,161,0.12)"/>')
        ly = y + CAP + 70
        lh = h - CAP - 88
        sled.append(f'<rect x="{x+3}" y="{ly}" width="{w-6}" height="{lh}" rx="1" '
                    f'fill="#e8e3d5" fill-opacity="0.09" stroke="rgba(147,161,161,0.24)"/>')
        tx, ty = x + w / 2, ly + lh / 2
        # в одном слоте — Optane: самый дорогой и узнаваемый накопитель в парке
        kind, size = ("Optane", "P5800X") if i == 2 else ("NVMe U.2", "3.84 TB")
        sled.append(mono(tx, ty - 2, kind, 8, op=0.55))
        sled.append(mono(tx, ty + 10, size, 8, op=0.4))
        sled.append(act_led(i, x + 7, y + h - 12, 3, "#2aa198"))
        sled.append(f'{glow("led", x + 17, y + h - 12, 3, "#859900")}'
                    f'<circle class="led" cx="{x+17}" cy="{y + h - 12}" r="3" fill="#859900"/>')

        # Ручка — отдельная деталь: сначала отщёлкивается она, и только потом
        # диск идёт наружу. Терракотовая планка по кромке — та самая защёлка,
        # которую нажимают большим пальцем.
        handle = (f'<path d="M{x} {y} H{x+w} V{y+CAP} L{x+w-5} {y+CAP+7} H{x+5} L{x} {y+CAP} Z" '
                  f'fill="#0d1317" stroke="rgba(147,161,161,0.28)"/>')
        for r in range(4):
            handle += (f'<line x1="{x+7}" y1="{y+10+r*8}" x2="{x+w-7}" y2="{y+10+r*8}" '
                       f'stroke="rgba(147,161,161,0.22)" stroke-width="2.2"/>')
        handle += (f'<rect x="{x+2}" y="{y+2}" width="7" height="{CAP-4}" rx="1.5" fill="#cb4b16" '
                   f'stroke="rgba(238,232,213,0.45)" stroke-width="1"/>')

        # Номер отсека — на корзине, а не на каддике: каддик уезжает с диском,
        # нумерация должна остаться на месте.
        cv.add(f'<g class="decor">{silk_frame(inner_x + 6, y + h / 2 - 7, str(i), 7, 0.5)}</g>')
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
