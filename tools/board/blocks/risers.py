"""райзеры: тонкий уголок, широкой частью к задней стенке.

Кронштейн действительно тонкий: пара миллиметров стали. Широкая часть у
задней панели, ножка уходит вперёд, к центру машины.
Углы штампованной скобы: наружные грани режут прямо по контуру заготовки,
а внутренний угол всегда скруглён — на прямом угле сталь трескается.

Райзеров два, и они разные не только размером. В верхнем стоит сетевая
карта, её торец — гнёзда SFP+. Нижний в этой сборке пуст, и пуст честно:
плата райзера со слотом на месте, карты нет, а окно в задней стенке закрыто
глухой планкой. Раньше в него рисовали такую же карту, как в верхний, — и
схема расходилась с паспортом, где второй слот значится свободным.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
# Первая карта доходит до задней стенки: её торец — это гнёзда SFP+.
BOUNDS = (992, 150, 316, 340)

from board.geom import RISER, X_IO, X_PCB_END, X_REAR, seat
from board.ink import mono, silk_boxed
from board.lamps import act_led, fault_at, lamp
from board.metal import hexgrid
from board.palette import COLD
from board.ports import sfp
from board.revision import stamp
from board.spec import PORTS


def render(cv):
    T, RI = 52, 18   # ширина стойки и радиус внутреннего угла
    x0, x1 = X_REAR + 12, X_PCB_END - 6
    cw = x1 - x0 - T - 46

    # Подпись ведёт к торцу карты, а не к стенке: гнёзда принадлежат ей.
    cv.callouts.append((X_IO - 30, 218, X_IO - 8, 226, "LinkedIn", "end",
                        "https://linkedin.com/in/cosmdandy", "ocp",
                        "профиль", "linkedin"))

    for k, ((y, hh), up) in enumerate(zip(RISER, (True, False))):
        if up:
            # полка сверху, стойка справа: вогнутый угол один — (x1-T, y+T)
            d = (f'M{x0} {y} H{x1} V{y+hh} H{x1-T} V{y+T+RI} '
                 f'A{RI} {RI} 0 0 0 {x1-T-RI} {y+T} H{x0} Z')
            hex_y, hex_h = y + T + 6, hh - T - 12
            edge_y = y + T + 6           # краевой разъём платы райзера
        else:
            d = (f'M{x0} {y+hh} H{x1} V{y} H{x1-T} V{y+hh-T-RI} '
                 f'A{RI} {RI} 0 0 1 {x1-T-RI} {y+hh-T} H{x0} Z')
            hex_y, hex_h = y + 4, hh - T - 8
            edge_y = y + hh - T - 6

        # Райзер — это две вещи: стальной кронштейн, за который тянут, и его
        # собственная плата со слотом. Плату видно вдоль кронштейна: карта
        # втыкается именно в неё, а сталь только держит.
        riser_pcb = (
            f'<rect x="{x0+12}" y="{edge_y-14}" width="{cw+16}" height="30" rx="2" '
            f'fill="#123642" stroke="rgba(42,161,152,0.34)"/>'
            # краевой разъём самой платы райзера — им она и садится в системную
            + ''.join(f'<line x1="{x0+20+j*7}" y1="{edge_y+9}" x2="{x0+20+j*7}" y2="{edge_y+14}" '
                      f'stroke="rgba(184,150,51,0.5)" stroke-width="1.6"/>'
                      for j in range(int(cw // 7)))
            + f'<rect x="{x0+18}" y="{edge_y-10}" width="{cw}" height="9" rx="1" fill="#05090b" '
              f'stroke="rgba(147,161,161,0.30)"/>'
            + ''.join(f'<line x1="{x0+24+j*9}" y1="{edge_y-9}" x2="{x0+24+j*9}" y2="{edge_y-2}" '
                      f'stroke="rgba(133,153,0,0.26)"/>' for j in range(int(cw // 9) - 1)))

        if up:
            # Сама карта: плата, крупный пассивный радиатор поверх чипа и клетки
            # портов на дальнем торце — у задней стенки. Вынимаешь райзер —
            # карта с портами уезжает вместе с ним. Карта тянется до самой
            # стенки: её торец и есть гнёзда, которые видно снаружи.
            card_y = edge_y - 46
            card_w = X_IO - x0 - 18
            card = (riser_pcb
                    + f'<rect x="{x0+18}" y="{card_y}" width="{card_w}" height="56" rx="1" '
                      f'fill="#0f1c24" stroke="rgba(42,161,152,0.34)"/>'
                    + f'<rect x="{x0+34}" y="{card_y+6}" width="{cw*0.46:.0f}" height="32" rx="2" '
                      f'fill="#26333a" stroke="rgba(147,161,161,0.38)"/>'
                    + ''.join(f'<line x1="{x0+38+f*3.4:.1f}" y1="{card_y+9}" '
                              f'x2="{x0+38+f*3.4:.1f}" y2="{card_y+35}" '
                              f'stroke="rgba(147,161,161,0.22)" stroke-width="1.2"/>'
                              for f in range(int(cw * 0.46 // 3.4) - 2))
                    + silk_boxed(x0 + 56, card_y + 50, "PCIE_X8_GF1 REV 1.01", 5))
            # Гнёзда на торце карты. Раньше они были нарисованы прямо на стенке
            # и ни к чему не вели: дырки в корпусе. Теперь видно, что это торец
            # карты, и вместе с райзером они уезжают наружу.
            ports = (f'<rect x="{X_IO}" y="{card_y-4}" width="86" height="64" rx="4" '
                     f'fill="#13282c" stroke="rgba(42,161,152,0.50)"/>'
                     + sfp(X_IO + 14, card_y + 2)
                     + sfp(X_IO + 14, card_y + 32)
                     + lamp('led-link', X_IO + 8, card_y + 8, 3, '#2aa198')
                     + act_led(3, X_IO + 8, card_y + 20, 3, "#859900", salt=2)
                     + lamp('led-link', X_IO + 8, card_y + 38, 3, '#b58900')
                     # Подписи сдвинуты от центра планки влево: у самого борта
                     # теперь стоит стальной лист, и строка, набранная по
                     # середине, уезжала хвостом на его перфорацию.
                     + mono(X_IO + 30, card_y + 74, PORTS['sfp'], 9, op=0.5)
                     + mono(X_IO + 30, card_y + 86, PORTS['sfp_degraded'], 7, op=0.34))
            card += (f'<g class="unit" data-unit="ocp" data-group="ocp" '
                     f'data-href="https://linkedin.com/in/cosmdandy">{ports}</g>')
        else:
            # Слот пуст: карты нет, окно в стенке закрыто глухой планкой. Её и
            # снимают первой, когда в машину что-то доставляют.
            blank_y = y + 6
            card = (riser_pcb
                    + f'<rect x="{X_IO}" y="{blank_y}" width="86" height="{hh-12}" rx="3" '
                      f'fill="#1b2429" stroke="rgba(147,161,161,0.30)"/>'
                    + ''.join(f'<line x1="{X_IO+14}" y1="{blank_y+10+r*11}" x2="{X_IO+72}" '
                              f'y2="{blank_y+10+r*11}" stroke="rgba(147,161,161,0.14)" '
                              f'stroke-width="1.4"/>' for r in range(int((hh - 34) // 11)))
                    + silk_boxed(X_IO + 38, blank_y + hh - 22, "SLOT 2 · FREE", 6))

        # Лепесток-ручка на внешнем торце: райзер вынимают вверх, взявшись за
        # него. Голубой, а не терракотовый: райзер меняют только на
        # обесточенной машине, и цвет ручки — это и есть предупреждение.
        ty = y + (-10 if up else hh - 6)
        py = y + (6 if up else hh - T + 6)
        tab = (
            # торцевой: наполовину за габаритом стойки
            f'<rect x="{x1-T+10}" y="{ty}" width="{T-24}" height="16" rx="2" fill="{COLD}" '
            f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
            f'<rect x="{x1-T+16}" y="{ty+4}" width="{T-36}" height="8" rx="1" fill="rgba(238,232,213,0.22)"/>'
            # на полке, ближе к центру машины: за него райзер и качают
            f'<rect x="{x0-8}" y="{py}" width="16" height="{T-12}" rx="2" fill="{COLD}" '
            f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
            f'<rect x="{x0-4}" y="{py+5}" width="8" height="{T-22}" rx="1" fill="rgba(238,232,213,0.22)"/>')

        # Ответный слот на плате — под краевыми контактами карты. Он остаётся,
        # когда райзер вынимают: разъём распаян, а кронштейн съёмный.
        # Слот длиннее карты и тянется вправо, к задней стенке: у PCIe ×16
        # разъём заметно длиннее краевых контактов карты ×8, и на плате это
        # первое, по чему слот узнают. Правый край держим у стойки
        # кронштейна — дальше начинается сталь.
        slot_w = (x1 - T - 6) - (x0 + 18)
        cv.add(f'''<g class="decor">
      <rect x="{x0+14}" y="{edge_y-3}" width="{slot_w+8}" height="14" rx="2" fill="#101a22"
            stroke="rgba(147,161,161,0.34)"/>
      <rect x="{x0+18}" y="{edge_y+1}" width="{slot_w}" height="6" rx="1" fill="#060d10"/>
      {''.join(f'<line x1="{x0+22+j*9}" y1="{edge_y+1}" x2="{x0+22+j*9}" y2="{edge_y+7}" stroke="rgba(133,153,0,0.22)"/>' for j in range(int(slot_w // 9) - 1))}
      {silk_boxed(x0 + 18 + slot_w / 2, edge_y + 22, f"RISER_{k+1} · PCIE_G5 ×16", 6)}
    </g>''')
        cv.add(f'''<g class="pick riser" data-riser="{k+1}" style="--seat:{seat('riser', k)}">
      <g class="pick-body">
        <path d="{d}" fill="#141d22" stroke="rgba(147,161,161,0.30)" stroke-width="1.4"/>
        {hexgrid(x1 - T + 8, hex_y, T - 16, hex_h)}
        {card}
        {tab}
      </g>
      {fault_at(cv, x0-14, y + (96 if up else 40), 5)}
      {stamp(x0 + 18, y + hh - 6 if up else y + 12, "райзеры")}
    </g>''')
