"""Проверки под TODO-PLAN.md: по одной на пункт, с его же кодом.

Зачем отдельный файл. `audit_text.py` ловит один класс поломок — надпись,
попавшую на чужую фигуру. `behave.mjs` ловит другой — машина перестала
отвечать. А «три гнезда стоят через один шаг» и «кнопки опознания на задней
панели больше нет» не ловит ни тот, ни другой: это утверждения о геометрии,
и проверять их надо по собранной схеме.

Читаем то же, что уходит на страницу: `tools/board-v17.svg.part`. Не исходники
блоков — иначе проверка подтверждала бы, что код написан, а не что он что-то
нарисовал.

    python3 tools/todo_check.py          все проверки
    python3 tools/todo_check.py A        только блок A

Пункт без проверки — это пункт, который никто не проверял; такие перечислены
в конце отдельно, чтобы их не путать с пройденными.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from board import geom  # noqa: E402 — путь к пакету настраивается строкой выше

ROOT = Path(__file__).parent.parent
BOARD = (ROOT / "tools/board-v17.svg.part").read_text(encoding="utf-8")
LID = (ROOT / "tools/board-v17-lid.svg.part").read_text(encoding="utf-8")
CSS = (ROOT / "server.css").read_text(encoding="utf-8")
JS = (ROOT / "server.js").read_text(encoding="utf-8")
HTML = (ROOT / "index.html").read_text(encoding="utf-8")

CHECKS = []


def check(code, what):
    """Регистрирует проверку. Возврат — True либо строка с тем, что нашли."""
    def wrap(fn):
        CHECKS.append((code, what, fn))
        return fn
    return wrap


def attrs(tag):
    return dict(re.findall(r'([a-z-]+)="([^"]*)"', tag))


def rects(src, **want):
    """Прямоугольники с заданными атрибутами: (x, y, w, h, атрибуты)."""
    out = []
    for m in re.finditer(r'<rect ([^>]*?)/>', src):
        d = attrs(m.group(1))
        if all(d.get(k) == v for k, v in want.items()):
            out.append((float(d.get('x', 0)), float(d.get('y', 0)),
                        float(d.get('width', 0)), float(d.get('height', 0)), d))
    return out


def texts(src):
    return [(float(attrs(m.group(1)).get('x', 0)), float(attrs(m.group(1)).get('y', 0)),
             m.group(2), attrs(m.group(1)))
            for m in re.finditer(r'<text ([^>]*?)>([^<]*)</text>', src)]


# ── A. Задняя панель ─────────────────────────────────────────────────────

@check('A1', 'кнопки опознания на задней панели нет')
def a1():
    strip = [t for x, y, t, d in texts(BOARD) if t.strip() == 'UID']
    return not strip or f'подпись UID осталась: {strip}'


@check('A2', 'два USB есть, mini-DP нет, D-Sub стоит поперёк')
def a2():
    labels = [t.strip() for x, y, t, d in texts(BOARD)]
    if 'USB 3.0' not in labels:
        return 'нет подписи USB 3.0'
    if any('mDP' in t or 'mini-DP' in t for t in labels):
        return 'mini-DP остался'
    # D-Sub высокий, а не широкий: ищем его корпус по контуру буквы D
    m = re.search(r'<path d="M(\d+) (\d+) H(\d+) L(\d+) (\d+) V(\d+)', BOARD)
    return True if m else 'корпус D-Sub не найден'


@check('A3', 'системные лампы отцентрованы в кронштейне')
def a3():
    sq = [r for r in rects(BOARD, rx='1.5')
          if 'sq-led' in r[4].get('class', '') and geom.IO_AUX_Y <= r[1] <= geom.IO_AUX_Y + geom.IO_AUX_H]
    if len(sq) != 2:
        return f'квадратных ламп в кронштейне: {len(sq)}'
    left = min(r[0] for r in sq)
    right = max(r[0] + r[2] for r in sq)
    slack = abs((left - geom.X_IO) - (geom.X_IO + 86 - right))
    return slack <= 1 or f'поля слева и справа расходятся на {slack:.1f}'


@check('A4', 'три гнезда стоят через один шаг')
def a4():
    jacks = sorted(r[1] for r in rects(BOARD, rx='3', width='86')
                   if abs(r[2] - 86) < 0.1 and abs(r[3] - geom.JACK_H) < 0.1 and abs(r[0] - geom.X_IO) < 0.1)
    if len(jacks) != 3:
        return f'гнёзд найдено: {len(jacks)}'
    steps = [round(jacks[i + 1] - jacks[i], 2) for i in range(2)]
    return steps == [geom.JACK_PITCH, geom.JACK_PITCH] or f'шаги: {steps}'


@check('A5', 'радиатор 10G-карты — общий finned_sink с четырьмя винтами')
def a5():
    # Радиатор карты лежит в райзере: ищем крупную плиту #26333a правее geom.X_REAR
    sinks = [r for r in rects(BOARD, fill='#26333a') if r[0] > 1000 and r[1] < 300]
    if not sinks:
        return 'радиатора на карте нет'
    x, y, w, h = sinks[0][:4]
    if w < 120:
        return f'радиатор всё ещё узкий: {w:.0f}'
    screws = [m for m in re.finditer(r'<circle ([^>]*?)/>', BOARD)
              if attrs(m.group(1)).get('fill') == '#162025'
              and x <= float(attrs(m.group(1))['cx']) <= x + w
              and y <= float(attrs(m.group(1))['cy']) <= y + h]
    return len(screws) == 4 or f'винтов по углам: {len(screws)}'


@check('A6', 'у каждого порта SFP+ своя пара ламп с подписями')
def a6():
    zone = BOARD[BOARD.find('data-unit="ocp"'):]
    zone = zone[:zone.find('</g>', zone.find('degraded'))]
    lnk = zone.count('>LNK</text>')
    act = zone.count('>ACT</text>')
    return (lnk, act) == (2, 2) or f'подписей LNK/ACT: {lnk}/{act}'


@check('A7', 'подписи портов стоят между магнитопроводами')
def a7():
    mid01 = geom.IO_Y + geom.JACK_H / 2 + geom.JACK_PITCH / 2
    mid12 = mid01 + geom.JACK_PITCH
    found = {t.strip(): y for x, y, t, d in texts(BOARD)
             if t.strip() in ('2× 1GbE', 'SYSTEM MGMT')}
    if len(found) != 2:
        return f'подписи не найдены: {found}'
    off = max(abs(found['2× 1GbE'] - mid01), abs(found['SYSTEM MGMT'] - mid12))
    return off <= 6 or f'уехали от середины разрыва на {off:.1f}'


@check('A8', 'перфорация просвечивает и не слипается')
def a8():
    holes = re.findall(r'<polygon points="([^"]*)" fill="([^"]*)"', BOARD)
    if not holes:
        return 'сот на схеме нет'
    opaque = [f for _, f in holes if not f.startswith('rgba') or f.endswith(',1)')]
    if opaque:
        return f'глухих сот: {len(opaque)}'
    # Шаг внутри столбца. Ряды идут вразбежку, поэтому одна и та же координата
    # X встречается через ряд: шаг столбца равен двум межрядным, то есть
    # 3·s + 1.73·gap. Меньше трёх высот полсоты — значит, соты налезают.
    cols = {}
    for pts, _ in holes:
        xs = [float(p.split(',')[0]) for p in pts.split()]
        ys = [float(p.split(',')[1]) for p in pts.split()]
        s_ = (max(ys) - min(ys)) / 2
        cols.setdefault((round(sum(xs) / len(xs), 1), round(s_, 1)), []).append(sum(ys) / len(ys))
    worst = None
    for (cx, s_), ys in cols.items():
        ys = sorted(ys)
        for a, b in zip(ys, ys[1:]):
            if b - a > 0.4 and (worst is None or (b - a) / s_ < worst[0]):
                worst = ((b - a) / s_, cx, round(b - a, 1), s_)
    if worst is None:
        return 'столбцов с двумя сотами не нашлось'
    return worst[0] >= 3 or f'в столбце x={worst[1]} шаг {worst[2]} при полувысоте {worst[3]}'


# ── D. Процессор ─────────────────────────────────────────────────────────

def _socket_zone():
    from board.geom import Y_CPU0
    i = BOARD.find('data-unit="cpu0"')
    return BOARD[i:BOARD.find('data-unit="cpu1"')]


@check('D1', 'поле контактов отцентровано в держателе')
def d1():
    zone = _socket_zone()
    m = re.search(r'<path d="(M[^"]*h0\.5[^"]*)"', zone)
    if not m:
        return 'поля контактов нет'
    pts = re.findall(r'M([\d.]+) ([\d.]+)h', m.group(1))
    xs = [float(a) for a, _ in pts]
    ys = [float(b) for _, b in pts]
    frame = [r for r in rects(zone, rx='1', fill='#0a1013')]
    if not frame:
        return 'подложки поля нет'
    fx, fy, fw, fh = frame[0][:4]
    left, right = min(xs) - fx, fx + fw - max(xs)
    top, bot = min(ys) - fy, fy + fh - max(ys)
    return (abs(left - right) < 0.6 and abs(top - bot) < 0.6) or \
        f'поля: слева {left:.1f} справа {right:.1f}, сверху {top:.1f} снизу {bot:.1f}'


@check('D2', 'надпись INSTALL не лежит на поле контактов')
def d2():
    zone = _socket_zone()
    m = re.search(r'<text x="([\d.]+)" y="([\d.]+)"[^>]*>INSTALL</text>', zone)
    if not m:
        return 'надписи INSTALL нет'
    ty = float(m.group(2))
    field = [r for r in rects(zone, rx='1', fill='#0a1013')]
    fy, fh = field[0][1], field[0][3]
    return not (fy - 6 < ty < fy + fh + 6) or f'INSTALL на {ty}, поле {fy}..{fy + fh}'


@check('D3', 'метки ключа на сокете и на процессоре в одном углу')
def d3():
    zone = _socket_zone()
    tri = re.findall(r'<path d="M([\d.-]+) ([\d.-]+) l[^"]*z" fill="rgba\((?:238,232,213|147,161,161)', zone)
    if len(tri) != 2:
        return f'треугольников найдено: {len(tri)}'
    (x1, y1), (x2, y2) = ((float(a), float(b)) for a, b in tri)
    return (abs(x1 - x2) < 40 and abs(y1 - y2) < 40) or f'метки в {x1},{y1} и {x2},{y2}'


@check('D4', 'номера болтов не лежат на внутренней рамке')
def d4():
    from board.geom import SOCKET_H, SOCKET_W, X_SOCK, Y_CPU0
    zone = _socket_zone()
    nums = [(x, y) for x, y, t, d in texts(zone) if t in '1234' and len(t) == 1]
    if len(nums) != 4:
        return f'номеров болтов: {len(nums)}'
    inner = (X_SOCK + 14, Y_CPU0 + 14, SOCKET_W - 28, SOCKET_H - 28)
    bad = [(x, y) for x, y in nums
           if inner[0] - 5 < x < inner[0] + inner[2] + 5 and inner[1] - 5 < y < inner[1] + inner[3] + 5]
    return not bad or f'на рамке: {bad}'


@check('D5', 'держатель сокета виден всегда, а не только на снятом процессоре')
def d5():
    zone = _socket_zone()
    holder = zone.find('class="ilm-frame"')
    if holder < 0:
        return 'держатель не отделён от поля контактов'
    return 'ilm-frame' not in CSS or 'держатель всё ещё гасится стилями'


@check('D6', 'у крышки нет боковых вырезов, срез угла — на подложке')
def d6():
    zone = _socket_zone()
    if 'a9 9 0 0 0' in zone:
        return 'полукруглые вырезы остались'
    sub = re.search(r'<path d="M([\d.]+) ([\d.]+) H[\d.]+ V[\d.]+ H[\d.]+ V[\d.]+ Z" fill="#10261f"', zone)
    return bool(sub) or 'подложка со срезом не найдена'


@check('D7', 'пунктирные рамки лежат под процессором')
def d7():
    return BOARD.find('block-frame') < BOARD.find('data-unit="cpu0"') or 'рамки идут после процессора'


@check('D9', 'радиатор и процессор разлетаются по диагонали')
def d9():
    hs = re.search(r'\.cpu-slot\.pulled \.heatsink \{ transform: translate\((-?\d+)px, (-?\d+)px\)', CSS)
    lid = re.search(r'\.cpu-slot\.opened \.cpu-lid \{ transform: translate\((-?\d+)px, (-?\d+)px\)', CSS)
    if not hs or not lid:
        return 'правил разлёта нет'
    hx, hy = int(hs.group(1)), int(hs.group(2))
    lx, ly = int(lid.group(1)), int(lid.group(2))
    return (hx > 0 > hy and lx < 0 < ly) or f'радиатор {hx},{hy}; процессор {lx},{ly}'


@check('D10', 'клеймо изготовителя вынесено в переменную и стоит везде одинаково')
def d10():
    from board.spec import MADE
    if 'MADE' not in (ROOT / 'tools/board/spec.py').read_text(encoding='utf-8'):
        return 'клейма нет в паспорте'
    hits = BOARD.count(MADE)
    return hits >= 3 or f'клеймо встречается {hits} раз'


# ── E. Память ────────────────────────────────────────────────────────────

def _dimm_chips():
    """Чипы одной плашки: (x, ширина), слева направо."""
    from board.geom import SLOT_H, X_CORE, Y_BANK_L
    band = BOARD[BOARD.find('data-dimm="L0"'):]
    band = band[:band.find('data-dimm="L1"')]
    return sorted((r[0], r[2]) for r in rects(band, fill='#0d1519')
                  if abs(r[3] - (SLOT_H - 8)) < 0.1)


@check('E1', 'чипы чередуются, первый слева — узкий')
def e1():
    chips = _dimm_chips()
    if len(chips) < 4:
        return f'чипов на плашке: {len(chips)}'
    widths = [w for _, w in chips]
    if widths[0] >= widths[1]:
        return f'первый чип не узкий: {widths[:2]}'
    swaps = sum(1 for a, b in zip(widths, widths[1:]) if (a < b) != (widths[0] < widths[1]) or a == b)
    alt = all((widths[k] < widths[k + 1]) != (widths[k + 1] < widths[k + 2] if k + 2 < len(widths) else False)
              for k in range(len(widths) - 2))
    return alt or f'ряд не чередуется: {widths}'


@check('E2', 'синяя полоса модуля темнее прежней')
def e2():
    from board.geom import Y_BANK_L
    band = BOARD[BOARD.find('data-dimm="L0"'):]
    band = band[:band.find('data-dimm="L1"')]
    old = ('#3f7d76', '#397169')
    return not any(c in band for c in old) or 'полоса осталась прежнего тона'


@check('E3', 'плашки выше, но банк не вышел за текстолит')
def e3():
    from board.geom import BANK_N, H, PITCH, SLOT_H, Y_BANK_R
    if SLOT_H <= 15:
        return f'высота плашки прежняя: {SLOT_H}'
    end = Y_BANK_R + (BANK_N - 1) * PITCH + SLOT_H
    return end <= H - 18 or f'правый банк кончается на {end} при кромке {H - 18}'


@check('E4', 'на широких чипах есть гравировка')
def e4():
    marks = [t for x, y, t, d in texts(BOARD) if d.get('font-size') == '3.4']
    return len(marks) >= 24 * 2 or f'подписей на чипах: {len(marks)}'


@check('E5', 'слева пробор с обвязкой, ключ сокета смещён вправо')
def e5():
    from board.geom import DIMM_SOCK_W, X_CORE
    band = BOARD[BOARD.find('data-dimm="L0"'):]
    band = band[:band.find('data-dimm="L1"')]
    parting = [r for r in rects(band, fill='#0b1418')]
    if not parting:
        return 'пробора на модуле нет'
    keys = [r for r in rects(band, fill='#0f1a20')]
    if not keys:
        return 'ключа в сокете нет'
    at = (keys[0][0] - (X_CORE - 2)) / DIMM_SOCK_W
    return (parting[0][0] < X_CORE + 40 and at > 0.55) or f'пробор {parting[0][0]}, ключ на {at:.2f}'


@check('E6', 'контакты сокета стали плотнее')
def e6():
    band = BOARD[BOARD.find('data-dimm="L0"'):]
    band = band[:band.find('data-dimm="L1"')]
    xs = sorted({float(m.group(1)) for m in
                 re.finditer(r'<line x1="([\d.]+)"[^>]*stroke="rgba\(206,168,58,0.62\)"', band)})
    if len(xs) < 20:
        return f'контактов найдено: {len(xs)}'
    step = min(round(b - a, 2) for a, b in zip(xs, xs[1:]))
    return step <= 4 or f'шаг контактов {step}'


@check('E7', 'рамка банка не рисуется поверх плашек')
def e7():
    return BOARD.find('block-frame') < BOARD.find('class="pick dimm"') or 'рамка идёт после памяти'


@check('E8', 'слоты подписаны буквами каналов')
def e8():
    # Только подписи самих слотов: обозначение тестовой точки DIMM_CPU0_A0 —
    # это позиция на текстолите, а не слот.
    labels = [t for x, y, t, d in texts(BOARD) if re.match(r'DIMM[ _]', t)
              and '_' not in t]
    if len(labels) != 24:
        return f'подписей слотов: {len(labels)}'
    bad = [t for t in labels if not re.fullmatch(r'DIMM [A-L]', t)]
    return not bad or f'не буквенные: {bad[:3]}'


@check('E9', 'на наклейке модуля есть штрих-код и паспортная строка')
def e9():
    from board.spec import DIMM
    want = f"{DIMM['size_gb']}GB {DIMM['kind'].split()[0]} {DIMM['ranks']}"
    if BOARD.count(f'>{want}</text>') != 24:
        return f'строк паспорта на модулях: {BOARD.count(f">{want}</text>")}'
    band = BOARD[BOARD.find('data-dimm="L0"'):]
    band = band[:band.find('data-dimm="L1"')]
    bars = [r for r in rects(band, fill='rgba(10,20,23,0.72)')]
    return len(bars) >= 10 or f'штрихов в коде: {len(bars)}'


@check('E10', 'партномер банка — в углу напротив заголовка рамки')
def e10():
    from board.geom import BANK_N, DIMM_SOCK_W, PITCH, SLOT_H, X_CORE, Y_BANK_L
    pn = [(x, y) for x, y, t, d in texts(BOARD)
          if t.startswith('P/N') and d.get('text-anchor') == 'end']
    mine = [(x, y) for x, y in pn if abs(x - (X_CORE + DIMM_SOCK_W)) < 0.1]
    if len(mine) != 3:
        return f'партномеров у банков: {len(mine)}'
    y = min(y for _, y in mine)
    return abs(y - (Y_BANK_L + (BANK_N - 1) * PITCH + SLOT_H + 2)) < 0.1 or f'стоит на {y}'


@check('E11', 'наведение начинает вынимать плашку, но не до конца')
def e11():
    m = re.search(r'\.dimm:hover:not\(\.pulled\) \.latch-l \{ transform: rotate\(([-\d.]+)deg\)', CSS)
    full = re.search(r'\.dimm\.pulled \.latch-l \{ transform: rotate\(([-\d.]+)deg\)', CSS)
    if not m or not full:
        return 'правил наведения или полного размаха нет'
    return abs(float(m.group(1))) < abs(float(full.group(1))) or 'наведение открывает лепестки до конца'


# ── F. Рейзеры ───────────────────────────────────────────────────────────

@check('F4', 'пустой слот подписан Empty, а не Free')
def f4():
    labels = [t for x, y, t, d in texts(BOARD)]
    if any('FREE' in t.upper() for t in labels):
        return 'надпись FREE осталась'
    return any('EMPTY' in t.upper() for t in labels) or 'нет надписи EMPTY'


# ── F. Рейзеры ───────────────────────────────────────────────────────────

@check('F1', 'райзер выезжает на всю длину ножки')
def f1():
    m = re.search(r'\.riser\.pulled \.pick-body \{ transform: translateX\((\d+)px\)', CSS)
    if not m:
        return 'правила выезда райзера нет'
    return int(m.group(1)) >= 100 or f'ход всего {m.group(1)}'


@check('F2', 'встроенные интерфейсы снимаются назад, а не вверх')
def f2():
    m = re.search(r'\.pick\[data-unit="eth"\]\.pulled \.pick-body \{ transform: (\w+)\(', CSS)
    return (m and m.group(1) == 'translateX') or f'ход: {m and m.group(1)}'


@check('F5', 'у райзера тугая длинная кривая, а не щелчок')
def f5():
    return ('.riser .pick-body { transition: transform var(--drag); }' in CSS
            or 'кривая райзера не --drag')


# ── G. Блоки питания ─────────────────────────────────────────────────────

@check('G1', 'лепесток блока гнётся при вытаскивании')
def g1():
    return ('.rig.service .psu.pulled .psu-latch' in CSS) or 'лепесток неподвижен'


@check('G2', 'лепесток не заходит на скобу')
def g2():
    # Скоба начинается на X_REAR+292 и идёт вниз от mid-30; лепесток обязан
    # кончиться выше её верхней оси.
    lat = [float(m.group(1)) for m in re.finditer(r'<path d="M1286 (\d+(?:\.\d+)?) h34', BOARD)]
    if len(lat) != 2:
        return f'лепестков найдено: {len(lat)}'
    bails = [float(m.group(1)) for m in re.finditer(r'<path d="M1296 (\d+(?:\.\d+)?) h30 a15', BOARD)]
    if len(bails) != 2:
        return f'скоб найдено: {len(bails)}'
    for ly, by in zip(sorted(lat), sorted(bails)):
        if ly + 16 > by:
            return f'лепесток на {ly} перекрывает скобу на {by}'
    return True


@check('G3', 'блоки питания одинаковые, без зеркала')
def g3():
    from board.geom import PSU_Y
    fans = sorted(float(m.group(1)) for m in re.finditer(r'<rect x="1242" y="(\d+(?:\.\d+)?)" width="58" height="58"', BOARD))
    if len(fans) != 2:
        return f'вентиляторов в блоках: {len(fans)}'
    off = [round(fy - y, 1) for fy, y in zip(fans, sorted(PSU_Y))]
    return off[0] == off[1] or f'вентиляторы стоят по-разному: {off}'


@check('G4', 'блок садится в два приёма')
def g4():
    return 'seatPsu var(--press-two)' in CSS or 'посадка блока не двухступенчатая'


@check('G5', 'карман блока — прямые углы')
def g5():
    pockets = [m.group(0) for m in re.finditer(r'<rect x="998" y="\d+" width="312" height="157"[^>]*>', BOARD)]
    if len(pockets) != 2:
        return f'карманов найдено: {len(pockets)}'
    bad = [p for p in pockets if 'rx=' in p]
    return not bad or f'скруглённых карманов: {len(bad)}'


# ── H. Диски ─────────────────────────────────────────────────────────────

@check('H1', 'накопитель выезжает, а не проявляется')
def h1():
    if re.search(r'\.drive-body \{\s*fill-opacity: 0', CSS):
        return 'диск всё ещё проявляется прозрачностью'
    if '.drive-body { transition: transform var(--drag); }' not in CSS:
        return 'у диска нет своего хода'
    return BOARD.count('clip-path="url(#bay-out-') == 8 or 'отсечений по устью не восемь'


@check('H4', 'у вынутого каддика ручка остаётся откинутой')
def h4():
    m = re.search(r'\.bay\.pulled \.bay-handle,\s*\.rig\.service \.blank\.pulled \.bay-handle \{ transform: ([^;]+);', CSS)
    return (m and m.group(1).strip() != 'none') or f'ручка возвращается: {m and m.group(1)}'


@check('H5', 'на заглушке нет надписи Filler')
def h5():
    return not [t for x, y, t, d in texts(BOARD) if 'FILLER' in t.upper()] or 'надпись FILLER осталась'


# ── I. Вентиляторы ───────────────────────────────────────────────────────

@check('I1', 'корпус модуля скруглён, площадка — нет')
def i1():
    from board.geom import FAN_W, X_FAN
    body = [r for r in rects(BOARD, fill='#0b1215') if abs(r[0] - (X_FAN + 4)) < 0.1]
    if len(body) != 8:
        return f'корпусов найдено: {len(body)}'
    if any(r[4].get('rx', '0') in ('0', '') for r in body):
        return 'корпус остался прямоугольным'
    wall = [r for r in rects(BOARD, fill='#0f1619') if abs(r[0] - X_FAN) < 0.1 and r[2] == FAN_W]
    return (wall and wall[0][4].get('rx') == '0') or 'площадка скруглена'


@check('I2', 'шов кожуха не пересекает крыльчатки')
def i2():
    from board.geom import FAN_W, X_FAN
    seam_x = str(X_FAN + FAN_W / 2)
    seams = re.findall(rf'<line x1="{re.escape(seam_x)}" y1="([\d.]+)" x2="{re.escape(seam_x)}" y2="([\d.]+)"', BOARD)
    return len(seams) == 16 or f'отрезков шва: {len(seams)} (ожидались два на модуль)'


@check('I3', 'подложка стены вровень с текстолитом')
def i3():
    from board.geom import FAN_W, H, X_FAN
    wall = [r for r in rects(BOARD, fill='#0f1619') if abs(r[0] - X_FAN) < 0.1 and r[2] == FAN_W]
    if not wall:
        return 'площадки стены нет'
    x, y, w, h = wall[0][:4]
    return (y, h) == (18, H - 36) or f'стена {y}..{y + h}, плата 18..{H - 18}'


@check('I5', 'номер модуля сверху, обороты снизу, полосы не мешают')
def i5():
    from board.geom import FAN_W, X_FAN
    cx = X_FAN + FAN_W / 2
    # Только подписи самого модуля: у посадочного места номер набран восьмым
    # кеглем и лежит по его середине — он не про эту проверку.
    labels = [(y, t) for x, y, t, d in texts(BOARD)
              if abs(x - cx) < 0.1 and d.get('font-size') == '7'
              and (t.startswith('FAN') or 'RPM' in t)]
    fans = sorted(y for y, t in labels if t.startswith('FAN') and 'RPM' not in t)
    rpm = sorted(y for y, t in labels if 'RPM' in t)
    if len(fans) != 8 or len(rpm) != 8:
        return f'подписей: FAN {len(fans)}, RPM {len(rpm)}'
    return all(f < r for f, r in zip(fans, rpm)) or 'обороты оказались выше номера'


@check('I6', 'колодка на плате разведена с лампой отсека')
def i6():
    from board.geom import FAN_LAMP_DY
    return FAN_LAMP_DY >= 14 or f'разнесены всего на {FAN_LAMP_DY}'


# ── K. Корпус ────────────────────────────────────────────────────────────

@check('K8', 'уши и штыри стойки уходят под корпус')
def k8():
    body = BOARD.find('<rect x="4" y="4" width="1306" height="855"')
    ear = BOARD.find('class="decor rack-ear"')
    rail = BOARD.find('class="decor rack-rail"')
    if -1 in (body, ear, rail):
        return f'не нашлось: корпус {body}, ухо {ear}, штырь {rail}'
    return (ear < body and rail < body) or 'крепёж нарисован поверх корпуса'


# ── J. Плата ─────────────────────────────────────────────────────────────

def _out_of_board():
    """Фигуры, вылезшие за кромку текстолита в его же поле по X."""
    from board.geom import H
    out = []
    for m in re.finditer(r'<(circle|rect|text)\b([^>]*)>', BOARD):
        attrs = m.group(2)
        ys = [float(v.group(1)) for k in ('cy', 'y', 'y1', 'y2')
              for v in [re.search(rf'\b{k}="(-?[\d.]+)"', attrs)] if v]
        xs = [float(v.group(1)) for k in ('cx', 'x', 'x1', 'x2')
              for v in [re.search(rf'\b{k}="(-?[\d.]+)"', attrs)] if v]
        if not ys or not xs or not (346 <= min(xs) <= 1000):
            continue
        if min(ys) < 17 or max(ys) > 846:
            g = BOARD.rfind('<g class="', 0, m.start())
            cls = re.search(r'<g class="([^"]*)"', BOARD[g:g + 80])
            out.append((m.group(1), cls.group(1) if cls else '?'))
    return out


@check('J1', 'рассыпуха и шелкография не выходят за кромку текстолита')
def j1():
    # Штыри салазок стоят на боковинах шасси и обязаны быть снаружи, медь
    # обрезана контуром платы — обе группы к этой проверке не относятся.
    stray = [t for t in _out_of_board() if 'rack-rail' not in t[1] and 'vias' not in t[1]
             and 'psu-bay' not in t[1]]
    return len(stray) <= 2 or f'за кромкой: {stray[:5]}'


@check('J2', 'медь разведена, а не слеплена кучками')
def j2():
    pts = [(float(m.group(1)), float(m.group(2))) for m in re.finditer(
        r'<circle cx="(-?\d+)" cy="(-?\d+)" r="1.6" fill="none" stroke="rgba\(184,115,51', BOARD)]
    if len(pts) < 200:
        return f'переходных отверстий всего {len(pts)}'
    # Ни одна ячейка сетки не должна собирать больше двух отверстий: контур
    # вокруг блока идёт с шагом девять и одну пару в ячейку даёт законно.
    cells = {}
    for x, y in pts:
        cells[(x // 12, y // 12)] = cells.get((x // 12, y // 12), 0) + 1
    worst = max(cells.values())
    # Четыре — это пересечение двух контуров вокруг соседних блоков: медь
    # обходит каждый своим кольцом, и в углу кольца встречаются. Пять и больше
    # бывает только у кучки.
    return worst <= 4 or f'в одной ячейке {worst} отверстий'


@check('J3', 'болта над верхним банком памяти нет, нижний на месте')
def j3():
    from board.geom import H
    holes = [(float(m.group(1)), float(m.group(2))) for m in re.finditer(
        r'<circle cx="(\d+)" cy="(\d+)" r="10.5"', BOARD)]
    top = [h for h in holes if abs(h[0] - 740) < 1 and h[1] < 100]
    bot = [h for h in holes if abs(h[0] - 740) < 1 and h[1] > 700]
    if top:
        return 'верхний болт остался'
    return bool(bot) or 'нижнего болта нет'


@check('J4', 'пунктир рамки прерывается под её заголовком')
def j4():
    m = re.search(r'<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="10" rx="1" '
                  r'fill="(rgba\([^"]*\)|none)" stroke="rgba\(232,227,213,0.24\)"', BOARD)
    if not m:
        return 'плашки заголовка не найдено'
    return m.group(1) != 'none' or 'заголовок без подложки: пунктир виден насквозь'


@check('J5', 'обозначения в рамках читаются поверх разводки')
def j5():
    # Только плашки обозначений: у них высота в кегль с полями, стенка тонкая
    # и своего цвета. Рамка таблицы перемычек рисуется тем же rx, но она в
    # восемьдесят единиц высотой и обозначением не является.
    boxed = [m.group(2) for m in re.finditer(
        r'<rect x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="(\d+(?:\.\d+)?)" rx="1" '
        r'fill="(none|rgba\(5,20,24[^"]*)" stroke="rgba\(232,227,213', BOARD)
        if float(m.group(1)) <= 20]
    if not boxed:
        return 'обозначений в рамках нет'
    empty = [b for b in boxed if b == 'none']
    return not empty or f'без подложки: {len(empty)} из {len(boxed)}'


@check('J6', 'подпись BMC не спорит с шелкографией слота райзера')
def j6():
    def at(text):
        m = re.search(rf'<text x="([\d.]+)" y="([\d.]+)"[^>]*>{re.escape(text)}</text>', BOARD)
        return m and (float(m.group(1)), float(m.group(2)))
    bmc, riser = at('BMC'), at('RISER_1 · PCIE_G5 ×16')
    if not bmc or not riser:
        return f'не найдено: BMC {bmc}, слот {riser}'
    return (abs(bmc[1] - riser[1]) > 12 or abs(bmc[0] - riser[0]) > 90) or \
        f'BMC {bmc}, слот {riser}'


@check('J7', 'марка изготовителя набрана тремя строками и стала крупнее')
def j7():
    from board.geom import IO_FREE
    zone = BOARD[BOARD.find('class="silk-mark"'):]
    zone = zone[:zone.find('</a>')]
    lines = [t for _x, _y, t, _d in texts(zone)]
    if len(lines) != 3:
        return f'строк в марке: {len(lines)}'
    if 'COSMDANDY' not in lines[1]:
        return f'посередине не имя: {lines[1]}'
    if not lines[0].startswith('DUAL') or 'REV' not in lines[2]:
        return f'порядок строк: {lines}'
    size = float(re.search(r'class="silk-name"[^>]*font-size="([\d.]+)"', zone).group(1))
    return size >= 24 or f'кегль имени {size}'


@check('J8', 'марка — ссылка с переливом, и только в сервисном режиме')
def j8():
    if 'class="silk-mark" href=' not in BOARD:
        return 'марка не ссылка'
    if '.silk-mark { pointer-events: none; }' not in CSS:
        return 'марка кликается вне сервисного режима'
    return ('silkShine' in CSS and '.silk-rule' in CSS) or 'нет перелива или подчёркивания'


# ── K. Передняя панель и Light Path ──────────────────────────────────────

@check('K1', 'кнопка питания стала мельче и стоит по центру плашки')
def k1():
    from board.geom import X_FRONT
    ring = [m for m in re.finditer(r'<circle cx="([\d.]+)" cy="50" r="(\d+)" fill="#0f1619"', BOARD)]
    if not ring:
        return 'кнопки питания нет'
    cx, r = float(ring[0].group(1)), int(ring[0].group(2))
    if r >= 21:
        return f'радиус прежний: {r}'
    mod = [x for x in rects(BOARD, fill='#151d21') if abs(x[0] - (X_FRONT + 90)) < 0.1]
    if not mod:
        return 'плашки питания нет'
    return abs(cx - (mod[0][0] + mod[0][2] / 2)) < 0.6 or f'кнопка на {cx}, середина плашки {mod[0][0] + mod[0][2] / 2}'


@check('K2', 'у панели диагностики появился зазор слева')
def k2():
    from board.geom import X_FRONT
    tab = re.search(r'<rect x="([\d.]+)" y="20" width="([\d.]+)" height="150" rx="2" fill="#0f1619"', BOARD)
    if not tab:
        return 'лицевой панели не найдено'
    gap = float(tab.group(1)) - (X_FRONT + 4)
    return gap >= 3 or f'зазор всего {gap}'


@check('K3', 'на панели только те лампы, которым есть от чего гореть')
def k3():
    from board.blocks import lightpath
    keys = {k for _, k in lightpath.LAMPS}
    drawn = set(re.findall(r'class="lp lp-([a-z-]+)"', BOARD))
    if drawn != keys:
        return f'нарисовано {sorted(drawn - keys)}, объявлено {sorted(keys - drawn)}'
    dead = {'pci', 'sp', 'nmi', 'raid'} & drawn
    if dead:
        return f'остались лампы без причины: {sorted(dead)}'
    lit = set(re.findall(r'\.lp-([a-z-]+)', CSS))
    silent = keys - lit
    return silent <= {'over-spec', 'vrm', 'temp'} or f'ничем не зажигаются: {sorted(silent)}'


@check('K4', 'контрольный индикатор — зелёный семисегментник, коды бегут')
def k4():
    segs = re.findall(r'class="seg seg-(\d)([a-g])"', BOARD)
    if len(segs) != 14:
        return f'сегментов найдено: {len(segs)}'
    if '.seg { fill: #859900' not in CSS:
        return 'индикатор не зелёный'
    return ('POST_CODES' in JS and 'runCheckpoint' in JS) or 'коды не крутятся'


@check('K5', 'кнопка сброса крупнее, в красной рамке и гасит защёлку')
def k5():
    m = re.search(r'<circle cx="[\d.-]+" cy="\d+" r="(\d+)" fill="#171f23" stroke="#dc322f"', BOARD)
    if not m:
        return 'кнопки сброса в красной рамке нет'
    if int(m.group(1)) <= 6:
        return f'радиус прежний: {m.group(1)}'
    return ('fault-latched' in JS and 'reset refused' in JS) or 'сброс ничего не гасит'


@check('K6', 'лампы панели с гнездом и ореолом')
def k6():
    halo = len(re.findall(r'class="lp lp-[a-z-]+ halo"', BOARD))
    from board.blocks import lightpath
    return halo == len(lightpath.LAMPS) or f'ореолов: {halo} из {len(lightpath.LAMPS)}'


@check('K7', 'заголовок панели набран двумя весами')
def k7():
    m = re.search(r'font-weight="300"[^>]*>Light Path <tspan font-weight="700"', BOARD)
    return bool(m) or 'заголовок одним весом'


# ── Физика ───────────────────────────────────────────────────────────────

@check('M5', 'у узлов разные характеры движения, а не одна кривая')
def m5():
    want = ('--drag:', '--snap:', '--heave:', '--latch-throw:', '--lever:', '--press-two:')
    missing = [w for w in want if w not in CSS]
    if missing:
        return f'нет кривых: {missing}'
    used = {c: CSS.count(f'var({c[:-1]})') for c in want}
    dead = [c for c, n in used.items() if n == 0]
    return not dead or f'кривые объявлены, но не применены: {dead}'


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ''
    rows = [c for c in CHECKS if c[0].startswith(only)]
    bad = 0
    for code, what, fn in rows:
        try:
            got = fn()
        except Exception as exc:                     # noqa: BLE001 — печатаем как отказ
            got = f'{type(exc).__name__}: {exc}'
        ok = got is True
        bad += not ok
        print(f'  {"·" if ok else "СЛОМАНО"} {code} {what}' + ('' if ok else f' → {got}'))
    print('всё сходится' if not bad else f'не сошлось: {bad} из {len(rows)}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
