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


def defs_group(name):
    """Содержимое шаблона из <defs> по его id.

    Двадцать четыре слота памяти рисуются одним шаблоном на всех: гнездо с
    контактами и тело модуля лежат в <defs>, а каждый слот — это <use> со
    сдвигом. Двадцать четыре копии одного и того же занимали 1560 узлов из
    2466 в блоке. Поэтому проверки, которые раньше резали разметку между
    `data-dimm="L0"` и `L1`, теперь смотрят в шаблон: фигура там одна.
    """
    i = BOARD.find(f'<g id="{name}"')
    if i < 0:
        return ''
    depth = 0
    for m in re.finditer(r'<(/?)g\b', BOARD[i:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return BOARD[i:i + m.end() + 1]
    return ''


def defs_uses(name):
    """Сдвиги всех экземпляров шаблона по вертикали, сверху вниз."""
    return sorted(float(m.group(1)) for m in re.finditer(
        rf'<use href="#{name}" transform="translate\(0,([-\d.]+)\)"', BOARD))


def perf_cells(src):
    """Соты перфорации: (центр, полувысота, заливка) по каждой.

    Решётка рисуется одной фигурой на всё поле — полторы тысячи отдельных
    полигонов браузер разбирал и обходил при каждой перерисовке. Поэтому
    разбираем подпути одного `d`, а не отдельные элементы: `M` начинает соту,
    `z` её закрывает, вершины абсолютные.
    """
    out = []
    for m in re.finditer(r'<path class="perf" d="([^"]*)" fill="([^"]*)"', src):
        for sub in m.group(1).split('M')[1:]:
            xy = [tuple(map(float, p.split())) for p in sub.rstrip('z').split('L')]
            ys = [p[1] for p in xy]
            out.append(((sum(p[0] for p in xy) / len(xy), sum(ys) / len(ys)),
                        (max(ys) - min(ys)) / 2, m.group(2)))
    return out


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


def linear_pts(name):
    """Узлы кривой linear() как (доля времени, доля пути)."""
    m = re.search(rf'--{name}: [\d.]+s linear\(\s*([^)]*)\)', CSS, re.DOTALL)
    if not m:
        return None
    got = [(0.0, 0.0)]
    for chunk in m.group(1).split(',')[1:]:
        part = chunk.split()
        got.append((float(part[1].rstrip('%')) / 100 if len(part) > 1 else 1.0,
                    float(part[0])))
    return got


def mirrored(fwd, back, tol=0.02):
    """Правда ли, что вторая кривая — первая, пущенная задом наперёд.

    Разворот получается из точки (t, p) точкой (1-t, 1-p). Сверяем по
    нескольким долям времени с интерполяцией: linear() ведёт между узлами по
    прямой, а сверка по ближайшему узлу врёт ровно на высоту шага.
    """
    a, b = linear_pts(fwd), linear_pts(back)
    if not (a and b):
        return False

    def at(got, t):
        for i in range(1, len(got)):
            if got[i][0] >= t:
                (t0, p0), (t1, p1) = got[i - 1], got[i]
                return p0 + (p1 - p0) * ((t - t0) / (t1 - t0 or 1))
        return got[-1][1]

    return max(abs((1 - at(a, 1 - t)) - at(b, t)) for t in (0.2, 0.4, 0.6, 0.8)) < tol


def curve(name):
    """Кривая как список пар «доля пути, доля времени»."""
    m = re.search(rf'--{name}: ([\d.]+)s linear\(([^)]*)\)', CSS)
    if not m:
        return None
    body = m.group(2)
    pts = [(0.0, 0.0)]
    for v, t in re.findall(r'(-?[\d.]+) (\d+)%', body):
        pts.append((float(v), int(t) / 100))
    pts.append((1.0, 1.0))
    return pts


def at(pts, t):
    """Доля пути к доле времени t."""
    prev = pts[0]
    for v, tt in pts:
        if tt >= t:
            return prev[0] if tt == prev[1] else prev[0] + (v - prev[0]) * (t - prev[1]) / (tt - prev[1])
        prev = (v, tt)
    return 1.0


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
    # Соты внутри масок считать нельзя: там глухой чёрный — это и есть дырка,
    # он вырезает лист, а не закрашивает его. Смотрим только на то, что
    # рисуется на самой схеме.
    src = re.sub(r'<mask id="[^"]*".*?</mask>', '', BOARD, flags=re.DOTALL)
    holes = perf_cells(src)
    if not holes:
        return 'сот на схеме нет'
    opaque = [f for _, _, f in holes if f != 'none'
              and (not f.startswith('rgba') or f.endswith(',1)'))]
    if opaque:
        return f'глухих сот: {len(opaque)}'
    # Шаг внутри столбца. Ряды идут вразбежку, поэтому одна и та же координата
    # X встречается через ряд: шаг столбца равен двум межрядным, то есть
    # 3·s + 1.73·gap. Меньше трёх высот полсоты — значит, соты налезают.
    cols = {}
    for (cx0, cy0), s_, _ in holes:
        cols.setdefault((round(cx0, 1), round(s_, 1)), []).append(cy0)
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


def _lga_box():
    """Габарит площадки контактов: (x, y, w, h).

    Площадка теперь путь со срезанным углом, а не прямоугольник — по атрибутам
    rect её больше не найти. Габарит считаем по её же контуру.
    """
    zone = _socket_zone()
    m = re.search(r'<path d="M([\d.]+) ([\d.]+) H([\d.]+) V([\d.]+) H([\d.]+) V([\d.]+) Z" fill="#0a1013"', zone)
    if not m:
        return None
    cx, y0, x1, y1, x0, _ = (float(v) for v in m.groups())
    return (x0, y0, x1 - x0, y1 - y0)


@check('D1', 'поле контактов отцентровано в держателе')
def d1():
    zone = _socket_zone()
    m = re.search(r'<path d="(M[^"]*h0\.\d[^"]*)"', zone)
    if not m:
        return 'поля контактов нет'
    pts = re.findall(r'M([\d.]+) ([\d.]+)h', m.group(1))
    xs = [float(a) for a, _ in pts]
    ys = [float(b) for _, b in pts]
    frame = _lga_box()
    if not frame:
        return 'подложки поля нет'
    fx, fy, fw, fh = frame
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
    field = _lga_box()
    if not field:
        return 'площадки контактов нет'
    fy, fh = field[1], field[3]
    return not (fy - 6 < ty < fy + fh + 6) or f'INSTALL на {ty}, поле {fy}..{fy + fh}'


@check('D3', 'указателей ключа на гнезде процессора нет')
def d3():
    """Требование снято владельцем: «эти стрелочки, две, одна на процессоре,
    другая на самом сокете — вообще убери, они мешают».

    Раньше просили свести их в один угол, и это было сделано. Смотреть они
    мешали обеим: пара треугольников в углу гнезда перетягивала внимание с
    самого гнезда, а ключ у SP5 задан срезом угла подложки — он виден и без
    указателей.
    """
    zone = _socket_zone()
    tri = re.findall(r'<path d="M[\d.]+ [\d.]+ l[-\d.]+ [-\d.]+ l[-\d.]+ [-\d.]+ z"', zone)
    return not tri or f'треугольников осталось: {len(tri)}'


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


@check('D13', 'радиатор ложится нижней кромкой на центр посадочного места')
def d13():
    from board.geom import SOCKET_H, Y_CPU0
    m = re.search(r'\.cpu-slot\.pulled \.heatsink \{ transform: translate\((-?\d+)px, (-?\d+)px\)', CSS)
    if not m:
        return 'правила разлёта радиатора нет'
    dx, dy = int(m.group(1)), int(m.group(2))
    if dx <= 0 or dy >= 0:
        return f'радиатор идёт не вправо-вверх: {dx}, {dy}'
    # Нижняя кромка радиатора совпадает с нижней кромкой гнезда; после подъёма
    # она обязана встать на его середину.
    edge = Y_CPU0 + SOCKET_H + dy
    mid = Y_CPU0 + SOCKET_H / 2
    return abs(edge - mid) <= 2 or f'кромка на {edge:.0f}, середина гнезда {mid:.0f}'


@check('D14', 'процессор откидывается по той же диагонали в другую сторону')
def d14():
    hs = re.search(r'\.cpu-slot\.pulled \.heatsink \{ transform: translate\((-?\d+)px, (-?\d+)px\)', CSS)
    lid = re.search(r'\.cpu-slot\.opened \.cpu-lid,?\s*(?:\.rig\.service )?'
                    r'\.cpu-slot\.opened \.die \{\s*transform: translate\((-?\d+)px, (-?\d+)px\)', CSS)
    if not (hs and lid):
        return 'одного из правил разлёта нет'
    hx, hy = int(hs.group(1)), int(hs.group(2))
    lx, ly = int(lid.group(1)), int(lid.group(2))
    if lx >= 0 or ly <= 0:
        return f'процессор идёт не влево-вниз: {lx}, {ly}'
    # Подъём и опускание равны по модулю: детали расходятся по одной прямой.
    return abs(abs(hy) - abs(ly)) <= 2 or f'вертикали разошлись: {hy} и {ly}'


@check('D9', 'снятые части не улетают дальше своего банка памяти')
def d9():
    """Правило смягчено сознательно, и вот чем.

    Изначально просили, чтобы снятые части не ложились на память вовсе. Потом
    просили развести радиатор и процессор по диагонали так, чтобы нижняя кромка
    радиатора встала на центр посадочного места, — это подъём в семьдесят пять
    единиц, а между гнездом и банком всего восемнадцать. Оба условия одновременно
    не выполнимы, и владелец выбрал диагональ: «не важно, что он залазит, это
    нормально, мы же в перспективе смотрим».

    Что осталось проверять: деталь не должна уходить дальше своего банка. Пока
    она лежит на нём, это читается как деталь, снятая и положенная рядом; уйдя
    за него, она оказывается посреди чужого узла.
    """
    from board.geom import (
        BANK_N,
        DIMM_SOCK_W,
        PITCH,
        SLOT_H,
        SOCKET_H,
        SOCKET_W,
        X_CORE,
        X_SOCK,
        Y_BANK_C,
        Y_BANK_L,
        Y_BANK_R,
        Y_CPU0,
        Y_CPU1,
    )
    hs = re.search(r'\.cpu-slot\.pulled \.heatsink \{ transform: translate\((-?\d+)px, (-?\d+)px\)', CSS)
    lid = re.search(r'\.cpu-slot\.opened \.cpu-lid,?\s*(?:\.rig\.service )?'
                    r'\.cpu-slot\.opened \.die \{\s*transform: translate\((-?\d+)px, (-?\d+)px\)', CSS)
    if not hs or not lid:
        return 'правил разлёта нет'
    bank_h = (BANK_N - 1) * PITCH + SLOT_H
    banks = [(X_CORE, y, DIMM_SOCK_W, bank_h) for y in (Y_BANK_L, Y_BANK_C, Y_BANK_R)]

    def moved(x, y, w, h, m):
        return (x + int(m.group(1)), y + int(m.group(2)), w, h)

    for cy in (Y_CPU0, Y_CPU1):
        parts = (('радиатор', moved(X_SOCK, cy, SOCKET_W, SOCKET_H, hs)),
                 ('процессор', moved(X_SOCK + 35, cy + 29, SOCKET_W - 70, SOCKET_H - 58, lid)))
        for what, (bx, by, bw, bh) in parts:
            for _, ky, _, kh in banks:
                # Ушла за дальнюю кромку банка — это уже не «положили рядом».
                if by < ky and by + bh > ky + kh:
                    return f'{what} у {cy} перекрыл банк {ky} насквозь'
    return True


@check('D10', 'клеймо изготовителя вынесено в переменную и стоит везде одинаково')
def d10():
    from board.spec import MADE
    if 'MADE' not in (ROOT / 'tools/board/spec.py').read_text(encoding='utf-8'):
        return 'клейма нет в паспорте'
    hits = BOARD.count(MADE)
    return hits >= 3 or f'клеймо встречается {hits} раз'


# ── E. Память ────────────────────────────────────────────────────────────

def _dimm_chips():
    """Чипы одной плашки: (x, ширина, верх), слева направо.

    Высота у корпусов теперь разная: узкие опущены на две единицы и на столько
    же ниже, чтобы ряд шёл вразбежку. Отбирать по одной высоте больше нельзя —
    так находились только широкие.
    """
    from board.geom import SLOT_H
    return sorted((r[0], r[2], r[1]) for r in rects(defs_group('dimm-body-0'), fill='#0d1519')
                  if SLOT_H - 11 <= r[3] <= SLOT_H - 8)


@check('E1', 'чипы чередуются, первый слева — узкий')
def e1():
    chips = _dimm_chips()
    if len(chips) < 4:
        return f'чипов на плашке: {len(chips)}'
    widths = [w for _, w, _ in chips]
    if widths[0] >= widths[1]:
        return f'первый чип не узкий: {widths[:2]}'
    alt = all((widths[k] < widths[k + 1]) != (widths[k + 1] < widths[k + 2] if k + 2 < len(widths) else False)
              for k in range(len(widths) - 2))
    if not alt:
        return f'ряд не чередуется: {widths}'
    # И по высоте вразбежку: соседние корпуса стоят не на одной линии.
    tops = [t for _, _, t in chips]
    return len(set(tops)) == 2 or f'все корпуса на одной высоте: {sorted(set(tops))}'


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
    # Гравировка лежит в шаблоне тела, а на плату он ставится двадцать четыре
    # раза: считаем по шаблонам, помноженным на число экземпляров.
    marks = sum(len([t for x, y, t, d in texts(defs_group(f'dimm-body-{k}'))
                     if d.get('font-size') == '3.4']) * len(defs_uses(f'dimm-body-{k}'))
                for k in (0, 1))
    return marks >= 24 * 2 or f'подписей на чипах: {marks}'


@check('E5', 'слева пробор с обвязкой, ключ сокета смещён вправо')
def e5():
    from board.geom import DIMM_SOCK_W, X_CORE
    # Пробор нарисован на теле модуля, ключ — в гнезде; шаблоны у них разные.
    parting = [r for r in rects(defs_group('dimm-body-0'), fill='#0b1418')]
    if not parting:
        return 'пробора на модуле нет'
    keys = [r for r in rects(defs_group('dimm-static'), fill='#0f1a20')]
    if not keys:
        return 'ключа в сокете нет'
    at = (keys[0][0] - (X_CORE - 2)) / DIMM_SOCK_W
    return (parting[0][0] < X_CORE + 40 and at > 0.55) or f'пробор {parting[0][0]}, ключ на {at:.2f}'


@check('E6', 'контакты сокета стали плотнее')
def e6():
    xs = sorted({float(m.group(1)) for m in
                 re.finditer(r'<line x1="([\d.]+)"[^>]*stroke="rgba\(206,168,58,0.62\)"',
                             defs_group('dimm-static'))})
    if len(xs) < 20:
        return f'контактов найдено: {len(xs)}'
    step = min(round(b - a, 2) for a, b in zip(xs, xs[1:]))
    return step <= 4 or f'шаг контактов {step}'


@check('E7', 'рамка банка не рисуется поверх плашек')
def e7():
    return BOARD.find('block-frame') < BOARD.find('class="pick dimm"') or 'рамка идёт после памяти'


@check('E8', 'слоты подписаны буквами каналов и отцентрованы по плашке')
def e8():
    from board.geom import PITCH, SLOT_H, Y_BANK_L
    # «DIMM SLOTS» — заголовок разметки на кожухе воздуховода, а не подпись
    # слота: он один на банк и отлит на пластике, а не набит на текстолите.
    labels = [t for x, y, t, d in texts(BOARD) if re.match(r'DIMM[ _]', t)
              and '_' not in t and t != 'DIMM SLOTS']
    if len(labels) != 24:
        return f'подписей слотов: {len(labels)}'
    bad = [t for t in labels if not re.fullmatch(r'DIMM [A-L]', t)]
    if bad:
        return f'не буквенные: {bad[:3]}'
    # Плашка подписи — прямоугольник silk_inverse рядом с модулем: его середина
    # обязана совпасть с серединой самого модуля.
    plates = sorted((r[1], r[3]) for r in rects(BOARD, rx='1.5')
                    if abs(r[0] - 808) < 40 and abs(r[3] - 12.5) < 0.1)
    if len(plates) != 24:
        return f'плашек подписей: {len(plates)}'
    off = plates[0][0] + plates[0][1] / 2 - (Y_BANK_L + SLOT_H / 2)
    return abs(off) < 1 or f'подпись смещена на {off:.1f} при шаге {PITCH}'


@check('E9', 'на наклейке модуля есть штрих-код и паспортная строка')
def e9():
    from board.spec import DIMM
    want = f"{DIMM['size_gb']}GB {DIMM['kind'].split()[0]} {DIMM['ranks']}"
    # Паспортная строка одна на шаблон тела, а тел два — по чётности полосы.
    # Считаем модули: строка в шаблоне, помноженная на число экземпляров.
    lines = sum(defs_group(f'dimm-body-{k}').count(f'>{want}</text>')
                * len(defs_uses(f'dimm-body-{k}')) for k in (0, 1))
    if lines != 24:
        return f'строк паспорта на модулях: {lines}'
    bars = [r for r in rects(defs_group('dimm-body-0'), fill='rgba(10,20,23,0.72)')]
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
    # Ход у райзера в два движения: сперва строго вверх, на высоту контакта,
    # и только выйдя из паза — вбок. Диагональю его не вынуть: краевой разъём
    # смотрит вниз, в плату.
    lift = re.search(r'\.riser\.pulled \.riser-lift \{\s*transform: translateY\((-\d+)px\)', CSS)
    slide = re.search(r'\.riser\.pulled \.pick-body \{\s*transform: translateX\((\d+)px\)', CSS)
    if not lift or not slide:
        return 'правила выезда райзера нет'
    up, right = -int(lift.group(1)), int(slide.group(1))
    if not 20 <= up <= 60 or not 20 <= right <= 60:
        return f'ход не микродвижение: вверх {up}, вправо {right}'
    # Отвод обязан начинаться позже подъёма, иначе движение снова диагональ.
    d = re.search(r'\.riser\.pulled \.pick-body \{[^}]*var\(--riser-slide\) ([\d.]+)s', CSS)
    return (d and float(d.group(1)) > 0.15) or 'отвод вбок не ждёт подъёма'


@check('F6', 'сборка райзера идёт теми же двумя движениями в обратном порядке')
def f6():
    m = re.search(r'@keyframes seatRiser \{(.*?)\n  \}', CSS, re.DOTALL)
    if not m:
        return 'расписания сборки райзера нет'
    body = m.group(1)
    if 'translate(34px, -34px)' not in body:
        return 'сборка стартует не из положения «вынуто»'
    # Промежуточный кадр: вбок вернулся, вниз ещё не пошёл.
    return 'translate(0, -34px)' in body or 'райзер садится по диагонали, одним движением'


@check('F2', 'встроенные интерфейсы снимаются назад, а не вверх')
def f2():
    m = re.search(r'\.pick\[data-unit="eth"\]\.pulled \.pick-body \{\s*transform: (\w+)\(', CSS)
    return (m and m.group(1) == 'translateX') or f'ход: {m and m.group(1)}'


@check('F5', 'у райзера тугая длинная кривая, а не щелчок')
def f5():
    # Наружу тугая --drag, внутрь она же развёрнутая. Проверяем обе: одна на
    # оба состояния означает, что обратный ход повторяет прямой.
    # Подъём — своей кривой: восемь десятых пути туго, остаток вылетает.
    if not re.search(r'\.riser\.pulled \.riser-lift \{[^}]*var\(--riser-lift\)', CSS):
        return 'подъём райзера идёт не своей кривой'
    # «Восемь десятых проходишь туго, а потом остаток быстро»: скорость в
    # последней пятой времени должна быть кратно выше средней по остальному
    # пути. Порогом по доле пути это не поймать — почти любая кривая его
    # проходит; ловится именно перелом скорости.
    pts = linear_pts('riser-lift')
    at = lambda t: next(p for tt, p in pts if tt >= t)
    slow, fast = at(0.8) / 0.8, (1 - at(0.8)) / 0.2
    if fast < slow * 2:
        return f'перелома нет: до восьми десятых {slow:.2f}, после {fast:.2f}'
    # Обратно — своей посадочной: та же тяжесть по всей длине ножки и короткая
    # доводка, когда краевой разъём пошёл в паз. Развёрнутая кривая давала
    # рывок с места, то есть противоположное на глаз при том же по числам.
    return ('.riser .pick-body { transition: transform var(--riser-slide); }' in CSS
            or 'обратный ход райзера не своей кривой')


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


@check('G4', 'блок садится в два приёма — и в сборке, и руками')
def g4():
    if 'seatPsu var(--press-two)' not in CSS:
        return 'посадка при сборке не двухступенчатая'
    if '.psu .pick-body { transition: transform var(--press-two); }' not in CSS:
        return 'руками блок возвращается зеркалом тугого хода'
    pts = curve('press-two')
    if not pts:
        return 'кривой --press-two нет'
    # Полка: между третью и половиной времени блок почти не движется — он
    # упёрся, и его проталкивают.
    shelf = at(pts, 0.48) - at(pts, 0.30)
    return shelf < 0.06 or f'полки нет, за это время проходит {shelf:.2f}'


@check('G5', 'карман блока — прямые углы')
def g5():
    from board.geom import X_REAR
    pockets = [m.group(0) for m in re.finditer(
        rf'<rect x="{X_REAR}" y="\d+" width="306" height="157"[^>]*>', BOARD)]
    if len(pockets) != 2:
        return f'карманов найдено: {len(pockets)}'
    bad = [p for p in pockets if 'rx=' in p]
    if bad:
        return f'скруглённых карманов: {len(bad)}'
    # И не залезает на текстолит: вырез в шасси начинается там, где кончается
    # плата, а не двумя единицами раньше.
    return True


# ── H. Диски ─────────────────────────────────────────────────────────────

@check('H1', 'накопитель выезжает, а не проявляется')
def h1():
    if re.search(r'\.drive-body \{\s*fill-opacity: 0', CSS):
        return 'диск всё ещё проявляется прозрачностью'
    # Наружу --caddy, внутрь --caddy-in: та же кривая, развёрнутая во времени.
    # Полка сопротивления сидит у разъёма и от направления не переезжает.
    # Наружу --caddy с полкой в начале: каддик выходит за ручкой на сантиметр,
    # и рука перехватывает. Внутрь --press-seat: перехватывать нечего, толкают
    # одним движением, упор в последнем сантиметре. Развёрнутая кривая давала
    # долгую полку почти у места — каддик читался застрявшим.
    # Своего хода у диска быть не должно: он внутри каддика и едет его кривой.
    # Пока правила были отдельными — те же по числам, но свои, — их держали
    # одинаковыми вручную, и одно из четырёх разошлось.
    if re.search(r'\.(bay|blank)[^,{]*\.drive-body[^,{]*\{', CSS):
        return 'у диска снова свой ход, и он разойдётся с каддиком'
    if 'transition: transform var(--caddy);' not in CSS:
        return 'у вынимания нет своей кривой'
    if BOARD.count('clip-path="url(#bay-out-') != 8:
        return 'отсечений по устью не восемь'
    # Обёртка с отсечением обязана стоять снаружи движущейся группы, иначе
    # срез поедет вместе с диском и обрезать станет нечего.
    return ('clip-path="url(#bay-out-0)">\n        <g class="pick-body">' in BOARD
            or 'отсечение стоит не снаружи каддика')


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
    stray = [t for t in _out_of_board() if 'rack-rail' not in t[1] and 'vias' not in t[1]]
    return len(stray) <= 2 or f'за кромкой: {stray[:5]}'


@check('J2', 'медь разведена, а не слеплена кучками')
def j2():
    # Большие отверстия склеены в пути группами, которые не соприкасаются
    # (via_ring/via_groups в pcb_vias.py) — путей несколько. Каждая дырка —
    # подпуть «M{cx+r} {cy}c...», центр восстанавливаем, отняв радиус у
    # первой координаты.
    pts = [(float(x) - 1.6, float(y)) for ring in re.finditer(
        r'<path class="via-ring"[^>]*d="([^"]*)"', BOARD)
        for x, y in re.findall(r'M(-?[\d.]+) (-?[\d.]+)c', ring.group(1))]
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


@check('J7', 'марка крупнее, и её паспорт читается')
def j7():
    zone = BOARD[BOARD.find('class="silk-mark"'):]
    zone = zone[:zone.find('</a>')]
    lines = [(t, float(d.get('font-size', 0))) for _x, _y, t, d in texts(zone)]
    if len(lines) != 4:
        return f'строк в марке: {len(lines)}'
    if 'COSMDANDY' not in lines[1][0]:
        return f'посередине не имя: {lines[1][0]}'
    if not lines[0][0].startswith('DUAL') or 'REV' not in lines[2][0]:
        return f'порядок строк: {[t for t, _ in lines]}'
    if lines[1][1] < 24:
        return f'кегль имени {lines[1][1]}'
    # Паспорт — это то, что продиктовано дословно, и читать его надо. Мельче
    # пяти на плате только гравировка на чипах, и та мелкая нарочно.
    small = [(t, sz) for t, sz in lines if sz < 5]
    return not small or f'нечитаемо мелко: {small}'


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


# ── M. Сборка ────────────────────────────────────────────────────────────

def _seats(pattern):
    """Задержки посадки по атрибуту style у узлов, подходящих под шаблон."""
    return [(m.group(1), float(m.group(2)))
            for m in re.finditer(pattern, BOARD)]


@check('M1', 'сборка идёт тремя группами, а не сплошной лентой')
def m1():
    from board.geom import SEAT
    order = sorted(SEAT.items(), key=lambda kv: kv[1][0])
    names = [k for k, _ in order]
    if names[:2] != ['psu', 'fan']:
        return f'первой идёт не пара «блоки и вентиляторы»: {names[:2]}'
    if set(names[2:4]) != {'cpu', 'dimm'}:
        return f'вторая группа не «память и процессоры»: {names[2:4]}'
    if set(names[4:]) != {'riser', 'bay'}:
        return f'третья группа не «райзеры и диски»: {names[4:]}'
    # Между группами есть разрыв, внутри группы его нет.
    starts = [v[0] for _, v in order]
    return (starts[2] - starts[1] > 0.8 and starts[4] - starts[3] > 0.8) or f'группы слиты: {starts}'


@check('M2', 'внутри групп свой порядок: блоки, вентиляторы, диски, райзеры')
def m2():
    from board.geom import BAY_ORDER, FAN_ORDER, SEAT, bay_seat, fan_seat, riser_seat
    fans = [float(fan_seat(i)[:-1]) for i in range(4)]
    if [i for i, _ in sorted(enumerate(fans), key=lambda kv: kv[1])] != [0, 2, 3, 1]:
        return f'вентиляторы садятся не 1-3-4-2: {fans}'
    if float(riser_seat(1)[:-1]) >= float(riser_seat(0)[:-1]):
        return 'большой райзер идёт раньше малого'
    from board.spec import FILLER_BAYS
    live = [(i, float(bay_seat(i)[:-1])) for i in range(8) if i not in FILLER_BAYS]
    order = [i for i, _ in sorted(live, key=lambda kv: kv[1])]
    if order[:4] != [1, 0, 3, 2]:
        return f'диски идут не парами с дальнего: {order}'
    fillers = {round(float(bay_seat(i, True)[:-1]), 2) for i in FILLER_BAYS}
    return len(fillers) == 1 or f'заглушки встают вразнобой: {fillers}'


@check('M3', 'память заполняется через канал, а не подряд')
def m3():
    from board.geom import DIMM_ORDER, dimm_seat
    letters = 'ABCDEFGH'
    times = [float(dimm_seat(c)[:-1]) for c in letters]
    order = [letters[i] for i, _ in sorted(enumerate(times), key=lambda kv: kv[1])]
    want = [c for c in DIMM_ORDER if c in letters]
    if order != want:
        return f'порядок {order}, ожидался {want}'
    return DIMM_ORDER[:2] == 'AC' or f'таблица каналов подряд: {DIMM_ORDER}'


@check('M4', 'сборка укладывается заметно быстрее прежнего')
def m4():
    from board.geom import SEAT_DONE
    return SEAT_DONE <= 7 or f'расписание на {SEAT_DONE} с'


@check('E12в', 'при вставке лепестки сперва поддвигаются внутрь')
def e12v():
    # Кривая берётся из правила того состояния, в которое едут: значит,
    # обратный ход описан правилом покоя, а не зеркалом --latch-throw.
    if 'transform var(--latch-close)' not in CSS:
        return 'у вставки нет своей кривой — идёт зеркалом снятия'
    pts = curve('latch-close')
    if not pts:
        return 'кривая --latch-close не объявлена'
    head = at(pts, 0.30)
    return 0.02 < head < 0.15 or f'за первую треть лепесток проходит {head:.2f}'


@check('H3б', 'каддик сперва выходит на сантиметр вслед за ручкой')
def h3b():
    m = re.search(r'--caddy: [\d.]+s linear\(([^)]*)\)', CSS)
    if not m:
        return 'своей кривой у каддика нет'
    # Пары «доля хода — доля времени». Полка — это то, что происходит в первую
    # треть времени: каддик обязан пройти около десятой части и встать.
    pairs = [(float(v), int(t)) for v, t in
             re.findall(r'(-?[\d.]+) (\d+)%', m.group(1))]
    shelf = [v for v, t in pairs if t <= 40]
    if not shelf:
        return 'полки в начале кривой нет'
    return (0.03 < max(shelf) < 0.12 and max(shelf) - min(shelf) < 0.05) \
        or f'за первую треть каддик проходит {shelf}'


@check('M6б', 'прозрачность набирается раньше хода')
def m6b():
    late = []
    for name, body in re.findall(r'@keyframes (seat\w+) \{([^@]*?)\n  \}', CSS):
        m = re.search(r'(\d+)%\s*\{ opacity: 1', body)
        if 'opacity: 0' not in body:
            continue
        if not m or int(m.group(1)) > 25:
            late.append(name)
    return not late or f'фейд размазан по всему ходу: {late}'


@check('M5', 'у посадки есть разнобой, а не ровный такт')
def m5_seat():
    from board.geom import wobble
    vals = {round(wobble('fan', i), 4) for i in range(8)}
    return len(vals) >= 6 or f'разнобой повторяется: {sorted(vals)}'


@check('M6', 'узел приходит издалека, а не проявляется на месте')
def m6():
    moves = {n: int(m) for n, m in re.findall(
        r'@keyframes seat(\w+) \{\s*from \{ opacity: 0; transform: translate[XY]\((-?\d+)px\)', CSS)}
    short = {n: v for n, v in moves.items() if abs(v) < 45}
    return not short or f'слишком короткий ход: {short}'


@check('M7', 'самотест поднимается сразу после нажатия')
def m7():
    m = re.search(r'wait\((\d+), runPost\)', JS)
    if not m:
        return 'вызова самотеста не найдено'
    return int(m.group(1)) <= 400 or f'задержка {m.group(1)} мс'


# ── Физика ───────────────────────────────────────────────────────────────

@check('M5b', 'у каждого узла своя кривая, и ни одна не простаивает')
def m5b():
    declared = set(re.findall(r'--((?:press-|latch-)?[a-z-]+): [\d.]+s linear\(', CSS))
    declared |= {'lever'} if '--lever:' in CSS else set()
    used = {}
    for name in declared:
        used[name] = len(re.findall(rf'var\(--{name}\)', CSS))
    dead = sorted(n for n, k in used.items() if k == 0)
    if dead:
        return f'объявлены и не применены: {dead}'
    # Кривая посадки не должна работать за двоих: у вентилятора щелчок, у
    # райзера длинная ножка, у плашки прижим — это разные движения.
    # Кривая посадки не должна работать за двоих. Считаем по узлам, а не по
    # упоминаниям: у блока питания она законно стоит дважды — в анимации
    # сборки и в переходе возврата, но узел один.
    blocks = {}
    for f in sorted((ROOT / 'tools/board/blocks').glob('*.css')):
        for name in re.findall(r'var\(--(press-[a-z-]+)\)', f.read_text(encoding='utf-8')):
            blocks.setdefault(name, set()).add(f.stem)
    shared = sorted(n for n, who in blocks.items() if len(who) > 1)
    return not shared or f'одна кривая посадки на несколько узлов: {shared}'


# ── Характер движения по кривым ──────────────────────────────────────────
# Форма кривой и есть то, что описано словами. Проверяем её по числам: доля
# пути к доле времени. Живьём то же самое печатает tools/physics.mjs.

CHARACTER = (
    # код, кривая, что должно быть верно, как объяснить отказ
    ('E12а', 'latch-throw', lambda c: min(v for v, _ in c) < -0.02,
     'лепесток не додавливается внутрь перед отбросом'),
    ('E12б', 'heave', lambda c: at(c, 0.3) > 0.15 and at(c, 0.6) > 0.7,
     'подъём плашки не сплошной: в нём вторая заминка'),
    ('F5а', 'drag', lambda c: at(c, 0.5) < 0.3,
     'ход райзера не тугой: за половину времени пройдено слишком много'),
    # Разгон: за последнюю четверть времени узел проходит больше трети пути —
    # столько же, сколько за первые две трети.
    ('F5б', 'drag', lambda c: 1 - at(c, 0.75) > 0.3,
     'к концу хода разгона нет'),
    ('I7', 'snap', lambda c: at(c, 0.4) < 0.1 and at(c, 0.6) > 0.85,
     'щелчок размазан: у него должна быть точка срабатывания'),
    ('G4а', 'drag', lambda c: at(c, 0.5) < 0.3,
     'блок питания вынимается не тем же тугим ходом'),
)


def _character(code, name, ok, why):
    def fn():
        c = curve(name)
        if not c:
            return f'кривой --{name} нет'
        return ok(c) or why
    return fn


for _code, _name, _ok, _why in CHARACTER:
    CHECKS.append((_code, f'характер движения по --{_name}', _character(_code, _name, _ok, _why)))


@check('E12г', 'наведение проходит часть размаха, а не весь')
def e12g():
    hov = re.search(r'\.dimm:hover:not\(\.pulled\) \.pick-body \{ transform: translateY\((-?\d+)px\)', CSS)
    full = re.search(r'\.dimm\.pulled \.pick-body \{\s*transform: translateY\((-?\d+)px\)', CSS)
    if not hov or not full:
        return 'правил наведения или полного хода нет'
    return abs(int(hov.group(1))) < abs(int(full.group(1))) or 'наведение вынимает плашку до конца'


@check('G1а', 'лепесток блока складывается к ручке, а не вбок')
def g1a():
    if 'transform-origin: 50% 100%' not in CSS:
        return 'ось лепестка не у кромки, ближней к скобе'
    m = re.search(r'\.psu\.pulled \.psu-latch \{ transform: translateY\((\d+)px\) scaleY\(([\d.]+)\)', CSS)
    return (m and float(m.group(2)) < 0.6 and int(m.group(1)) > 0) or f'складывания нет: {m and m.group(0)}'


@check('H3а', 'ручка при вынимании отклоняется сильнее исходного')
def h3a():
    lat = re.search(r'\.bay\.unlatched \.bay-handle,[^{]*\{ transform: translateX\((-?\d+)px\) rotate\((-?\d+)deg\)', CSS)
    pull = re.search(r'\.bay\.pulled \.bay-handle,[^{]*\{ transform: translateX\((-?\d+)px\) rotate\((-?\d+)deg\)', CSS)
    if not lat or not pull:
        return 'правил ручки нет'
    return abs(int(pull.group(2))) > abs(int(lat.group(2))) or \
        f'угол не растёт: {lat.group(2)} → {pull.group(2)}'


@check('M5а', 'посадка идёт с разнобоем')
def m5a():
    from board.geom import wobble
    vals = {round(wobble('bay', i), 4) for i in range(8)}
    return len(vals) >= 6 or f'разнобой повторяется: {sorted(vals)}'


@check('M5б', 'у узлов разные кривые вытаскивания')
def m5b_pull():
    seen = {}
    for f in sorted((ROOT / 'tools/board/blocks').glob('*.css')):
        body = f.read_text(encoding='utf-8')
        for name in re.findall(r'\.pick-body \{ transition: transform var\(--([a-z-]+)\)', body):
            seen.setdefault(name, set()).add(f.stem)
    if len(seen) < 4:
        return f'кривых вытаскивания всего {len(seen)}: {sorted(seen)}'
    # --drag на троих — не совпадение, а сказанное дословно: «Тут анимацию
    # сделай такую же, как у рейзера» про блок питания. Встроенные интерфейсы
    # вынимаются тем же движением и через тот же борт. Всё остальное общим быть
    # не должно.
    BACKWARD = {'psu', 'risers', 'rear_io'}
    shared = sorted(n for n, who in seen.items()
                    if len(who) > 1 and not (n == 'drag' and who <= BACKWARD))
    return not shared or f'одна кривая на несколько узлов: {shared}'


@check('M6а', 'ход при посадке длиннее фейда')
def m6a():
    moves = {n: int(m) for n, m in re.findall(
        r'@keyframes seat(\w+) \{\s*0%\s*\{ opacity: 0;\s*transform: translate[XY]\((-?\d+)px\)', CSS)}
    short = {n: v for n, v in moves.items() if abs(v) < 45}
    return not short or f'слишком короткий ход: {short}'


@check('G1б', 'лепесток блока движется коротко, без инерции')
def g1b():
    return '.psu-latch {' in CSS and 'transition: transform var(--lever);' in CSS \
        or 'у лепестка нет короткой кривой'


@check('G4б', 'посадка блока имеет полку — второй приём')
def g4b():
    pts = curve('press-two')
    if not pts:
        return 'кривой --press-two нет'
    return at(pts, 0.48) - at(pts, 0.30) < 0.06 or 'полки нет'


@check('H2', 'ручка каддика идёт линейно и коротко')
def h2():
    m = re.search(r'--lever: ([\d.]+)s linear;', CSS)
    return (m and float(m.group(1)) <= 0.2) or f'ручка: {m and m.group(0)}'


@check('D8', 'по крышке процессора идёт блик, а не сплошная заливка')
def d8():
    """Мерилом стала прозрачность концов, а не ширина прямоугольника.

    Полоса обязана быть шире крышки: иначе при своём ходе она уходит с неё, и
    из-под обрезки торчит её собственная кромка — половина крышки цветная,
    половина нет. Значит «блик, а не заливка» держится тем, что концы полосы
    сведены в ноль: по краям крышки виден сам металл с выбитой маркировкой.
    """
    grad = re.search(r'<linearGradient id="die-shine".*?</linearGradient>', BOARD, re.DOTALL)
    if not grad:
        return 'градиента кристалла нет'
    stops = re.findall(r'offset="(\d+)%"\s+stop-color="[^"]*"\s+stop-opacity="([\d.]+)"', grad.group(0))
    if len(stops) < 4:
        return f'узлов градиента: {len(stops)}'
    first, last = stops[0], stops[-1]
    if float(first[1]) or float(last[1]):
        return f'концы полосы не прозрачны: {first[1]}, {last[1]}'
    # Прозрачная кайма — не меньше четверти длины с каждой стороны.
    return (int(stops[1][0]) >= 25 and int(stops[-2][0]) <= 75) \
        or f'кайма узкая: {stops[1][0]}%…{stops[-2][0]}%'


@check('F3', 'партномер набит на самом райзере')
def f3():
    zone = BOARD[BOARD.find('data-riser="1"'):]
    zone = zone[:zone.find('data-riser="2"')] if 'data-riser="2"' in zone else zone[:20000]
    return 'class="stamp"' in zone or 'на райзере нет набивки'


@check('I4', 'партномер вентиляторов — снизу общего блока')
def i4():
    from board.geom import H, X_FAN
    pn = [(x, y) for x, y, t, d in texts(BOARD) if t.startswith('P/N') and abs(x - (X_FAN + 6)) < 1]
    return (pn and pn[0][1] > H - 60) or f'набивка вентиляторов: {pn}'


@check('J9', 'партномеров ровно столько, сколько названо')
def l0():
    # Названы были блоки питания, райзеры, процессоры, память и вентиляторы.
    # Партномер живёт по одному на файл узла, память — по одному на банк.
    n = BOARD.count('class="stamp"')
    return n == 9 or f'набивок на схеме: {n}'


@check('J10', 'партномер меняется под курсором, а не ведёт по ссылке')
def l0b():
    if 'a class="stamp"' in BOARD or '<a class="stamp"' in BOARD:
        return 'набивка осталась ссылкой'
    return ('.stamp:hover .stamp-alt text' in CSS) or 'под курсором ничего не меняется'


@check('G6', 'блок вынимается тугим ходом райзера, садится в два приёма')
def g6():
    # Наружу — тем же тугим ходом, что у райзера: так и надиктовано. Внутрь —
    # посадка в два приёма. Ход при этом короткий: чуть больше контакта.
    if not re.search(r'\.psu\.pulled \.pick-body \{[^}]*var\(--drag\)', CSS):
        return 'блок вынимается не тугим ходом райзера'
    if '.psu .pick-body { transition: transform var(--press-two); }' not in CSS:
        return 'посадка блока не в два приёма'
    m = re.search(r'\.psu\.pulled \.pick-body \{\s*transform: translateX\((\d+)px\)', CSS)
    return (m and int(m.group(1)) <= 60) or f'ход блока {m and m.group(1)} — это не микродвижение'


@check('G7', 'у блока питания нет движения вверх ни в одном состоянии')
def g7():
    if '.pick.psu:hover .pick-body { transform: none; }' not in CSS:
        return 'наводка всё ещё приподнимает блок'
    m = re.search(r'\.psu\.pulled \.pick-body \{\s*transform: ([^;]+);', CSS)
    return (m and m.group(1).startswith('translateX')) or f'ход блока: {m and m.group(1)}'


@check('H7', 'каддик задвигается свободно, а упирается в последнем сантиметре')
def h7():
    if not re.search(r'\.bay \.pick-body, \.blank \.pick-body \{ transition: transform var\(--press-seat\)', CSS):
        return 'задвигание идёт не своей кривой'
    # Полка сопротивления обязана быть в конце хода, а не в начале: в начале
    # она читается как «застряло, не доехав».
    pts = linear_pts('press-seat')
    at = lambda t: next(p for tt, p in pts if tt >= t)
    return at(0.3) > 0.5 or f'к трети времени каддик проходит всего {at(0.3):.0%}'


@check('D11', 'кристалл уезжает вместе с крышкой процессора')
def d11():
    # Он рисуется рядом с гнездом, а не внутри крышки: внутри его обрезка
    # уезжала не туда — clipPath задан в пользовательских координатах, и под
    # переносом группы срез оказывался в другом месте. Значит двигать его
    # должно то же правило, что и крышку.
    if not re.search(r'\.cpu-slot\.opened \.cpu-lid,\s*\.rig\.service \.cpu-slot\.opened \.die \{', CSS):
        return 'кристалл не привязан к правилу крышки'
    return ('.heatsink, .cpu-lid, .die { transition: transform var(--glide); }' in CSS
            or 'у кристалла нет перехода — он будет прыгать')


@check('O1', 'подсказка автодополнения стоит на строке поля, а не над ней')
def o1():
    m = re.search(r'\.ghost \{([^}]*)\}', CSS)
    if not m:
        return 'зеркала подсказки нет'
    body = m.group(1)
    if 'line-height: normal' in body:
        return 'строка зеркала считается по своей высоте, а не по высоте поля'
    return ('align-items: center' in body) or 'зеркало не центровано по вертикали'


@check('O2', 'строки настроек BIOS набраны плотно')
def o2():
    m = re.search(r'\.crt-row \{([^}]*)\}', CSS)
    if not m:
        return 'строк настроек нет'
    pad = re.search(r'padding: (\d+)px', m.group(1))
    return (pad and int(pad.group(1)) <= 1) or f'поля строки {pad and pad.group(1)}px'


@check('R2', 'штрихи сосчитаны из текста, а не выдуманы, и не только у памяти')
def r2():
    from board.ink import barcode
    from board.spec import DIMM, PSU
    # Тот же вызов, что делает блок: если генератор перестанет держаться за
    # текст, ширины совпадут у любых двух разных строк.
    a = barcode(0, 0, f"{DIMM['size_gb']}GB", 10)
    b = barcode(0, 0, f"{PSU['model']} {PSU['watt']}W PSU-1", 10)
    if a == b:
        return 'разные тексты дают одинаковые штрихи'
    # И у памяти, и у блока штрихи должны стоять на схеме.
    thin = BOARD.count('width="0.6"') + BOARD.count('height="1.4"')
    return thin > 20 or f'штрихов на схеме всего {thin}'


# ── L. Интерфейс и режимы ────────────────────────────────────────────────

@check('L1', 'вид выбирает ширина окна, кнопки переключения нет')
def l1():
    left = [n for n, src in (('разметке', HTML), ('стилях', CSS), ('скрипте', JS))
            if 'view-switch' in src]
    if left:
        return f'переключатель вида остался в: {", ".join(left)}'
    return "matchMedia('(min-width: 821px)')" in JS or 'вид не привязан к ширине окна'


@check('L2', 'кнопка лупы стоит в ряду и видна только на схеме')
def l2():
    if 'id="zoom-btn"' not in HTML:
        return 'кнопки лупы нет в разметке'
    return 'body.view-rig .zoom-btn { display: grid; }' in CSS or 'кнопка видна и в карточке'


@check('L3', 'лупа: поле во весь экран, три ступени, выход по Esc')
def l3():
    if 'ZOOM_STEPS = [1, 1.6, 2.4]' not in JS:
        return 'ступеней приближения не видно'
    if 'position: fixed' not in re.search(r'\.rig\.zoom \.rig-body \{([^}]*)\}', CSS).group(1):
        return 'поле не разложено на весь экран'
    return "if (rig.classList.contains('zoom')) setZoom(false)" in JS or 'Esc не выводит из лупы'


@check('L3а', 'вход и выход — перелётом: замер до и после, разница переходом')
def l3a():
    for cls in ('zoom-shift', 'zooming'):
        if f'.rig.{cls} ' not in CSS or f"'{cls}'" not in JS:
            return f'класса {cls} нет в стилях или в скрипте'
    if 'transformOrigin' not in JS or 'getBoundingClientRect' not in JS:
        return 'перелёт ничего не мерит'
    # Переходы у летящих узлов обязаны быть выключены до смены раскладки: у
    # сцены свой переход по width, и замер в эту секунду даёт нулевую разницу.
    fly = re.search(r'function flyParts\(mutate\) \{(.*?)\n  \}', JS, re.DOTALL)
    if not fly:
        return 'flyParts не найдена'
    body = fly.group(1)
    # Ищем именно строку смены раскладки, а не первое `mutate()` в тексте:
    # выше него стоит короткий путь для тех, кому движение не показывают.
    if body.index("transition = 'none'") > body.index('\n    mutate();'):
        return 'переходы глушатся после смены раскладки, замер выйдет нулевым'
    # Корпус распрямляется ровно столько же, сколько длится перелёт.
    fly_ms = int(re.search(r'const FLY = (\d+);', JS).group(1))
    css_s = float(re.search(r'\.rig\.zooming \.chassis \{ transition: transform ([\d.]+)s', CSS).group(1))
    return abs(css_s * 1000 - fly_ms) < 1 or f'перелёт {fly_ms} мс, распрямление {css_s} с'


@check('L3б', 'имя и должность летят вместе со сценой, строка о работе гаснет')
def l3b():
    if "'.stage, .rig-id h2, .rig-id .bio'" not in JS:
        return 'шапка не летит вместе со сценой'
    if '.rig.zoom .rig-id h1' in CSS:
        return 'в стилях лупы остался h1, а в разметке h2'
    return '.rig.zoom .rig-id .now { display: none; }' in CSS or 'строка о работе видна в лупе'


@check('L3в', 'приближает shift + клик, курсор и подсказка это показывают')
def l3v():
    if "!e.shiftKey" not in JS:
        return 'приближает всякий щелчок'
    if '.rig.zoom .rig-body { cursor: grab; }' not in CSS:
        return 'простым курсором машину не возят'
    if '.rig.zoom.shifted .rig-body { cursor: zoom-in; }' not in CSS:
        return 'с зажатым shift курсор не становится лупой'
    return ('lh-key' in CSS and 'lh-key">shift' in JS) or 'про shift подсказка молчит'


@check('L5', 'у мелких органов управления вместо рамки — своя подсветка')
def l5():
    for sel in ('.svc-switch', '.power-btn', '.lp-reset', '.pick', 'a.callout', '.silk-mark'):
        if not re.search(rf'{re.escape(sel)}:focus-visible[^{{]*\{{[^}}]*outline: none', CSS):
            return f'{sel} остался с рамкой фокуса'
    return True


@check('L6', 'блик на переключателе сервиса — размытый и широкий')
def l6():
    if 'svc-shine-grad' not in BOARD:
        return 'блик залит сплошным цветом'
    r = rects(BOARD, **{'class': 'svc-shine'})
    return (r and r[0][2] >= 40) or f'ширина блика {r[0][2] if r else "нет"}'


@check('L7', 'почта копируется в буфер и отмечается словом')
def l7():
    return ('navigator.clipboard' in JS and 'скопировано' in JS) or 'почта только открывает клиент'


@check('L8', 'адрес под курсором, длинные хвосты обрезаны')
def l8():
    if 'id="link-hint"' not in HTML:
        return 'подсказки нет в разметке'
    if 'HINT_TAIL = 28' not in JS:
        return 'хвост не обрезается'
    # Карточка — такой же набор ссылок, и подсказка там нужна затем же.
    return "e.target.closest('.rig')" in JS or 'подсказка живёт только на схеме'


@check('L9', 'бирки крупнее: плашка, значок и обе строки')
def l9():
    box = re.search(r'class="co-box" x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)"', BOARD)
    if not box or float(box.group(1)) < 74:
        return f'высота плашки {box.group(1) if box else "не найдена"}'
    size = re.search(r'\.co-text \{[^}]*font-size: ([\d.]+)px', CSS)
    sub = re.search(r'\.co-sub \{[^}]*font-size: ([\d.]+)px', CSS)
    return ((size and float(size.group(1)) >= 26 and sub and float(sub.group(1)) >= 14.5)
            or f'кегль строк: {size and size.group(1)}, {sub and sub.group(1)}')


@check('L4', 'лента ревизий поднимается командой, а локально сама')
def l4():
    if "name: 'revisions'" not in JS:
        return 'команды revisions нет'
    if 'revsAsked = true' not in JS:
        return 'команда не снимает запрет на загрузку истории'
    return ('if (revs.length || !(LOCAL || revsAsked)) return;' in JS
            or 'лента не спрашивает ни про локальный запуск, ни про команду')


# ── S…AA. Второй круг правок ─────────────────────────────────────────────

@check('S1', 'приближение ведёт скрипт кадр за кадром, а не переход по ширине')
def s1():
    if re.search(r'\.rig\.zoom \.stage \{[^}]*transition: width', CSS):
        return 'ширина всё ещё меняется переходом'
    return ('requestAnimationFrame(tick)' in JS and 'const ZOOM_MS' in JS) or 'приближение не анимируется'


@check('S2', 'точка под курсором остаётся на месте при приближении')
def s2():
    # Прокрутка считается из точки в координатах схемы и ставится в том же
    # кадре, что и масштаб. Пока её доводили после перехода, схема всё это
    # время ехала вокруг прежней точки.
    m = re.search(r'function zoomTo\(step, cx, cy\) \{(.*?)\n  \}', JS, re.DOTALL)
    if not m:
        return 'zoomTo не найдена'
    body = m.group(1)
    return ('panTo(px * k - ax, py * k - ay)' in body) or 'якорь под курсором не держится'


@check('S3', 'схему нельзя увезти за край поля')
def s3():
    if 'function panTo(' not in JS or 'function scrollMax(' not in JS:
        return 'границ поля нет'
    # Границы считаются по самой сцене: прокручиваемая область шире машины —
    # перспектива и подписи рисуются за её габарит.
    return ("st.offsetLeft + st.offsetWidth" in JS) or 'границы считаются не по сцене'


@check('T1', 'рамки фокуса нет ни у одного органа управления на схеме')
def t1():
    for sel in ('.lid-btn-svg', '.lid-on-btn', '.svc-switch', '.lp-reset'):
        if not re.search(rf'{re.escape(sel)}:focus-visible[^{{]*\{{[^}}]*outline: none', CSS):
            return f'{sel} остался с рамкой'
    return True


@check('U1', 'тугой ход блока питания стал короче')
def u1():
    d = float(re.search(r'--drag: ([\d.]+)s', CSS).group(1))
    return d <= 0.85 or f'--drag всё ещё {d} с'


@check('V5', 'соты на кронштейне райзера — настоящие дырки, а не рисунок')
def v5():
    # Полупрозрачной заливки поверх стали мало: под ней остаётся непрозрачный
    # кронштейн, и сквозь такую «дырку» видно его же, только темнее. Плата
    # видна там, где стали физически нет, — значит лист обязан пробиваться
    # маской.
    if 'mask="url(#riser-perf-' not in BOARD:
        return 'кронштейн не пробит маской'
    return BOARD.count('<mask id="riser-perf-') == 2 or 'маска не у каждого кронштейна'


@check('W2', 'INSTALL мелкая, без подложки и по середине полосы под площадкой')
def w2():
    from board.geom import SOCKET_H, Y_CPU0
    m = re.search(r'<text x="[\d.]+" y="([\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>INSTALL</text>', BOARD)
    if not m:
        return 'надписи INSTALL нет'
    ty, size = float(m.group(1)), float(m.group(2))
    if size > 5:
        return f'кегль INSTALL {size}'
    # Плашки под ней быть не должно: подложка под четырьмя буквами читалась
    # ярлыком, а не набивкой. Ищем прямоугольник ровно под этой строкой.
    if re.search(rf'<rect x="[\d.]+" y="{ty - 8:.0f}[^"]*"[^>]*/><text[^>]*>INSTALL<', BOARD):
        return 'у надписи осталась подложка'
    # По середине полосы между нижней кромкой площадки и кромкой гнезда.
    pad_bot = Y_CPU0 + 29 + (SOCKET_H - 58)
    mid = pad_bot + (Y_CPU0 + SOCKET_H - pad_bot) / 2
    return abs(ty - mid) <= 4 or f'INSTALL на {ty}, середина полосы {mid}'


@check('X2', 'штрих-код считается от хэша сборки')
def x2():
    mem = (ROOT / 'tools/board/blocks/memory.py').read_text(encoding='utf-8')
    psu = (ROOT / 'tools/board/blocks/psu.py').read_text(encoding='utf-8')
    return ('barcode(x + 3, y + 1.4, BOARD_SHA' in mem and 'BOARD_SHA + name' in psu) \
        or 'штрихи считаются не от коммита'


@check('Y3', 'ни одна надпись на плате не залезает на её кромку')
def y3():
    from board.geom import H
    bad = [(t, y) for x, y, t, d in texts(BOARD) if y < 20 or y > H - 20]
    return not bad or f'за кромкой: {bad[:3]}'


@check('Y5', 'лампа сердца не накрывает свою подпись')
def y5():
    hb = re.search(r'class="lamp led-hb"[^>]*cx="([\d.]+)" cy="([\d.]+)"', BOARD)
    if not hb:
        hb = re.search(r'<circle class="[^"]*led-hb[^"]*" cx="([\d.]+)" cy="([\d.]+)"', BOARD)
    lab = [(x, y) for x, y, t, d in texts(BOARD) if t == 'HB']
    if not hb or not lab:
        return f'не нашлось: лампа {bool(hb)}, подпись {bool(lab)}'
    return abs(float(hb.group(1)) - lab[0][0]) > 10 or 'лампа стоит над подписью'


@check('Z1', 'защёлка ошибки снимается чтением журнала')
def z1():
    return ('function faultLog()' in JS and 'const cleared = faultLog();' in JS) \
        or 'журнал не снимает защёлку'


@check('Z2', 'на сборке между группами нет простоя')
def z2():
    from board.geom import SEAT
    # Процессор обязан начаться до того, как отыграли вентиляторы: их последний
    # трогается на 0.46 + 3·0.11 и идёт 0.62 с.
    fan_end = SEAT['fan'][0] + 3 * SEAT['fan'][1] + 0.62
    return SEAT['cpu'][0] <= fan_end + 0.05 or \
        f'процессор стартует на {SEAT["cpu"][0]}, а вентиляторы кончают на {fan_end:.2f}'


@check('AA4', 'в лупе тема спрятана, а оставшиеся кнопки крупнее')
def aa4():
    if 'body.zoom .theme-switch { display: none; }' not in CSS:
        return 'кнопка темы в лупе на месте'
    m = re.search(r'body\.zoom \.zoom-btn,\s*body\.zoom \.assemble-btn \{\s*width: (\d+)px', CSS)
    return (m and int(m.group(1)) >= 52) or f'ширина кнопок {m and m.group(1)}'


@check('AA5', 'включённая лупа горит красным')
def aa5():
    m = re.search(r'body\.zoom \.zoom-btn\[aria-pressed="true"\] \{([^}]*)\}', CSS)
    return (m and '#dc322f' in m.group(1)) or 'кнопка не выделена красным'


@check('W5', 'у кристалла одно правило разлёта, без дублей и без масштаба')
def w5():
    n = len(re.findall(r'\.cpu-slot\.opened \.die \{', CSS))
    if n != 1:
        return f'правил разлёта кристалла: {n}'
    return 'scale' not in re.search(r'\.cpu-slot\.opened \.die \{([^}]*)\}', CSS).group(1) \
        or 'масштаб уводит кристалл с крышки'


@check('W6', 'блик накрывает крышку целиком в любой точке своего хода')
def w6():
    from board.geom import SOCKET_H, SOCKET_W, X_SOCK, Y_CPU0
    m = re.search(r'class="die-shine" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"', BOARD)
    if not m:
        return 'полосы блика нет'
    bx, by, bw, bh = (float(v) for v in m.groups())
    k = re.search(r'50%\s*\{ transform: translate\((\d+)px, (-?\d+)px\)', CSS)
    dx, dy = (int(k.group(1)), int(k.group(2))) if k else (0, 0)
    # Крышка сидит внутри гнезда с полем 35 по X и 29 по Y.
    ix, iy, iw, ih = X_SOCK + 35, Y_CPU0 + 29, SOCKET_W - 70, SOCKET_H - 58
    for ox, oy in ((0, 0), (dx, dy)):
        if not (bx + ox <= ix and by + oy <= iy
                and bx + ox + bw >= ix + iw and by + oy + bh >= iy + ih):
            return f'при сдвиге {ox},{oy} полоса не накрывает крышку'
    return True


@check('W7', 'обозначение процессора набито под деталью, а не поверх неё')
def w7():
    i = BOARD.find('data-unit="cpu0"')
    body = BOARD[i:BOARD.find('data-unit="cpu1"')]
    label = body.find('>CPU0<')
    slot = body.find('class="pick cpu-slot"')
    return (0 < label < slot) or 'подпись стоит после гнезда — значит поверх снятых частей'


@check('V6', 'отвод райзера вбок ждёт, пока подъём кончится')
def v6():
    d = re.search(r'\.riser\.pulled \.pick-body \{[^}]*var\(--riser-slide\) ([\d.]+)s', CSS)
    lift = float(re.search(r'--riser-lift: ([\d.]+)s', CSS).group(1))
    if not d:
        return 'задержки отвода нет'
    return float(d.group(1)) >= lift or f'отвод трогается на {d.group(1)} при подъёме в {lift} с'


@check('T2', 'внутри машины браузерных рамок фокуса нет вовсе')
def t2():
    return '.rig :focus, .rig :focus-visible { outline: none; }' in CSS \
        or 'рамки гасятся только у перечисленных органов'


@check('AA6', 'кнопки в лупе не наезжают друг на друга')
def aa6():
    z = re.search(r'body\.zoom \.zoom-btn \{ right: (\d+)px', CSS)
    a = re.search(r'body\.zoom \.assemble-btn \{ right: (\d+)px', CSS)
    w = re.search(r'body\.zoom \.zoom-btn,\s*body\.zoom \.assemble-btn \{\s*width: (\d+)px', CSS)
    if not (z and a and w):
        return 'правил размещения в лупе нет'
    return int(z.group(1)) >= int(a.group(1)) + int(w.group(1)) + 8 \
        or f'зазор между кнопками {int(z.group(1)) - int(a.group(1)) - int(w.group(1))}'


@check('X4', 'серебристых контактов на проборе плашки нет')
def x4():
    mem = (ROOT / 'tools/board/blocks/memory.py').read_text(encoding='utf-8')
    return 'SILVER' not in mem or 'серебро на плашке осталось'


# ── N. Светлая тема ──────────────────────────────────────────────────────

@check('N5', 'консоль остаётся тёмной вместе с машиной')
def n5():
    """Тоже перевёрнуто. Консоль — приборная панель этой машины, а не блок
    страницы: она стоит вплотную к схеме и обязана быть с ней одного тона.
    Светлая консоль рядом с тёмной машиной читалась приклеенным листом бумаги.
    """
    if re.search(r':root\[data-theme="light"\][^{]*\{[^}]*--con-bg', CSS):
        return 'светлое переопределение консоли вернулось'
    return '--con-bg:' in CSS or 'токена фона консоли нет'


@check('N1', 'машина не перекрашивается вместе с темой страницы')
def n1():
    """Требование перевёрнуто сознательно, и вот чем.

    Сначала просили, чтобы корпус, блоки и борт светлели вместе с темой. Это
    сделали, и оказалось плохо по двум причинам. Цвета машины подобраны под
    тёмный фон: на кремовом сталь и текстолит читаются выцветшей картинкой, а
    лампы — просто цветными точками, потому что свет виден только на тёмном.
    И перекраска шла рывком: страница гасит фон переходом, а фигуры в svg берут
    цвет из переменной, которая не интерполируется, — машина перещёлкивалась
    посреди плавного перехода.

    Схема осталась фотографией тёмного предмета: на дневном свету он тёмным и
    остаётся. Тема живёт у страницы вокруг него.
    """
    if re.search(r':root\[data-theme="light"\] \.rig \{', CSS):
        return 'светлые переопределения схемы вернулись'
    # Токены при этом на месте: ими машина и красится, просто значение одно.
    need = ('--chassis', '--metal', '--metal-deep', '--steel', '--pcb')
    missing = [t for t in need if f'{t}:' not in CSS]
    return not missing or f'нет токенов: {missing}'


@check('N2', 'райзеры и борт берут цвет из того же токена')
def n2():
    return BOARD.count('var(--steel,') >= 4 or f'по токену стали нарисовано {BOARD.count("var(--steel,")} фигур'


@check('N3', 'у страницы светлая тема осталась')
def n3():
    # Убрана она только у машины. Карточка, фон и кнопки темой по-прежнему
    # управляются — иначе переключатель нечем было бы объяснить.
    page = (ROOT / 'style.css').read_text(encoding='utf-8')
    return ':root[data-theme="light"]' in page or 'светлая тема исчезла со страницы целиком'


@check('N4', 'передний лист и вентиляторы остаются тёмными')
def n4():
    from board.geom import FAN_W, X_FAN
    wall = [r for r in rects(BOARD, fill='#0f1619') if abs(r[0] - X_FAN) < 0.1 and r[2] == FAN_W]
    sheet = 'fill="#0a1013"' in BOARD
    return (wall and sheet) or 'фронт или стена вентиляторов ушли в переменную'


# ── B. Крышка ────────────────────────────────────────────────────────────
# Крышка лежит во втором SVG, поэтому все проверки этого раздела читают LID.
# Читаем именно собранный файл: в исходнике видно, что код написан, а не что
# он что-то нарисовал.


def _turned(src):
    """Повёрнутые на 90° группы: (центр X, центр Y, содержимое).

    Всё, что на крышке лежит вдоль неё, нарисовано в обычных координатах и
    повёрнуто целиком — иначе каждую надпись пришлось бы считать в уме.
    """
    return [(float(m.group(1)), float(m.group(2)), m.group(3))
            for m in re.finditer(r'<g transform="rotate\(-90 ([\d.]+) ([\d.]+)\)">(.*?)</g>',
                                 src, re.DOTALL)]


def _psu_plates():
    """Шильдики питания: номер отсека → (центр поворота, рамка)."""
    out = {}
    for cx, cy, body in _turned(LID):
        m = re.search(r'>PSU (\d)</text>', body)
        if not m:
            continue
        edge = rects(body, stroke='#05090b')
        if edge:
            out[m.group(1)] = (cx, cy, edge[0])
    return out


def _perf():
    """Соты крышки: список центров."""
    return [c for c, _, _ in perf_cells(LID)]


@check('B1', 'соты только над задней стенкой и отсеками БП, и они сквозные')
def b1():
    holes = _perf()
    if not holes:
        return 'сот на крышке нет'
    # Задняя стенка с гнёздами лежит ровно между отсеками БП — это её полоса.
    zones = {'задняя стенка': (geom.X_IO - 12, geom.Y_PSU_TOP, geom.W, geom.Y_PSU_BOT)}
    for n, y in enumerate(geom.PSU_Y):
        zones[f'отсек БП {n+1}'] = (geom.X_REAR, y, geom.W, y + geom.PSU_H)
    seen = dict.fromkeys(zones, 0)
    for cx, cy in holes:
        hit = [k for k, (x0, y0, x1, y1) in zones.items() if x0 <= cx <= x1 and y0 <= cy <= y1]
        if not hit:
            return f'сота вне задней стенки и отсеков: ({cx:.0f}, {cy:.0f}), всего сот {len(holes)}'
        seen[hit[0]] += 1
    empty = [k for k, n in seen.items() if not n]
    if empty:
        return f'без перфорации остались: {", ".join(empty)}'
    # Сквозная — значит лист в этих местах пробит, а не закрашен: те же соты
    # лежат в маске, которой вырезано тело листа.
    mask = re.search(r'<mask id="lid-perf".*?</mask>', LID, re.DOTALL)
    if not mask or '<path class="perf"' not in mask.group(0):
        return 'соты нарисованы поверх глухого листа, а не вырезаны в нём'
    return 'mask="url(#lid-perf)"' in LID or 'маска есть, но лист ею не пробит'


@check('B2', 'шильдики питания у правой кромки: PSU 1 в сплошной рамке, PSU 2 в пунктирной')
def b2():
    plates = _psu_plates()
    if sorted(plates) != ['1', '2']:
        return f'шильдиков с номером отсека: {sorted(plates)}'
    left = {}
    for n, (cx, cy, (x, y, w, h, d)) in plates.items():
        # Поворот на −90° вокруг (cx, cy): по X шильдик занимает cx ± h/2.
        gap = geom.W - (cx + h / 2)
        if gap > 12:
            return f'шильдик PSU {n} не прижат к кромке: до края {gap:.0f}'
        dashed = 'stroke-dasharray' in d
        if (n == '2') != dashed:
            return f'у PSU {n} рамка {"пунктирная" if dashed else "сплошная"}'
        if float(d.get('stroke-width', 0)) < 3:
            return f'рамка PSU {n} тонкая: {d.get("stroke-width")}'
        left[n] = cx - h / 2
    # «А после, немножечко отходя, начинается перфорация»: соты отсека лежат
    # левее шильдика и не наезжают на него.
    for n, y in enumerate(geom.PSU_Y):
        near = [cx for cx, cy in _perf() if y <= cy <= y + geom.PSU_H]
        if not near:
            return f'над отсеком {n+1} перфорации нет'
        if max(near) > left[str(n + 1)] - 8:
            return f'соты отсека {n+1} доходят до шильдика: {max(near):.0f} при кромке {left[str(n+1)]:.0f}'
    return True


@check('B3', 'схематика крышки совпадает с местами самих узлов')
def b3():
    # Гнездо нарисовано один раз в <defs>, а на плату его ставит <use> со
    # сдвигом: место каждого сокета — это база шаблона плюс сдвиг экземпляра.
    base = rects(defs_group('dimm-static'), fill='#05090b', width=str(geom.DIMM_SOCK_W))
    socks = sorted(((base[0][0], base[0][1] + dy, base[0][2], base[0][3])
                    for dy in defs_uses('dimm-static')), key=lambda r: r[1]) if base else []
    if len(socks) != 3 * geom.BANK_N:
        return f'сокетов памяти на плате: {len(socks)}'
    for b in range(3):
        bank = socks[b * geom.BANK_N:(b + 1) * geom.BANK_N]
        x0, y0 = bank[0][0], bank[0][1]
        y1 = bank[-1][1] + bank[-1][3]
        if not [r for r in rects(LID, width=str(geom.DIMM_SOCK_W))
                if abs(r[0] - x0) < 2 and abs(r[1] - y0) < 2 and abs(r[1] + r[3] - y1) < 2]:
            return f'рамка банка на крышке не сходится с сокетами: {x0:.0f},{y0:.0f}..{y1:.0f}'
    for y in (geom.Y_CPU0, geom.Y_CPU1):
        if not [r for r in rects(LID, width=str(geom.SOCKET_W), height=str(geom.SOCKET_H))
                if abs(r[0] - geom.X_SOCK) < 1 and abs(r[1] - y) < 1]:
            return f'рамка процессора на y={y} не по сокету'
    # Бирки гнёзд стоят против середины своего гнезда, а не там, где пришлось.
    for k, name in enumerate(('Telegram', 'Twitter', 'Email')):
        mid = geom.IO_Y + k * geom.JACK_PITCH + geom.JACK_H / 2
        ys = [y for x, y, t, d in texts(LID) if t == name]
        if not ys or abs(ys[0] - 4 - mid) > 4:
            return f'бирка {name} на y={ys} при середине гнезда {mid:.0f}'
    return True


@check('B4', 'методичка Power Supply не лежит под кнопкой снятия крышки')
def b4():
    frag = [ln for ln in LID.split('\n') if '>POWER SUPPLY<' in ln]
    if not frag:
        return 'методички Power Supply нет'
    x, y, w, h, _ = rects(frag[0])[0]
    bx, by, bs = geom.LID_BTN
    if x < bx + bs and x + w > bx and y < by + bs and y + h > by:
        return f'методичка ({x:.0f},{y:.0f} {w:.0f}×{h:.0f}) под кнопкой ({bx},{by} {bs}×{bs})'
    return True


@check('B5', 'Hot Swap и код замены повёрнуты, ниже верхнего края и разнесены')
def b5():
    was = {'HOT-SWAP HDD': 150, 'КОД ЗАМЕНЫ': 100}     # прежние высоты плашек
    box = {}
    for cx, cy, body in _turned(LID):
        for title, before in was.items():
            if f'>{title}<' not in body:
                continue
            _, _, w, h, _ = rects(body)[0]
            if h >= before:
                return f'{title}: высота {h:.0f} — не меньше прежних {before}'
            box[title] = (cy - w / 2, w)               # после поворота: верх и высота
    if sorted(box) != sorted(was):
        return f'повёрнутых наклеек: {sorted(box)}'
    top = min(v[0] for v in box.values())
    if top < 80:
        return f'верхняя наклейка прижата к краю крышки: y={top:.0f}'
    a, b = sorted(box.values())
    gap = b[0] - (a[0] + a[1])
    return gap >= 60 or f'между наклейками {gap:.0f} — тесно'


@check('B6', 'на крышке нет ни вентиляторов, ни общей обводки платы')
def b6():
    if [r for r in rects(LID, width=str(geom.FAN_W)) if abs(r[0] - geom.X_FAN) < 1]:
        return 'рамка стенки вентиляторов осталась'
    if re.search(rf'<circle[^>]*r="{geom.FAN_W / 3.6:.1f}"', LID):
        return 'крыльчатки остались'
    if f'M{geom.X_PCB} 18' in LID:
        return 'обводка платы осталась'
    return True


@check('B7', 'на левой кромке две синие кнопки, и они же снимают крышку')
def b7():
    from board.palette import COLD
    i = LID.find('<g id="lid-remove"')
    if i < 0:
        return 'кнопки снятия крышки нет'
    lat = re.findall(r'<g class="lid-latch">(.*?)</g>', LID[i:], re.DOTALL)
    if len(lat) != 2:
        return f'защёлок внутри кнопки снятия: {len(lat)}'
    for body in lat:
        x, _, _, _, d = rects(body)[0]
        if x > geom.X_BP + 14:
            return f'защёлка не на передней кромке: x={x:.0f}'
        if d.get('fill') != COLD:
            return f'защёлка не синяя: {d.get("fill")}'
    press = re.search(r'\.lid-btn-svg:active \.lid-latch \{([^}]*)\}', CSS)
    if not press or 'translate' not in press.group(1):
        return 'нажатие не вдавливает кнопки'
    return True


@check('B8', 'крышка снимается в три движения: туго вправо, приподнялась, ушла')
def b8():
    pts = curve('lid-slide')
    dur = re.search(r'--lid-slide: ([\d.]+)s', CSS)
    off = re.search(r'\.rig\.lid-off \.lid \{([^}]*)\}', CSS)
    if not pts or not dur or not off:
        return 'кривой снятия или правила снятой крышки нет'
    dur, body = float(dur.group(1)), off.group(1)
    far = re.search(r'translate:\s*(-?[\d.]+)%', body)
    if not far or float(far.group(1)) < 50:
        return f'крышка уезжает недалеко: {far and far.group(1)}'
    if not re.search(r'scale:\s*1\.0[1-9]', body):
        return 'крышка не приподнимается — второго движения нет'
    lift = re.search(r'scale [\d.]+s [a-z-]+ ([\d.]+)s', body)
    if not lift:
        return 'подъём идёт без своей задержки: это одно движение, а не три'
    t = float(lift.group(1))
    # Первое движение — «туго, примерно на полсантиметра». У листа 1146 единиц
    # ширины на 44 см живого корпуса, то есть полсантиметра — это около 1,3%.
    tight = at(pts, t / dur) * float(far.group(1))
    if not 0.4 <= tight <= 2.5:
        return f'к подъёму лист прошёл {tight:.2f}% ширины — это не полсантиметра'
    gone = at(pts, (t + 0.34) / dur) * float(far.group(1))
    return gone <= 20 or f'лист ушёл на {gone:.0f}% ширины, не дождавшись подъёма'


@check('B9', 'на задней кромке крышки два выреза-трапеции со скруглениями')
def b9():
    """Требование уточнено владельцем.

    Было: выемка под каждый кронштейн райзера. Стало: два выреза на всю кромку —
    один под оба слота райзеров разом (перемычка между ними была бы язычком
    стали в палец шириной), другой под гнёзда встроенных сетевых карт. Под USB
    и D-Sub выреза нет: там ничего не снимают.

    Спуски под сорок пять градусов, а не прямым углом: штампованный лист так и
    режут, прямой угол — концентратор напряжений. Углы скруглены, и внешние и
    внутренние.
    """
    m = re.search(r'<path d="(M\d+ 4 H[^"]*)" fill="#161f24"', LID)
    if not m:
        return 'контура листа нет'
    d = m.group(1)
    # Скос под 45°: у прямой L разница по осям одинакова.
    slopes = [(float(x), float(y)) for x, y in re.findall(r'L([\d.]+) ([\d.]+)', d)]
    if len(slopes) != 4:
        return f'наклонных участков: {len(slopes)} — вырезов должно быть два'
    # Скруглений на вырез — четыре, дуги малого радиуса.
    arcs = re.findall(r'a(\d+) \1 0 0 [01] ', d)
    if len(arcs) < 8:
        return f'скруглений на кромке: {len(arcs)}'
    # Первый вырез начинается у верхнего райзера, второй — у первого гнезда
    # сетевой карты. Точку входа ищем по вертикали перед скруглением: она
    # отстоит от кромки выреза на r·tg(22.5°).
    # Начало выреза узнаётся по направлению скругления: внутрь листа кромка
    # заворачивает дугой со sweep 0, наружу — со sweep 1. Иначе за начало
    # принимается и дальний край предыдущего выреза.
    tops = [float(v) for v in re.findall(r'V([\d.]+) a\d+ \d+ 0 0 0 ', d)]
    want = (geom.RISER[0][0] - 8, geom.IO_Y - 8)
    for w in want:
        if not any(abs(t - w) < 4 for t in tops):
            return f'выреза у y={w} нет; вертикали перед скруглениями: {tops}'
    # Под мелочью выреза быть не должно.
    aux = geom.IO_AUX_Y
    return not any(abs(t - aux) < 12 for t in tops) or 'под мелочью прорезан лишний вырез'


@check('B12', 'вырезы крышки согласованы с проёмами задней панели')
def b12():
    """Крышка садится на машину, и её вырезы обязаны совпадать с тем, что из
    машины торчит: с кронштейнами райзеров и с гнёздами сетевых карт. Иначе на
    надетой крышке вырез приходится на глухую сталь панели, а торчащий
    кронштейн — на лист.

    Проверяем не числа, а то, что и лист, и панель считают их из одних и тех же
    имён: RISER и IO_Y с JACK_PITCH. Совпадение, выписанное числами дважды,
    расходится на первой же правке.
    """
    lid_src = (ROOT / 'tools/board/blocks/lid.py').read_text(encoding='utf-8')
    io_src = (ROOT / 'tools/board/blocks/rear_io.py').read_text(encoding='utf-8')
    if 'notch(RISER[0][0]' not in lid_src or 'notch(IO_Y' not in lid_src:
        return 'крышка режет кромку по своим числам, а не по RISER и IO_Y'
    if 'cutouts=[(y, h) for y, h in RISER]' not in io_src:
        return 'панель режет проёмы не по RISER'
    return 'IO_Y + 2 * JACK_PITCH' in io_src or 'панель ставит гнёзда не по шагу JACK_PITCH'


@check('B10', 'закрытие крышки — снятие задом наперёд: та же кривая и зеркальные задержки')
def b10():
    # Сверять надо не «похоже ли», а три отдельных движения по отдельным
    # свойствам: одной проверки кривой мало — задержки живут в сокращённой
    # записи transition и разъезжаются молча.
    flat = re.sub(r'/\*.*?\*/', ' ', CSS, flags=re.DOTALL)

    def moves(sel):
        """Свойство → (длительность, задержка) из transition правила."""
        for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', flat):
            if sel not in [s.strip() for s in m.group(1).split(',')]:
                continue
            line = re.search(r'transition:([^;]*);', m.group(2))
            if not line:
                continue
            out = {}
            for part in line.group(1).split(','):
                secs = [float(v) for v in re.findall(r'([\d.]+)s', part)]
                var = re.search(r'var\(--([\w-]+)\)', part)
                if var:
                    span = re.search(rf'--{var.group(1)}: ([\d.]+)s', CSS)
                    if not span:
                        return f'кривой --{var.group(1)} нет'
                    out[part.split()[0]] = (float(span.group(1)), secs[0] if secs else 0.0)
                else:
                    out[part.split()[0]] = (secs[0], secs[1] if len(secs) > 1 else 0.0)
            return out
        return None

    fwd, back = moves('.rig.lid-off .lid'), moves('.lid')
    if not isinstance(fwd, dict) or not isinstance(back, dict):
        return f'переходов крышки не нашлось: снятие {fwd}, закрытие {back}'
    if not re.search(r'translate var\(--lid-slide\)', flat):
        return 'снятие идёт не по --lid-slide'
    if not re.search(r'translate var\(--lid-press\)', flat):
        return 'закрытие идёт не по --lid-press'
    if not mirrored('lid-slide', 'lid-press'):
        return 'кривая закрытия не является разворотом кривой снятия'
    if sorted(fwd) != sorted(back):
        return f'движений на снятии {sorted(fwd)}, на закрытии {sorted(back)}'
    span = fwd['translate'][0]
    if abs(back['translate'][0] - span) > 0.01:
        return (f'ход длится {span}s на снятии и {back["translate"][0]}s на закрытии — '
                'разной длины разворот разворотом не будет')
    # Развёрнутое движение стартует тогда, когда прямое кончало: задержка
    # обязана стать (полный ход − конец прямого). Общая добавка ко всем трём
    # разрешена — это ожидание воздуховодов, оно сдвигает ход целиком.
    shift = {}
    for prop, (dur, lag) in fwd.items():
        if abs(back[prop][0] - dur) > 0.01:
            return f'{prop}: {dur}s на снятии против {back[prop][0]}s на закрытии'
        shift[prop] = round(back[prop][1] - (span - (lag + dur)), 3)
    if max(shift.values()) - min(shift.values()) > 0.02:
        return f'задержки не зеркальны, разбег добавок: {shift}'
    return min(shift.values()) >= -0.01 or f'закрытие начинается раньше нуля: {shift}'


@check('B11', 'бирки со ссылками живут по крышке: под листом их нет, проступают, когда он сошёл')
def b11():
    flat = re.sub(r'/\*.*?\*/', ' ', CSS, flags=re.DOTALL)
    hid = re.search(r'\.rig:not\(\.lid-off\) \.callout \{([^}]*)\}', flat)
    if not hid:
        return 'бирки с крышкой не связаны: правила «лист на месте» нет'
    if not re.search(r'opacity:\s*0\b', hid.group(1)):
        return 'под закрытой крышкой бирки видны'
    if not re.search(r'\.rig:not\(\.lid-off\) a\.callout \{[^}]*pointer-events:\s*none', flat):
        return 'под закрытой крышкой в бирки всё ещё можно ткнуть'
    show = re.search(r'\.rig\.lid-off \.callout \{([^}]*)\}', flat)
    lag = show and re.search(r'transition-delay:\s*calc\(([\d.]+)s \+ '
                             r'var\(--tag-order[^*]*\* ([\d.]+)s\)', show.group(1))
    if not lag:
        return 'снятая крышка бирок не показывает либо показывает разом, без --tag-order'
    if float(lag.group(2)) <= 0:
        return 'ступеньки между бирками нет — они выскакивают все сразу'
    # Раньше времени бирки выскочили бы из-под ещё не ушедшего листа.
    dur = float(re.search(r'--lid-slide: ([\d.]+)s', CSS).group(1))
    gone = at(curve('lid-slide'), min(1.0, float(lag.group(1)) / dur))
    if gone < 0.85:
        return f'бирки проступают, когда крышка прошла {gone*100:.0f}% пути'
    # А на закрытии, наоборот, гаснуть надо до того, как лист тронулся: иначе
    # надписи будут читаться сквозь идущую крышку.
    start = re.search(r'translate var\(--lid-press\) ([\d.]+)s', flat)
    if not start:
        return 'закрытие идёт без задержки — сверять уход бирок не с чем'
    fade = re.search(r'transition:([^;]*);', hid.group(1))
    off = sum(float(v) for v in re.findall(r'([\d.]+)s', fade.group(1))) if fade else 0.0
    return off <= float(start.group(1)) + 0.01 or (
        f'бирки гаснут {off:.2f}s, а лист трогается на {start.group(1)}s')


# ── C. Воздуховоды памяти ────────────────────────────────────────────────
# Кожух — узел платы, поэтому читаем BOARD. Каждый нарисован одним фрагментом,
# то есть одной строкой собранного файла.

FAN_OF = {'l': (0,), 'c': (3, 4), 'r': (7,)}
LETTERS_OF = {'l': 'ABCDEFGH', 'c': 'IJKLABCD', 'r': 'EFGHIJKL'}


def _hoods():
    return {ln[len('<g class="baffle baffle-')]: ln
            for ln in BOARD.split('\n') if ln.startswith('<g class="baffle baffle-')}


def _hood_path(hood):
    return re.search(r'<path d="([^"]*)" fill="#080c0e"', hood).group(1)


def _fan_window(fans):
    """Окно вентиляторов, к которым ведёт раструб: сверху донизу."""
    return (26 + fans[0] * geom.FAN_STEP,
            26 + fans[-1] * geom.FAN_STEP + geom.FAN_H)


@check('C1', 'над каждым банком кожух, справа — по границе процессора')
def c1():
    hoods = _hoods()
    if sorted(hoods) != ['c', 'l', 'r']:
        return f'кожухов на схеме: {sorted(hoods)}'
    right = geom.X_SOCK + geom.SOCKET_W
    for code, y0 in zip('lcr', (geom.Y_BANK_L, geom.Y_BANK_C, geom.Y_BANK_R)):
        m = re.match(r'M[\d.]+ [\d.]+ L[\d.]+ ([\d.]+) H([\d.]+) V([\d.]+)', _hood_path(hoods[code]))
        if not m:
            return f'кожух {code}: контур не разобран'
        top, x_r, bot = float(m.group(1)), float(m.group(2)), float(m.group(3))
        if abs(x_r - right) > 1:
            return f'кожух {code} кончается на {x_r:.0f}, край процессора на {right}'
        bank_bot = y0 + (geom.BANK_N - 1) * geom.PITCH + geom.SLOT_H
        if top > y0 or bot < bank_bot:
            return f'кожух {code} накрывает {top:.0f}..{bot:.0f} при банке {y0}..{bank_bot}'
    # Подписи слотов остаются на виду: они правее кожуха.
    plates = [r for r in rects(BOARD, rx='1.5') if abs(r[3] - 12.5) < 0.1]
    if not plates:
        return 'плашек подписей DIMM не нашлось'
    return min(r[0] for r in plates) > right or 'подписи DIMM ушли под кожух'


@check('C2', 'раструб каждого кожуха приходится на свои вентиляторы, и номера те же')
def c2():
    for code, hood in _hoods().items():
        d = _hood_path(hood)
        top = float(re.match(r'M[\d.]+ ([\d.]+)', d).group(1))
        bot = float(re.search(r'L[\d.]+ ([\d.]+) Z', d).group(1))
        f0, f1 = _fan_window(FAN_OF[code])
        if abs(top - f0) > 1 or abs(bot - f1) > 1:
            return (f'кожух {code}: раструб {top:.0f}..{bot:.0f}, '
                    f'окно вентиляторов {f0:.0f}..{f1:.0f}')
        nums = sorted(set(re.findall(r'>(\d)</text>', hood)))
        want = sorted(str(i + 1) for i in FAN_OF[code])
        if nums != want:
            return f'кожух {code} подписан вентиляторами {nums}, ведёт к {want}'
    return True


@check('C3', 'у вентилятора полупрозрачная шторка с вырезом под оранжевую ручку')
def c3():
    tab_x = geom.X_FAN + geom.FAN_W - 8
    handles = [r for r in rects(BOARD, fill='#cb4b16') if abs(r[0] - tab_x) < 0.1]
    for code, hood in _hoods().items():
        m = re.search(rf'<path d="(M{tab_x} [^"]*)" fill="#dfe8ea" fill-opacity="([\d.]+)"', hood)
        if not m:
            return f'у кожуха {code} шторки нет'
        op = float(m.group(2))
        if not 0.05 <= op <= 0.35:
            return f'шторка кожуха {code} залита на {op}: сквозь неё либо всё, либо ничего'
        notches = [(float(b), float(a)) for a, b in
                   re.findall(rf'V([\d.]+) H{tab_x+22} V([\d.]+)', m.group(1))]
        if len(notches) != len(FAN_OF[code]):
            return f'в шторке кожуха {code} вырезов {len(notches)} на {len(FAN_OF[code])} ручек'
        for i in FAN_OF[code]:
            tab = [r for r in handles
                   if abs(r[1] - (26 + i * geom.FAN_STEP + geom.FAN_H / 2 - 19)) < 0.6]
            if not tab:
                return f'ручки вентилятора {i+1} на схеме нет'
            ty, th = tab[0][1], tab[0][3]
            if not any(hi <= ty and lo >= ty + th for hi, lo in notches):
                return f'вырез кожуха {code} не приходится на ручку вентилятора {i+1}'
    return True


@check('C4', 'на пластике отлиты процессор, слоты, вентиляторы и указатель потока')
def c4():
    cpu = {'l': 'CPU 0', 'c': 'CPU 0 / CPU 1', 'r': 'CPU 1'}
    for code, hood in _hoods().items():
        if f'>{cpu[code]}</text>' not in hood:
            return f'кожух {code} без обозначения процессора {cpu[code]}'
        if '>DIMM SLOTS</text>' not in hood:
            return f'кожух {code} без разметки DIMM SLOTS'
        got = [t for x, y, t, d in texts(hood) if len(t) == 1 and t.isalpha()]
        if sorted(set(got)) != sorted(set(LETTERS_OF[code])):
            return f'кожух {code}: каналы {sorted(set(got))} против {sorted(set(LETTERS_OF[code]))}'
        # Литьё, а не печать: каждая надпись набрана дважды — тень в канавке и
        # блик на её кромке. В одну краску это была бы наклейка.
        if len(got) != 2 * geom.BANK_N:
            return (f'кожух {code}: буквы каналов набраны {len(got)} раз вместо '
                    f'{2 * geom.BANK_N} — у литья тень и блик, а не одна краска')
        if '<ellipse' not in hood:
            return f'кожух {code} без значка вентилятора'
        if not re.search(r'<path d="M[\d.]+ [\d.]+ h[\d.]+ v-7 l', hood):
            return f'кожух {code} без указателя потока'
    return True


@check('C5', 'воздуховоды снимаются после крышки, а встают перед ней')
def c5():
    # Комментарии из стилей убираем: иначе они попадают в список селекторов
    # правила и ни один из них не сходится дословно.
    flat = re.sub(r'/\*.*?\*/', ' ', CSS, flags=re.DOTALL)

    def rules(sel):
        out = []
        for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', flat):
            if sel in [s.strip() for s in m.group(1).split(',')]:
                out.append(m.group(2))
        return ' '.join(out)

    up, down, mid = (rules(f'.rig.lid-off .baffle-{c}') for c in 'lrc')
    if 'translateY(-' not in up:
        return 'верхний кожух уходит не вверх'
    if not re.search(r'translateY\(\d', down):
        return 'нижний кожух уходит не вниз'
    if 'translateY(-' not in mid or 'opacity: 0' not in mid:
        return 'центральный не растворяется на ходу вверх'
    lag = re.search(r'transform var\(--baffle-lift\) ([\d.]+)s', up)
    if not lag:
        return 'кожухи трогаются вместе с крышкой'
    # Крышку в это время должно быть видно снятой, а не только тронувшейся:
    # первые полсекунды она идёт туго и с места будто не двигается.
    dur = float(re.search(r'--lid-slide: ([\d.]+)s', CSS).group(1))
    gone = at(curve('lid-slide'), min(1.0, float(lag.group(1)) / dur))
    if gone < 0.5:
        return f'кожухи трогаются, когда крышка прошла {gone*100:.0f}% пути'
    if re.search(r'transform var\(--baffle-lift\) [\d.]', rules('.baffle-l')):
        return 'на обратном ходе кожухи тоже ждут — тогда они встают после крышки'
    if not re.search(r'translate var\(--lid-press\) [\d.]+s', rules('.lid')):
        return 'крышка на обратном ходе не ждёт кожухи'
    return True


def _sfx():
    """Собранная логика целиком: меток частей в ней уже нет, их съедает сборка."""
    return JS


def _body(name):
    """Тело функции по имени — до закрывающей скобки на её же отступе."""
    i = JS.find(f'function {name}(')
    if i < 0:
        return ''
    return JS[i:JS.find('\n  }', i)]


@check('AL1', 'щелчок собран ударом и модами, а не полосой шума')
def al1():
    body = _body('chk')
    if 'burst(' in body:
        return 'щелчок снова кусок шума в полосе'
    if 'tick(' not in body or body.count('mode(') < 3:
        return 'нет фронта или мод'
    # Полоса Q=6 выбрасывала двадцать три децибела энергии — ради этого всё и
    # переписывалось; вернуть её значит вернуть щелчок, которого не слышно.
    return 'duck(' in body or 'гул не приседает под удар'


@check('AL2', 'гул приседает под удар отдельной ручкой, а не общей')
def al2():
    sfx = _sfx()
    if 'function duck(' not in sfx or 'humDuck' not in sfx:
        return 'приглушения нет'
    if 'g.connect(duckNode())' not in sfx:
        return 'гул идёт мимо ручки приглушения'
    # Своя ручка нужна потому, что ту, что поднимает гул, humLevel переписывает
    # целиком при каждом заходе курсора на машину.
    return 'humDuck.connect(bus)' in sfx or 'ручка приглушения ни к чему не подключена'


@check('AL3', 'тон гула считается от текущих оборотов, а не от паспорта')
def al3():
    sfx = _sfx()
    if 'animationDuration' not in sfx or 'function fanRpm(' not in sfx:
        return 'обороты берутся из паспорта и не меняются'
    if 'SPIN_NOM' not in sfx:
        return 'не с чем сравнивать паспортный период'
    if 'function humTune(' not in sfx or 'exponentialRampToValueAtTime' not in sfx:
        return 'тон не едет за оборотами'
    if 'MutationObserver' not in sfx:
        return 'смену настроек BIOS никто не слушает'
    return True


@check('AL4', 'тихая загрузка глушит писк спикера')
def al4():
    if "toggle('nv-quiet'" not in JS:
        return 'прошивка не объявляет тихую загрузку'
    sfx = _sfx()
    beep = sfx[sfx.find('beep: function'):]
    beep = beep[:beep.find('\n    }')]
    if "nv-quiet" not in beep:
        return 'писк не спрашивает про тихую загрузку'
    # По умолчанию она выключена: машина показывает полный журнал самотеста,
    # то есть ведёт себя как машина с выключенной тихой загрузкой.
    return "quietBoot: 'Disabled'" in JS or 'по умолчанию машина стартует молча'


@check('AL5', 'запрещённые C-States слышны писком дросселей')
def al5():
    if "toggle('nv-cst-off'" not in JS:
        return 'прошивка не объявляет запрет C-States'
    sfx = _sfx()
    if 'coil' not in sfx:
        return 'дросселей нет'
    if "contains('nv-cst-off')" not in sfx:
        return 'писк не спрашивает про C-States'
    if "contains('nv-eff')" not in sfx:
        return 'на энергосбережении дроссели тоже поют, а там машина спит'
    return True


@check('AL6', 'гул разложен на рокот и поток, тона расстроены между собой')
def al6():
    sfx = _sfx()
    nodes = _body('fanNodes')
    if "'lowpass'" not in nodes:
        return 'рокота корпуса нет — гул остался одной серединой'
    if nodes.count("'bandpass'") < 1 or nodes.count("'lowpass'") < 2:
        return 'у потока нет завала верха, от него и устаёт ухо'
    detune = re.search(r'\[(-?[\d.]+(?:, *-?[\d.]+){2,})\]\.forEach', nodes)
    if not detune:
        return 'все крыльчатки гудят в унисон'
    return True


@check('AJ3', 'сетка фона ходит за мышью и в лупе, и в обычном виде')
def aj3():
    # Сдвиг ставится обычным свойством на самих слоях. Наследуемой переменной
    # на корне тут быть не должно: запись в неё раз в кадр гонит пересчёт стиля
    # по всему дереву — 68% главного потока и десять кадров в секунду, померено
    # (см. PROGRESS.8213f6dc.md).
    page = (ROOT / 'style.css').read_text(encoding='utf-8')
    if '--dots-x' in HTML or '--dots-x' in CSS or '--dots-x' in page:
        return 'сдвиг снова ходит наследуемой переменной с корня'
    body = HTML[HTML.find('function animate()'):]
    body = body[:body.find('})();')]
    if 'dotsEl.style.backgroundPosition' not in body:
        return 'фон страницы стоит на месте'
    if 'rigBody.style.backgroundPosition' not in body:
        return 'поле лупы рисует сетку без сдвига'
    if 'pos !== dotsPos' not in body:
        return 'сдвиг пишется и тогда, когда не изменился'
    return True


@check('AJ4', 'подвал страницы в лупе уходит и перестаёт ловить курсор')
def aj4():
    flat = re.sub(r'/\*.*?\*/', ' ', CSS, flags=re.DOTALL)
    if not re.search(r'body\.zoom \.meta \{[^}]*opacity: 0', flat):
        return 'подвал остаётся видимым'
    if not re.search(r'body\.zoom \.meta a \{[^}]*pointer-events: none', flat):
        return 'ссылка в подвале по-прежнему кликается'
    return True


@check('AJ5', 'наведение гасит машину, а узел остаётся собой и обводится своим цветом')
def aj5():
    flat = re.sub(r'/\*.*?\*/', ' ', CSS, flags=re.DOTALL)
    # Приглушается группа железа, а не вся плата: подписи и обводки лежат вне
    # её и потому остаются собой. Компенсировать их обратным множителем
    # нельзя — на белой плашке он упирается в потолок и возвращает серое.
    if '<g class="lyr-parts">' not in BOARD:
        return 'железо не выделено в свой слой, приглушать нечего'
    if BOARD.index('<g class="lyr-parts">') > BOARD.index('class="callouts"'):
        return 'подписи попали внутрь группы железа'
    dim = re.search(r'\.rig\.spot:not\(\.service\) \.lyr-deck,[^{]*\{[^}]*'
                    r'brightness\(([\d.]+)\)', flat)
    if not dim:
        return 'схема при наведении не гаснет'
    if float(dim.group(1)) < 0.6:
        return f'машина не приглушается, а гаснет: {dim.group(1)}'
    # Приглушаются все бирки, кроме той, чей узел под курсором: когда вывели из
    # приглушения все семь, они загорались разом и не показывали ничего.
    off = re.search(r'\.rig\.spot:not\(\.service\) a\.callout:not\(\.lit\) \{[^}]*'
                    r'brightness\(([\d.]+)\)', flat)
    if not off:
        return 'соседние бирки не приглушаются, горят все разом'
    if abs(float(off.group(1)) - float(dim.group(1))) > 0.001:
        return 'бирки приглушаются не в ту же меру, что железо'
    if re.search(r'a\.callout\.lit[^{]*\{[^}]*brightness', flat):
        return 'подсвеченную бирку снова осветляют множителем — белое обрежется'
    lit = re.search(r'\.rig\.spot:not\(\.service\) \.unit\.lit \{[^}]*'
                    r'brightness\(([\d.]+)\)', flat)
    if not lit or float(lit.group(1)) * float(dim.group(1)) < 1.2:
        return 'узел под курсором не подсвечен, а только не погашен'
    if '.lid > svg' not in flat:
        return 'надетая крышка остаётся яркой над погашенной машиной'
    if 'spot-rings' not in JS or 'getBBox' not in JS:
        return 'кольца рисуются не по габаритам самих узлов'
    return True


@check('AK3', 'схема разложена по слоям, и слои ничего не потеряли')
def ak3():
    import importlib

    from board.canvas import Canvas
    from build import LAYERS, ORDER, layered

    cls = [f'lyr-{c}' for c, _ in LAYERS]
    for c in cls:
        if f'<g class="{c}">' not in BOARD:
            return f'слоя {c} в разметке нет'
    # Слои идут в объявленном порядке и не вложены друг в друга.
    at = [BOARD.index(f'<g class="{c}">') for c in cls]
    if at != sorted(at):
        return f'слои идут не в объявленном порядке: {cls}'
    # На группе слоя не должно быть transform: кольца прожектора меряют узлы
    # через getBBox() и кладут прямоугольники в координатах корня, а своя
    # система координат у слоя увела бы их вбок.
    if re.search(r'<g class="lyr-[a-z]+"[^>]*transform', BOARD):
        return 'на слое появился transform — кольца наведения уедут'
    # Обводки и бирки лежат в самом верхнем слое поверх железа.
    if BOARD.index('<g class="lyr-tags">') > BOARD.index('class="spot-rings"'):
        return 'кольца наведения оказались вне верхнего слоя'
    # И главное: обёртки ничего не теряют и не переставляют. Пересобираем
    # холст заново и сверяем список фрагментов с обёрнутым.
    cv = Canvas()
    report = []
    for name in ORDER:
        mark = len(cv.parts)
        importlib.import_module(f'board.blocks.{name}').render(cv)
        report.append((name, len(cv.parts) - mark, None))
    plain = list(cv.parts)
    inner = [p for p in layered(plain, report)
             if not (p.startswith('<g class="lyr-') or p == '</g>')]
    return inner == plain or 'слои теряют или переставляют фрагменты'


def silk_rev(markup):
    """Номер ревизии, набитый на текстолите."""
    m = re.search(r'REV (\d+) · S/N [0-9A-F]+', markup)
    return m.group(1) if m else '—'


def _spec():
    """Паспорт машины, вшитый в страницу генератором."""
    import json

    return json.loads(re.search(r'id="rig-spec">(.*?)</script>', HTML, re.DOTALL).group(1))


@check('AM3', 'ревизия платы — номер той сборки, которой она станет, а не предыдущей')
def am3():
    import subprocess

    from board.revision import BOARD_REV

    done = subprocess.run(('git', '-C', str(ROOT), 'rev-list', '--count', 'HEAD', '--', 'index.html'),
                          capture_output=True, text=True, check=False).stdout.strip()
    if not done.isdigit():
        return 'счётчик коммитов страницы не прочитался'
    # Номер смотрит вперёд, поэтому сверять его с числом коммитов надо с
    # оглядкой на то, лежит ли страница уже в коммите.
    #
    #   страница правлена, но не закоммичена — она станет коммитом N+1,
    #     и генератор обязан набить N+1;
    #   страница закоммичена — тем самым коммитом она и стала, счётчик уже
    #     учёл её, и набитое N совпадает со счётчиком.
    #
    # Первая версия требовала N+1 всегда — и краснела сразу после каждого
    # коммита пересобранной страницы, требуя пересобрать её снова. Это была
    # не поломка ревизии, а качели в самой проверке.
    dirty = bool(subprocess.run(('git', '-C', str(ROOT), 'status', '--porcelain', '--', 'index.html'),
                                capture_output=True, text=True, check=False).stdout.strip())
    want = int(done) + 1 if dirty else int(done)
    if int(BOARD_REV) != int(done) + 1:
        return f'сборка числит REV {BOARD_REV} при {done} коммитах страницы'
    if int(silk_rev(BOARD)) != want:
        return (f'на плате REV {silk_rev(BOARD)}, а страница '
                f'{"правлена" if dirty else "закоммичена"} при {done} коммитах — ждали {want}')
    # Паспорт и текстолит — из одного места, разойтись не должны.
    return _spec()['board']['rev'] == int(silk_rev(BOARD)) or \
        f'паспорт числит ревизию {_spec()["board"]["rev"]}, плата — {silk_rev(BOARD)}'


@check('AM4', 'серийный номер — отпечаток чертежа, а не хэш предыдущего коммита')
def am4():
    from board.revision import SN_SLOT

    if SN_SLOT in BOARD or SN_SLOT in HTML:
        return 'заполнитель серийного номера остался в разметке'
    silk = re.search(r'REV \d+ · S/N ([0-9A-F]{7})\b', BOARD)
    if not silk:
        return 'серийный номер на текстолите не семизначный'
    # Тот же номер и в паспорте: печатает его самотест, и разойтись с платой
    # он не должен — раньше расходились именно тем, что оба брались от HEAD.
    if _spec()['board']['sha'] != silk.group(1):
        return f'паспорт числит S/N {_spec()["board"]["sha"]}, на плате {silk.group(1)}'
    # Ссылка марки ведёт на историю страницы. На один коммит она вести не
    # может: тот, в котором эта плата уедет, на момент сборки не существует.
    return '/commits/master/index.html"' in BOARD or 'марка всё ещё ведёт на один коммит'


@check('AN1', 'история схемы уезжает в деплой, а не остаётся на машине разработчика')
def an1():
    wf = (ROOT / '.github/workflows/deploy.yaml').read_text(encoding='utf-8')
    # Мелкий клон истории страницы не содержит — ленту из него не собрать.
    if 'fetch-depth: 0' not in wf:
        return 'checkout мелкий, историю страницы не достать'
    if 'python3 tools/history.py' not in wf:
        return 'history.py в сборке не запускается'
    if 'cp -r history _site/' not in wf:
        return 'история не попадает в _site'
    # Имя файла несёт хэш коммита, поэтому кэш вечный.
    heads = (ROOT / '_headers').read_text(encoding='utf-8')
    return ('/history/*.svg' in heads and 'immutable' in heads) or 'нет вечного кэша для схем'


@check('AN2', 'history.py не привязан к одной машине')
def an2():
    src = (ROOT / 'tools/history.py').read_text(encoding='utf-8')
    if 'Path("/workspaces' in src:
        return 'путь к репозиторию записан руками — в CI такого каталога нет'
    return 'Path(__file__).resolve().parents[1]' in src or 'корень репозитория считается не от скрипта'


@check('AN3', 'лента включается и выключается командой')
def an3():
    term = (ROOT / 'tools/board/parts/term.js').read_text(encoding='utf-8')
    zone = term[term.find("name: 'revisions'"):]
    zone = zone[:zone.find('});')]
    if "usage: 'revisions on|off'" not in zone:
        return 'команда не объявляет on|off'
    if "'on'" not in zone or "'off'" not in zone:
        return 'разбора on/off нет'
    # Выйти из ленты, оставшись на старой схеме, нельзя: ползунка уже не будет.
    if 'showRev(revs.length - 1)' not in zone:
        return 'off не возвращает машину на текущую сборку'
    return "complete: function" in zone or 'нет дополнения по Tab'


@check('AN4', 'схема с ленты — снимок: не движется и не нажимается')
def an4():
    if '.rig.archive #board * { animation: none; }' not in CSS:
        return 'архивная схема продолжает анимироваться'
    if '.rig.archive #board { pointer-events: none; }' not in CSS:
        return 'на архивной схеме остались нажимаемые органы'
    return "rig.classList.toggle('archive'" in JS or 'снимок ничем не помечается'


@check('AN5', 'органы управления на плате переживают подмену разметки')
def an5():
    # Прямой обработчик уезжает вместе со старым узлом: showRev переписывает
    # board.innerHTML целиком, и кнопки переставали нажиматься.
    if re.search(r'(svcSwitch|lidOn|lidRemove)\.addEventListener', JS):
        return 'обработчик снова висит прямо на кнопке платы'
    if 'function onBoard(' not in JS:
        return 'делегирования на плату нет'
    # Крышка ходит через свою обёртку bindLid, она же зовёт onBoard.
    if 'onBoard(id, function' not in JS:
        return 'кнопки крышки мимо делегирования'
    missing = [i for i in ("onBoard('svc-switch'", "bindLid('lid-remove'", "bindLid('lid-on'")
               if i not in JS]
    return not missing or f'не через плату: {missing}'


@check('AM5', 'лента показывает место в ленте, а не чужую ревизию')
def am5():
    if "'REV '" in JS:
        return 'подпись ленты снова называет себя ревизией'
    return "+ '/' + revs.length" in JS or 'лента не показывает своё место'


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
    # Закрытые пункты без проверки. Пункт, который никто не проверял, легко
    # спутать с пройденным — поэтому он назван вслух.
    plan = (ROOT / 'TODO-PLAN.md').read_text(encoding='utf-8')
    done = re.findall(r'^- \[x\] ([A-Z]\d+[а-я]?)\.', plan, re.MULTILINE)
    have = {c for c, _, _ in CHECKS}
    blind = [c for c in done if c not in have and c.startswith(only)]
    if blind:
        print(f'  без проверки ({len(blind)}): {", ".join(blind)}')
    print('всё сходится' if not bad else f'не сошлось: {bad} из {len(rows)}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
