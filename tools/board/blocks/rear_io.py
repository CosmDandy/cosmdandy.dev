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
# Левая кромка сдвинута к 1080: лампы второго гигабитного порта стоят на
# текстолите между PHY и магнитопроводами, а не на самой панели. Они её узла,
# а не соседнего: гнездо, его магнитопровод и его индикация — одна вещь.
BOUNDS = (1080, 166, 232, 528)

from board.geom import (
    BRACKET_W,
    IO_AUX_H,
    IO_AUX_Y,
    IO_BOARD,
    IO_Y,
    JACK_H,
    JACK_PITCH,
    RISER,
    WALL_D,
    X_IO,
    X_IO_END,
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
    x, y = X_IO_END - 66, cy - h / 2
    pins = ''.join(pad(x + 4 + k * 4.8, y - 2.6, 3, 3, 0.4)
                   + pad(x + 4 + k * 4.8, y + h - 0.4, 3, 3, 0.4) for k in range(8))
    return (pins
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="#10171b" '
              f'stroke="rgba(147,161,161,0.30)"/>'
            + relief(x, y, w, h, 1.5)
            + mono(x + w / 2, y + h / 2 + 2, label, 5, op=0.42))


# Лапок кожуха у гнёзд больше нет. На живой плате ими клетка разъёма держится
# в текстолите, но в этом масштабе от них оставались три пары светлых штрихов
# в промежутках между гнёздами — и читались они не креплением, а серыми
# перемычками, делящими ряд портов на части.


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


# Зазор между листом и тем, что в него встроено: тонкая линия, по которой
# видно, что блок вставлен в стенку, а не нарисован поверх неё. Мелкий
# намеренно: блоки занимают 86 единиц из 114 по ширине листа, и каждая
# единица зазора съедает полосу, в которой ещё помещается ряд дырок.
GAP = 3


def cut_width():
    """Ширина проёма под кронштейн райзера: стойка плюс тот же зазор."""
    return BRACKET_W + GAP


# Припуск проёма под кронштейн райзера с каждой стороны.
RISER_GAP = 5


def rear_wall(holes, cutouts, keepouts=()):
    """Задняя панель: одна широкая перфорированная планка с окнами.

    Раньше борт был полосой в двадцать две единицы, а между ним и платами
    разъёмов оставались тонкие серые заполнители — по одному на каждый просвет.
    Читалось это не панелью, а набором прокладок. На живой машине задняя стенка
    одна: штампованный лист во всю глубину кронштейна, в котором вырезаны окна
    под разъёмы и проёмы под съёмные райзеры.

    Ширина листа взята по кронштейну райзера: от его стойки до внешней кромки
    борта. Поэтому лист и кронштейн совпадают по левому краю — они и есть одна
    деталь, только кронштейн съёмный.

    holes   — окна под разъёмы: (y, высота). Сквозные, лист там пробит.
    cutouts — проёмы под райзеры: (y, высота). Там листа нет вовсе, туда
              заходит съёмный кронштейн со своей перфорацией.
    """
    # Лист начинается левее стойки кронштейна: он подложка под всё, что стоит у
    # задней стенки, а не полоска между ней и платами. Правая кромка — внешний
    # край борта.
    x0 = X_IO - 24
    w = X_WALL + WALL_D - x0
    top, bot = Y_PSU_TOP, Y_PSU_BOT

    # Маска: белое поле листа, чёрным — соты, окна и проёмы. Всё чёрное в
    # маске это дырка, сквозь неё видно то, что лежит под листом.
    field = f'<rect x="{x0 - 2}" y="{top - 2}" width="{w + 4}" height="{bot - top + 4}" fill="#fff"/>'
    mask, plate = [field], [field]
    ribs = []

    # Проём под кронштейн вырезан не на всю глубину листа, а ровно под стойку
    # плюс тонкий зазор. Прежде вырез шёл до самого края, и на высоте райзера
    # задняя стенка пропадала совсем: за кронштейном зияла пустота вместо
    # перфорации. Теперь за зазором лист продолжается — как на передней панели,
    # где корзина дисков так же врезана в перфорированное поле.
    cut_w = cut_width()
    for hy, hh in cutouts:
        hole = f'<rect x="{x0 - 2}" y="{hy}" width="{cut_w}" height="{hh}" fill="#000"/>'
        mask.append(hole)
        plate.append(hole)
    for hy, hh in holes:
        # Окно пробито только в борту: вглубь машины лист остаётся, на нём и
        # стоит плата разъёма.
        hole = f'<rect x="{X_WALL - 1}" y="{hy}" width="{WALL_D + 2}" height="{hh}" fill="#000"/>'
        mask.append(hole)
        plate.append(hole)
        # Отбортовки у окна больше нет. Она рисовалась по стальному борту —
        # той самой серой ленте вдоль края, — и держалась на ней. Ленту убрали,
        # а пара светлых чёрточек от каждого окна осталась висеть в пустоте:
        # снаружи это читалось короткими серыми штрихами между гнёздами, ни к
        # чему не относящимися.

    # Соты по всему листу: одна сетка, а не по сетке на каждый просвет. Сота
    # той же величины, что на крышке и на кронштейнах — дырки в этой машине
    # пробиты одним пуансоном.
    # Сота здесь заметно мельче, чем на крышке и на кронштейнах, и это не
    # прихоть, а вынужденная мера. Блоки занимают 86 единиц из 114 по ширине
    # листа, между гнёздами остаётся 12 по высоте, между блоком мелочи и первым
    # гнездом — 8. Сота прежнего размера (высотой 12) в эти полосы не входила
    # вовсе: перфорация обрывалась на верхней трети, и стенка читалась не
    # цельным листом, а куском стали с дырками сверху. Мелкая решётка проходит
    # везде — и вдоль блоков, и в просветах между ними.
    grid = dict(s=4, gap=3)
    # Поле сот одно на весь лист, от блока питания до блока питания. Раньше их
    # было два, с разрывом на высоте райзеров, и стенка читалась не цельным
    # перфорированным листом, а тремя кусками: дырки шли сверху, потом
    # обрывались, потом начинались снова. Всё, что стоит на листе, вырезано из
    # него зонами обхода — блоки в него встроены, а не приставлены к нему.
    # Поле начинается почти от самой кромки листа: в нижней трети стенки блоки
    # оставляют под перфорацию полосу всего в два десятка единиц, и отступ в
    # шесть съедал её целиком — дырки там просто переставали помещаться.
    for fx, fy, fw, fh in ((x0 + 3, top + 6, w - 6, bot - 6 - (top + 6)),):
        if fh < 20:
            continue
        mask.append(hexgrid(fx, fy, fw, fh, fill='#000', stroke='none',
                            skip=keepouts, **grid))
        ribs.append(hexgrid(fx, fy, fw, fh, fill='none',
                            stroke='rgba(147,161,161,0.26)', skip=keepouts, **grid))

    # Обводки дырок обрезаются второй маской — по самому листу, без сот.
    # Первой их резать нельзя: она чёрная ровно по шестиугольникам, то есть
    # съела бы как раз то, что рисует. А без обрезки кромки сот ложились поверх
    # карт, стоящих в проёмах: лист рисуется одним прямоугольником, и его сетка
    # шла по всей его площади, включая вырезы.
    return ('<defs><mask id="rear-perf" maskUnits="userSpaceOnUse">'
            + ''.join(mask) + '</mask>'
            + '<mask id="rear-plate" maskUnits="userSpaceOnUse">'
            + ''.join(plate) + '</mask></defs>'
            + f'<rect x="{x0}" y="{top}" width="{w}" height="{bot - top}" rx="2" '
              f'fill="{STEEL}" stroke="rgba(147,161,161,0.34)" stroke-width="1.1" '
              f'mask="url(#rear-perf)"/>'
            + f'<g mask="url(#rear-plate)">{"".join(ribs)}</g>')


def render(cv):
    # Задняя панель кладётся первой: это подложка, на которой стоит всё
    # остальное. Пока она добавлялась последней, лист ложился поверх гнёзд и
    # закрывал их собой.
    cv.add('<g class="decor">' + rear_wall(
        holes=[
            (IO_AUX_Y, IO_AUX_H),          # кронштейн мелочи
            (IO_Y + 0 * JACK_PITCH, JACK_H),   # LAN_1
            (IO_Y + 1 * JACK_PITCH, JACK_H),   # LAN_2
            (IO_Y + 2 * JACK_PITCH, JACK_H),   # порт управления
        ],
        # Проёмы под съёмные райзеры: листа там нет вовсе, туда заходит
        # кронштейн со своей перфорацией. Оба слота, и занятый, и пустой:
        # пустой закрыт заглушкой, а заглушка — часть кронштейна.
        # Проём шире райзера: между кромкой листа и кронштейном остаётся зазор,
        # как на живой панели — вырез штампуют с припуском, иначе кронштейн в
        # него не войдёт. Вплотную было видно, что это не проём, а обводка
        # райзера по его же габариту.
        cutouts=[(y - RISER_GAP, h + RISER_GAP * 2) for y, h in RISER],
        # Зоны, которые перфорация обходит: габарит каждого блока плюс тонкий
        # зазор. Блок встроен в лист, а не приставлен к нему, — значит вокруг
        # него остаётся узкая глухая кромка, как под рамку и винты на живой
        # панели, а дальше лист снова пробит.
        #
        # Отступ маленький нарочно. Он был вдесятеро больше, и зоны соседних
        # гнёзд смыкались: перфорация пропадала на всю нижнюю треть стенки, а
        # лист читался вырезанным кусками. Ширина блоков — 86 от X_IO, и с
        # зазором зона занимает не весь лист, оставляя полосу под дырки.
        keepouts=[(X_IO - GAP, IO_AUX_Y - GAP, 86 + GAP * 2, IO_AUX_H + GAP * 2)]
                 + [(X_IO - GAP, IO_Y + k * JACK_PITCH - GAP,
                     86 + GAP * 2, JACK_H + GAP * 2) for k in range(3)]
                 # Райзеры вырезаны из листа целиком, но соты подходили к самой
                 # кромке выреза и читались обгрызенным краем. Тот же зазор.
                 + [(X_IO - 26, y - RISER_GAP - GAP, cut_width() + GAP,
                     h + (RISER_GAP + GAP) * 2) for y, h in RISER],
    ) + '</g>')

    BY = IO_Y
    # Три гнезда одного размера, через один шаг. Середина гнезда k — это и
    # якорь его бирки, и высота его магнитопровода: одно число на все три
    # слоя, иначе они расходятся при первой же правке.
    def jack_y(k):
        return BY + k * JACK_PITCH

    def jack_mid(k):
        return jack_y(k) + JACK_H / 2

    # Шаг между бирками — 170, см. пояснение у LinkedIn в risers. Выноска от
    # поднятой бирки к своему гнезду идёт длиннее прежнего, и это цена: гнёзда
    # стоят внизу кучно, а бирки обязаны читаться порознь.
    # Опущена ровно настолько, чтобы из-под неё вышла лампа HB у контроллера
    # управления: она моргает раз в секунду и есть единственный признак, что
    # машина жива, — прятать её под плашкой нельзя.
    cv.callouts.append((X_IO - 30, 385, X_IO - 8, jack_mid(0), "Telegram", "end",
                        "/tg/", "eth", "написать", "telegram"))
    # Ниже марки изготовителя: строка COSMDANDY на текстолите — самое крупное,
    # что на плате написано, и закрывать её плашкой значит прятать подпись
    # автора под ссылкой на его же профиль.
    cv.callouts.append((X_IO - 30, 560, X_IO - 8, jack_mid(1), "Twitter", "end",
                        "https://x.com/cosmdandy", "tw", "мысли", "twitter"))
    cv.callouts.append((X_IO - 30, 670, X_IO - 8, jack_mid(2), "Email", "end",
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
    # Лампы второго гигабитного порта. Стоят они на плате, а не в гнезде: у
    # встроенной пары светодиоды разведены на текстолит, и по ним смотрят
    # состояние линка, когда в гнездо воткнут кабель и самого гнезда не видно.
    # Первому порту такие не нужны — его состояние видно в самой розетке.
    #
    # They carry the same classes as the lamps inside the jack, not classes of
    # their own. Classes of their own is exactly why they burned around the
    # clock: `led-enet2-lnk` and `led-enet2-act` meant nothing to the styles,
    # and a lamp no rule reaches keeps fill-opacity 1 — so link and traffic
    # shone equally bright on a machine that was off. Link comes up on
    # `.rig.net`, activity blinks on `.rig.on`, exactly as in the jack beside
    # them: it is the same pair, brought out onto the laminate.
    enet = []
    for i, (dy, color, text) in enumerate(((-13, '#268bd2', 'ENET2 LINK'),
                                           (13, '#859900', 'ENET2 ACTIVE'))):
        # Место у блока своё: он сам объявил его через IO_BOARD, и спрашивать
        # разрешения у собственной брони незачем. Между гигабитным PHY слева
        # (кончается на 1074) и магнитопроводами справа (начинаются на 1140)
        # остаётся полоса, и лампы с подписями встают ровно в неё.
        lx, ly = X_IO_END - 122, jack_mid(1) + dy
        enet.append(lamp('led-link', lx, ly, 3.4, color) if i == 0
                    else act_led(9, lx, ly, 3.4, color, salt=13))
        enet.append(mono(lx + 8, ly + 2, text, 4.8, anchor="start", op=0.42))

    cv.add('<g class="decor">'
           + ''.join(magnetics(jack_mid(k), "PA0515.321NL") for k in range(3))
           + mono(X_IO_END - 43, gap_mid + 3, PORTS['eth'], 7, op=0.5)
           + mono(X_IO_END - 43, gap_mid2 + 3, PORTS['mgmt'], 7, op=0.5)
           + ''.join(enet)
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
    <g class="unit" data-group="eth" data-href="/tg/">
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
