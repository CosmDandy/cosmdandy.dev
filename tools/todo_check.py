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
    labels = [t for x, y, t, d in texts(BOARD) if t.startswith('DIMM')]
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
    mine = [(x, y) for x, y in pn if abs(x - (X_CORE + DIMM_SOCK_W + 4)) < 0.1]
    if len(mine) != 3:
        return f'партномеров у банков: {len(mine)}'
    y = min(y for _, y in mine)
    return abs(y - (Y_BANK_L + (BANK_N - 1) * PITCH + SLOT_H + 8)) < 0.1 or f'стоит на {y}'


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
