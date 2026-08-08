"""memory: three banks, each with its own tag.

The module is shorter than it used to be: 292 units is almost half the depth
of the board, while a real DIMM takes up a third of the chassis width at
most. It also freed the field to the right of the banks, where the discrete
components sit.

Как устроена плашка, если смотреть на неё сверху. Слева — пробор: узкая
полоса с мелкой серебристой обвязкой, регистр и питание модуля. Дальше идут
чипы, и идут они вперемежку: узкий, широкий, узкий, широкий. Так они и стоят
на живом RDIMM — часть корпусов развёрнута поперёк платы, и ряд читается
рисунком, а не шестью одинаковыми кирпичами. Ключ — прорезь в контактной
кромке — смещён вправо: левая часть контактов длиннее правой, и вставить
модуль наоборот нельзя.
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (488, 4, 360, 850)

from board.geom import (
    BANK_N,
    DIMM_SOCK_W,
    PITCH,
    SLOT_H,
    X_CORE,
    X_TAG,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
)

# Module dimensions along the depth of the board. Everything else in the socket
# is derived from them: the contacts, the key and the chips have to line up at
# any width.
SOCK_W = DIMM_SOCK_W
DIMM_W = SOCK_W - 6
# Ключ стоит на 64% длины: это и есть то, чем DDR5 отличают от DDR4 наощупь —
# смещение прорези от середины. Левая часть контактов длиннее правой.
KEY_AT = 0.64
CHIP_H = SLOT_H - 8          # чипы занимают всё, что осталось под кромкой

from board.geom import dimm_seat
from board.canvas import SILK
from board.ink import barcode, hit, mono, silk_inverse
from board.revision import BOARD_SHA, stamp
from board.spec import DIMM

# Маркировка чипа. На живом модуле она мельче всего, что вообще есть на плате,
# и складывается из кода производителя, ёмкости кристалла и ревизии. Читать её
# не нужно — нужно, чтобы чип не был пустым прямоугольником.
CHIP_MARK = 'H58G'

# Место наклейки на модуле. Ширина считается той же формулой, что и в
# sticker(): полосы штрих-кода, отступы и строка моноширинным кеглем 4.6.
STICKER_X = 168
STICKER_W = len(f"{DIMM['size_gb']}GB {DIMM['kind'].split()[0]} {DIMM['ranks']}") * 4.6 * 0.62 \
    + 14 * 1.7 + 4 + 10


def module(x0, y, i, skip=None):
    """Тело плашки: кромка, пробор и ряд чипов.

    skip — полоса, занятая наклейкой: чипы под неё не лезут, а перепрыгивают.
    Наклейку клеят поверх корпусов, но рисовать корпус, которого потом не
    видно, значит платить узлами за невидимое.
    """
    # Торец текстолита — самая светлая полоса на модуле, но заметно темнее
    # прежнего: двадцать четыре ярко-бирюзовые черты собирались в решётку,
    # которая спорила с подписями ссылок.
    edge = '#2d5c57' if i % 2 else '#28524c'
    parts = [
        (f'<rect x="{x0}" y="{y}" width="{DIMM_W}" height="{SLOT_H}" rx="0" fill="#13323a" '
         f'stroke="rgba(147,161,161,0.30)"/>'),
        f'<rect x="{x0+2}" y="{y+1}" width="{DIMM_W-4}" height="3.4" rx="1" fill="{edge}"/>',
    ]
    cy = y + 5.6
    # Пробор: регистр и обвязка питания модуля. Серебристых контактов на нём
    # больше нет — на плашке такого размера шесть светлых столбиков читались не
    # пайкой, а вторым рядом чипов, и спорили с настоящим рядом справа. Осталась
    # тёмная площадка: она отделяет контактную гребёнку от корпусов, а этого и
    # достаточно.
    parts.append(f'<rect x="{x0+5}" y="{cy}" width="30" height="{CHIP_H}" rx="0.6" '
                 f'fill="#0b1418" stroke="rgba(147,161,161,0.18)" stroke-width="0.5"/>')

    # Чипы: узкий — широкий — узкий — широкий, начиная от пробора с узкого.
    # Шаг считается по фактической ширине предыдущего корпуса, а не по среднему
    # числу: со средним чередование сбивалось и подряд выходили два узких.
    cx, k = x0 + 42, 0
    while True:
        wide = k % 2
        w = 26 if wide else 13
        if skip and cx + w > skip[0] and cx < skip[1]:
            cx = skip[1] + 5
            continue
        if cx + w > x0 + DIMM_W - 8:
            break
        # Корпуса стоят вразбежку по высоте: широкий прижат к верхней кромке,
        # узкий опущен на два. На живой планке чипы и стоят не по одной линии —
        # ряд читается как ряд, а не как сплошная полоса.
        chy = cy + (0 if wide else 2)
        parts.append(f'<rect x="{cx:.1f}" y="{chy}" width="{w}" height="{CHIP_H-2 if not wide else CHIP_H}" rx="0.6" '
                     f'fill="#0d1519" stroke="rgba(147,161,161,0.14)" stroke-width="0.5"/>')
        if wide:
            # Гравировка — только на широких: на узкий корпус её и в жизни не
            # ставят целиком, там остаётся один код партии.
            parts.append(f'<text x="{cx+w/2:.1f}" y="{chy+CHIP_H/2+1.4:.1f}" text-anchor="middle" '
                         f'fill="rgba(147,161,161,0.34)" '
                         f'font-family="ui-monospace, Menlo, monospace" '
                         f'font-size="3.4">{CHIP_MARK}</text>')
        cx += w + 5
        k += 1

    return ''.join(parts)


def sticker(x, y):
    """Наклейка модуля: что за память и её штрих-код.

    Штрих-код не украшение: на живой планке по нему её и заводят в учёт, и он
    занимает добрую треть наклейки. Разряды кода считаются из самого текста —
    так он меняется вместе с паспортом, а не остаётся картинкой.
    """
    text = f"{DIMM['size_gb']}GB {DIMM['kind'].split()[0]} {DIMM['ranks']}"
    bars = 14
    bw = bars * 1.7 + 4
    w = len(text) * 4.6 * 0.62 + bw + 10
    out = [(f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{SLOT_H-7}" rx="1" '
            f'fill="#e8e3d5" fill-opacity="0.40" stroke="rgba(147,161,161,0.20)" '
            f'stroke-width="0.5"/>')]
    # Разряды кода считаются от хэша сборки: на живой планке штрих-код — это
    # её серийный номер, а серийный номер этой машины и есть коммит, которым
    # она собрана. Так код меняется вместе с платой, а не живёт своей жизнью.
    out.append(barcode(x + 3, y + 1.4, BOARD_SHA, SLOT_H - 9.8, bars=bars))
    out.append(f'<text x="{x+bw+4:.1f}" y="{y+SLOT_H-9.6:.1f}" fill="rgba(10,20,23,0.80)" '
               f'font-family="ui-monospace, Menlo, monospace" font-size="4.6">{text}</text>')
    return ''.join(out)


# Опорная точка, на которой рисуются общие детали в <defs>: первый слот
# левого банка. Не (0, 0) — build.py проверяет BOUNDS блока по регулярке,
# считая x/y-атрибуты из сырого текста, и это касается и того, что лежит
# внутри <defs> (он не рендерится, но остаётся текстом фрагмента). Взяв за
# ноль настоящую координату первого слота, получаем то же самое гнездо,
# что рисовалось раньше явно, — оно уже проходило проверку BOUNDS, потому
# что это и есть его прежние координаты.
_DEFS_Y = Y_BANK_L


def _slot_static(y, first=False):
    """Гнездо модуля и его hit-зона — то, что остаётся на плате при вынутой
    плашке.

    Совпадает буквально у всех 24 слотов: контакты, ключ и зона захвата
    зависят только от X_CORE и SOCK_W, а они одни на всю плату. Отличие
    между слотами — только сдвиг по Y, а его добавляет transform на <use>,
    которым слот на это гнездо ссылается.

    Контакты плотнее прежнего: шаг четыре вместо шести. У DDR5 их больше
    двух с половиной сотен на модуль, и редкая гребёнка читалась краевым
    разъёмом райзера, а не памятью.
    """
    n_pins = int((SOCK_W - 20) // 4)
    key_x = X_CORE - 2 + SOCK_W * KEY_AT
    # Цвет гнезда — не украшение, а инструкция по заселению. Первый слот каждого
    # канала красят иначе, и правило «ставь в цветные, пока они есть» написано
    # прямо на плате: две планки в один канал работают медленнее, чем те же две
    # в разные. У нас все двадцать четыре гнезда были одинаково чёрными, и
    # порядок заселения нельзя было прочесть ниоткуда.
    body = '#2a1f14' if first else '#05090b'
    edge = 'rgba(203,75,22,0.34)' if first else 'rgba(147,161,161,0.26)'
    return (f'<rect class="hit" x="{X_CORE-8}" y="{y-1}" width="{SOCK_W+28}" height="{PITCH}" '
            f'fill="#000" fill-opacity="0.001"/>'
            f'<rect x="{X_CORE-2}" y="{y-1}" width="{SOCK_W}" height="{SLOT_H+2}" rx="1" '
            f'fill="{body}" stroke="{edge}"/>'
            + ''.join(f'<line x1="{X_CORE+8+c*4}" y1="{y+2}" x2="{X_CORE+8+c*4}" '
                      f'y2="{y+SLOT_H-2}" stroke="rgba(206,168,58,0.62)" '
                      f'stroke-width="1"/>'
                      for c in range(n_pins)
                      if not (key_x - 4 < X_CORE + 8 + c * 4 < key_x + 8))
            + f'<rect x="{key_x:.1f}" y="{y+1}" width="4" height="{SLOT_H-2}" '
              f'fill="#0f1a20"/>')


def _slot_body(y, parity):
    """Тело модуля и наклейка — то, что едет вместе с pick-body при съёме.

    parity — чётность позиции в банке (i % 2): единственное, чем корпус
    одного слота отличается от соседнего, — цвет полосы текстолита. Два
    варианта на все 24 слота, не 24. Наклейка не отличается вовсе: текст и
    штрих-код берутся из паспорта модуля и ревизии платы, а не из номера
    слота, — поэтому она одна и та же что при parity=0, что при parity=1.
    """
    skip = (X_CORE + STICKER_X, X_CORE + STICKER_X + STICKER_W)
    return module(X_CORE, y, parity, skip=skip) + sticker(X_CORE + STICKER_X, y + 5.6)


def _defs():
    """Общая геометрия слота, вынесенная один раз на все 24.

    Гнездо (контакты, ключ, hit-зона) даёт около 1560+48 узлов из 2466 —
    почти всё дерево блока — и совпадает буквально; тело модуля и наклейка
    совпадают с точностью до чётности позиции. Вынесенные сюда, они рисуются
    по одному разу, а слот обращается к ним через <use> с одним числом
    (сдвиг по Y).

    Что осталось за скобками нарочно: задержка посадки (--seat), буква
    канала на шелкографии и защёлки — у каждой плашки свои, а до внутренностей
    <use> из CSS не достать (стилизуется только сам <use>, теневое дерево —
    нет). Плашка выходит по одной, и это как раз то немногое, что должно
    остаться настоящим отдельным узлом, а не ссылкой на общий.
    """
    return (f'<defs>'
            f'<g id="dimm-static">{_slot_static(_DEFS_Y)}</g>'
            f'<g id="dimm-static-1">{_slot_static(_DEFS_Y, first=True)}</g>'
            f'<g id="dimm-body-0">{_slot_body(_DEFS_Y, 0)}</g>'
            f'<g id="dimm-body-1">{_slot_body(_DEFS_Y, 1)}</g>'
            f'</defs>')


def render(cv):
    # Modules are populated not one after another but by channel: first the
    # first slot of every channel on both processors, then the second. That is
    # why the middle bank is filled from both ends — its halves belong to
    # different processors.
    def bank(y0, n, code, letters, first_ref, wave2):
        slots = []
        for i in range(n):
            y = y0 + i * PITCH
            # Слот занимает место, и об этом надо сказать вслух. Блок рисуется
            # поздно, когда поле уже разобрано, и молчание сходило ему с рук:
            # после него места просит только краска. Но регистр — не только
            # очередь, он ещё и то, по чему сверяют разметку с рисунком, и
            # двадцати четырёх самых заметных узлов платы в нём не было вовсе:
            # под банками памяти он считал поле пустым.
            cv.busy(X_CORE - 8, y, DIMM_SOCK_W + 8, SLOT_H, pad=0)
            # The socket stays on the board when the module is pulled out, so
            # it is a separate shape and not part of the module — hence a
            # separate <use>, outside .pick-body, right next to the hit zone
            # that shares its geometry.
            #
            # Сдвиг — через transform, а не через x/y на <use>: build.py ищет
            # границы блока регуляркой по x=/y=-атрибутам, не разбирая ни
            # path, ни transform (см. докстрing bbox() в build.py). Атрибут
            # y="126" эта регулярка сочла бы координатой в 126 и обрушила
            # проверку BOUNDS блока, хотя это не координата, а сдвиг.
            #
            # the hover zone is wider than the module itself and covers the gap
            # to the next one: otherwise the cursor falls through between the
            # slots and the click goes nowhere
            slots.append(f'''<g class="pick dimm" data-dimm="{code}{i}" style="--seat:{dimm_seat(letters[i], wave2(i))}">
          <use href="#dimm-static{'-1' if i % 2 == 0 else ''}" transform="translate(0,{y - _DEFS_Y})"/>
          <g class="pick-body">
            <use href="#dimm-body-{i % 2}" transform="translate(0,{y - _DEFS_Y})"/>
          </g>
          <path class="latch latch-l" d="M{X_CORE-7} {y+1} h6 v{SLOT_H-2} h-6 a2 2 0 0 1 -2 -2 v{-(SLOT_H-6)} a2 2 0 0 1 2 -2 Z"/>
          <path class="latch latch-r" d="M{X_CORE+DIMM_W+1} {y+1} h6 a2 2 0 0 1 2 2 v{SLOT_H-6} a2 2 0 0 1 -2 2 h-6 Z"/>
          {silk_inverse(X_CORE + DIMM_W + 18, y + (SLOT_H - 12.5) / 2, f"DIMM {letters[i]}", 6.5)}
          {mono(X_CORE + DIMM_W + 56, y + 11, f"J{first_ref + i}", 4.5, anchor="start", op=0.34)}
        </g>''')
            # Краска банка занимает место, и сказать об этом надо вслух. Плашка
            # с буквой канала лежит правее гнезда, у самой кромки служебной
            # колонки, а регистр о ней не знал — и обозначение колодки питания
            # встало прямо на «DIMM E». Гнездо своё место держит, плашка
            # держалась ничем.
            cv.busy(X_CORE + DIMM_W + 16, y + (SLOT_H - 12.5) / 2 - 1,
                    58, 14.5, pad=0, kind=SILK)
        return f'''<g class="unit" data-unit="dimm-{code}" data-group="dimm" data-href="https://blog.cosmdandy.dev">
      {hit(X_CORE-8, y0-4, SOCK_W + 42, n * PITCH + 6)}
      {''.join(slots)}
    </g>'''

    # Общие узлы — один раз перед банками, а не внутри каждого: <use> находит
    # id где угодно в документе, порядок для этого не важен, но так все
    # 24 ссылки в build-выводе идут после того, на что ссылаются, — читается
    # как обычный SVG, а не как забегание вперёд.
    cv.add(_defs())

    # The label goes into the gap between packages: the strip at the edge is
    # taken up by them entirely, and in its old place the plate lay right on
    # the network controller.
    cv.callouts.append((X_TAG - 44, Y_BANK_C + 32, X_CORE - 10, Y_BANK_C + 110,
                        "Blog", "end", "https://blog.cosmdandy.dev", "dimm",
                        "заметки", "blog"))
    half = BANK_N // 2
    # Подпись слота — буква канала, а не сквозной номер. Так его и называет
    # прошивка: у процессора двенадцать каналов A–L, по модулю на канал, и
    # «DIMM 17» не говорит ни о канале, ни о процессоре. Буквы берутся из
    # паспорта банка, где уже написано, какие каналы в нём лежат.
    cv.add(bank(Y_BANK_L, BANK_N, "L", "ABCDEFGH", 41, lambda i: False))
    # The upper half of the middle bank is CPU0's second slots, the lower one
    # is CPU1's first slots: the former go in the second wave, the latter in
    # the first.
    cv.add(bank(Y_BANK_C, BANK_N, "C", "IJKLABCD", 49, lambda i: i < half))
    cv.add(bank(Y_BANK_R, BANK_N, "R", "EFGHIJKL", 57, lambda i: True))
    # The middle bank is shared by both processors: half of its channels go to
    # one, half to the other. Twelve modules per processor is the usual layout
    # for 1U, where there is no board room left for all eight channels.
    # The bank designation is printed on its frame — see blocks/frames.py.
    #
    # Партномер — в нижнем правом углу рамки банка, по одному на банк. Заголовок
    # рамки стоит в верхнем левом; вдвоём в одном углу они спорили.
    for y0 in (Y_BANK_L, Y_BANK_C, Y_BANK_R):
        cv.add(stamp(X_CORE + DIMM_SOCK_W, y0 + (BANK_N - 1) * PITCH + SLOT_H + 2,
                     "память", anchor="end"))
