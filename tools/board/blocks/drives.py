"""фронт: шесть отсеков 2.5″ тремя группами по два.

Диски в 1U ходят парами: два каддика в группе, между группами — стойка
корзины. Подписи развёрнуты вдоль салазок, скругления минимальные.
"""

from board.geom import BAY_N, BAY_TOP, BAY_W, CAP, FRONT_W, GROUP_GAP, GROUP_H, H, X_FRONT
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
    for i in range(BAY_N):

        g, k = i // 2, i % 2

        x = X_FRONT + k * BAY_W

        y = BAY_TOP + g * (GROUP_H + GROUP_GAP)

        w, h = BAY_W - 3, GROUP_H

        sled = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#28323a" stroke="rgba(147,161,161,0.26)"/>']

        for c in range(3):

            cy = y + CAP + 22 + c * 20

            sled.append(f'<rect x="{x+4}" y="{cy}" width="{w-8}" height="11" rx="1" fill="#131b20" '

                        f'stroke="rgba(147,161,161,0.12)"/>')

        ly = y + CAP + 106

        lh = h - CAP - 130

        sled.append(f'<rect x="{x+3}" y="{ly}" width="{w-6}" height="{lh}" rx="1" '

                    f'fill="#e8e3d5" fill-opacity="0.09" stroke="rgba(147,161,161,0.24)"/>')

        tx, ty = x + w / 2, ly + lh / 2

        # в одном слоте — Optane: самый дорогой и узнаваемый накопитель в парке

        kind, size = ("Optane", "P5800X") if i == 2 else ("NVMe U.2", "3.84 TB")

        sled.append(mono(tx, ty - 3, kind, 9, op=0.55))

        sled.append(mono(tx, ty + 11, size, 9, op=0.4))

        sled.append(f'<path d="M{x} {y} H{x+w} V{y+CAP} L{x+w-5} {y+CAP+7} H{x+5} L{x} {y+CAP} Z" '

                    f'fill="#0d1317" stroke="rgba(147,161,161,0.24)"/>')

        bx = x + w / 2

        sled.append(f'<rect x="{bx-10}" y="{y+24}" width="20" height="20" rx="1" fill="#1b2429" stroke="rgba(147,161,161,0.34)"/>')

        sled.append(f'<circle cx="{bx}" cy="{y+34}" r="6" fill="none" stroke="#dc322f" stroke-width="2.4"/>')

        sled.append(act_led(i, x + 6, y + 10, 3, "#2aa198"))

        sled.append(f'{glow("led", x + w - 6, y + 10, 3, "#859900")}'

                    f'<circle class="led" cx="{x+w-6}" cy="{y+10}" r="3" fill="#859900"/>')

        # Номер отсека печатают на самой корзине, а не на каддике: каддик

        # уезжает вместе с диском, а нумерация должна остаться на месте.

        cv.add(f'<g class="decor">{silk_frame(x + w - 21, y + h - 17, str(i), 7, 0.5)}</g>')

        if i == BAY_N - 1:

            cv.add(bay_filler(x, y, w, h))

            continue

        cv.add(f'''<g class="unit pick bay" data-unit="hdd{i}" data-group="hdd" data-href="https://github.com/cosmdandy">
      <g class="pick-body">{''.join(sled)}</g>
    </g>''')

    # выноска корзины — одна на все шесть отсеков

    cv.callouts.append((X_FRONT + FRONT_W + 30, BAY_TOP + 46, X_FRONT + FRONT_W - 10, BAY_TOP + 24,

                     "GitHub", "start", "https://github.com/cosmdandy", "hdd"))



    cv.add(stamp(X_FRONT + 4, H - 18, "фронт: шесть отсеков"))


