"""фронт: восемь отсеков 2.5″ четырьмя группами по два.

Диски в 1U ходят парами: два каддика в группе, между группами — стойка
корзины. Каддик занимает не всю глубину фронта: за ним видно нутро
корзины — направляющие и ответный разъём. Туда же диск и уезжает, когда
его вынимают, поэтому пустое место под ним не пустота, а посадочное место.

Каддик разобран на три части, и границы между ними — не рисунок, а
механика. Голова с лампами приклёпана к салазкам и никуда не девается.
Ручка — длинный рычаг во всю оставшуюся длину лицевой стороны: за него
берутся, он отгибается влево, и только после этого каддик идёт наружу.
Наклейка с моделью — на самой ручке, потому что на живом каддике лицевая
сторона и есть ручка, а больше наклеить некуда.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
# Слева выходит за габарит шасси: вынутый диск выезжает наружу, как в жизни.
BOUNDS = (-120, 194, 292, 664)

from board.geom import (
    BAY_DEPTH,
    BAY_N,
    BAY_NUM_H,
    BAY_TOP,
    BAY_W,
    CAP,
    FRONT_W,
    GROUP_GAP,
    GROUP_H,
    X_FRONT,
    H,
    seat,
)
from board.ink import silk_frame
from board.lamps import act_led, lamp
from board.metal import hexgrid
from board.revision import stamp
from board.spec import BAYS

LABEL_H = 43     # наклейка на ручке: вдвое короче прежнего шильдика


def vent_slots(x, y, w, h, n=3):
    """Ряд продольных прорезей: через них каддик и дышит."""
    step = w / n
    return ''.join(
        f'<rect x="{x + c * step + 2:.1f}" y="{y}" width="{step - 4:.1f}" height="{h}" '
        f'rx="1.5" fill="#05090b" stroke="rgba(147,161,161,0.16)"/>'
        for c in range(n))


def caddy_head(x, y, w, lamps):
    """Голова каддика: лампы сверху, под ними решётка.

    Она приклёпана к салазкам, а не к ручке, поэтому остаётся на месте, когда
    ручку отгибают: на живом каддике светодиоды сидят на плате самого
    переходника и уезжают только вместе с диском.
    """
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{CAP}" rx="1" fill="#0d1317" '
            f'stroke="rgba(147,161,161,0.24)"/>'
            + lamps
            + vent_slots(x + 4, y + 22, w - 8, CAP - 28))


def bay_filler(x, y, w, h):
    """Заглушка отсека: та же голова и глухая панель вместо ручки.

    Панель не отгибается и ламп над ней нет — вынимать из неё нечего.
    Полностью забитая корзина выдаёт рендер, на живой машине заглушка всегда
    найдётся.
    """
    ribs = ''.join(
        f'<line x1="{x+6}" y1="{y+CAP+16+r*16}" x2="{x+w-6}" y2="{y+CAP+16+r*16}" '
        f'stroke="rgba(147,161,161,0.14)" stroke-width="1.4"/>'
        for r in range(int((h - CAP - 24) // 16)))
    return f'''<g class="decor bay-filler">
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#1b2429" stroke="rgba(147,161,161,0.24)"/>
    {caddy_head(x, y, w, "")}
    {ribs}
    <text x="{x + w/2:.1f}" y="{y + h/2:.1f}" transform="rotate(-90 {x + w/2:.1f} {y + h/2:.1f})"
          text-anchor="middle" fill="rgba(147,161,161,0.30)"
          font-family="ui-monospace, Menlo, monospace" font-size="7">FILLER</text>
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
        slot_y = BAY_TOP + g * (GROUP_H + GROUP_GAP)
        # Верхняя полоса группы отдана нумерации: номер стоит на корзине, у
        # верхней грани своего каддика, и остаётся на месте, когда диск вынут.
        y = slot_y + BAY_NUM_H
        h = GROUP_H - BAY_NUM_H
        # Каддик занимает отсек целиком: посадочное место ровно под ним, и
        # видно его только когда диск вынут. Рамка короче гнезда читалась как
        # деталь, торчащая из чужого места, а не как вставленный диск.
        w = BAY_W - 3

        # Направляющая и ответный разъём — то, что видно на месте вынутого
        # диска. Без них «вынуто» читается как дырка в корпусе.
        cv.add(f'''<g class="decor bay-slot">
      <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#0c1216"
            stroke="rgba(147,161,161,0.16)"/>
      <line x1="{x + 3}" y1="{y + 5}" x2="{x + w - 3}" y2="{y + 5}"
            stroke="rgba(147,161,161,0.20)" stroke-width="2"/>
      <line x1="{x + 3}" y1="{y + h - 5}" x2="{x + w - 3}" y2="{y + h - 5}"
            stroke="rgba(147,161,161,0.20)" stroke-width="2"/>
      <rect x="{x + w - 16}" y="{y + h / 2 - 20}" width="10" height="40" rx="1"
            fill="#14202a" stroke="rgba(42,161,152,0.30)"/>
      {silk_frame(x + w / 2 - 6, slot_y + 1, str(i), 7, 0.55)}
    </g>''')

        spec_bay = BAYS[i]
        if spec_bay.get('filler'):
            cv.add(bay_filler(x, y, w, h))
            continue

        # Каддик: салазки, накопитель в них и голова с лампами. Лампы наверху,
        # у самой грани: на живой корзине их читают сверху вниз одним взглядом,
        # а не выискивают у каждого диска в своём углу.
        lamps = (act_led(i, x + 9, y + 11, 3.4, "#859900")
                 + lamp("led", x + 22, y + 11, 3.4, "#b58900"))
        sled = [(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#28323a" '
                 f'stroke="rgba(147,161,161,0.26)"/>')]
        # Сам накопитель: в каддике он виден как металлическая коробка. Ручка
        # его закрывает, и целиком его видно только отогнув её — так и руками.
        dx, dy, dw, dh = x + 3, y + CAP + 4, w - 6, h - CAP - 10
        sled.append(f'<rect x="{dx}" y="{dy}" width="{dw}" height="{dh}" rx="1.5" '
                    f'fill="#1b242a" stroke="rgba(147,161,161,0.34)" stroke-width="1.1"/>')
        # винты крепления к салазкам — по два с каждой стороны
        sled.extend(f'<circle cx="{cx}" cy="{cy}" r="1.6" fill="#0b1114" '
                    f'stroke="rgba(147,161,161,0.30)"/>'
                    for cx in (dx + 3, dx + dw - 3) for cy in (dy + 12, dy + dh - 12))
        sled.append(caddy_head(x, y, w, lamps))

        # Ручка — отдельная деталь и главная на лицевой стороне: рычаг во всю
        # длину каддика. Сначала отщёлкивается она, и только потом диск идёт
        # наружу. Терракотовая планка вдоль кромки — та самая защёлка, которую
        # нажимают большим пальцем.
        hx, hy = x + 3, y + CAP + 4
        hw, hh = w - 6, h - CAP - 12
        lab_y = hy + hh - LABEL_H - 4
        handle = (f'<rect x="{hx}" y="{hy}" width="{hw}" height="{hh}" rx="3" '
                  f'fill="#0d1317" stroke="rgba(147,161,161,0.30)" stroke-width="1.2"/>'
                  # защёлка: узкая полоса вдоль всей ручки, за неё и тянут
                  f'<rect x="{hx+2}" y="{hy+4}" width="6" height="{hh-8}" rx="2" fill="#cb4b16" '
                  f'stroke="rgba(238,232,213,0.45)" stroke-width="1"/>'
                  # вентиляционные окна: воздух идёт к диску сквозь ручку
                  + vent_slots(hx + 11, hy + 7, hw - 14, lab_y - hy - 13, n=2))

        # Наклейка с моделью — на ручке, в её нижней половине. Строка идёт
        # вдоль каддика: он узкий, и поперёк она вылезала на соседей.
        kind = spec_bay.get('kind', '')
        size = 'P5800X' if kind == 'Optane' else f"{spec_bay.get('tb', 0)} TB"
        handle += (f'<rect x="{hx+10}" y="{lab_y}" width="{hw-14}" height="{LABEL_H}" rx="1" '
                   f'fill="#e8e3d5" fill-opacity="0.09" stroke="rgba(147,161,161,0.24)"/>')
        tx, ty = hx + 10 + (hw - 14) / 2, lab_y + LABEL_H / 2
        for ddx, text, size_pt, op in ((-5, kind, 7, 0.55), (6, size, 7, 0.4)):
            handle += (f'<text x="{tx+ddx:.1f}" y="{ty:.1f}" '
                       f'transform="rotate(-90 {tx+ddx:.1f} {ty:.1f})" text-anchor="middle" '
                       f'fill="rgba(147,161,161,{op})" '
                       f'font-family="ui-monospace, Menlo, monospace" '
                       f'font-size="{size_pt}">{text}</text>')

        cv.add(f'''<g class="unit pick bay" data-unit="hdd{i}" data-group="hdd"
          style="--seat:{seat('bay', i)}" data-href="https://github.com/cosmdandy">
      <g class="pick-body">{''.join(sled)}</g>
      <g class="bay-handle">{handle}</g>
    </g>''')
    # Выноска корзины — одна на все отсеки, и указывает она на диск, а не на
    # решётку рядом с ним: якорь сидит в середине каддика третьей группы.
    # В третьей группе внешний отсек занят заглушкой, поэтому целимся во
    # внутренний: выноска обязана указывать на диск, а не на пустую панель.
    hdd_y = BAY_TOP + 2 * (GROUP_H + GROUP_GAP) + GROUP_H / 2
    cv.callouts.append((X_FRONT + FRONT_W + 30, hdd_y, X_FRONT + BAY_W + (BAY_W - 3) / 2, hdd_y,
                     "GitHub", "start", "https://github.com/cosmdandy", "hdd",
                     "код и проекты", "github"))

    cv.add(stamp(X_FRONT + 4, H - 18, "фронт: восемь отсеков"))
