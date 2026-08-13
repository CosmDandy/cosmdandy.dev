"""Coordinates: the single place that says what lies where.

This is the shared table — the one file that cannot be edited in parallel.
Everything else can be: a block takes its bounds from here and draws inside
them without peeking at its neighbours. As long as a unit's coordinate lives
in the unit's own code, the neighbours are tied through it, and "edit them
separately" does not work.

The composition is rotated 90°: front on the left, depth to the right — the
screen is wide and the server is long. So X_* is the depth from the front,
Y_* is the width of the chassis.
"""

W, H = 1314, 863

# ── depth: from the front to the rear wall ───────────────────────────────
X_FRONT  = 6      # front: control panel on top, drive bays below it
X_BP     = 166    # backplane — right behind the cage, past the bay grille
# Стена вентиляторов заходит на текстолит — но только планками с дальней
# стороны модулей, а не вся. Так она и стоит в машине: пластиковые планки выше
# платы и ложатся на её переднюю кромку вместе с рассыпухой под ними —
# рассыпуха никуда не девается, её просто не видно, и блок рисуется после неё
# именно за этим. Само поле крыльчаток при этом остаётся перед платой: стена,
# наехавшая на текстолит целиком, съедала полосу шириной с модуль.
#
# Отсюда и число: BODY_X1 (дальняя кромка корпуса модуля) обязано совпасть с
# кромкой платы, а X_FAN — это она минус глубина модуля без планки.
X_FAN    = 208    # fan wall — its rear rails lap onto the board
FAN_N    = 4      # hot-swap modules in the wall
FAN_W    = 152    # depth of a module: handle, two fans, rail
X_PCB    = 346    # the board comes right up to the wall: exactly enough gap
                  # for the fan power harnesses to read
X_CORE   = 504    # memory slots
X_SVC    = 842    # service area: battery, microSD, M.2
X_REAR   = 1004   # PSU bays
X_IO     = 1214   # rear panel

# Модуль — это два вентилятора под одной ручкой, и вынимаются они вместе: на
# живой машине ручка и есть деталь, а два корпуса под ней с неё не снимаются.
# Крыльчаток в стене по-прежнему шестнадцать, а узлов, которые вынимаются,
# четыре, не восемь.
FAN_PER_MOD = 2   # вентиляторов под одной ручкой
FAN_ROTORS  = 4   # крыльчаток в модуле: два вентилятора по два колеса

# Стена стоит не вплотную к кромкам, и просветы у неё не декоративные: через них
# шлейфы бэкплейна переходят с той стороны стены на плату. Просветов три —
# сверху, по центру и снизу, — и середина появилась ровно оттого, что модули
# сжались попарно. Числа держатся друг за друга: что не ушло в модули, то и есть
# просветы.
FAN_GAP  = 26     # просвет у верхней и у нижней кромки
FAN_MID  = 31     # просвет посередине стены, между парами модулей
FAN_H    = (H - 36 - 2 * FAN_GAP - FAN_MID) / FAN_N


