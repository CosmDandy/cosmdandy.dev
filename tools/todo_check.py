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


# ── F. Рейзеры ───────────────────────────────────────────────────────────

@check('F4', 'пустой слот подписан Empty, а не Free')
def f4():
    labels = [t for x, y, t, d in texts(BOARD)]
    if any('FREE' in t.upper() for t in labels):
        return 'надпись FREE осталась'
    return any('EMPTY' in t.upper() for t in labels) or 'нет надписи EMPTY'


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
