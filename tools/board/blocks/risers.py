"""райзеры: тонкий уголок, широкой частью к задней стенке.

Кронштейн действительно тонкий: пара миллиметров стали. Широкая часть у
задней панели, ножка уходит вперёд, к центру машины.
Углы штампованной скобы: наружные грани режут прямо по контуру заготовки,
а внутренний угол всегда скруглён — на прямом угле сталь трескается.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
# Первая карта доходит до задней стенки: её торец — это гнёзда SFP+.
BOUNDS = (992, 160, 316, 516)

from board.geom import X_IO, X_PCB_END, X_REAR
from board.ink import mono, silk_inverse
from board.lamps import act_led, fault_at
from board.metal import hexgrid
from board.ports import sfp
from board.revision import stamp


def render(cv):
    T, RI = 52, 18   # ширина стойки и радиус внутреннего угла
    # Подпись ведёт к торцу карты, а не к стенке: гнёзда принадлежат ей.
    cv.callouts.append((X_IO - 30, 214, X_IO + 4, 214, "LinkedIn", "end",
                        "https://linkedin.com/in/cosmdandy", "ocp"))

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

        # Райзер — это две вещи: стальной кронштейн, за который тянут, и его
        # собственная плата со слотом. Плату видно вдоль кронштейна: карта
        # втыкается именно в неё, а сталь только держит.
        cw = x1 - x0 - T - 46
        if not up:
            slot_y = y + hh - T - 74        # прижимаем к полке: она снизу
        edge_y = slot_y + (-8 if up else 58)
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
                      f'stroke="rgba(133,153,0,0.26)"/>' for j in range(int(cw // 9) - 1))
            + mono(x0 + 18 + cw / 2, edge_y + 6, "48.51102.011", 5, op=0.30))

        # Сама карта: плата, крупный пассивный радиатор поверх чипа и клетки
        # портов на дальнем торце — у задней стенки. Вынимаешь райзер — карта
        # с портами уезжает вместе с ним.
        card_y = slot_y - (50 if up else -12)
        # Верхняя карта тянется до задней стенки: её торец и есть гнёзда,
        # которые видно снаружи. Нижний райзер пока пустой — так на живой
        # машине и бывает, второй слот занимают не всегда.
        card_w = (X_IO - x0 - 18) if up else cw
        card = (riser_pcb
                + f'<rect x="{x0+18}" y="{card_y}" width="{card_w}" height="56" rx="1" fill="#0f1c24" '
                  f'stroke="rgba(42,161,152,0.34)"/>'
                # радиатор: пакет рёбер над чипом, самый заметный элемент карты
                + f'<rect x="{x0+34}" y="{card_y+6}" width="{cw*0.46:.0f}" height="32" rx="2" '
                  f'fill="#26333a" stroke="rgba(147,161,161,0.38)"/>'
                + ''.join(f'<line x1="{x0+38+f*3.4:.1f}" y1="{card_y+9}" '
                          f'x2="{x0+38+f*3.4:.1f}" y2="{card_y+35}" '
                          f'stroke="rgba(147,161,161,0.22)" stroke-width="1.2"/>'
                          for f in range(int(cw * 0.46 // 3.4) - 2))
                + mono(x0 + 24, card_y + 52, "PCIE_X8_GF1 REV 1.01", 5, anchor="start", op=0.32))

        # Гнёзда на торце карты. Раньше они были нарисованы прямо на стенке и
        # ни к чему не вели: дырки в корпусе. Теперь видно, что это торец
        # карты, и вместе с райзером они уезжают наружу.
        if up:
            ports = (f'<rect x="{X_IO}" y="{card_y-4}" width="86" height="64" rx="4" '
                     f'fill="#13282c" stroke="rgba(42,161,152,0.50)"/>'
                     + sfp(X_IO + 14, card_y + 2)
                     + sfp(X_IO + 14, card_y + 32)
                     + f'<circle class="led-link" cx="{X_IO+8}" cy="{card_y+8}" r="3" fill="#2aa198"/>'
                     + act_led(3, X_IO + 8, card_y + 20, 3, "#859900", salt=2)
                     + f'<circle class="led-link" cx="{X_IO+8}" cy="{card_y+38}" r="3" fill="#b58900"/>'
                     + mono(X_IO + 43, card_y + 74, "2× 10G SFP+", 9, op=0.5)
                     + mono(X_IO + 43, card_y + 86, "1× 1G · degraded", 7, op=0.34))
            card += (f'<g class="unit" data-unit="ocp" data-group="ocp" '
                     f'data-href="https://linkedin.com/in/cosmdandy">{ports}</g>')
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
