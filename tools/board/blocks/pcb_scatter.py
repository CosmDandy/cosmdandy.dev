"""крупная рассыпуха.

Микросхемы на живой плате чёрные, и на каждой белый шильдик с партномером
и точка первого вывода. Ставим их до мелочи, чтобы места достались им.
"""

import hashlib
import math

from board.geom import (
    CHIPS,
    FAN_N,
    IO_FREE,
    PCB_H,
    PCB_W,
    X_PCB,
    X_PCB_END,
    X_REAR,
    X_SVC,
    Y_PSU_BOT,
    Y_PSU_TOP,
    H,
    fan_foot_y,
)
from board.canvas import MINOR, PART, SILK
from board.ink import empty_pads, mono, silk_boxed
from board.lamps import lamp
from board.metal import pad, relief
from board.palette import SILVER
from board.revision import BOARD_REV, BOARD_SN
from board.spec import CPU, ram_label


def render(cv):
    def fit(text, avail, size):
        """Кегль, при котором строка влезает в отведённую ширину.

    Моноширинный шрифт продвигается ровно на 0.6 em, поэтому ширину строки
    можно посчитать заранее, не измеряя её в браузере.
    """
        return round(min(size, avail / (len(text) * 0.6)), 1)

    def chip_qfp(x, y, w, h, mark, sub):
        """Корпус с выводами по всем четырём сторонам — контроллеры и мосты."""
        # Шаг выводов мелкий: у контроллера их по три-четыре десятка на сторону,
        # и корпус читается частой гребёнкой. С прежним шагом 6 выходило по шесть
        # штук, и AST2600 выглядел копеечным драйвером.
        pins = []
        for k in range(int(w // 2) - 2):
            px = x + 3 + k * 2
            pins.append(f'<line x1="{px}" y1="{y}" x2="{px}" y2="{y-4}" stroke="rgba(184,196,200,0.72)" stroke-width="0.8"/>')
            pins.append(f'<line x1="{px}" y1="{y+h}" x2="{px}" y2="{y+h+4}" stroke="rgba(184,196,200,0.72)" stroke-width="0.8"/>')
        for k in range(int(h // 2) - 2):
            py = y + 3 + k * 2
            pins.append(f'<line x1="{x}" y1="{py}" x2="{x-4}" y2="{py}" stroke="rgba(184,196,200,0.72)" stroke-width="0.8"/>')
            pins.append(f'<line x1="{x+w}" y1="{py}" x2="{x+w+4}" y2="{py}" stroke="rgba(184,196,200,0.72)" stroke-width="0.8"/>')
        # Шильдик занимает середину корпуса, а точка первого вывода — угол за его
        # пределами: на живой микросхеме надпись её обходит, а не наезжает.
        lx, ly, lw, lh = x + w * 0.14, y + h * 0.26, w * 0.72, h * 0.54
        return (''.join(pins)
                + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#080b0d" '
                  f'stroke="rgba(147,161,161,0.30)"/>'
                + f'<rect x="{lx:.1f}" y="{ly:.1f}" width="{lw:.1f}" height="{lh:.1f}" '
                  f'rx="1" fill="#d9d3c1" fill-opacity="0.62"/>'
                + f'<text x="{x+w/2:.1f}" y="{ly+lh*0.44:.1f}" text-anchor="middle" fill="#0a1417" '
                  f'font-family="ui-monospace, Menlo, monospace" font-size="{fit(mark, lw-4, 7)}">{mark}</text>'
                + f'<text x="{x+w/2:.1f}" y="{ly+lh-2:.1f}" text-anchor="middle" fill="rgba(10,20,23,0.72)" '
                  f'font-family="ui-monospace, Menlo, monospace" font-size="{fit(sub, lw-4, 6)}">{sub}</text>'
                + relief(x, y, w, h, 2)
                + f'<circle cx="{x+4}" cy="{y+4}" r="1.7" fill="#268bd2" fill-opacity="0.7"/>')

    def chip_soic(x, y, w, h, mark, size=5.5):
        """Выводы по двум сторонам — память, логика, датчики.

    Ширину диктует маркировка: у длинного партномера и корпус длиннее. Точка
    первого вывода стоит у самого края, надпись начинается после неё — иначе
    точка садится прямо в название.
    """
        w = max(w, len(mark) * size * 0.6 + 15)
        pins = ''.join(
            f'<line x1="{x+4+k*5}" y1="{y}" x2="{x+4+k*5}" y2="{y-2.5}" stroke="rgba(184,196,200,0.72)"/>'
            f'<line x1="{x+4+k*5}" y1="{y+h}" x2="{x+4+k*5}" y2="{y+h+2.5}" stroke="rgba(147,161,161,0.32)"/>'
            for k in range(int(w // 5) - 1))
        return (pins
                + f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h}" rx="1.5" fill="#0a0e11" '
                  f'stroke="rgba(147,161,161,0.26)"/>'
                + f'<text x="{x+8+(w-11)/2:.1f}" y="{y+h/2+2.6:.1f}" text-anchor="middle" '
                  f'fill="rgba(238,232,213,0.58)" font-family="ui-monospace, Menlo, monospace" '
                  f'font-size="{size}">{mark}</text>'
                + relief(x, y, w, h, 1.5)
                + f'<circle cx="{x+3.4}" cy="{y+h-3.2}" r="1.2" fill="rgba(238,232,213,0.45)"/>')

    def transistor(x, y, big=False):
        """SOT-23 и DPAK: три вывода, у мощного — площадка теплоотвода."""
        if big:
            return (''.join(pad(x + 1.8 + k * 4, y + 11, 2.6, 3) for k in range(3))
                    + pad(x + 2, y - 1.6, 10, 2)          # площадка теплоотвода
                    + f'<rect x="{x}" y="{y}" width="14" height="11" rx="1" fill="#0c1114" '
                      f'stroke="rgba(147,161,161,0.26)"/>'
                    + f'<rect x="{x+2}" y="{y+2}" width="10" height="4" fill="rgba(147,161,161,0.14)"/>'
                    + relief(x, y, 14, 11))
        return (pad(x + 0.6, y + 6, 2.6, 2.4) + pad(x + 4.8, y + 6, 2.6, 2.4)
                + pad(x + 2.7, y - 2.4, 2.6, 2.4)
                + f'<rect x="{x}" y="{y}" width="8" height="6" rx="0.8" fill="#0c1114" '
                  f'stroke="rgba(147,161,161,0.24)"/>'
                + relief(x, y, 8, 6, 0.8))

    def small_sink(x, y, w, h):
        """Радиатор на горячей мелочи: рёбра и винт в каждом углу."""
        fins = ''.join(f'<line x1="{x+3}" y1="{y+4+k*4}" x2="{x+w-3}" y2="{y+4+k*4}" '
                       f'stroke="rgba(147,161,161,0.22)" stroke-width="1.6"/>'
                       for k in range(int((h - 6) // 4)))
        screws = ''.join(f'<circle cx="{sx}" cy="{sy}" r="2.2" fill="#0d1418" '
                         f'stroke="rgba(147,161,161,0.34)"/>'
                         for sx in (x + 4, x + w - 4) for sy in (y + 4, y + h - 4))
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#222d33" '
                f'stroke="rgba(147,161,161,0.34)"/>{fins}{screws}')

    def choke(x, y, s=14):
        """Дроссель питания: залитый феррит, светлее всего остального."""
        return (f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="2.5" fill="#2a3238" '
                f'stroke="rgba(147,161,161,0.30)"/>'
                f'<rect x="{x+3}" y="{y+s-3}" width="{s-6}" height="3" fill="rgba(147,161,161,0.22)"/>'
                + pad(x - 2.6, y + 2, 3, s - 4) + pad(x + s - 0.4, y + 2, 3, s - 4)
                + relief(x, y, s, s, 2.5))

    def xtal(x, y, mark="32.768kHz"):
        """Кварц в металлическом корпусе. Частоту на плате подписывают всегда —
    по ней и опознают, что это резонатор, а не конденсатор."""
        return (pad(x - 1.6, y + 1, 4, 6) + pad(x + 13.6, y + 1, 4, 6)
                + f'<rect x="{x}" y="{y}" width="16" height="8" rx="4" fill="#3a444a" '
                  f'stroke="rgba(147,161,161,0.36)"/>'
                + f'<rect x="{x+3}" y="{y+2}" width="10" height="4" rx="2" fill="rgba(147,161,161,0.10)"/>'
                + f'<path d="M{x+4} {y+1.4} h8" stroke="rgba(223,232,234,0.30)" stroke-width="1"/>'
                # подпись от левого края корпуса: центрированная уезжала влево за
                # отведённое место и садилась на соседа
                + mono(x, y + 16, mark, 5, anchor="start", op=0.34))

    # «SPI FLASH» отсюда убран: это не партномер, а назначение, и та же
    # микросхема уже стоит рядом под своим настоящим именем W25Q256. На плате
    # их было две — одна деталь, нарисованная дважды. На её место встал второй
    # датчик температуры: на двухсокетной плате их и правда несколько, по
    # одному у каждого сокета.
    SOICS = [('D9LHR', 30, 13), ('PCA9557', 26, 11), ('MAX6642', 24, 11), ('W25Q256', 28, 12),
             ('ADM1278', 26, 11), ('LM75', 20, 10), ('EMC1413', 24, 11), ('TMP421', 22, 10)]
    parts = []
    lost = []
    # центры уже поставленных корпусов: обвязка кладётся вокруг них, а не
    # ровным полем по всей плате — у живой платы мелочь жмётся к своему чипу
    hubs = []
    spot = 0

    def place(w, h, draw, name='деталь'):
        """Кладём деталь в первое свободное место честного обхода платы.

    Псевдослучайные броски исчерпывались раньше, чем находилось место, и
    крупные детали просто не появлялись — ни одного дросселя и радиатора.
    Обход по сетке гарантирует, что если место есть, деталь встанет.

    Не поместившееся запоминаем: молчаливая потеря деталей здесь уже
    случалась дважды, и оба раза обнаружилась глазами, а не сборкой.
    """
        nonlocal spot
        spot += 1
        step = 14
        y0 = 26 + (spot * 37) % 90        # разное начало, иначе всё выстроится в ряд
        # Три поля по убыванию удобства: от своей строки вниз, потом верх платы,
        # потом карман между вырезами под блоки питания. Последний нужен под
        # крупные корпуса: банки памяти и служебная зона съедают основное поле
        # целиком, и корпус в 50 единиц туда уже не входит ни при каком обходе.
        fields = ((X_PCB + 16, X_REAR - 10, y0, int(PCB_H)),
                  (X_PCB + 16, X_REAR - 10, 22, y0),
                  (X_REAR + 6, X_PCB_END - 12, Y_PSU_TOP + 10, Y_PSU_BOT - 10))
        for xa, xb, ya, yb in fields:
            for yy in range(int(ya), int(yb) - int(h), step):
                x0 = xa + (spot * 53 + yy) % 70
                for xx in list(range(x0, int(xb - w), step)) + list(range(xa, x0, step)):
                    # Всё, что расставляет этот обход, — крупная рассыпуха, а
                    # не узел: у неё нет ни бирки, ни имени на схеме, и место
                    # ей не назначено, а найдено. Вид отделяет её от разъёмов
                    # и гнёзд, чтобы по адресу было видно, о чём речь.
                    if cv.put(xx, yy, w, h, PART):
                        parts.append(draw(xx, yy))
                        hubs.append((xx + w / 2, yy + h / 2, max(w, h)))
                        return True
        lost.append(f'{name} {w:.0f}×{h:.0f}')
        return False

    # Голые футпринты под опции, которых в этой сборке нет. Координаты заданы
    # руками: place() к этому моменту свободного места уже не находит — плата
    # занята почти целиком, а свободен только карман под служебной зоной.
    pads_done = 0
    for k, (name, cols) in enumerate((("J150", 4), ("J156", 3), ("DEBUG CONN", 5))):
        px, py = X_SVC + 8, 706 + k * 42
        if cv.put(px - 4, py - 4, 118, 38, PART):
            parts.append(empty_pads(px, py, cols, 2, pitch=7)
                         + mono(px + cols * 3.5, py + 26, name, 5, op=0.3))
            pads_done += 1

    # Крупные корпуса стоят по объявленным местам, а не там, где нашлось: их
    # координаты нужны разводке и меди раньше, чем рассыпуха вообще начнётся.
    for mark, sub, cx0, cy0, w, h in CHIPS:
        cv.busy(cx0 - 6, cy0 - 6, w + 12, h + 12)
        parts.append(chip_qfp(cx0, cy0, w, h, mark, sub))
        hubs.append((cx0 + w / 2, cy0 + h / 2, max(w, h)))
    for mark, w, h in SOICS:
        # корпус вырастает под длинную маркировку — резервируем сразу по факту
        w = max(w, len(mark) * 5.5 * 0.6 + 15)
        place(w + 6, h + 6, lambda x, y, m=mark, w=w, h=h: chip_soic(x + 3, y + 3, w, h, m), mark)
    for i in range(14):
        place(18, 18, lambda x, y, b=(i % 3 == 0): transistor(x + 2, y + 2, big=b), 'транзистор')
    for i in range(7):
        place(20, 20, lambda x, y: choke(x + 3, y + 3), 'дроссель')
    for i in range(4):
        place(30, 26, lambda x, y: small_sink(x + 2, y + 2, 26, 22), 'радиатор')
    for i, mark in enumerate(("Y2 · 7.3728MHz", "Y4 · 32.768kHz", "OS1 · 50MHz")):
        # место под кварц диктует подпись частоты, а не корпус: он вдвое короче
        place(max(20, len(mark) * 3) + 6, 22, lambda x, y, m=mark: xtal(x + 2, y + 2, m), mark)
    bx, by, bw, bh = next((x, y, w, h) for n, _s, x, y, w, h in CHIPS if n == 'AST2600')
    # Отодвинута от корпуса: на прежних десяти единицах лампа стояла вплотную
    # к гребёнке выводов, и её зелёный терялся в частых светлых штрихах. Сердце
    # машины должно быть видно с одного взгляда — иначе оно не сердце.
    parts.append(lamp('led-hb', bx + bw + 34, by + 34, 4, '#859900'))
    # Подпись под лампой, а не сбоку: слева от неё идут выводы процессора
    # управления, и короткое «HB» терялось среди них — читалось как ещё одна
    # метка вывода. Под лампой оно стоит особняком и явно относится к ней.
    parts.append(silk_boxed(bx + bw + 34, by + 46, "HB", 5.5, op=0.4))
    cv.busy(bx + bw + 22, by + 24, 28, 34)

    cv.add('<g class="decor parts">' + ''.join(parts) + '</g>')
    if lost:
        print('НЕ РАЗМЕСТИЛОСЬ:', ', '.join(lost))

    silk = []
    # дорожки: пучками, со ступеньками — как разводка к сокетам
    for i in range(26):
        y = 30 + i * 31
        if cv.free(X_PCB + 12, y - 3, 130, 8):
            silk.append(f'<path d="M{X_PCB+12} {y} H{X_PCB+66} l14 14 H{X_PCB+134}" fill="none" '
                        f'stroke="rgba(133,153,0,0.11)" stroke-width="1.1"/>')
    for i in range(18):
        x = X_SVC + 4 + i * 9
        silk.append(f'<path d="M{x} 40 V{104} l8 8 V196" fill="none" stroke="rgba(133,153,0,0.10)" stroke-width="1"/>')

    # посадочные места мелочи: резисторы, конденсаторы, диоды
    #
    # Ставим их не полем по всей плате, а кольцами вокруг корпусов: на живой
    # плате обвязка жмётся к своей микросхеме — развязка по питанию физически
    # обязана стоять у выводов, иначе не работает. Ровная россыпь читалась как
    # штриховка и вдобавок занимала площадь, которой потом не хватало крупному.
    def on_laminate(x, y, w=13, h=13):
        """Целиком ли фигура лежит на текстолите.

    Обвязка раскладывается кольцами вокруг корпусов, и у корпусов, стоящих
    близко к кромке, кольцо уходило за плату: детали оказывались нарисованными
    на шасси. cv.put() этого не ловит — он знает только про занятость места, а
    про край текстолита не знает ничего.
    """
        if not (X_PCB <= x and x + w <= X_PCB_END and 18 <= y and y + h <= H - 18):
            return False
        # Правее выреза под блоки питания текстолит есть только между ними.
        if x + w > X_REAR - 4:
            return Y_PSU_TOP <= y and y + h <= Y_PSU_BOT
        return True

    def small_part(kind, x, y):
        """Один элемент обвязки. Возвращает фигуры или пусто, если места нет."""
        if not on_laminate(x, y):
            return []
        # У каждого корпуса есть чем паяться: 0402 стоит на двух площадках, и
        # именно они, а не корпус, блестят на живой плате.
        if kind == 'res':
            horiz = (x + y) % 2
            w, h = (10, 4) if horiz else (4, 10)
            if not cv.put(x, y, w, h, MINOR):
                return []
            if horiz:
                body = f'<rect x="{x+2.6}" y="{y}" width="4.8" height="4" rx="0.6" fill="#1c262b"/>'
                pads = pad(x, y + 0.4, 3, 3.2) + pad(x + 7, y + 0.4, 3, 3.2)
            else:
                body = f'<rect x="{x}" y="{y+2.6}" width="4" height="4.8" rx="0.6" fill="#1c262b"/>'
                pads = pad(x + 0.4, y, 3.2, 3) + pad(x + 0.4, y + 7, 3.2, 3)
            return [pads, body, relief(x, y, w, h, 0.6)]
        if kind == 'cap':
            if not cv.put(x, y, 11, 8, MINOR):
                return []
            return [pad(x, y + 1, 3, 6) + pad(x + 8, y + 1, 3, 6),
                    f'<rect x="{x+2.4}" y="{y}" width="6.2" height="8" rx="1" fill="#16202a" '
                    f'stroke="rgba(147,161,161,0.26)" stroke-width="0.7"/>',
                    f'<rect x="{x+3}" y="{y+0.8}" width="5" height="1.4" rx="0.7" '
                    f'fill="rgba(223,232,234,0.16)"/>']
        if kind == 'diode':
            if not cv.put(x, y, 10, 5, MINOR):
                return []
            return [pad(x, y + 0.6, 2.6, 3.8) + pad(x + 7.4, y + 0.6, 2.6, 3.8),
                    f'<rect x="{x+2.2}" y="{y}" width="5.6" height="5" rx="0.6" fill="#0d1a1e" '
                    f'stroke="rgba(147,161,161,0.20)" stroke-width="0.7"/>',
                    f'<line x1="{x+6.6}" y1="{y}" x2="{x+6.6}" y2="{y+5}" stroke="{SILVER}" '
                    f'stroke-width="1" stroke-opacity="0.7"/>']
        if kind == 'array':
            # резисторная сборка: один корпус на четыре номинала, у шин их ряды
            if not cv.put(x, y, 18, 9, MINOR):
                return []
            return [''.join(pad(x + 2 + k * 4, y - 1.4, 2.4, 2.2) + pad(x + 2 + k * 4, y + 7.2, 2.4, 2.2)
                            for k in range(4)),
                    f'<rect x="{x}" y="{y}" width="18" height="7" rx="1" fill="#12191d" '
                    f'stroke="rgba(147,161,161,0.22)"/>',
                    relief(x, y, 18, 7)]
        if not cv.put(x, y, 18, 11, MINOR):
            return []
        out = [''.join(pad(x - 2.4, y + 1.4 + d * 4, 2.6, 1.8) + pad(x + 13.8, y + 1.4 + d * 4, 2.6, 1.8)
                       for d in range(3)),
               f'<rect x="{x}" y="{y}" width="14" height="11" rx="1" fill="#16212a" '
               f'stroke="rgba(147,161,161,0.20)"/>',
               relief(x, y, 14, 11)]
        return out

    KIND = ('res', 'cap', 'res', 'diode', 'cap', 'array', 'res', 'ic')
    clusters = []                       # центры гроздей: по ним же встанут refdes

    # вокруг каждого корпуса — плотное кольцо обвязки
    for n, (cx, cy, size) in enumerate(hubs):
        ring = size / 2 + 9
        for k in range(8):
            ang = (k * 47 + n * 23) % 360
            r = ring + (k % 2) * 10
            px = int(cx + r * math.cos(math.radians(ang)))
            py = int(cy + r * math.sin(math.radians(ang)))
            silk.extend(small_part(KIND[(n + k) % len(KIND)], px, py))
        clusters.append((cx, cy))

    # Полоса у левой кромки: между колодками вентиляторов остаются широкие
    # окна, и они пустовали — раньше вся полоса держалась под колодки целиком.
    # Обвязка там честная: к каждой колодке идёт своя цепь тахометра.
    for i in range(FAN_N - 1):
        mid = (fan_foot_y(i) + fan_foot_y(i + 1)) / 2
        for k in range(9):
            px = X_PCB + 12 + (k % 3) * 24
            py = int(mid - 24 + (k // 3) * 17)
            silk.extend(small_part(KIND[(i * 3 + k) % len(KIND)], px, py))
        clusters.append((X_PCB + 40, mid))

    # и гроздьями вдоль шин — там, где дорожки ломаются, стоит их обвязка
    for i in range(26):
        kx, ky = cv.share['knots'][(i * 29) % len(cv.share['knots'])]
        if not (X_PCB + 14 < kx < X_PCB_END - 20 and 24 < ky < H - 30):
            continue
        for k in range(5):
            px = int(kx + ((k % 3) - 1) * 13)
            py = int(ky + (k // 3) * 12 - 6)
            silk.extend(small_part(KIND[(i + k) % len(KIND)], px, py))
        clusters.append((kx, ky))

    # тестовые точки
    for i in range(26):
        x = X_PCB + 30 + (i * 173) % (PCB_W - 60)
        y = 40 + (i * 121) % (PCB_H - 50)
        if not cv.free(x - 4, y - 4, 8, 8):
            continue
        silk.append(f'<circle cx="{x}" cy="{y}" r="2.6" fill="none" stroke="rgba(147,161,161,0.30)" stroke-width="1"/>')
        silk.append(f'<circle cx="{x}" cy="{y}" r="0.9" fill="rgba(147,161,161,0.34)"/>')

    # позиционные обозначения — то, что реально написано на плате рядом с деталями
    # Обозначения на живой плате четырёхзначные, стоят стопками по 3–5 у своей
    # цепи и половина повёрнута боком — набирать их горизонтально в строку негде.
    # Стопка встаёт у своей грозди — обозначение печатают рядом с деталью, к
    # которой оно относится, а не там, где на плате осталось место.
    PREFIX = ['R', 'C', 'R', 'C', 'U', 'Q', 'L', 'CR', 'TP', 'J']
    # Стопок снова полсотни: разводит их теперь сам регистр занятости. Краска
    # ложится поверх меди и поверх мелочи, но не на корпуса и не на другую
    # краску — то есть ровно так, как на живой плате. Пока регистр был один на
    # всех, приходилось выбирать между «нет обозначений вовсе» и «набросаны
    # друг на друга»; теперь встают те, которым нашлось место, а остальные
    # честно пропускаются.
    for i in range(min(58, len(clusters))):
        cx, cy = clusters[(i * 5) % len(clusters)]
        # Две-три штуки в стопке, а не три-пять: краске достаётся то, что
        # осталось между корпусами, и длинная колонка туда не входит. На живой
        # плате в плотных местах обозначений тоже по одному-два — там, где
        # места нет, их не печатают вовсе.
        n = 2 + (i % 2)
        turn = i % 2                         # половину ставим боком
        # Запрашиваем ровно тот прямоугольник, который занимает текст: пять
        # знаков кеглем 5.5 — это около шестнадцати единиц в длину и семь на
        # строку. Раньше просили 30 в поперечнике, вдвое больше нужного, и
        # место не находилось нигде: к моменту расстановки поле уже занято
        # обвязкой, и ни одна из полусотни стопок не вставала. Обозначений на
        # плате не было вовсе — при том, что на живой их тысячи и это её
        # главный признак.
        w, h = (17, 7 * n + 4) if not turn else (7 * n + 4, 17)
        # Обвязка кольцом уже заняла ближний радиус, поэтому стопке даём обойти
        # гроздь по кругу — и не по одному витку, а по трём, расходящимся от
        # детали: обозначение печатают рядом со своей, но если там занято,
        # отступают дальше, а не бросают его вовсе.
        x = y = None
        for step in range(36):
            ang = math.radians((i * 61 + step * 10) % 360)
            r = 24 + (step % 6) * 11
            px = int(cx + r * math.cos(ang))
            py = int(cy + r * math.sin(ang))
            if not (X_PCB + 16 < px < X_PCB_END - 24 and 30 < py < H - 34):
                continue
            if cv.put(px - 4, py - 8, w, h, SILK):
                x, y = px, py
                break
        if x is None:
            continue
        # Номер берётся из хэша, а не из арифметики. Прежние 1000 + i·137 с
        # шагом семь внутри стопки давали ряд: соседние обозначения отличались
        # ровно на семь, и по трём подряд читалась формула. На живой плате
        # номер детали — это её место в схеме, а схему рисуют не по возрастанию
        # координаты: рядом стоят R1274 и C2801, и ничего между ними общего
        # нет. Отпечаток даёт ту же устойчивость — пересобрали, номер тот же, —
        # но без ряда.
        зерно = hashlib.sha1(f'{BOARD_SN}:refdes:{i}'.encode()).hexdigest()
        for k in range(n):
            номер = int(зерно[k * 4:k * 4 + 4], 16) % 3400 + 1000
            ref = f'{PREFIX[(i + k) % len(PREFIX)]}{номер}'
            if turn:
                tx, ty = x + k * 7, y + 12
                silk.append(f'<text x="{tx}" y="{ty}" transform="rotate(-90 {tx} {ty})" '
                            f'text-anchor="middle" fill="rgba(147,161,161,0.30)" '
                            f'font-family="ui-monospace, Menlo, monospace" font-size="5.5">{ref}</text>')
            else:
                silk.append(mono(x + 12, y + k * 7, ref, 5.5, op=0.30))

    cv.add('<g class="decor silk">' + ''.join(silk) + '</g>')

    # монтажные отверстия — со своей зоной, чтобы на них ничего не садилось
    holes = []
    # По углам плата притянута обязательно, по кромкам — через одну. Болта над
    # верхним банком памяти здесь нет нарочно: пара «сверху и снизу по центру»
    # читалась симметрией, которой на живой плате не бывает, а нижний нужен —
    # там кромка длиннее и её ведёт.
    for i, (x, y) in enumerate([(X_PCB+14, 30), (X_REAR-18, 30), (X_PCB+14, H-30), (X_REAR-18, H-30),
                   (X_PCB+14, 430), (X_REAR-18, 430), (740, H-30),
                   (X_PCB_END-14, Y_PSU_TOP+14), (X_PCB_END-14, Y_PSU_BOT-14)]):
        cv.busy(x - 10, y - 10, 20, 20)
        # Медное кольцо вокруг отверстия — маска на него не заходит, поэтому оно
        # рыжее. У части отверстий винт с пружинной шайбой.
        holes.append(f'<circle cx="{x}" cy="{y}" r="10.5" fill="none" stroke="rgba(184,115,51,0.34)" stroke-width="3"/>')
        holes.append(f'<circle cx="{x}" cy="{y}" r="7" fill="#0a1417" stroke="rgba(147,161,161,0.34)" stroke-width="2"/>')
        if i % 3 == 0:
            holes.append(f'<circle cx="{x}" cy="{y}" r="5.4" fill="#1a232a" stroke="rgba(147,161,161,0.42)"/>')
            holes.append(f'<path d="M{x-3.4} {y} h6.8 M{x} {y-3.4} v6.8" stroke="rgba(147,161,161,0.5)" stroke-width="1.3"/>')
    cv.add('<g class="decor">' + ''.join(holes) + '</g>')

    # Марка изготовителя. Стояла вертикально по правой кромке кеглем в 44 — и
    # не читалась: кромку пересекают три бирки ссылок, а они непрозрачные, и
    # половина строки лежала под ними. Крупный кегль этого не лечит, потому
    # что дело не в размере, а в том, что буквы закрыты.
    #
    # Теперь строка набрана поперёк, в поле, которое освободилось от выдуманной
    # платы встроенных интерфейсов, и полоса под неё выбрана между бирками
    # Telegram и Twitter — единственный разрыв в их частоколе, где марку видно
    # целиком. Кегль упирается в ширину поля: 9 знаков по 0.7 em с разрядкой.
    fx, fy, fw, fh = IO_FREE
    cv.busy(fx, fy, fw, fh)
    # Марка изготовителя. Три строки, и порядок у них тот же, что на живой
    # плате: сверху чем машина собрана, посередине кто её собрал, снизу её
    # паспорт. Раньше паспорт стоял отдельно, вертикально вдоль кромки
    # служебной зоны, и с маркой его ничего не связывало.
    #
    # Кегль каждой строки упирается в ширину поля, а не подбирается на глаз:
    # знак моноширинного продвигается на 0.6 em, разрядка добавляет свои 0.10.
    top = f"DUAL {CPU['socket']} · {ram_label()}"
    # Паспорт двумя строками, а не одной. Семьдесят знаков в строку ужимались
    # до кегля 3,6 — мельче на плате только гравировка на чипах памяти, и та
    # мелкая нарочно. Строку, продиктованную дословно, читать было нельзя.
    rev = f'REV {BOARD_REV} · S/N {BOARD_SN}'
    # Разрядка в 0.10 em добавляется к продвижению знака, поэтому в fit()
    # уходит ширина поля, ужатая на ту же долю.
    avail = fw / 1.17
    name_size = fit('COSMDANDY', avail, fh * 0.42)
    # Марка — ссылка на историю самой платы, а не на один коммит. Коммитом
    # она быть перестала вместе с тем, как серийный номер стал отпечатком
    # чертежа: коммит, в котором эта плата уедет, на момент сборки ещё не
    # существует, и ссылка вела на предыдущий — то есть на другую плату.
    # Открывается она только в сервисном режиме: вне его поверх марки лежат
    # бирки, и вести оттуда некуда.
    cv.add(f'''<a class="silk-mark" href="https://github.com/CosmDandy/cosmdandy.dev/commits/master/index.html"
   target="_blank" rel="noopener" aria-label="Исходники платы">
  <rect class="silk-hit" x="{fx}" y="{fy}" width="{fw}" height="{fh}" fill="#000" fill-opacity="0.001"/>
  <text class="silk-line" x="{fx + fw / 2:.0f}" y="{fy + 11:.0f}" text-anchor="middle"
        font-family="ui-monospace, Menlo, monospace"
        font-size="{fit(top, avail, 8)}" letter-spacing="0.10em">{top}</text>
  <text class="silk-name" x="{fx + fw / 2:.0f}" y="{fy + 16 + name_size:.0f}" text-anchor="middle"
        font-family="ui-monospace, Menlo, monospace"
        font-size="{name_size}" font-weight="600" letter-spacing="0.10em">COSMDANDY</text>
  <text class="silk-line" x="{fx + fw / 2:.0f}" y="{fy + fh - 12:.0f}" text-anchor="middle"
        font-family="ui-monospace, Menlo, monospace"
        font-size="{fit(rev, avail, 7)}" letter-spacing="0.06em">{rev}</text>
  <path class="silk-rule" d="M{fx + 14} {fy + fh - 3} H{fx + fw - 14}" fill="none"/>
  <clipPath id="silk-clip"><rect x="{fx}" y="{fy}" width="{fw}" height="{fh}"/></clipPath>
  <g clip-path="url(#silk-clip)">
    <rect class="silk-shine" x="{fx - 40}" y="{fy}" width="22" height="{fh}"/>
  </g>
</a>''')
