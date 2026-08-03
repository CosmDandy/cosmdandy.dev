"""rear panel: what is soldered onto the board, and the steel it looks through.

The gigabit jacks and the management port come straight off the board, so
they stay in place when the riser with the network card is pulled out. The
SFP+ themselves live in the risers block: they are the end face of a card,
not holes in the wall.

Раньше здесь стояла плата встроенных интерфейсов: прямоугольник в 234
единицы шириной с одним квадратиком «PHY» внутри и краевым разъёмом снизу.
Такой платы на живой машине нет — гнёзда распаяны прямо на системной, — а
краевой разъём приходился ровно на карман нижнего блока питания, то есть на
вырез, где текстолита вообще нет. Вместо неё нарисовано то, что там стоит на
самом деле: за каждой розеткой свой магнитопровод, рядом гигабитный PHY (он
объявлен в geom.CHIPS, оттуда его берут и разводка, и рассыпуха), а лапки
кожухов садятся на плату у самой кромки.

Стенка. X_IO — это не борт, а плоскость, с которой начинаются корпуса
разъёмов; сам борт лежит на X_WALL, и до этой правки его на схеме не было
вовсе: гнёзда висели в воздухе скруглёнными коробочками. Лист сплошной,
окна пробиты ровно по торцам разъёмов, между окнами сталь дырявят сотами —
машина дышит спереди назад, и выходит воздух именно здесь.

The three callouts of this block — Telegram, Twitter and mail — are the
tightest on the drawing: the jacks sit inside one module, while the labels
are four times larger than the jacks. That is why the labels are spread wider
apart in height than the sockets themselves, and each reaches its own jack
with a line. While they stood strictly opposite the sockets, the three
callouts stuck together into one plate and the address could not be read.
"""

# Own rectangle: the build checks that the block did not leave it. The block
# now owns the whole rear border, from the upper power supply to the lower
# one: the steel of the wall is drawn here.
BOUNDS = (1100, 166, 212, 528)

from board.geom import (
    IO_AUX_H,
    IO_AUX_Y,
    IO_BOARD,
    IO_Y,
    JACK_H,
    JACK_PITCH,
    RISER,
    WALL_D,
    X_IO,
    X_PCB_END,
    X_WALL,
    Y_PSU_BOT,
    Y_PSU_TOP,
)
from board.ink import mono
from board.lamps import act_led, fault_mark, glow, id_mark, lamp, square_led
from board.metal import hexgrid, pad, relief
from board.ports import rj45
from board.spec import PORTS

# The jack width is needed twice over — to draw the jack and to place the
# lamps beside it — so it is stated here and handed to rj45() explicitly.
# Three lamps have to stand where two stood, hence the smaller bulb.
JACK_W, LED_R = 52, 2.4

from board.palette import METAL, STEEL


def rj_leds(seed, jx, y, salt, aux=False):
    """Lamps of one jack: activity left of it, link right of it.

    Traffic is one lamp, not two. A live jack has a single activity LED with
    two dies in it, and which way the packet went is told by the colour it
    flashes — amber out, green in. Two separate lamps said the same thing
    twice and made the panel look busier than the machine is.
    """
    left, right = jx - 9, jx + JACK_W + 9
    return (act_led(seed, left, y + 12, LED_R, "#b58900",
                    salt=salt, aux=aux, extra_cls='led-txrx')
            + mono(left, y + 22, "TX/RX", 4, op=0.32)
            # Link is a state, not an event: it holds steady while the cable
            # is in, and that is the whole difference the viewer reads.
            + lamp('led-link aux' if aux else 'led-link', right, y + 12, LED_R, "#859900")
            + mono(right, y + 22, "LNK", 4, op=0.32))


def sys_leds(x, y):
    """Системные лампы задней панели: те же две квадратные, что и спереди.

    Они и должны быть теми же: неисправность и опознание видны с обеих сторон
    стойки, и лампа, нарисованная сзади кругом, читалась как другая лампа.
    Подписей тут нет — трафарет на самой лампе и есть подпись, а место на
    кронштейне занято портами.
    """
    return (square_led(x, y, 'fault-sys', '#b58900', fault_mark(x, y))
            + glow('fault-sys', x + 8, y + 8, 8, '#b58900')
            + square_led(x + 44, y, 'led-id', '#268bd2', id_mark(x + 44, y))
            + glow('led-id', x + 52, y + 8, 8, '#268bd2'))