def fan_y(i):
    """Верхняя кромка модуля i: первая пара, просвет, вторая пара."""
    return 18 + FAN_GAP + i * FAN_H + (FAN_MID if i >= FAN_N // 2 else 0)


def fan_gaps():
    """Середины трёх просветов стены: сверху, по центру и снизу."""
    return (18 + FAN_GAP / 2,
            fan_y(1) + FAN_H + FAN_MID / 2,
            fan_y(3) + FAN_H + FAN_GAP / 2)


# Три порта SlimSAS стоят у передней кромки платы, прямо за просветами стены.
# Стояли они в служебной колонке, у дальнего края, и это была единственная
# неправда во всей разводке: шлейф от корзины пришлось бы тянуть через всю
# плату, поверх обоих процессоров и всей памяти. На живой машине эти разъёмы
# ставят ровно сюда и ровно за этим — чтобы шлейф был короткий.
X_SAS = X_FAN + FAN_W + 8
SAS_W, SAS_H = 44, 24


# Колодка на плате стоит не строго против середины модуля, а выше её. Причина
# не в красоте: у самой колодки на плате сидит лампа отсека, и пока и разъём, и
# лампа стояли на одной высоте, провод от вентилятора приходил ровно в лампу —
# две разные вещи читались одной. Смещение выносим сюда, а не в блок: к этой же
# точке разводка ведёт шину, и разъезжаться им нечем.
FAN_FOOT_LIFT = 22
FAN_LAMP_DY = 22          # лампа отсека — настолько же ниже колодки


def fan_foot_y(i):
    """Y of module i's header on the board — above the middle of the module."""
    return fan_y(i) + FAN_H / 2 - FAN_FOOT_LIFT


FRONT_W  = 156    # caddies plus a grille of the same width
# Control panel: the cage starts underneath it and therefore moved down.
# The previous 150 was enough for a row of buttons across, but the
# diagnostics panel ended up along the left edge — it needs the full height
# of the block, and the buttons were left the right half.
Y_PANEL  = 196

# ── width: 8 DIMM | CPU0 | 8 DIMM | CPU1 | 8 DIMM ────────────────────────
# Twenty-four slots, twelve per processor. Thirty-two did not fit: 544 units
# of memory plus two sockets of 150 each is the entire width of the chassis
# with nothing to spare, and the banks ran into the sockets. Now every pair
# of neighbours has exactly 28 between them — that is where the bank
# silkscreen and the VRM marking go.
# Шаг и высота плашки. Обе подросли на единицу: на модуле надо разместить
# чипы двух ориентаций, пробор с обвязкой и наклейку, а на пятнадцати они
# слипались в одну полосу. Больше нельзя — банк из восьми упирается в сокет
# сверху и в кромку текстолита снизу: правый банк кончается на 844 при кромке
# 845.
PITCH = 18
SLOT_H = 16
Y_BANK_L, Y_CPU0, Y_BANK_C, Y_CPU1, Y_BANK_R = 34, 194, 368, 528, 696
BANK_N = 8        # DIMMs in a bank; bank width = BANK_N * PITCH
DIMM_SOCK_W = 292  # length of a memory socket along the board's depth
SOCKET_W, SOCKET_H = 202, 150   # LGA 4677 is noticeably rectangular

Y_PSU_TOP, Y_PSU_BOT = 172, 690

# ── rear part: divided vertically with no overlaps ───────────────────────
# Power supply, riser, bridges, low-profile riser, I/O module, second power
# supply. The cover draws exactly the same places as the units themselves —
# which is why the coordinates live here and not inside the blocks. While
# they lived in the blocks, the cover lagged behind every move and covered
# empty space.
PSU_Y = (22, 696)
PSU_W, PSU_H = 300, 145
# Задняя стенка по вертикали. Лист идёт от 172 до 690, и всё, что в него
# врезано, должно уместиться с зазорами: между райзерами, между нижним
# райзером и кронштейном мелочи, между ним и рядом гнёзд.
#
# Прежняя раскладка была впритык и местами внахлёст: между райзерами
# оставалось четырнадцать единиц, кронштейн мелочи начинался ровно там, где
# кончался нижний райзер, а последнее гнездо вылезало за нижнюю кромку листа
# на десяток. На живой панели так не бывает — каждый вырез отбортован, и между
# отбортовками остаётся полоса металла.
RISER = ((176, 176), (372, 80))   # y and height: the upper one is full-height
# Кронштейн мелочи. Стал ниже: mini-DP на этой машине нет, а кнопка опознания
# ушла — её работу делает синяя лампа, продублированная спереди и сзади, и
# отдельная кнопка сзади была третьим изображением одного и того же.
IO_AUX_Y, IO_AUX_H = 468, 70      # USB, D-Sub и системные лампы
# Полоса гнёзд. Три розетки одного размера с одинаковым шагом: раньше две
# гигабитные стояли вплотную, а порт управления был выше их обеих и отстоял
# на четыре единицы — глаз читал это как «две розетки и что-то ещё».
IO_Y, IO_H = 552, 132
JACK_PITCH, JACK_H = 44, 38       # шаг между гнёздами и высота одного
# Текстолит доведён до самого борта: между его прежней кромкой и стальной
# стенкой оставалось семьдесят шесть единиц пустого серого поля, и задняя треть
# машины читалась не платой, а подложкой под разъёмами.
X_PCB_END = 1304
# Где кончались платы разъёмов до того, как текстолит продлили до борта. Сами
# платы никуда не переезжали: у них своё место на машине, и считать его от
# кромки текстолита было ошибкой — кромка ушла, а гнёзда уехали вместе с ней.
X_IO_END = 1206

# Задняя часть машины. Текстолит кончается на X_PCB_END — так и на живой
# плате; всё, что правее, это глубина задней панели, видимая сверху: корпуса
# разъёмов, а у самого борта стальной лист с окнами.
#
# IO_BOARD — то место платы, на котором стоят сами гнёзда: лапки кожухов,
# магнитопровод за каждой розеткой, гигабитный PHY. Раньше здесь рисовали
# целую плату встроенных интерфейсов в 234 единицы шириной, которой на живой
# машине нет, — а её краевой разъём приходился на карман блока питания.
IO_BOARD = (1030, 528, 176, 164)
# Свободное поле, оставшееся от той платы: марка изготовителя набирается в нём
# поперёк, а не вдоль кромки. Полоса выбрана между бирками Telegram и Twitter:
# бирки непрозрачные и крупные, и всё, что попадает под них, читателю не
# достаётся вовсе — прежняя вертикальная марка наполовину лежала под ними.
# Поле марки изготовителя. Раньше это была узкая полоса в сорок две единицы,
# зажатая между бирками Telegram и Twitter: больше в их частоколе места не
# было. Бирки разведены шире, и полоса вслед за ними — теперь на ней помещается
# всё, что печатают на живой плате: чем машина собрана сверху, кто её собрал
# посередине и её паспорт снизу.
# Правый край поля — по началу задней панели, а не по краю платы: за X_IO
# стоят гнёзда и их рамки, и надпись уходила под них. «COSMDANDY» набирается по
# ширине поля, поэтому обрезался не хвост строки, а буквы целиком.
IO_FREE = (X_REAR + 16, 466, X_IO - 12 - (X_REAR + 16), 88)
# Ширина стойки кронштейна райзера. Число одно на два блока: risers рисует по
# нему саму стойку, rear_io — проём под неё в перфорированном листе. Разойдутся
# — кронштейн вылезет на перфорацию или оставит под собой щель.
BRACKET_W = 52

# Стальной борт был отдельной полосой поверх листа: узкая серая лента во всю
# высоту задней части. Своей работы она не делала — перфорированный лист и так
# доходит до края машины, — а читалась подложкой, из-за которой текстолит будто
# не доставал до конца. Полосы больше нет, текстолит доведён до внешней кромки.
# Координата осталась: по ней пробиты окна под гнёзда, и это по-прежнему внешняя
# плоскость машины.
X_WALL, WALL_D = 1282, 22

X_TAG = 470       # core labels — in the empty left part, one under another

# board field: passives, traces and holes are laid out across it
PCB_W, PCB_H = X_REAR - 4 - X_PCB, H - 36

# ── unit places ──────────────────────────────────────────────────────────
# These coordinates used to live inside the blocks, and to learn where a
# socket stands the cover had to import the processors wholesale. Now it is
# the other way round: both the socket and the cover ask the same place here.
X_SOCK = X_CORE + 40                  # processor heatsinks
X_VRM  = X_CORE - 20                  # core power chokes, right by the socket

# The large packages. They used to land in the first free spot the search
# found and bunched up along the left edge; now every place is chosen by
# hand and declared here, because three layers at once lean on it: the
# traces run a bus to the chip, the support components sit in a ring around
# it, the copper flows past it. The strip between the fan headers and the
# memory banks is the only unoccupied part of the board, so the packages run
# along it, but staggered towards the edge. The strip at the left edge is
# narrow, and three parties share it: the packages, the ribbon headers and
# the core power electrolytics. Hence the alternating Y values.
#
# A package the eye never finds is a package that is not there, and three of
# these stood exactly where nothing finds them. The network controller and the
# TPM went into the second riser's pocket — and the bracket of that riser lies
# straight over them, so on an assembled machine there was simply nothing at
# that spot. Both moved out into the strip between the sockets and the service
# zone, one by each processor. The BMC stood in the far top corner, where it
# had neither neighbours nor anything to lead to; it moved into the pocket
# between the risers, which is empty on this build and is the one place on the
# board where a package of its size fits without crowding anyone.
# В шильдике стоит партномер, а не назначение. «PCIe SW» и «CPLD» на живой
# микросхеме не написано никогда: там маркировка изготовителя, по которой её и
# заказывают. Назначение говорит рамка блока, а не сам корпус.
#
# Чипсета у платформы SP5 нет вовсе — контроллер ввода-вывода встроен в сам
# процессор, — а на его месте стоял «PCH C741», причём интеловский, на плате с
# двумя AMD. Это была самая грубая ошибка схемы. Место занял ретаймер PCIe:
# линии до райзеров идут через всю плату, на пятом поколении такую длину без
# восстановления сигнала не тянут, и на двухсокетных платах он там и стоит.
CHIPS = (
    ('PT5161L',  'U31',  438, 120, 44, 44),   # ретаймер PCIe к райзерам
    ('PEX88048', 'U44',  436, 380, 42, 42),   # коммутатор линий на райзеры
    ('LCMXO3',   'U12',  442, 700, 34, 34),   # логика последовательности питания
    ('X710',     'U21',  768, 224, 36, 36),   # network controller, by CPU0
    ('SLB9673',  'U9',   768, 558, 32, 26),   # TPM 2.0, by CPU1
    ('AST2600',  'U79', 1030, 272, 46, 46),   # BMC, between the risers
    # Гигабитный PHY — у своих же гнёзд. Стоит он в единственном разрыве между
    # бирками ссылок: бирки непрозрачные, и корпус, поставленный на полста
    # единиц выше или ниже, виден не был бы вовсе.
    ('BCM54210', 'U55', 1040, 604, 34, 34),
)

# Корзина поднята вплотную к панели: восемь единиц зазора читались щелью между
# двумя деталями, которых на живой машине нет — фронт там один штампованный
# лист, и корзина начинается сразу под приборами.
BAY_TOP, BAY_N, GROUPS = Y_PANEL + 2, 8, 4   # drive cage
GROUP_GAP = 10
# A pair of caddies takes as much depth as one used to: 2.5″ is narrow, and
# a cage of eight of them is a thin pack right at the front. Whatever is
# left of the front depth goes to the ventilation grille — that is where the
# fans pull the air through the drives from.
BAY_DEPTH = 78
BAY_W = BAY_DEPTH / 2
GROUP_H = (H - 12 - BAY_TOP - GROUP_GAP * (GROUPS - 1)) / GROUPS
CAP = 46
# Strip for the bay number: it is on the cage, at the top edge of the caddy,
# and each drive gets its own. While the number stood in the middle of the
# group, both numbers of a pair landed on the same point — a cage of eight
# bays showed four digits.
# The strip is deeper than the digit needs. Hovering lifts a caddy by a few
# pixels, and at fifteen it climbed onto its own number — the label has to sit
# clear of the part that moves under it, not merely above it.
BAY_NUM_H = 21

# Cover button: x, y, side of the square. It went down to the very bottom of
# the service column, under the service toggle, and grew by a third. Up where
# it used to stand it overlapped the jumper legend and left the toggle — the
# wider of the two — squeezed between them; below there was simply free
# laminate. Both buttons now stand in one column of the same width.
# Стоит она не по служебной колонке, а по свободному углу платы, и по обеим
# осям выровнена по тому, что этот угол образует.
#
# Вширь — коридор между шелкографией правого банка памяти (кончается на 842) и
# карманом блока питания (начинается на 998): 156 единиц, центр 920. Колонка
# служебной зоны кончается левее, и выровненная по ней кнопка садилась в
# коридоре влево.
#
# Ввысь — сам правый банк: сокеты с шелкографией занимают 701..837, центр 769.
LID_BTN = (X_SVC + 21, 712, 114)
# Тумблер сервисного режима. Числа заданы владельцем и стоят здесь, а не в
# самом блоке: бронь под него берётся отсюда же, иначе они расходятся —
# прежняя бронь стояла на 848,612 при настоящих 825,570, и обозначения
# ложились прямо на переключатель.
SVC_SW = (825, 570, 114, 54)


# ── Assembling the machine ───────────────────────────────────────────────
# The order in which the units drop into their places on the first pass.
# Only the "when" lives here; "from where it flies in and how" lives in the
# unit's own css: a fan is lowered into the wall from above, a drive is
# pushed in from the front, a power supply from the rear.
#
# Seconds are counted from page load. The first one and a half go to the
# cover: the visitor has to see a closed machine, and an empty chassis
# underneath it.
#
# The memory waves are not decoration. DIMMs are not installed one after
# another but by channel: first the first slot of every channel of both
# processors, then the second. That is why the CPU0 bank and the half of the
# middle bank that belongs to CPU1 share a start time: they are filled at
# the same time.
# Между группами не должно быть простоя: следующая начинается там, где
# предыдущая ещё доводит последний узел. Прежде процессор ждал до 2.05, а
# вентиляторы и блоки заканчивались к 1.4 — полсекунды машина стояла собранной
# наполовину и ничего не делала. Это читалось не паузой в работе, а зависанием.
SEAT = {
    'psu':   (0.30, 0.34),    # старт и шаг между соседями
    'fan':   (0.46, 0.11),
    'cpu':   (1.42, 0.42),
    'dimm':  (1.58, 0.075),   # первая волна; вторая — SEAT_WAVE2
    'riser': (2.95, 0.34),
    'bay':   (3.30, 0.11),
}
SEAT_WAVE2 = 2.32             # вторые слоты каналов
SEAT_DONE = 5.00              # к этому времени машина собрана целиком

# Порядок внутри группы вентиляторов: первый, третий, четвёртый, второй. Так их
# и ставят руками — крайние держат стенку, средние доводят. Обе группы, верхняя
# и нижняя, идут одновременно: это одна операция на две руки.
FAN_ORDER = (0, 3, 1, 2)

# Диски ставят парами, и внутри пары — с дальнего: сначала внутренний отсек,
# потом внешний. Заглушки идут последними и разом: это не установка, а
# закрытие пустых мест.
BAY_ORDER = (1, 0, 3, 2, 5, 4, 7, 6)
PAIR_GAP = 0.16          # лишняя пауза между парами, поверх общего шага

# Память заполняют не подряд, а через канал: сначала первый слот каждого
# второго контроллера, потом остальные. Смысл в пропускной способности —
# соседние каналы делят один контроллер, и две плашки на нём медленнее, чем
# две на разных. Порядок букв отсюда и берётся.
DIMM_ORDER = 'ACEGIKBDFHJL'


def wobble(kind, i, spread=0.07):
    """Разнобой в долях секунды: детерминированный, но не читаемый глазом.

    Без него все узлы группы садятся ровно через равные промежутки, и сборка
    читается отработкой расписания, а не работой рук. С ним каждая деталь
    приходит чуть раньше или чуть позже своего такта — ровно настолько, чтобы
    ритм перестал быть машинным.
    """
    salt = sum(ord(c) for c in kind)
    return ((i * 53 + salt * 17) % 100 / 100 - 0.5) * 2 * spread


def seat(kind, i, base=None):
    """Seating delay of unit i — a ready string for a CSS variable."""
    start, step = SEAT[kind]
    return f'{(base if base is not None else start) + i * step + wobble(kind, i):.2f}s'


def fan_seat(i):
    """Задержка вентилятора i: своя группа, свой порядок внутри неё."""
    return seat('fan', FAN_ORDER[i % 4])


def bay_seat(i, filler=False):
    """Задержка каддика i.

    Внутри пары шаг маленький — это одно движение руки, — а между парами
    больше: рука переходит к следующему отсеку. Ровный шаг на все восемь
    читался отсчётом, а не работой. Заглушки идут последними и все разом:
    это не установка, а закрытие пустых мест.
    """
    start, step = SEAT['bay']
    if filler:
        return f'{start + 4 * step + 3 * PAIR_GAP:.2f}s'
    rank = BAY_ORDER.index(i)
    return seat('bay', rank - (rank // 2) * 2, base=start + (rank // 2) * (PAIR_GAP + 2 * step))


def riser_seat(k):
    """Малый райзер ставят первым: он ниже и уходит под большой."""
    return seat('riser', 0 if k else 1)


def dimm_seat(letter, cpu_wave2=False):
    """Задержка плашки по букве её канала."""
    base = SEAT_WAVE2 if cpu_wave2 else SEAT['dimm'][0]
    return seat('dimm', DIMM_ORDER.index(letter), base=base)
