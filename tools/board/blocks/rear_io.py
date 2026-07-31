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
from board.revision import stamp
from board.spec import PORTS

# The jack width is needed twice over — to draw the jack and to place the
# lamps beside it — so it is stated here and handed to rj45() explicitly.
# Three lamps have to stand where two stood, hence the smaller bulb.
JACK_W, LED_R = 52, 2.4

STEEL = "#1b2429"


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
    по скошенным углам его опознают, не читая подписи."""
    w, h, cut = 34, 15, 4
    body = (f'<path d="M{x} {y+cut} L{x+cut} {y} H{x+w-cut} L{x+w} {y+cut} '
            f'V{y+h-cut} L{x+w-cut} {y+h} H{x+cut} L{x} {y+h-cut} Z" fill="#151d22" '
            f'stroke="rgba(147,161,161,0.38)" stroke-width="1.1"/>')
    slot = (f'<path d="M{x+7} {y+cut+1.6} H{x+w-7} L{x+w-9} {y+h-cut-1.6} H{x+9} Z" '
            f'fill="#060d10" stroke="rgba(147,161,161,0.18)" stroke-width="0.6"/>')
    # два ряда штырьков: пять сверху, четыре снизу — тем и отличается от всего
    # остального на панели
    pins = ''.join(f'<circle cx="{x+11+k*3.4:.1f}" cy="{y+h/2-2.4:.1f}" r="0.9" '
                   f'fill="rgba(206,168,58,0.55)"/>' for k in range(5))
    pins += ''.join(f'<circle cx="{x+12.7+k*3.4:.1f}" cy="{y+h/2+2.4:.1f}" r="0.9" '
                    f'fill="rgba(206,168,58,0.55)"/>' for k in range(4))
    screws = ''.join(f'<circle cx="{sx}" cy="{y+h/2}" r="3" fill="#222c31" '
                     f'stroke="rgba(147,161,161,0.40)"/>'
                     f'<path d="M{sx-1.8} {y+h/2} h3.6" stroke="rgba(147,161,161,0.55)" '
                     f'stroke-width="0.9"/>' for sx in (x - 4, x + w + 4))
    return body + slot + pins + screws


def minidp(x, y):
    """mini-DP: узкая щель со срезанным углом и защёлкой сбоку."""
    w, h = 24, 12
    return (f'<path d="M{x} {y} H{x+w} V{y+h-3} L{x+w-3} {y+h} H{x} Z" fill="#151d22" '
            f'stroke="rgba(147,161,161,0.34)" stroke-width="1"/>'
            f'<rect x="{x+3}" y="{y+3}" width="{w-7}" height="{h-7}" rx="0.6" fill="#060d10" '
            f'stroke="rgba(147,161,161,0.18)" stroke-width="0.6"/>')


def uid_button(x, y):
    """Кнопка опознания: её жмут, чтобы синяя лампа зажглась и спереди, и сзади.

    Кнопка и лампа — одно устройство: лампа сидит в самой кнопке, и на живой
    машине её именно так и находят, наощупь по выпуклому колпачку.
    """
    s = 18
    return (f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="3" fill="#182126" '
            f'stroke="rgba(147,161,161,0.40)" stroke-width="1.1"/>'
            + relief(x, y, s, s, 3)
            + lamp('led-id', x + s / 2, y + s / 2, 4, '#268bd2'))


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
    cv.callouts.append((X_IO - 30, 468, X_IO - 8, BY + 46, "Telegram", "end",
                        "https://t.me/cosmdandy", "eth", "написать", "telegram"))
    cv.callouts.append((X_IO - 30, 574, X_IO - 8, BY + 104, "Twitter", "end",
                        "https://x.com/cosmdandy", "tw", "мысли", "twitter"))
    cv.callouts.append((X_IO - 30, 668, X_IO - 8, BY + 153, "Email", "end",
                        "mailto:i@cosmdandy.dev", "bmc", "i@cosmdandy.dev", "email"))

    # Обвязка гнёзд на самом текстолите. Гигабитный PHY стоит слева от неё и
    # объявлен в geom.CHIPS: разводка тянет к нему шину от сетевого
    # контроллера, рассыпуха кладёт вокруг него обвязку — оба берут корпус
    # оттуда же, и второй раз рисовать его здесь нечем.
    bx, by, bw, bh = IO_BOARD
    cv.busy(bx, by, bw, bh)
    cv.add('<g class="decor">'
           + magnetics(BY + 46, "T1 · 1G")
           + magnetics(BY + 104, "T2 · 1G")
           + magnetics(BY + 153, "T3 · 1G")
           + jack_tabs(BY + 26, 40)
           + jack_tabs(BY + 84, 40)
           + jack_tabs(BY + 128, 50)
           + '</g>')

    # Два гигабитных гнезда — две разные ссылки. Общая группа остаётся: пара
    # распаяна одним узлом и подписана одной строкой, но горит и открывается
    # каждое своё, поэтому unit вложен в группу, а не наоборот.
    def rj_port(y, group, href, salt, seed):
        """A jack with the full set of lamps: link, receive, transmit."""
        # Кожух шире самого гнезда: по колонке ламп с каждой стороны в
        # меньшую ширину не помещается. Он же и есть та металлическая клетка,
        # которая лапками паяется в плату.
        return (f'<g class="unit" data-group="{group}" data-href="{href}">'
                f'<g class="body">'
                f'<rect x="{X_IO}" y="{y-8}" width="86" height="40" rx="3" fill="#0f2226" '
                f'stroke="rgba(42,161,152,0.26)"/>'
                f'{rj45(X_IO+17, y, JACK_W)}'
                + rj_leds(seed, X_IO + 17, y, salt)
                + '</g></g>')

    cv.add(f'''<g class="pick" data-unit="eth">
  <g class="pick-body">
    {rj_port(BY + 34, "eth", "https://t.me/cosmdandy", 4, 6)}
    {rj_port(BY + 92, "tw", "https://x.com/cosmdandy", 7, 11)}
  </g>
  {mono(X_IO-96, BY + 118, PORTS['eth'], 8, op=0.5)}
</g>''')

    # The management port lives its own life: it runs on standby power and
    # works while the machine is off, which is why it is labelled separately.
    cv.add(f'''<g class="unit" data-unit="bmc" data-group="bmc" data-href="mailto:i@cosmdandy.dev">
  <g class="pick-body">
    <rect x="{X_IO}" y="{BY + 128}" width="86" height="50" rx="5" fill="#1a1f14"
          stroke="rgba(181,137,0,0.55)"/>
    {rj45(X_IO+17, BY + 138, JACK_W)}
    {rj_leds(9, X_IO + 17, BY + 138, 6, aux=True)}
  </g>
  {mono(X_IO-104, BY + 162, PORTS['mgmt'], 8, op=0.55)}
</g>''')

    cv.add(stamp(X_IO + 43, BY - 10, "задняя панель", anchor="middle"))
    # Кронштейн мелочи: два USB стопкой, D-Sub, mini-DP, кнопка опознания и
    # две системные лампы. У него своё место между нижним райзером и сетевыми
    # гнёздами — раньше он висел прямо над модулем и читался его частью.
    AY = IO_AUX_Y
    cv.add(f'''<g class="decor">
  <rect x="{X_IO}" y="{AY}" width="86" height="{IO_AUX_H}" rx="4" fill="#121a1e"
        stroke="rgba(147,161,161,0.22)"/>
  {usb_stack(X_IO + 8, AY + 6)}
  {dsub(X_IO + 43, AY + 8)}
  {minidp(X_IO + 52, AY + 28)}
  {uid_button(X_IO + 12, AY + 46)}
  {sys_leds(X_IO + 10, AY + 70)}
  {mono(X_IO + 23, AY + 43, "USB 3.0", 5, op=0.42)}
  {mono(X_IO + 63, AY + 27, "D-SUB", 5, op=0.42)}
  {mono(X_IO + 64, AY + 48, "mDP", 5, op=0.42)}
  {mono(X_IO + 21, AY + 68, "UID", 5, op=0.42)}
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
        (BY + 26, 40),            # LAN_1
        (BY + 84, 40),            # LAN_2
        (BY + 128, 50),           # порт управления
    ]) + '</g>')