def magnetics(cy, label):
    """Магнитопровод гигабитной розетки: тёмный кирпич с двумя рядами выводов.

    Это и есть узнаваемая подпись Ethernet-порта на плате: развязывающие
    трансформаторы стоят вплотную к своему гнезду, потому что между ними идёт
    сигнал, который дальше пары сантиметров вести уже нельзя.
    """
    w, h = 46, 20
    x, y = X_PCB_END - 66, cy - h / 2
    pins = ''.join(pad(x + 4 + k * 4.8, y - 2.6, 3, 3, 0.4)
                   + pad(x + 4 + k * 4.8, y + h - 0.4, 3, 3, 0.4) for k in range(8))
    return (pins
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="#10171b" '
              f'stroke="rgba(147,161,161,0.30)"/>'
            + relief(x, y, w, h, 1.5)
            + mono(x + w / 2, y + h / 2 + 2, label, 5, op=0.42))


def jack_tabs(y, h):
    """Лапки кожуха: ими металлическая клетка гнезда держится на плате.

    Гнездо стоит за кромкой текстолита, а паяется в неё — поэтому лапки и
    есть единственное, что от разъёма остаётся на плате.
    """
    n = max(2, int(h // 13))
    step = (h - 6) / max(1, n - 1)
    return ''.join(pad(X_PCB_END - 13, y + 3 + k * step - 1.7, 13, 3.4, 0.5)
                   for k in range(n))


def usb_stack(x, y):
    """Два USB в одном кожухе, один над другим — так они и стоят на панели."""
    w, h = 30, 30
    slots = ''.join(f'<rect x="{x+4}" y="{y+4+k*13}" width="{w-8}" height="9" rx="1" '
                    f'fill="#060d10" stroke="rgba(147,161,161,0.22)" stroke-width="0.7"/>'
                    f'<rect x="{x+6}" y="{y+6+k*13}" width="{w-16}" height="3" rx="0.6" '
                    f'fill="rgba(147,161,161,0.26)"/>' for k in range(2))
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="#151d22" '
            f'stroke="rgba(147,161,161,0.34)"/>' + slots + relief(x, y, w, h, 1.5))


def dsub(x, y):
    """D-Sub: трапеция и два винта-барашка. Самый узнаваемый силуэт панели —
    по скошенным углам его опознают, не читая подписи.

    Стоит поперёк, длинной стороной вдоль ширины машины: разъём смотрит в
    задний борт, и его лицевая сторона лежит в плоскости борта. Пока он был
    развёрнут вдоль глубины, кронштейн мелочи занимал вдвое больше места, чем
    ему нужно, — и по этому месту его и растащило.
    """
    w, h, cut = 15, 28, 5
    # Форма и есть буква D: одна длинная грань прямая, вторая короче на два
    # среза. По ней разъём и опознают, не читая подписи.
    body = (f'<path d="M{x} {y} H{x+w-cut} L{x+w} {y+cut} V{y+h-cut} L{x+w-cut} {y+h} '
            f'H{x} Z" fill="#151d22" '
            f'stroke="rgba(147,161,161,0.38)" stroke-width="1.1"/>')
    slot = (f'<path d="M{x+3} {y+4} H{x+w-cut-1} L{x+w-3} {y+cut+2} V{y+h-cut-2} '
            f'L{x+w-cut-1} {y+h-4} H{x+3} Z" '
            f'fill="#060d10" stroke="rgba(147,161,161,0.18)" stroke-width="0.6"/>')
    # два ряда штырьков: пять в одном, четыре в другом — тем и отличается от
    # всего остального на панели
    pins = ''.join(f'<circle cx="{x+w/2-2.2:.1f}" cy="{y+8+k*3:.1f}" r="0.9" '
                   f'fill="rgba(206,168,58,0.55)"/>' for k in range(5))
    pins += ''.join(f'<circle cx="{x+w/2+2.2:.1f}" cy="{y+9.5+k*3:.1f}" r="0.9" '
                    f'fill="rgba(206,168,58,0.55)"/>' for k in range(4))
    screws = ''.join(f'<circle cx="{x+w/2}" cy="{sy}" r="3" fill="#222c31" '
                     f'stroke="rgba(147,161,161,0.40)"/>'
                     f'<path d="M{x+w/2} {sy-1.8} v3.6" stroke="rgba(147,161,161,0.55)" '
                     f'stroke-width="0.9"/>' for sy in (y - 4, y + h + 4))
    return body + slot + pins + screws


def rear_wall(holes):
    """Стальной борт: сплошной лист с окнами ровно по торцам разъёмов.

    Окно пробивают под разъём — поэтому оно и совпадает с ним до единицы, а
    не «примерно там». Сталь между окнами дырявят сотами: воздух в машине
    идёт спереди назад и выходит именно через борт, а глухой лист его запрёт.
    Той же сеткой перфорированы кронштейны райзеров — это одна и та же сталь
    одной и той же машины.
    """
    out, y = [], Y_PSU_TOP
    for hy, hh in holes + [(Y_PSU_BOT, 0)]:
        seg = hy - y
        if seg > 2:
            out.append(f'<rect x="{X_WALL}" y="{y}" width="{WALL_D}" height="{seg}" rx="1" '
                       f'fill="{STEEL}" stroke="rgba(147,161,161,0.34)" stroke-width="1.1"/>')
            if seg >= 40:
                out.append(hexgrid(X_WALL + 2, y + 5, WALL_D - 4, seg - 10, s=4, gap=3.2))
            out.append(relief(X_WALL, y, WALL_D, seg, 1))
        if hh:
            # Кромка окна: лист по краю отогнут внутрь, и на отбортовке ловится
            # свет — без неё окно читается дыркой в бумаге, а не в стали.
            out.append(f'<path d="M{X_WALL} {hy} H{X_WALL+WALL_D} M{X_WALL} {hy+hh} '
                       f'H{X_WALL+WALL_D}" stroke="rgba(223,232,234,0.26)" '
                       f'stroke-width="1.2" fill="none"/>')
        y = hy + hh
    return ''.join(out)


def render(cv):
    BY = IO_Y
    # Три гнезда одного размера, через один шаг. Середина гнезда k — это и
    # якорь его бирки, и высота его магнитопровода: одно число на все три
    # слоя, иначе они расходятся при первой же правке.
    def jack_y(k):
        return BY + k * JACK_PITCH

    def jack_mid(k):
        return jack_y(k) + JACK_H / 2

    cv.callouts.append((X_IO - 30, 436, X_IO - 8, jack_mid(0), "Telegram", "end",
                        "https://t.me/cosmdandy", "eth", "написать", "telegram"))
    cv.callouts.append((X_IO - 30, 596, X_IO - 8, jack_mid(1), "Twitter", "end",
                        "https://x.com/cosmdandy", "tw", "мысли", "twitter"))
    cv.callouts.append((X_IO - 30, 676, X_IO - 8, jack_mid(2), "Email", "end",
                        "mailto:i@cosmdandy.dev", "bmc", "i@cosmdandy.dev", "email"))

    # Обвязка гнёзд на самом текстолите. Гигабитный PHY стоит слева от неё и
    # объявлен в geom.CHIPS: разводка тянет к нему шину от сетевого
    # контроллера, рассыпуха кладёт вокруг него обвязку — оба берут корпус
    # оттуда же, и второй раз рисовать его здесь нечем.
    bx, by, bw, bh = IO_BOARD
    cv.busy(bx, by, bw, bh)
    # Подписи портов стоят в разрывах между магнитопроводами, а не колонкой у
    # левого края блока. Так они и напечатаны на живой панели: строка лежит
    # между гнёздами, которые ею названы, и не требует догадываться, к какому
    # из трёх она относится.
    gap_mid = (jack_mid(0) + jack_mid(1)) / 2
    gap_mid2 = (jack_mid(1) + jack_mid(2)) / 2
    cv.add('<g class="decor">'
           + ''.join(magnetics(jack_mid(k), f"T{k+1} · 1G") for k in range(3))
           + ''.join(jack_tabs(jack_y(k), JACK_H) for k in range(3))
           + mono(X_PCB_END - 43, gap_mid + 3, PORTS['eth'], 7, op=0.5)
           + mono(X_PCB_END - 43, gap_mid2 + 3, PORTS['mgmt'], 7, op=0.5)
           + '</g>')

    # Два гигабитных гнезда — две разные ссылки. Общая группа остаётся: пара
    # распаяна одним узлом и подписана одной строкой, но горит и открывается
    # каждое своё, поэтому unit вложен в группу, а не наоборот.
    def jack(k, salt, seed, aux=False):
        """Гнездо целиком: кожух, розетка и её лампы. Без обёртки узла —
        гигабитная пара живёт в одной группе, порт управления в своей."""
        # Кожух шире самого гнезда: по колонке ламп с каждой стороны в
        # меньшую ширину не помещается. Он же и есть та металлическая клетка,
        # которая лапками паяется в плату.
        y = jack_y(k)
        fill, edge = (('#1a1f14', 'rgba(181,137,0,0.55)') if aux
                      else ('#0f2226', 'rgba(42,161,152,0.26)'))
        return (f'<rect x="{X_IO}" y="{y}" width="86" height="{JACK_H}" rx="3" fill="{fill}" '
                f'stroke="{edge}"/>'
                f'{rj45(X_IO+17, y+6, JACK_W)}'
                + rj_leds(seed, X_IO + 17, y + 6, salt, aux=aux))

    cv.add(f'''<g class="pick" data-unit="eth">
  <g class="pick-body">
    <g class="unit" data-group="eth" data-href="https://t.me/cosmdandy">
      <g class="body">{jack(0, 4, 6)}</g>
    </g>
    <g class="unit" data-group="tw" data-href="https://x.com/cosmdandy">
      <g class="body">{jack(1, 7, 11)}</g>
    </g>
  </g>
</g>''')

    # The management port lives its own life: it runs on standby power and
    # works while the machine is off, which is why it is labelled separately.
    cv.add(f'''<g class="unit" data-unit="bmc" data-group="bmc" data-href="mailto:i@cosmdandy.dev">
  <g class="pick-body">{jack(2, 6, 9, aux=True)}</g>
</g>''')

        # Кронштейн мелочи: два USB стопкой, последовательный порт и пара
    # системных ламп. Место у него своё, между нижним райзером и сетевыми
    # гнёздами. Всё выровнено по середине борта, а не сложено в его левый
    # край: разъёмы идут одним рядом, лампы вторым.
    #
    # Чего здесь больше нет. Кнопки опознания: её работу делает синяя лампа,
    # которая и так продублирована спереди и сзади, — отдельная кнопка была
    # третьим изображением одного и того же устройства. И mini-DP: на этой
    # машине его нет, видео выведено на D-Sub.
    AY = IO_AUX_Y
    LEDS_W = 60                       # две квадратные лампы через 44
    leds_x = X_IO + (86 - LEDS_W) / 2
    cv.add(f'''<g class="decor">
  <rect x="{X_IO}" y="{AY}" width="86" height="{IO_AUX_H}" rx="4" fill="{METAL}"
        stroke="rgba(147,161,161,0.22)"/>
  {usb_stack(X_IO + 12, AY + 7)}
  {dsub(X_IO + 56, AY + 10)}
  {mono(X_IO + 27, AY + 48, "USB 3.0", 5, op=0.42)}
  {mono(X_IO + 63, AY + 48, "D-SUB", 5, op=0.42)}
  {sys_leds(leds_x, AY + 54)}
</g>''')

    # Борт. Окна под гнёздами этого блока заданы прямо здесь, а торцы карты в
    # верхнем райзере и глухой планки нижнего считаются от RISER: они
    # принадлежат съёмным узлам, но окно в стали под них пробито раз и
    # навсегда — вынимаешь карту, окно остаётся.
    ry0, _rh0 = RISER[0]
    ry1, rh1 = RISER[1]
    cv.add('<g class="decor">' + rear_wall([
        (ry0 + 8, 64),            # торец сетевой карты: гнёзда SFP+
        (ry1 + 6, rh1 - 12),      # глухая планка пустого слота
        (AY, IO_AUX_H),           # кронштейн мелочи
        (jack_y(0), JACK_H),      # LAN_1
        (jack_y(1), JACK_H),      # LAN_2
        (jack_y(2), JACK_H),      # порт управления
    ]) + '</g>')
