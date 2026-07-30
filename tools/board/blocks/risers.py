"""райзеры: тонкий уголок, широкой частью к задней стенке.

Кронштейн действительно тонкий: пара миллиметров стали. Широкая часть у
задней панели, ножка уходит вперёд, к центру машины.
Углы штампованной скобы: наружные грани режут прямо по контуру заготовки,
а внутренний угол всегда скруглён — на прямом угле сталь трескается.
"""

from board.geom import X_PCB_END, X_REAR
from board.ink import mono, silk_inverse
from board.lamps import fault_at
from board.metal import hexgrid
from board.revision import stamp


def render(cv):
    T, RI = 52, 18   # ширина стойки и радиус внутреннего угла



    for k, (y, up) in enumerate(((186, True), (474, False))):

        x0, x1, hh = X_REAR + 12, X_PCB_END - 6, 192

        if up:

            # полка сверху, стойка справа: вогнутый угол один — (x1-T, y+T)

            d = (f'M{x0} {y} H{x1} V{y+hh} H{x1-T} V{y+T+RI} '

                 f'A{RI} {RI} 0 0 0 {x1-T-RI} {y+T} H{x0} Z')

            slot_y = y + T + 14

            hex_y = y + T + 6

        else:

            d = (f'M{x0} {y+hh} H{x1} V{y} H{x1-T} V{y+hh-T-RI} '

                 f'A{RI} {RI} 0 0 1 {x1-T-RI} {y+hh-T} H{x0} Z')

            slot_y = y + 14

            hex_y = y + 6



        # Одна карта на райзер — так и стоит в 1U. Разъём у верхнего смотрит

        # вниз, у нижнего вверх: райзеры зеркальны, и карты в них тоже.

        cw = x1 - x0 - T - 46

        if not up:

            slot_y = y + hh - T - 74        # прижимаем к полке: она снизу

        edge_y = slot_y + (-8 if up else 58)

        card = (f'<rect x="{x0+18}" y="{slot_y}" width="{cw}" height="50" rx="1" fill="none" '

                f'stroke="rgba(147,161,161,0.14)" stroke-dasharray="5 5"/>'

                f'<rect x="{x0+18}" y="{edge_y}" width="{cw}" height="8" rx="0" fill="#101a22" '

                f'stroke="rgba(147,161,161,0.26)"/>'

                + ''.join(f'<line x1="{x0+26+j*14}" y1="{edge_y+1}" x2="{x0+26+j*14}" y2="{edge_y+7}" '

                          f'stroke="rgba(133,153,0,0.30)"/>' for j in range(int(cw // 14) - 1))

                + silk_inverse(x0 + 18 + cw / 2 - 26, slot_y + 22, "PCIe ×16", 7))

        # Лепесток-ручка на внешнем торце: райзер вынимают вверх, взявшись за него.

        ty = y + (-10 if up else hh - 6)

        py = y + (6 if up else hh - T + 6)

        tab = (

            # торцевой: наполовину за габаритом стойки

            f'<rect x="{x1-T+10}" y="{ty}" width="{T-24}" height="16" rx="2" fill="#cb4b16" '

            f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'

            f'<rect x="{x1-T+16}" y="{ty+4}" width="{T-36}" height="8" rx="1" fill="rgba(238,232,213,0.22)"/>'

            # на полке, ближе к центру машины: за него райзер и качают

            f'<rect x="{x0-8}" y="{py}" width="16" height="{T-12}" rx="2" fill="#cb4b16" '

            f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'

            f'<rect x="{x0-4}" y="{py+5}" width="8" height="{T-22}" rx="1" fill="rgba(238,232,213,0.22)"/>')



        # Ответный слот на плате — под краевыми контактами карты. Он остаётся,

        # когда райзер вынимают: разъём распаян, а кронштейн съёмный.

        cv.add(f'''<g class="decor">
      <rect x="{x0+14}" y="{edge_y-3}" width="{cw+8}" height="14" rx="2" fill="#101a22"
            stroke="rgba(147,161,161,0.34)"/>
      <rect x="{x0+18}" y="{edge_y+1}" width="{cw}" height="6" rx="1" fill="#060d10"/>
      {''.join(f'<line x1="{x0+22+j*9}" y1="{edge_y+1}" x2="{x0+22+j*9}" y2="{edge_y+7}" stroke="rgba(133,153,0,0.22)"/>' for j in range(int(cw // 9) - 1))}
      {mono(x0 + 18 + cw / 2, edge_y + 22, f"RISER_{k+1} · PCIE_G5 ×16", 6, op=0.32)}
    </g>''')

        cv.add(f'''<g class="pick riser" data-riser="{k+1}">
      <g class="pick-body">
        <path d="{d}" fill="#141d22" stroke="rgba(147,161,161,0.30)" stroke-width="1.4"/>
        {hexgrid(x1 - T + 8, hex_y, T - 16, hh - T - 12)}
        {card}
        {tab}
      </g>
      {fault_at(cv, x0-14, y + 96, 5)}
      {stamp(x0 + 18, y + hh - 6 if up else y + 12, "райзеры")}
    </g>''')



    # PCH и BMC — в проёме между райзерами.

    cv.add(f'''<g class="decor">
  <rect x="{X_REAR+16}" y="398" width="62" height="62" rx="3" fill="#16222a" stroke="rgba(147,161,161,0.34)"/>
  {mono(X_REAR+47, 434, "PCH", 9, op=0.45)}
  <rect x="{X_REAR+94}" y="396" width="66" height="66" rx="4" fill="#26333a" stroke="rgba(147,161,161,0.30)"/>
  {''.join(f'<line x1="{X_REAR+100}" y1="{404+i*8}" x2="{X_REAR+154}" y2="{404+i*8}" stroke="rgba(147,161,161,0.18)" stroke-width="2"/>' for i in range(7))}
  {mono(X_REAR+127, 478, "BMC", 9, op=0.45)}
  <circle class="led-hb" cx="{X_REAR+182}" cy="404" r="5" fill="#859900"/>
  {mono(X_REAR+182, 424, "HB", 7, op=0.36)}
</g>''')


