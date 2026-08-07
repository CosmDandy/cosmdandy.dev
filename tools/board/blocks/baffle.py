"""воздуховоды памяти: чёрный пластиковый кожух над каждым банком.

Без кожуха вентилятор гонит воздух мимо памяти — по пустому месту над
платой, где сопротивления меньше. Кожух отбирает у стенки её долю потока и
ведёт её вдоль модулей, поэтому он и стоит между стенкой и банком: раструбом
к вентиляторам, крышей над сокетами.

Три кожуха на три банка, и каждый берёт воздух у своего вентилятора.
Центральный банк лежит ровно против двух средних модулей стенки, крайние —
против крайних. Номера на литье те же, что набиты на самих модулях: на схеме
кожух показывает пальцем на конкретный вентилятор, и разойтись подписям
нельзя.

Справа кожух кончается на границе процессора: дальше начинается сам сокет, а
у памяти остаётся видимой правая часть плашек с буквами каналов — по ним и
находят слот, не снимая кожуха. Ровно так подписан и живой кожух: DIMM SLOTS
со стрелками на каждый слот, значки вентиляторов с номерами, указатель
потока и обозначение процессора, которому эта половина памяти принадлежит.

Спереди, у самой стенки, кожух закрыт полупрозрачной шторкой с вырезами под
оранжевые ручки вентиляторов: ручку видно и за неё берутся, не снимая
воздуховода.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (312, 18, 442, 836)

from board.geom import (
    BANK_N,
    FAN_H,
    FAN_STEP,
    FAN_W,
    PITCH,
    SLOT_H,
    SOCKET_W,
    X_FAN,
    X_PCB,
    X_SOCK,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
)

FACE = X_FAN + FAN_W          # задняя плоскость стенки вентиляторов
NECK = X_PCB + 84             # где раструб переходит в крышу над банком
RIGHT = X_SOCK + SOCKET_W     # правая граница кожуха — край процессора
TAB_X = X_FAN + FAN_W - 8     # оранжевая ручка вентилятора: под неё вырез

SHELL = "#080c0e"             # пластик кожуха: чернее всего, что есть на плате
EDGE = "rgba(147,161,161,0.26)"

# Банки: буква для класса и данных, ордината, вентиляторы под раструбом,
# каналы по слотам и процессор, которому банк принадлежит. Средний банк делят
# оба процессора — половина каналов у одного, половина у другого.
BANKS = (
    ('l', Y_BANK_L, (0,), "ABCDEFGH", "CPU 0"),
    ('c', Y_BANK_C, (3, 4), "IJKLABCD", "CPU 0 / CPU 1"),
    ('r', Y_BANK_R, (7,), "EFGHIJKL", "CPU 1"),
)


def emboss(x, y, text, size, anchor="middle", weight=700, op=0.34):
    """Литьё на пластике: буквы не печатают, а выдавливают в форме.

    Отсюда две копии одной строки. Нижняя тёмная — тень в канавке, верхняя
    светлая — блик на её кромке. Одной светлой строкой надпись читалась
    наклейкой, а наклейку на воздуховод не клеят.
    """
    common = (f'text-anchor="{anchor}" font-family="ui-monospace, Menlo, monospace" '
              f'font-size="{size}" font-weight="{weight}" letter-spacing="0.08em"')
    return (f'<text x="{x:.1f}" y="{y+1:.1f}" {common} fill="#000" fill-opacity="0.55">{text}</text>'
            f'<text x="{x:.1f}" y="{y:.1f}" {common} fill="#dfe8ea" fill-opacity="{op}">{text}</text>')


def fan_icon(x, y, n, w=32, h=22):
    """Значок вентилятора с его номером — как отлит на живом кожухе.

    Крыльчатка набрана теми же четырьмя лепестками, что и значок на сервисной
    наклейке крышки: это один и тот же знак «здесь крутится», и рисовать его
    двумя разными способами значит завести два языка на одну машину.
    """
    cx, cy = x + h * 0.42, y + h / 2
    r = h * 0.30
    blades = ''.join(
        f'<ellipse cx="{cx:.1f}" cy="{cy-r*0.62:.1f}" rx="{r*0.34:.1f}" ry="{r*0.62:.1f}" '
        f'fill="#dfe8ea" fill-opacity="0.26" transform="rotate({i*90} {cx:.1f} {cy:.1f})"/>'
        for i in range(4))
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="2" fill="none" '
            f'stroke="#dfe8ea" stroke-opacity="0.20"/>'
            f'<path d="M{x:.1f} {y+h:.1f} h{w}" stroke="#000" stroke-opacity="0.5"/>'
            + blades
            + f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.20:.1f}" fill="#dfe8ea" fill-opacity="0.26"/>'
            + emboss(x + w - h * 0.34, cy + h * 0.20, str(n), h * 0.52))


def airflow(x, y, w=84):
    """Указатель потока: стрела по ходу воздуха и струи за ней.

    Поток в машине идёт спереди назад, то есть слева направо, — стрела лежит
    вдоль него. Волны позади острия и есть то, чем этот знак отличается от
    обычной стрелки «сюда»: он говорит не про направление сборки, а про
    движение воздуха.
    """
    head = w * 0.30
    body = (f'<path d="M{x:.1f} {y-7:.1f} h{w-head:.1f} v-7 l{head:.1f} 10.5 '
            f'l{-head:.1f} 10.5 v-7 h{-(w-head):.1f} Z" fill="#dfe8ea" fill-opacity="0.22" '
            f'stroke="#000" stroke-opacity="0.45"/>')
    waves = ''.join(
        f'<path d="M{x-6-k*9:.1f} {y-9:.1f} q4 4.5 0 9 q-4 4.5 0 9" fill="none" '
        f'stroke="#dfe8ea" stroke-opacity="0.20" stroke-width="1.6"/>' for k in range(3))
    return body + waves


def chip_mark(x, y, text):
    """Обозначение процессора: значок корпуса и подпись под ним."""
    return (f'<rect x="{x-9:.1f}" y="{y-19:.1f}" width="18" height="14" rx="1.5" fill="none" '
            f'stroke="#dfe8ea" stroke-opacity="0.22"/>'
            + ''.join(f'<line x1="{x-9+3+k*4:.1f}" y1="{y-19:.1f}" x2="{x-9+3+k*4:.1f}" '
                      f'y2="{y-22:.1f}" stroke="#dfe8ea" stroke-opacity="0.22"/>' for k in range(4))
            + emboss(x, y, text, 9))


def render(cv):
    def fan_span(i):
        y = 26 + i * FAN_STEP
        return y, y + FAN_H

    bank_h = (BANK_N - 1) * PITCH + SLOT_H + 2

    for code, y0, fans, letters, cpu in BANKS:
        top, bot = y0 - 6, y0 - 6 + bank_h + 12
        mouth0, mouth1 = fan_span(fans[0])[0], fan_span(fans[-1])[1]
        mid = (top + bot) / 2

        # Тело: раструб от плоскости стенки к крыше над банком. Ширина
        # раструба — ровно окно тех вентиляторов, которые в него дуют.
        hood = (f'<path d="M{FACE} {mouth0:.1f} L{NECK} {top} H{RIGHT} V{bot} '
                f'H{NECK} L{FACE} {mouth1:.1f} Z" fill="{SHELL}" stroke="{EDGE}" '
                f'stroke-width="1.3"/>')
        # Рёбра жёсткости вдоль потока: по ним пластик и узнают сверху.
        ribs = ''.join(f'<path d="M{NECK+6} {ry:.1f} H{RIGHT-6}" stroke="#dfe8ea" '
                       f'stroke-opacity="0.07" stroke-width="1.2"/>'
                       for ry in (top + 10, bot - 10))

        marks = [ribs]
        # Значки вентиляторов — у самого раструба, каждый напротив своего окна.
        for k, i in enumerate(fans):
            fy0, fy1 = fan_span(i)
            marks.append(fan_icon(NECK + 8, (fy0 + fy1) / 2 - 11 if len(fans) > 1
                                  else mid - 11, i + 1))
        marks.append(airflow(NECK + 58, mid))
        # Обозначение процессора — в углу кожуха, как на живой отливке. По
        # середине оно стоять не может: там же, но на крышке, лежит бирка
        # «Blog», и под крышкой две надписи читались одна сквозь другую.
        marks.append(chip_mark(RIGHT - 118, top + 32, cpu))

        # Разметка слотов: заголовок вдоль кожуха и по стрелке на каждый слот.
        # Стрелка смотрит вправо — туда, где из-под кожуха выходит сама плашка
        # с буквой своего канала.
        # Заголовок стоит вплотную к колонке букв: левее его теснит бирка
        # «Blog», нарисованная на крышке ровно по середине банка.
        marks.append(f'<g transform="rotate(-90 {RIGHT-70} {mid})">'
                     + emboss(RIGHT - 70, mid + 3, "DIMM SLOTS", 8) + '</g>')
        for i in range(BANK_N):
            sy = y0 + i * PITCH + SLOT_H / 2
            marks.append(emboss(RIGHT - 58, sy + 3, letters[i], 7.5, weight=400))
            marks.append(f'<path d="M{RIGHT-48} {sy:.1f} h20 m-5 -4 l5 4 -5 4" fill="none" '
                         f'stroke="#dfe8ea" stroke-opacity="0.22" stroke-width="1.4"/>')

        # Шторка у стенки: полупрозрачный пластик с вырезами под оранжевые
        # ручки вентиляторов. Ручку из-под неё видно, и берутся за неё, не
        # снимая воздуховода; сквозь саму шторку читается то, что под ней, но
        # читается приглушённо — это пластик, а не дырка.
        w = f'M{TAB_X} {mouth0:.1f} H{TAB_X+60} V{mouth1:.1f} H{TAB_X} '
        for i in reversed(fans):
            fy0, fy1 = fan_span(i)
            cy = (fy0 + fy1) / 2
            w += f'V{cy+23:.1f} H{TAB_X+22} V{cy-23:.1f} H{TAB_X} '
        w += 'Z'
        shutter = (f'<path d="{w}" fill="#dfe8ea" fill-opacity="0.12" '
                   f'stroke="#dfe8ea" stroke-opacity="0.30" stroke-width="1.2"/>'
                   f'<path d="M{TAB_X+52} {mouth0+6:.1f} V{mouth1-6:.1f}" stroke="#dfe8ea" '
                   f'stroke-opacity="0.16" stroke-width="1.6"/>')

        # Направление воздуха отлито в самом кожухе, а не напечатано на плате.
        # Стрелки стояли на текстолите — но воздух гонит не плата, и на живой
        # машине их находишь именно здесь, выпуклыми в пластике: рёбрышко со
        # скосом, поймавшее свет. Одна на кожух, у самого зева.
        стрелка = (f'<path d="M{NECK+16} {mid:.1f} h30 m-8 -5 l8 5 -8 5" fill="none" '
                   f'stroke="#dfe8ea" stroke-opacity="0.22" stroke-width="1.6" '
                   f'stroke-linejoin="round"/>')
        cv.add(f'<g class="baffle baffle-{code}" data-baffle="{code}">'
               + hood + ''.join(marks) + стрелка + shutter + '</g>')
