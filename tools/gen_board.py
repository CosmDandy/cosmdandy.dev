"""Генератор SVG платы, v17.

Геометрия снята с реальной схемы Gigabyte R183-S94 (вид сверху, крышка снята):
refs/gigabyte-r183-s94-top.png. Композиция повёрнута на 90° — фронт слева,
глубина вправо, потому что экран широкий, а сервер длинный.

Индикация построена по IBM x3550 M3: прозрачные защёлки памяти, которые
загораются жёлтым при извлечении, такие же лампы у процессоров, вентиляторов и
райзеров, выдвижная панель Light Path Diagnostics на фронте.

Важно про индикаторы: гасим их через fill-opacity, а не через opacity.
opacity на SVG-элементе создаёт composited layer, и в браузере эти слои
перекрывают сцену целиком — именно так выглядел «весь фон стал чёрным».

Две роли элементов, и они не совпадают:
  .unit — то, что называет себя ярлыком при наведении (диск, банк памяти,
          процессор, сетевая карта). Ярлык живёт рядом со своим узлом.
  .pick — то, что физически вынимается: планка, диск, вентилятор, радиатор,
          райзер, блок питания.
Лампа неисправности всегда лежит внутри своего .pick — иначе селектор
`.pick.pulled .fault` до неё не достаёт, и горят не те лампы.

Результат подставляется прямо в v17.html между маркерами BOARD:BEGIN/END.
"""

import re

W, H = 1314, 863
import subprocess

# Ревизия платы — это ревизия репозитория: номер сборки равен числу коммитов,
# а серийный номер — хэшу HEAD. С каждым коммитом шелкография меняется, как
# меняется артикул платы при смене ревизии.
def git(*args, default=""):
    try:
        return subprocess.run(("git", "-C", "/workspaces/cosmdandy.dev") + args,
                              capture_output=True, text=True, timeout=5).stdout.strip() or default
    except Exception:
        return default

BOARD_REV = git("rev-list", "--count", "HEAD", default="0")
BOARD_SHA = git("rev-parse", "--short=7", "HEAD", default="0000000").upper()
REPO = "https://github.com/CosmDandy/cosmdandy.dev"

# У каждого узла свой партномер, и это хэш коммита, который его последний раз
# менял. Границы блоков — заголовки вида «# ── имя ───» в этом же файле, а
# историю диапазона строк git умеет отслеживать сам, через log -L.
_SRC = __file__
_LINES = open(_SRC, encoding="utf-8").read().split("\n")
_HEADS = [(i + 1, l) for i, l in enumerate(_LINES) if l.startswith("# ── ")]

def block_sha(prefix):
    """Хэш коммита, последним изменившего блок с таким заголовком."""
    for k, (ln, text) in enumerate(_HEADS):
        if text.startswith("# ── " + prefix):
            end = _HEADS[k + 1][0] - 1 if k + 1 < len(_HEADS) else len(_LINES)
            out = git("log", "-1", "--format=%h", "-L", f"{ln},{end}:tools/{_SRC.rsplit('/', 1)[-1]}")
            return (out.split("\n")[0] or "0000000")[:7]
    return "0000000"

def stamp(x, y, prefix, anchor="start", op=0.3):
    """Партномер узла: хэш его последнего коммита, ссылкой на этот коммит."""
    sha = block_sha(prefix)
    return (f'<a class="stamp" href="{REPO}/commit/{sha}" target="_blank" rel="noopener" '
            f'data-sha="{sha}">'
            + mono(x, y, f"P/N {sha.upper()}", 6, anchor=anchor, op=op)
            + '</a>')

P = []
def add(s): P.append(s)

def mono(x, y, text, size=11, anchor="middle", op=0.5):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" fill="rgba(147,161,161,{op})" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text>')

def jitter(i, base, spread, salt=0):
    """Детерминированный разброс: индикаторы не должны мигать в такт."""
    return round(base + ((i * 37 + salt * 13 + 11) % 100) / 100 * spread, 2)

GLOW = {'#2aa198': 'rgba(42,161,152,0.20)', '#859900': 'rgba(133,153,0,0.20)',
        '#b58900': 'rgba(181,137,0,0.22)', '#268bd2': 'rgba(38,139,210,0.22)',
        '#dc322f': 'rgba(220,50,47,0.22)'}

GLOW3 = {
    '#2aa198': ('rgba(42,161,152,0.16)', 'rgba(42,161,152,0.10)', 'rgba(42,161,152,0.05)'),
    '#859900': ('rgba(133,153,0,0.16)', 'rgba(133,153,0,0.10)', 'rgba(133,153,0,0.05)'),
    '#b58900': ('rgba(181,137,0,0.18)', 'rgba(181,137,0,0.11)', 'rgba(181,137,0,0.05)'),
    '#268bd2': ('rgba(38,139,210,0.18)', 'rgba(38,139,210,0.11)', 'rgba(38,139,210,0.05)'),
    '#f4d03f': ('rgba(244,208,63,0.22)', 'rgba(244,208,63,0.13)', 'rgba(244,208,63,0.06)'),
}

def glow(cls, cx, cy, r, color, extra=''):
    """Мягкий ореол: три круга с убывающей плотностью вместо одного жёсткого.

    Радиальный градиент был бы точнее, но paint server отваливается при
    трансформациях — поэтому только сплошные заливки.
    """
    tones = GLOW3.get(color, ('rgba(147,161,161,0.14)', 'rgba(147,161,161,0.09)', 'rgba(147,161,161,0.04)'))
    return ''.join(
        f'<circle class="{cls} halo" cx="{cx}" cy="{cy}" r="{r*k:.1f}" fill="{t}"{extra}/>'
        for k, t in zip((1.7, 2.5, 3.4), tones))

def act_led(i, cx, cy, r, color, salt=0, aux=False):
    """Лампа активности: резкая, ступенчатая, у каждой свой период и фаза.

    aux=True — узел питается от дежурки и работает при выключенной машине:
    так живут BMC, порт управления и сами блоки питания.
    """
    d = jitter(i, 0.7, 1.6, salt)
    delay = -jitter(i, 0, 2.2, salt + 5)
    cls = 'led led-act aux' if aux else 'led led-act'
    style = f' style="animation-duration:{d}s;animation-delay:{delay}s"'
    return (glow(cls, cx, cy, r, color, style) +
            f'<circle class="{cls}" cx="{cx}" cy="{cy}" r="{r}" fill="{color}"{style}/>')

def fault_at(cx, cy, r=4.5, shift=18):
    """Лампа со сдвигом, если выбранное место уже занято креплением."""
    for dy in (0, -shift, shift, -2 * shift, 2 * shift):
        if free(cx - r - 4, cy + dy - r - 4, 2 * r + 8, 2 * r + 8):
            busy(cx - r - 4, cy + dy - r - 4, 2 * r + 8, 2 * r + 8)
            return fault(cx, cy + dy, r)
    busy(cx - r - 4, cy - r - 4, 2 * r + 8, 2 * r + 8)
    return fault(cx, cy, r)

def fault(cx, cy, r=4.5):
    """Лампа на плате: в покое матовая и всё равно заметная, при сбое горит.

    Подложка нужна, чтобы лампу было видно и на выключенной машине — иначе
    непонятно, где вообще искать индикацию.
    """
    return (f'<circle cx="{cx}" cy="{cy}" r="{r+2.5}" fill="#20282d" stroke="rgba(147,161,161,0.34)" stroke-width="1"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#8d979a"/>'
            + glow('fault', cx, cy, r, '#f4d03f')
            + f'<circle class="fault" cx="{cx}" cy="{cy}" r="{r}" fill="#f4d03f"/>')

def tag(x_center, y, text):
    """Ярлык узла. Держим внутри габарита: за краем его срезает."""
    return (f'<g class="tag"><rect x="{x_center-78}" y="{y-15}" width="156" height="30" rx="6"/>'
            f'<text x="{x_center}" y="{y+6}" text-anchor="middle">{text}</text></g>')

def callout(tx, ty, ax, ay, text, anchor="start", href=None, unit=None):
    """Постоянная выноска-ссылка: якорь на узле, линия и подпись.

    На визитке подписи обязаны быть видны сразу и вести по адресу — гость не
    должен догадываться, что по железу надо водить курсором.
    """
    w = len(text) * 9 + 26
    x0 = tx if anchor == "start" else tx - w
    inner = (f'<circle class="co-dot" cx="{ax}" cy="{ay}" r="3.4"/>'
             f'<path class="co-line" d="M{ax} {ay} L{tx + (10 if anchor == "start" else -10)} {ty}" fill="none"/>'
             f'<rect class="co-box" x="{x0}" y="{ty-14}" width="{w}" height="28" rx="3"/>'
             f'<text class="co-text" x="{x0 + w/2}" y="{ty+6}" text-anchor="middle">{text}</text>')
    # data-for связывает подпись с узлом: наводишь на сетевую карту — горит её
    # подпись, наводишь на подпись — горит карта. Без него подсветка
    # односторонняя, и непонятно, к чему относится ярлык.
    attr = f' data-for="{unit}"' if unit else ''
    if href:
        return f'<a class="callout" href="{href}" target="_blank" rel="noopener"{attr}>{inner}</a>'
    return f'<g class="callout"{attr}>{inner}</g>'

def hit(x, y, w, h):
    """Зона захвата: без неё клик проваливается в щели между фигурами."""
    return f'<rect class="hit" x="{x}" y="{y}" width="{w}" height="{h}" fill="#000" fill-opacity="0.001"/>'

def rj45(x, y, w=52, h=30):
    """Гнездо RJ45: прямоугольник с ключом-выемкой сверху."""
    k = w * 0.46
    return (f'<path d="M{x} {y+h} V{y+8} H{x+(w-k)/2} V{y} H{x+(w+k)/2} V{y+8} H{x+w} V{y+h} Z" '
            f'fill="#0a1417" stroke="rgba(42,161,152,0.38)" stroke-width="1.2"/>'
            f'<rect x="{x+6}" y="{y+h-9}" width="{w-12}" height="4" fill="rgba(147,161,161,0.18)"/>')

def sfp(x, y, w=58, h=26):
    """Клетка SFP+: щель с язычком защёлки и рядом контактов."""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#0a1417" '
            f'stroke="rgba(42,161,152,0.42)" stroke-width="1.2"/>'
            f'<rect x="{x+4}" y="{y+5}" width="{w-8}" height="{h-14}" rx="1" fill="#060e11" '
            f'stroke="rgba(147,161,161,0.16)"/>'
            f'<rect x="{x+w-16}" y="{y+h-7}" width="12" height="4" rx="1" fill="rgba(42,161,152,0.34)"/>')


# ── Регистр занятых мест ──────────────────────────────────────────────────
# Плата плотная, и мелочь то и дело садилась на монтажные отверстия и на
# чужие подписи. Каждый крупный элемент отмечает свой прямоугольник, а мелочь
# и шелкография перед вставкой спрашивают, свободно ли.
BUSY = []
CALLOUTS = []   # постоянные подписи: (x текста, y текста, x якоря, y якоря, текст, сторона)

def busy(x, y, w, h, pad=3):
    BUSY.append((x - pad, y - pad, x + w + pad, y + h + pad))

def free(x, y, w, h):
    for (x1, y1, x2, y2) in BUSY:
        if x < x2 and x + w > x1 and y < y2 and y + h > y1:
            return False
    return True

def put(x, y, w, h):
    """Занять место, если свободно. Возвращает True, если получилось."""
    if not free(x, y, w, h):
        return False
    busy(x, y, w, h)
    return True

# ── зоны по глубине ───────────────────────────────────────────────────────
X_FRONT  = 6      # фронт: блок управления сверху, отсеки дисков под ним
X_BP     = 160    # backplane — вплотную к корзине, диски кончаются на 159
X_FAN    = 192    # стенка вентиляторов
FAN_W    = 180    # шире прежнего: заняла место, освободившееся у backplane
X_PCB    = 382    # плата
X_CORE   = 504    # слоты памяти
X_SVC    = 842    # служебная зона: батарея, microSD, M.2
X_REAR   = 1004   # отсеки БП
X_IO     = 1214   # задняя панель

FRONT_W  = 156
Y_PANEL  = 150

# ── зоны по ширине: 8 DIMM | CPU0 | 16 DIMM | CPU1 | 8 DIMM ───────────────
# Планки стали толще, зазоры между ними и до сокета — меньше.
PITCH = 14
SLOT_H = 12
Y_BANK_L, Y_CPU0, Y_BANK_C, Y_CPU1, Y_BANK_R = 40, 160, 318, 550, 708
SOCKET_W, SOCKET_H = 230, 150   # LGA 4677 заметно прямоугольный

Y_PSU_TOP, Y_PSU_BOT = 172, 690
X_PCB_END = 1206

X_TAG = 470       # ярлыки ядра платы — в пустой левой части, друг под другом

def rack_ears():
    """Уши стойки на фронте: сверху и снизу, торчат за габарит шасси.

    Вид сверху — открытая сторона П-профиля, овальное отверстие под винт и
    откидная защёлка на шарнире с точкой нажима. Ими 1U и держится в стойке.
    """
    EAR_W, EAR_H = 46, 74

    def one(y0, flip):
        x_out = X_FRONT - EAR_W
        x_in = X_FRONT + 8
        yc = y0 + EAR_H / 2
        hinge_x, hinge_y = x_in - 6, y0 + (10 if not flip else EAR_H - 10)
        tip_x, tip_y = x_out + 8, y0 + (EAR_H - 16 if not flip else 16)
        return f'''<g class="decor rack-ear">
  <rect x="{x_out}" y="{y0}" width="{x_in-x_out}" height="{EAR_H}" rx="3"
        fill="#1b2429" stroke="rgba(147,161,161,0.30)"/>
  <rect x="{x_out+6}" y="{y0+7}" width="{x_in-x_out-16}" height="{EAR_H-14}" rx="2"
        fill="#0f1619" stroke="rgba(147,161,161,0.20)"/>
  <ellipse cx="{x_out+15}" cy="{yc}" rx="6" ry="13"
           fill="#0a1417" stroke="rgba(147,161,161,0.36)" stroke-width="1.4"/>
  <circle cx="{hinge_x}" cy="{hinge_y}" r="3.2" fill="#0a1417" stroke="rgba(147,161,161,0.34)"/>
  <path d="M{hinge_x} {hinge_y} L{tip_x+6} {tip_y}" stroke="rgba(147,161,161,0.10)"
        stroke-width="10" stroke-linecap="round"/>
  <path d="M{hinge_x} {hinge_y} L{tip_x+6} {tip_y}" fill="none"
        stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>
  <circle cx="{tip_x}" cy="{tip_y}" r="5.5" fill="#222d33" stroke="rgba(147,161,161,0.40)"/>
  <circle cx="{tip_x}" cy="{tip_y}" r="2.2" fill="rgba(147,161,161,0.28)"/>
</g>'''

    return one(6, False) + one(H - 6 - EAR_H, True)


def bay_filler(x, y, w, h):
    """Заглушка отсека: рамка каддика без диска, без ламп и без шильдика.

    Ручка та же, что у соседей, но глухая — вынимать из неё нечего. Полностью
    забитая корзина выдаёт рендер, на живой машине заглушка всегда найдётся.
    """
    CAP = 46
    ribs = ''.join(
        f'<line x1="{x+6}" y1="{y+CAP+16+r*16}" x2="{x+w-6}" y2="{y+CAP+16+r*16}" '
        f'stroke="rgba(147,161,161,0.14)" stroke-width="1.4"/>'
        for r in range(int((h - CAP - 24) // 16)))
    return f'''<g class="decor bay-filler">
    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#1b2429" stroke="rgba(147,161,161,0.24)"/>
    <path d="M{x} {y} H{x+w} V{y+CAP} L{x+w-5} {y+CAP+7} H{x+5} L{x} {y+CAP} Z"
          fill="#0d1317" stroke="rgba(147,161,161,0.24)"/>
    {ribs}
    {mono(x + w/2, y + h/2 + 3, "FILLER", 7, op=0.30)}
</g>'''


def dip_switch(x, y, n=4, on=(1, 3)):
    """Блок DIP-переключателей: янтарный корпус, белые движки в пазах.

    on — номера переключателей в положении ON, считая с единицы.
    """
    pitch, sw_w, sw_h = 15, 9, 26
    pad_x, pad_y, label_h = 9, 8, 11
    body_w = pad_x * 2 + n * pitch - (pitch - sw_w)
    body_h = label_h + pad_y * 2 + sw_h
    parts = [
        f'<rect x="{x}" y="{y}" width="{body_w}" height="{body_h}" rx="2" '
        f'fill="#c9a06a" stroke="#7a5a34" stroke-width="1"/>',
        f'<rect x="{x+2.5}" y="{y+2.5}" width="{body_w-5}" height="{body_h-5}" rx="1.5" '
        f'fill="none" stroke="rgba(122,90,52,0.4)" stroke-width="0.7"/>',
        f'<text x="{x+8}" y="{y+label_h}" fill="#3a2712" '
        f'font-family="ui-monospace, Menlo, monospace" font-size="6" font-weight="600">ON</text>',
    ]
    for i in range(n):
        cx = x + pad_x + i * pitch
        sy = y + label_h + pad_y
        parts.append(f'<rect x="{cx}" y="{sy}" width="{sw_w}" height="{sw_h}" rx="1.5" '
                     f'fill="#1b2429" stroke="rgba(147,161,161,0.30)" stroke-width="0.7"/>')
        is_on = (i + 1) in on
        slider_h = sw_h * 0.46
        slider_y = sy + (1.5 if is_on else sw_h - slider_h - 1.5)
        parts.append(f'<rect x="{cx+1}" y="{slider_y:.1f}" width="{sw_w-2}" height="{slider_h:.1f}" rx="1" '
                     f'fill="#e8e3d5" stroke="#8d979a" stroke-width="0.6"/>')
        parts.append(mono(cx + sw_w / 2, y + body_h - 1.5, str(i + 1), 6, op=0.4))
    return f'<g class="decor dip-switch">{"".join(parts)}</g>'


def jumper_table(x, y, title, rows):
    """Таблица-легенда перемычки: рамка, сетка, положения контактов.

    Такую печатают прямо на текстолите рядом с самой перемычкой — по ней и
    понимают, чем primary отличается от backup, не открывая мануал.
    """
    col1_w, row_h, pad, title_h = 34, 13, 6, 15
    label_w = max(60, max((len(r[1]) for r in rows), default=0) * 6 + 10)
    body_w = max(col1_w + label_w, len(title) * 4.6 + 16)
    body_h = title_h + len(rows) * row_h + pad
    STROKE = 'rgba(232,227,213,0.55)'
    TEXT = 'rgba(232,227,213,0.62)'
    parts = [
        f'<rect x="{x}" y="{y}" width="{body_w:.1f}" height="{body_h}" rx="1" '
        f'fill="none" stroke="{STROKE}" stroke-width="1"/>',
        f'<text x="{x+body_w/2:.1f}" y="{y+10}" text-anchor="middle" fill="{TEXT}" '
        f'font-family="ui-monospace, Menlo, monospace" font-size="7" '
        f'font-weight="600" letter-spacing="0.02em">{title}</text>',
        f'<line x1="{x}" y1="{y+title_h}" x2="{x+body_w:.1f}" y2="{y+title_h}" '
        f'stroke="{STROKE}" stroke-width="0.8"/>',
        f'<line x1="{x+col1_w}" y1="{y+title_h}" x2="{x+col1_w}" y2="{y+body_h}" '
        f'stroke="{STROKE}" stroke-width="0.8"/>',
    ]
    for i, (pos, label) in enumerate(rows):
        ry = y + title_h + i * row_h
        if i:
            parts.append(f'<line x1="{x}" y1="{ry}" x2="{x+body_w:.1f}" y2="{ry}" '
                         f'stroke="{STROKE}" stroke-width="0.6" stroke-opacity="0.6"/>')
        parts.append(f'<text x="{x+col1_w/2}" y="{ry+row_h-4}" text-anchor="middle" fill="{TEXT}" '
                     f'font-family="ui-monospace, Menlo, monospace" font-size="6.5">{pos}</text>')
        parts.append(f'<text x="{x+col1_w+6}" y="{ry+row_h-4}" fill="{TEXT}" '
                     f'font-family="ui-monospace, Menlo, monospace" font-size="6.5">{label}</text>')
    return f'<g class="decor jumper-table">{"".join(parts)}</g>'


def silk_inverse(x, y, text, size=7):
    """Инверсная шелкография: светлая плашка, тёмный выбитый текст.

    Так подписывают то, что человек с отвёрткой должен найти сразу.
    """
    pad_x, pad_y = 5, 3
    w = len(text) * size * 0.62 + pad_x * 2
    h = size + pad_y * 2
    return (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h}" rx="1.5" '
            f'fill="#e8e3d5" fill-opacity="0.88" stroke="rgba(147,161,161,0.30)" stroke-width="0.6"/>'
            f'<text x="{x+w/2:.1f}" y="{y+h-pad_y-1:.1f}" text-anchor="middle" fill="#0a1417" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text>')


def empty_pads(x, y, cols, rows, pitch=8, pad_w=3.5, pad_h=2):
    """Непропаянное посадочное место: голые площадки без детали.

    На живой плате их полно — под опции, которых в этой сборке нет.
    """
    cells = []
    for r in range(rows):
        for c in range(cols):
            px, py = x + c * pitch, y + r * pitch
            cells.append(f'<rect x="{px:.1f}" y="{py:.1f}" width="{pad_w}" height="{pad_h}" rx="0.5" '
                         f'fill="#8d979a" fill-opacity="0.5" stroke="rgba(147,161,161,0.28)" stroke-width="0.4"/>')
    w = (cols - 1) * pitch + pad_w
    h = (rows - 1) * pitch + pad_h
    x0, y0, x1, y1 = x - 4, y - 4, x + w + 4, y + h + 4
    outline = (f'<path d="M{x0+6} {y0} H{x1} V{y1} H{x0} V{y0+6} Z" fill="none" '
               f'stroke="rgba(147,161,161,0.24)" stroke-width="1" stroke-dasharray="3 2"/>')
    return f'<g class="decor empty-footprint">{outline}{"".join(cells)}</g>'


def service_label(x, y, w, h, title, lines):
    """Сервисная табличка на крышке: кирпичная шапка и светлое поле.

    Поле держим на fill-opacity, а не сплошной белой заливкой: крышка тёмная,
    и непрозрачная бумага на ней выжигает глаза.
    """
    head_h = h * 0.19
    body_y = y + head_h
    body_h = h - head_h
    parts = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="#e8e3d5" fill-opacity="0.78" '
        f'stroke="rgba(147,161,161,0.35)" stroke-width="1.2"/>',
        f'<path d="M{x} {y+head_h:.1f} V{y+3} Q{x} {y} {x+3} {y} H{x+w-3} Q{x+w} {y} {x+w} {y+3} '
        f'V{y+head_h:.1f} Z" fill="#cb4b16"/>',
    ]
    icon_r = head_h * 0.34
    icx, icy = x + head_h * 0.6, y + head_h / 2
    for i in range(4):
        parts.append(f'<ellipse cx="{icx:.1f}" cy="{icy-icon_r*0.55:.1f}" rx="{icon_r*0.30:.1f}" '
                     f'ry="{icon_r*0.55:.1f}" fill="#161005" transform="rotate({i*90} {icx:.1f} {icy:.1f})"/>')
    parts.append(f'<circle cx="{icx:.1f}" cy="{icy:.1f}" r="{icon_r*0.16:.1f}" fill="#161005"/>')
    parts.append(f'<text x="{x+head_h*1.05:.1f}" y="{y+head_h/2+head_h*0.16:.1f}" text-anchor="start" '
                 f'fill="#161005" font-family="ui-monospace, Menlo, monospace" '
                 f'font-size="{max(8, head_h*0.46):.1f}" font-weight="700" letter-spacing="0.04em">{title}</text>')
    line_h = body_h / (len(lines) + 1)
    for i, ln in enumerate(lines):
        parts.append(f'<text x="{x+10}" y="{body_y + line_h*(i+1):.1f}" text-anchor="start" fill="#161005" '
                     f'fill-opacity="0.82" font-family="ui-monospace, Menlo, monospace" font-size="7.5">{ln}</text>')
    return ''.join(parts)


def rating_label(x, y):
    """Шильдик питания: два ввода, и по каждому свой блок с током.

    Жёлтые квадраты по краям — предупреждение, что вводов два и обесточить
    надо оба. Единственное цветное пятно на крышке настоящей машины.
    """
    w, h = 300, 46
    yw, ow = 50, 34
    dw = w - 2 * yw - 2 * ow

    def bolt(cx, cy, sz):
        tri = (f'<path d="M{cx:.1f} {cy-sz:.1f} L{cx+sz*0.9:.1f} {cy+sz*0.75:.1f} '
               f'L{cx-sz*0.9:.1f} {cy+sz*0.75:.1f} Z" fill="none" stroke="#161005" '
               f'stroke-width="{max(1, sz*0.14):.1f}"/>')
        zig = (f'<path d="M{cx+sz*0.10:.1f} {cy-sz*0.55:.1f} L{cx-sz*0.30:.1f} {cy+sz*0.08:.1f} '
               f'L{cx+sz*0.02:.1f} {cy+sz*0.08:.1f} L{cx-sz*0.16:.1f} {cy+sz*0.62:.1f} '
               f'L{cx+sz*0.40:.1f} {cy-sz*0.10:.1f} L{cx+sz*0.08:.1f} {cy-sz*0.10:.1f} Z" fill="#161005"/>')
        return tri + zig

    def yellow(zx, num):
        cx, cy, sz = zx + yw * 0.36, y + h * 0.42, h * 0.26
        return (f'<rect x="{zx}" y="{y}" width="{yw}" height="{h}" fill="#f2c200" '
                f'stroke="rgba(20,20,10,0.5)" stroke-width="1"/>' + bolt(cx, cy, sz)
                + f'<text x="{zx+yw*0.72:.1f}" y="{y+h*0.68:.1f}" text-anchor="middle" fill="#161005" '
                  f'font-family="ui-monospace, Menlo, monospace" font-size="{h*0.48:.1f}" '
                  f'font-weight="700">{num}</text>')

    def orange(zx, num):
        return (f'<rect x="{zx}" y="{y}" width="{ow}" height="{h}" fill="#cb4b16" '
                f'stroke="rgba(20,20,10,0.4)" stroke-width="1"/>'
                f'<path d="M{zx+ow*0.22:.1f} {y+h*0.30:.1f} q{ow*0.14:.1f} -{h*0.16:.1f} {ow*0.28:.1f} 0 '
                f'q{ow*0.14:.1f} {h*0.16:.1f} {ow*0.28:.1f} 0" fill="none" stroke="#161005" stroke-width="1.4"/>'
                + f'<text x="{zx+ow/2:.1f}" y="{y+h*0.78:.1f}" text-anchor="middle" fill="#161005" '
                  f'font-family="ui-monospace, Menlo, monospace" font-size="{h*0.40:.1f}" '
                  f'font-weight="700">{num}</text>')

    x_o2, x_dark = x + yw, x + yw + ow
    x_o1, x_y1 = x_dark + dw, x_dark + dw + ow
    lines = ["100-127Vac 5,3A · 200-240Vac 2,6A · 50/60Hz",
             "100-127Vac 7,8A · 200-240Vac 3,8A",
             "-48 to -60Vdc, 18,34A"]
    line_h = h / (len(lines) + 1)
    dark = (f'<rect x="{x_dark:.1f}" y="{y}" width="{dw:.1f}" height="{h}" fill="#10171a" '
            f'stroke="rgba(147,161,161,0.28)" stroke-width="1"/>'
            + ''.join(f'<text x="{x_dark+6:.1f}" y="{y+line_h*(i+1):.1f}" text-anchor="start" '
                      f'fill="rgba(238,232,213,0.72)" font-family="ui-monospace, Menlo, monospace" '
                      f'font-size="4.4">{ln}</text>' for i, ln in enumerate(lines)))
    return (yellow(x, 2) + orange(x_o2, 2) + dark + orange(x_o1, 1) + yellow(x_y1, 1)
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" '
              f'stroke="rgba(20,20,10,0.55)" stroke-width="1.2"/>')


# ── шасси ─────────────────────────────────────────────────────────────────
add(f'<rect x="4" y="4" width="{W-8}" height="{H-8}" rx="14" fill="#141c20" stroke="rgba(147,161,161,0.30)"/>')
add(rack_ears())

# ── плата: прямоугольник с двумя вырезами под БП ──────────────────────────
add(f'''<path d="M{X_PCB} 18 H{X_REAR-4} V{Y_PSU_TOP} H{X_PCB_END} V{Y_PSU_BOT}
  H{X_REAR-4} V{H-18} H{X_PCB} Z" fill="#0e3a40" stroke="rgba(133,153,0,0.22)" stroke-width="1.4"/>''')

# ── шелкография: то, чем настоящая плата отличается от чертежа ───────────
# Дорожки, посадочные места мелочи, тестовые точки, обозначения позиций.
# Всё это фон — читается только вблизи, но без него плата выглядит пустой.
pcb_w, pcb_h = X_REAR - 4 - X_PCB, H - 36

# Крупные зоны занимаем заранее, чтобы мелочь на них не села. Резервации
# держим по фактическим габаритам: щедрый запас съедал всю свободную площадь,
# и крупным деталям не оставалось ни одного места — ни дросселя, ни радиатора.
busy(X_CORE - 16, Y_BANK_L - 14, 348, Y_BANK_R + 8 * PITCH - Y_BANK_L + 20)
busy(X_PCB + 14, 88, 60, 700)
# служебная зона: сами узлы и их подписи, а не прямоугольник на всю площадь
for bx, by, bw, bh in ((X_SVC + 6, 108, 146, 46),    # P1/P2
                       (X_SVC + 2, 180, 150, 62),    # SATA / SlimSAS
                       (X_SVC + 6, 272, 150, 74),    # CMOS и microSD
                       (X_SVC + 6, 392, 146, 48),    # M.2
                       (X_SVC + 130, 296, 46, 388),  # шелкография вдоль края
                       (X_SVC + 18, 500, 104, 104),  # кнопка «надеть крышку»
                       (X_SVC + 2, 438, 154, 62),   # таблица перемычки
                       (X_SVC + 6, 612, 130, 100)):  # тумблер SERVICE
    busy(bx, by, bw, bh)

# ── переходные отверстия ──────────────────────────────────────────────────
# Их на плате тысячи, и это единственное тёплое пятно в холодной палитре:
# в отверстие затянута медь, маска на него не заходит. Рисуем прежде всего
# остального — на живой плате via уходят под корпуса, а не лежат поверх.
vias = []
for i in range(430):
    # три манеры: рядами вдоль дорожек, кучками у корпусов и вразнобой
    mode = i % 3
    if mode == 0:
        bx = X_PCB + 20 + (i * 53) % (pcb_w - 60)
        by = 30 + (i * 97) % (pcb_h - 40)
        for k in range(4):
            vias.append((bx + k * 5, by))
    elif mode == 1:
        bx = X_PCB + 24 + (i * 131) % (pcb_w - 70)
        by = 34 + (i * 61) % (pcb_h - 50)
        for k in range(3):
            vias.append((bx + (k % 2) * 6, by + (k // 2) * 6))
    else:
        vias.append((X_PCB + 18 + (i * 197) % (pcb_w - 40),
                     26 + (i * 149) % (pcb_h - 30)))
add('<g class="decor vias">' + ''.join(
    f'<circle cx="{vx}" cy="{vy}" r="1.6" fill="none" stroke="rgba(184,115,51,0.34)" stroke-width="1.1"/>'
    for vx, vy in vias) + '</g>')

# ── крупная рассыпуха ─────────────────────────────────────────────────────
# Микросхемы на живой плате чёрные, и на каждой белый шильдик с партномером
# и точка первого вывода. Ставим их до мелочи, чтобы места достались им.
def chip_qfp(x, y, w, h, mark, sub):
    """Корпус с выводами по всем четырём сторонам — контроллеры и мосты."""
    # Шаг выводов мелкий: у контроллера их по три-четыре десятка на сторону,
    # и корпус читается частой гребёнкой. С прежним шагом 6 выходило по шесть
    # штук, и AST2600 выглядел копеечным драйвером.
    pins = []
    for k in range(int(w // 2) - 2):
        px = x + 3 + k * 2
        pins.append(f'<line x1="{px}" y1="{y}" x2="{px}" y2="{y-4}" stroke="rgba(147,161,161,0.30)" stroke-width="0.8"/>')
        pins.append(f'<line x1="{px}" y1="{y+h}" x2="{px}" y2="{y+h+4}" stroke="rgba(147,161,161,0.30)" stroke-width="0.8"/>')
    for k in range(int(h // 2) - 2):
        py = y + 3 + k * 2
        pins.append(f'<line x1="{x}" y1="{py}" x2="{x-4}" y2="{py}" stroke="rgba(147,161,161,0.30)" stroke-width="0.8"/>')
        pins.append(f'<line x1="{x+w}" y1="{py}" x2="{x+w+4}" y2="{py}" stroke="rgba(147,161,161,0.30)" stroke-width="0.8"/>')
    return (''.join(pins)
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#080b0d" '
              f'stroke="rgba(147,161,161,0.30)"/>'
            + f'<rect x="{x+w*0.16:.1f}" y="{y+h*0.2:.1f}" width="{w*0.68:.1f}" height="{h*0.6:.1f}" '
              f'rx="1" fill="#e8e3d5" fill-opacity="0.88"/>'
            + f'<text x="{x+w/2:.1f}" y="{y+h/2-1:.1f}" text-anchor="middle" fill="#0a1417" '
              f'font-family="ui-monospace, Menlo, monospace" font-size="7">{mark}</text>'
            + f'<text x="{x+w/2:.1f}" y="{y+h/2+8:.1f}" text-anchor="middle" fill="#0a1417" '
              f'font-family="ui-monospace, Menlo, monospace" font-size="6">{sub}</text>'
            + f'<circle cx="{x+6}" cy="{y+6}" r="2.2" fill="#268bd2" fill-opacity="0.8"/>')

def chip_soic(x, y, w, h, mark):
    """Выводы по двум сторонам — память, логика, датчики."""
    pins = ''.join(
        f'<line x1="{x+4+k*5}" y1="{y}" x2="{x+4+k*5}" y2="{y-2.5}" stroke="rgba(147,161,161,0.32)"/>'
        f'<line x1="{x+4+k*5}" y1="{y+h}" x2="{x+4+k*5}" y2="{y+h+2.5}" stroke="rgba(147,161,161,0.32)"/>'
        for k in range(int(w // 5) - 1))
    return (pins
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="#0a0e11" '
              f'stroke="rgba(147,161,161,0.26)"/>'
            + f'<text x="{x+w/2:.1f}" y="{y+h/2+3:.1f}" text-anchor="middle" '
              f'fill="rgba(238,232,213,0.62)" font-family="ui-monospace, Menlo, monospace" '
              f'font-size="6">{mark}</text>'
            + f'<circle cx="{x+4}" cy="{y+h-3.5}" r="1.4" fill="rgba(238,232,213,0.5)"/>')

def transistor(x, y, big=False):
    """SOT-23 и DPAK: три вывода, у мощного — площадка теплоотвода."""
    if big:
        return (f'<rect x="{x}" y="{y}" width="14" height="11" rx="1" fill="#0c1114" '
                f'stroke="rgba(147,161,161,0.26)"/>'
                f'<rect x="{x+2}" y="{y+2}" width="10" height="4" fill="rgba(147,161,161,0.14)"/>'
                + ''.join(f'<line x1="{x+3+k*4}" y1="{y+11}" x2="{x+3+k*4}" y2="{y+14}" '
                          f'stroke="rgba(147,161,161,0.30)" stroke-width="1.4"/>' for k in range(3)))
    return (f'<rect x="{x}" y="{y}" width="8" height="6" rx="0.8" fill="#0c1114" '
            f'stroke="rgba(147,161,161,0.24)"/>'
            f'<line x1="{x+2}" y1="{y+6}" x2="{x+2}" y2="{y+8}" stroke="rgba(147,161,161,0.28)"/>'
            f'<line x1="{x+6}" y1="{y+6}" x2="{x+6}" y2="{y+8}" stroke="rgba(147,161,161,0.28)"/>'
            f'<line x1="{x+4}" y1="{y}" x2="{x+4}" y2="{y-2}" stroke="rgba(147,161,161,0.28)"/>')

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
            f'<rect x="{x+3}" y="{y+s-3}" width="{s-6}" height="3" fill="rgba(147,161,161,0.22)"/>')

def xtal(x, y, mark="32.768kHz"):
    """Кварц в металлическом корпусе. Частоту на плате подписывают всегда —
    по ней и опознают, что это резонатор, а не конденсатор."""
    return (f'<rect x="{x}" y="{y}" width="16" height="8" rx="4" fill="#3a444a" '
            f'stroke="rgba(147,161,161,0.36)"/>'
            f'<rect x="{x+3}" y="{y+2}" width="10" height="4" rx="2" fill="rgba(147,161,161,0.10)"/>'
            + mono(x + 8, y + 16, mark, 5, op=0.34))

BIG = [('AST2600', 'U79', 44, 44), ('X710', 'U21', 38, 38), ('CPLD', 'U12', 32, 32),
       ('PCIe SW', 'U44', 40, 40), ('TPM 2.0', 'U9', 26, 26)]
SOICS = [('D9LHR', 30, 13), ('PCA9557', 26, 11), ('MAX6642', 24, 11), ('W25Q256', 28, 12),
         ('ADM1278', 26, 11), ('LM75', 20, 10), ('SPI FLASH', 34, 12), ('TMP421', 22, 10)]
parts = []
spot = 0

def place(w, h, draw):
    """Кладём деталь в первое свободное место честного обхода платы.

    Псевдослучайные броски исчерпывались раньше, чем находилось место, и
    крупные детали просто не появлялись — ни одного дросселя и радиатора.
    Обход по сетке гарантирует, что если место есть, деталь встанет.
    """
    global spot
    spot += 1
    step = 14
    y0 = 26 + (spot * 37) % 90        # разное начало, иначе всё выстроится в ряд
    for yy in range(y0, int(pcb_h) - int(h), step):
        x0 = X_PCB + 16 + (spot * 53 + yy) % 70
        for xx in range(x0, X_REAR - 10 - int(w), step):
            if put(xx, yy, w, h):
                parts.append(draw(xx, yy))
                return True
    return False

# Голые футпринты под опции, которых в этой сборке нет. Координаты заданы
# руками: place() к этому моменту свободного места уже не находит — плата
# занята почти целиком, а свободен только карман под служебной зоной.
pads_done = 0
for k, (name, cols) in enumerate((("J150", 4), ("J156", 3), ("DEBUG CONN", 5))):
    px, py = X_SVC + 8, 706 + k * 42
    if put(px - 4, py - 4, 118, 38):
        parts.append(empty_pads(px, py, cols, 2, pitch=7)
                     + mono(px + cols * 3.5, py + 26, name, 5, op=0.3))
        pads_done += 1

for mark, sub, w, h in BIG:
    place(w + 8, h + 8, lambda x, y, m=mark, s=sub, w=w, h=h: chip_qfp(x + 4, y + 4, w, h, m, s))
for mark, w, h in SOICS:
    place(w + 6, h + 6, lambda x, y, m=mark, w=w, h=h: chip_soic(x + 3, y + 3, w, h, m))
for i in range(14):
    place(18, 18, lambda x, y, b=(i % 3 == 0): transistor(x + 2, y + 2, big=b))
for i in range(7):
    place(20, 20, lambda x, y: choke(x + 3, y + 3))
for i in range(4):
    place(30, 26, lambda x, y: small_sink(x + 2, y + 2, 26, 22))
for i, mark in enumerate(("Y2 · 7.3728MHz", "Y4 · 32.768kHz", "OS1 · 50MHz")):
    place(46, 22, lambda x, y, m=mark: xtal(x + 2, y + 2, m))
add('<g class="decor parts">' + ''.join(parts) + '</g>')

silk = []
# дорожки: пучками, со ступеньками — как разводка к сокетам
for i in range(26):
    y = 30 + i * 31
    if free(X_PCB + 12, y - 3, 130, 8):
        silk.append(f'<path d="M{X_PCB+12} {y} H{X_PCB+66} l14 14 H{X_PCB+134}" fill="none" '
                    f'stroke="rgba(133,153,0,0.11)" stroke-width="1.1"/>')
for i in range(18):
    x = X_SVC + 4 + i * 9
    silk.append(f'<path d="M{x} 40 V{104} l8 8 V196" fill="none" stroke="rgba(133,153,0,0.10)" stroke-width="1"/>')

# посадочные места мелочи: резисторы, конденсаторы, диоды
KIND = ('res', 'cap', 'diode', 'ic')
for i in range(210):
    x = X_PCB + 18 + (i * 137) % (pcb_w - 46)
    y = 26 + (i * 211) % (pcb_h - 30)
    kind = KIND[i % 4]
    if kind == 'res':
        w, h = (8, 4) if i % 2 else (4, 8)
        if not free(x, y, w, h):
            continue
        silk.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="rgba(147,161,161,0.16)"/>')
    elif kind == 'cap':
        if not free(x, y, 9, 9):
            continue
        silk.append(f'<circle cx="{x+4}" cy="{y+4}" r="4" fill="#141d22" stroke="rgba(147,161,161,0.22)" stroke-width="1"/>')
        silk.append(f'<line x1="{x+1}" y1="{y+4}" x2="{x+7}" y2="{y+4}" stroke="rgba(147,161,161,0.20)"/>')
    elif kind == 'diode':
        if not free(x, y, 8, 5):
            continue
        silk.append(f'<rect x="{x}" y="{y}" width="8" height="5" fill="#0d1a1e" stroke="rgba(147,161,161,0.18)"/>')
        silk.append(f'<line x1="{x+6}" y1="{y}" x2="{x+6}" y2="{y+5}" stroke="rgba(147,161,161,0.30)"/>')
    else:
        if not free(x, y, 14, 11):
            continue
        silk.append(f'<rect x="{x}" y="{y}" width="14" height="11" rx="1" fill="#16212a" stroke="rgba(147,161,161,0.20)"/>')
        for d in range(3):
            silk.append(f'<line x1="{x}" y1="{y+2+d*4}" x2="{x-2}" y2="{y+2+d*4}" stroke="rgba(147,161,161,0.18)"/>')
            silk.append(f'<line x1="{x+14}" y1="{y+2+d*4}" x2="{x+16}" y2="{y+2+d*4}" stroke="rgba(147,161,161,0.18)"/>')

# тестовые точки
for i in range(26):
    x = X_PCB + 30 + (i * 173) % (pcb_w - 60)
    y = 40 + (i * 121) % (pcb_h - 50)
    if not free(x - 4, y - 4, 8, 8):
        continue
    silk.append(f'<circle cx="{x}" cy="{y}" r="2.6" fill="none" stroke="rgba(147,161,161,0.30)" stroke-width="1"/>')
    silk.append(f'<circle cx="{x}" cy="{y}" r="0.9" fill="rgba(147,161,161,0.34)"/>')

# позиционные обозначения — то, что реально написано на плате рядом с деталями
# Обозначения на живой плате четырёхзначные, стоят стопками по 3–5 у своей
# цепи и половина повёрнута боком — набирать их горизонтально в строку негде.
PREFIX = ['R', 'C', 'R', 'C', 'U', 'Q', 'L', 'CR', 'TP', 'J']
for i in range(46):
    x = X_PCB + 34 + (i * 173) % (pcb_w - 90)
    y = 46 + (i * 131) % (pcb_h - 90)
    n = 3 + (i % 3)                      # в стопке три-пять обозначений
    turn = i % 2                         # половину ставим боком
    w, h = (30, 7 * n + 6) if not turn else (7 * n + 6, 30)
    if not put(x - 4, y - 8, w, h):
        continue
    base = 1000 + (i * 137) % 2600
    for k in range(n):
        ref = f'{PREFIX[(i + k) % len(PREFIX)]}{base + k * 7}'
        if turn:
            tx, ty = x + k * 7, y + 12
            silk.append(f'<text x="{tx}" y="{ty}" transform="rotate(-90 {tx} {ty})" '
                        f'text-anchor="middle" fill="rgba(147,161,161,0.30)" '
                        f'font-family="ui-monospace, Menlo, monospace" font-size="5.5">{ref}</text>')
        else:
            silk.append(mono(x + 12, y + k * 7, ref, 5.5, op=0.30))

add('<g class="decor silk">' + ''.join(silk) + '</g>')

# монтажные отверстия — со своей зоной, чтобы на них ничего не садилось
holes = []
for i, (x, y) in enumerate([(X_PCB+14, 30), (X_REAR-18, 30), (X_PCB+14, H-30), (X_REAR-18, H-30),
               (X_PCB+14, 430), (X_REAR-18, 430), (740, 30), (740, H-30),
               (X_PCB_END-14, Y_PSU_TOP+14), (X_PCB_END-14, Y_PSU_BOT-14)]):
    busy(x - 10, y - 10, 20, 20)
    # Медное кольцо вокруг отверстия — маска на него не заходит, поэтому оно
    # рыжее. У части отверстий винт с пружинной шайбой.
    holes.append(f'<circle cx="{x}" cy="{y}" r="10.5" fill="none" stroke="rgba(184,115,51,0.34)" stroke-width="3"/>')
    holes.append(f'<circle cx="{x}" cy="{y}" r="7" fill="#0a1417" stroke="rgba(147,161,161,0.34)" stroke-width="2"/>')
    if i % 3 == 0:
        holes.append(f'<circle cx="{x}" cy="{y}" r="5.4" fill="#1a232a" stroke="rgba(147,161,161,0.42)"/>')
        holes.append(f'<path d="M{x-3.4} {y} h6.8 M{x} {y-3.4} v6.8" stroke="rgba(147,161,161,0.5)" stroke-width="1.3"/>')
add('<g class="decor">' + ''.join(holes) + '</g>')

# стрелки продува
airflow = []
for i in range(5):
    y = 120 + i * 160
    airflow.append(f'<path d="M{X_PCB+22} {y} h34 m-7 -4 l7 4 -7 4" fill="none" '
                   f'stroke="rgba(42,161,152,0.22)" stroke-width="1.4"/>')
airflow.append(mono(X_PCB + 40, 104, "AIRFLOW", 7, op=0.3))
add('<g class="decor">' + ''.join(airflow) + '</g>')

# Марка изготовителя: вертикально вдоль служебной зоны, там же где тумблер —
# на реальных платах имя вендора идёт по свободной кромке, а не поперёк деталей
busy(X_SVC + 110, 300, 76, 380)
add(f'''<g class="decor">
  <text x="{X_SVC+140}" y="480" transform="rotate(-90 {X_SVC+140} 480)" text-anchor="middle"
        fill="rgba(147,161,161,0.22)" font-family="ui-monospace, Menlo, monospace"
        font-size="34" font-weight="600" letter-spacing="0.10em">COSMDANDY</text>
  <text x="{X_SVC+118}" y="480" transform="rotate(-90 {X_SVC+118} 480)" text-anchor="middle"
        fill="rgba(147,161,161,0.26)" font-family="ui-monospace, Menlo, monospace"
        font-size="9" letter-spacing="0.14em">DUAL SOCKET · 32× DDR5 RDIMM · 8 TB MAX</text>
</g>''')

# Ревизия платы — по правому борту от марки. Она же ссылка: номер сборки это
# число коммитов, серийник — хэш HEAD, и оба ведут на сам коммит.
add(f'''<g class="unit" data-unit="plate" data-group="plate"
      data-href="https://github.com/CosmDandy/cosmdandy.dev/commit/{BOARD_SHA.lower()}">
  {hit(X_SVC+150, 300, 40, 380)}
  <text x="{X_SVC+172}" y="480" transform="rotate(-90 {X_SVC+172} 480)" text-anchor="middle"
        fill="rgba(147,161,161,0.30)" font-family="ui-monospace, Menlo, monospace"
        font-size="11" letter-spacing="0.12em">REV {BOARD_REV}  ·  S/N {BOARD_SHA}</text>
  <text x="{X_SVC+186}" y="480" transform="rotate(-90 {X_SVC+186} 480)" text-anchor="middle"
        fill="rgba(147,161,161,0.20)" font-family="ui-monospace, Menlo, monospace"
        font-size="8" letter-spacing="0.10em">ASSEMBLED IN A CONTAINER · MADE BY HAND</text>
</g>''')

# ── VRM: вплотную к сокетам ───────────────────────────────────────────────
# Дроссели питают ядро и физически сидят рядом с ним, а не в стороне.
X_VRM = X_CORE - 20   # почти касается левого края сокета
vrm = []
for y0 in (Y_CPU0, Y_CPU1):
    n = SOCKET_H // 14
    for i in range(n):
        y = y0 + 4 + i * 14
        vrm.append(f'<rect x="{X_VRM}" y="{y}" width="18" height="10" rx="1.5" '
                   f'fill="#1a2429" stroke="rgba(147,161,161,0.20)"/>')
        vrm.append(f'<rect x="{X_VRM-22}" y="{y+1}" width="15" height="8" rx="1" fill="rgba(147,161,161,0.16)"/>')
    vrm.append(mono(X_VRM + 6, y0 - 8, "VRM", 9, op=0.4))
add('<g class="decor">' + ''.join(vrm) + '</g>')

# ── фронт: блок управления ────────────────────────────────────────────────
# Панель ужата: только питание, лампа неисправности, опознание и язычок
# диагностики. USB убран — место нужнее отсекам.
add(f'''<g class="decor">
  <rect x="{X_FRONT}" y="6" width="{FRONT_W}" height="{Y_PANEL-14}" rx="4" fill="#151d21" stroke="rgba(147,161,161,0.28)"/>
  <line x1="{X_FRONT+10}" y1="94" x2="{X_FRONT+FRONT_W-10}" y2="94" stroke="rgba(147,161,161,0.14)" stroke-width="1"/>
</g>''')

add(f'''<g class="power-btn" id="power" role="button" tabindex="0" aria-label="Питание">
  {hit(X_FRONT+4, 16, 68, 76)}
  <circle cx="{X_FRONT+38}" cy="50" r="21" fill="#0f1619" stroke="rgba(147,161,161,0.34)"/>
  <circle class="pwr-ring" cx="{X_FRONT+38}" cy="50" r="12" fill="none" stroke="#586e75" stroke-width="2.2"/>
  <line x1="{X_FRONT+38}" y1="38" x2="{X_FRONT+38}" y2="48" stroke="#586e75" stroke-width="2.2" stroke-linecap="round"/>
  <circle class="pwr-led" cx="{X_FRONT+38}" cy="50" r="25" fill="none" stroke="#859900" stroke-width="2.2"/>
  {mono(X_FRONT+38, 86, "POWER", 7, op=0.42)}
</g>''')

add(f'''<g class="decor">
  <circle cx="{X_FRONT+88}" cy="48" r="10" fill="#0f1619" stroke="rgba(147,161,161,0.26)"/>
  {glow('fault-sys', X_FRONT+88, 48, 6.5, '#b58900')}
  <circle class="fault-sys" cx="{X_FRONT+88}" cy="48" r="6.5" fill="#b58900"/>
  {mono(X_FRONT+88, 86, "FAULT", 7, op=0.42)}
</g>''')

add(f'''<g class="id-btn" id="id-btn" role="button" tabindex="0" aria-label="Опознание в стойке">
  {hit(X_FRONT+112, 18, 48, 72)}
  <circle cx="{X_FRONT+134}" cy="48" r="12" fill="#0f1619" stroke="rgba(147,161,161,0.32)"/>
  {glow('led-id', X_FRONT+134, 48, 7.5, '#268bd2')}
  <circle class="led-id" cx="{X_FRONT+134}" cy="48" r="7.5" fill="#268bd2"/>
  {mono(X_FRONT+134, 86, "ID", 7, op=0.42)}
</g>''')

add(f'''<g class="lp-tab" id="lp-tab" role="button" tabindex="0" aria-label="Панель диагностики">
  {hit(X_FRONT+6, 100, FRONT_W-12, 40)}
  <rect x="{X_FRONT+12}" y="104" width="{FRONT_W-24}" height="22" rx="2" fill="#0f1619" stroke="rgba(147,161,161,0.3)"/>
  <line x1="{X_FRONT+24}" y1="110" x2="{X_FRONT+FRONT_W-24}" y2="110" stroke="rgba(147,161,161,0.3)" stroke-width="2"/>
  <line x1="{X_FRONT+24}" y1="115" x2="{X_FRONT+FRONT_W-24}" y2="115" stroke="rgba(147,161,161,0.3)" stroke-width="2"/>
  <line x1="{X_FRONT+24}" y1="120" x2="{X_FRONT+FRONT_W-24}" y2="120" stroke="rgba(147,161,161,0.3)" stroke-width="2"/>
  {mono(X_FRONT+FRONT_W/2, 140, "LIGHT PATH", 7, op=0.34)}
</g>''')

# ── фронт: шесть отсеков 2.5″ тремя группами по два ──────────────────────
# Диски в 1U ходят парами: два каддика в группе, между группами — стойка
# корзины. Подписи развёрнуты вдоль салазок, скругления минимальные.
BAY_TOP, BAY_N, GROUPS = Y_PANEL + 8, 6, 3
GROUP_GAP = 10
BAY_W = FRONT_W / 2
GROUP_H = (H - 12 - BAY_TOP - GROUP_GAP * (GROUPS - 1)) / GROUPS
CAP = 46
for i in range(BAY_N):
    g, k = i // 2, i % 2
    x = X_FRONT + k * BAY_W
    y = BAY_TOP + g * (GROUP_H + GROUP_GAP)
    w, h = BAY_W - 3, GROUP_H
    sled = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#28323a" stroke="rgba(147,161,161,0.26)"/>']
    for c in range(3):
        cy = y + CAP + 22 + c * 20
        sled.append(f'<rect x="{x+4}" y="{cy}" width="{w-8}" height="11" rx="1" fill="#131b20" '
                    f'stroke="rgba(147,161,161,0.12)"/>')
    ly = y + CAP + 106
    lh = h - CAP - 130
    sled.append(f'<rect x="{x+3}" y="{ly}" width="{w-6}" height="{lh}" rx="1" '
                f'fill="#e8e3d5" fill-opacity="0.09" stroke="rgba(147,161,161,0.24)"/>')
    tx, ty = x + w / 2, ly + lh / 2
    # в одном слоте — Optane: самый дорогой и узнаваемый накопитель в парке
    kind, size = ("Optane", "P5800X") if i == 2 else ("NVMe U.2", "3.84 TB")
    sled.append(mono(tx, ty - 3, kind, 9, op=0.55))
    sled.append(mono(tx, ty + 11, size, 9, op=0.4))
    sled.append(f'<path d="M{x} {y} H{x+w} V{y+CAP} L{x+w-5} {y+CAP+7} H{x+5} L{x} {y+CAP} Z" '
                f'fill="#0d1317" stroke="rgba(147,161,161,0.24)"/>')
    bx = x + w / 2
    sled.append(f'<rect x="{bx-10}" y="{y+24}" width="20" height="20" rx="1" fill="#1b2429" stroke="rgba(147,161,161,0.34)"/>')
    sled.append(f'<circle cx="{bx}" cy="{y+34}" r="6" fill="none" stroke="#dc322f" stroke-width="2.4"/>')
    sled.append(act_led(i, x + 6, y + 10, 3, "#2aa198"))
    sled.append(f'{glow("led", x + w - 6, y + 10, 3, "#859900")}'
                f'<circle class="led" cx="{x+w-6}" cy="{y+10}" r="3" fill="#859900"/>')
    if i == BAY_N - 1:
        add(bay_filler(x, y, w, h))
        continue
    add(f'''<g class="unit pick bay" data-unit="hdd{i}" data-group="hdd" data-href="https://github.com/cosmdandy">
      <g class="pick-body">{''.join(sled)}</g>
    </g>''')
# выноска корзины — одна на все шесть отсеков
CALLOUTS.append((X_FRONT + FRONT_W + 30, BAY_TOP + 46, X_FRONT + FRONT_W - 10, BAY_TOP + 24,
                 "GitHub", "start", "https://github.com/cosmdandy", "hdd"))

add(stamp(X_FRONT + 4, H - 18, "фронт: шесть отсеков"))

# ── backplane ─────────────────────────────────────────────────────────────
bp = [f'<rect x="{X_BP}" y="8" width="18" height="{H-16}" rx="0" fill="#0e3a40" stroke="rgba(133,153,0,0.24)"/>']
for i in range(BAY_N):
    y = BAY_TOP + 30 + i * (H - 12 - BAY_TOP - 70) / BAY_N
    bp.append(f'<rect x="{X_BP+3}" y="{y}" width="12" height="46" rx="0" fill="#0a1417"/>')
add('<g class="decor">' + ''.join(bp) + '</g>')

# ── жгуты SlimSAS: три пучка в обход, а не напрямик ─────────────────────
# На фото кабели не идут кратчайшим путём: они прижаты к стенкам корзины и
# к середине, чтобы не мешать продуву. Рисуем до вентиляторов — стенка их
# перекрывает, и жгут «ныряет» под модули.
cables = []
ROUTES = [(0, 34), (1, 34), (2, H / 2), (3, H / 2), (4, H - 34), (5, H - 34)]
for i, (n, via) in enumerate(ROUTES):
    y0 = BAY_TOP + 40 + n * (H - 12 - BAY_TOP - 80) / 5
    y1 = 108 + n * 122
    x1 = X_PCB + 26
    d = (f'M{X_BP+18} {y0} C{X_BP+52} {y0}, {X_FAN-14} {via}, {X_FAN+70} {via} '
         f'S{x1-70} {y1}, {x1} {y1}')
    for (wid, op) in ((7, 0.32), (3, 0.16)):
        cables.append(f'<path d="{d}" fill="none" stroke="rgba(42,161,152,{op})" '
                      f'stroke-width="{wid}" stroke-linecap="round"/>')
add('<g class="decor cables">' + ''.join(cables) + '</g>')

# ── вентиляторы: две группы через перегородку, один слот пуст ────────────
# На живой машине место под вентилятор бывает и пустым — с заглушкой и
# предупреждением о продуве. Перегородка делит корзину на две секции, как на
# реальном шасси. Рисуем после жгутов, поэтому стенка их перекрывает.
add(f'<rect class="decor" x="{X_FAN}" y="20" width="{FAN_W}" height="{H-40}" rx="0" fill="#0f1619" stroke="rgba(147,161,161,0.28)"/>')
add(stamp(X_FAN + 6, 14, "вентиляторы"))
FAN_N, FAN_EMPTY = 8, -1   # пустых слотов нет
FAN_STEP = (H - 52) / FAN_N
for i in range(FAN_N):
    y = 26 + i * FAN_STEP
    rotors = []
    for k in range(2):
        cx, cy = X_FAN + FAN_W / 4 + k * (FAN_W / 2), y + (FAN_STEP - 8) / 2
        blades = ' '.join(
            f'M{cx} {cy-33} L{cx+9} {cy} L{cx} {cy+33} L{cx-9} {cy} Z' if b % 2 == 0 else
            f'M{cx-33} {cy} L{cx} {cy-9} L{cx+33} {cy} L{cx} {cy+9} Z'
            for b in range(2))
        rotors.append(f'<circle cx="{cx}" cy="{cy}" r="36" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>')
        rotors.append(f'<path class="fan-blades" d="{blades}" fill="rgba(34,48,54,0.55)" '
                      f'stroke="rgba(147,161,161,0.26)" style="animation-duration:{jitter(i, 0.42, 0.24, k)}s"/>')
        rotors.append(f'<circle cx="{cx}" cy="{cy}" r="11" fill="#0a1215" stroke="rgba(147,161,161,0.22)"/>')

    h = FAN_STEP - 8
    # Оранжевые язычки по бокам — за них вентилятор и вынимают на горячую.
    # На живой машине они единственное цветное пятно в корзине. Рисуем их
    # до корпуса: язычок утоплен в раму, и наружу торчит только половина.
    tabs = ''.join(
        f'<rect x="{tx}" y="{y+h/2-19}" width="16" height="38" rx="2" fill="#cb4b16" '
        f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
        f'<rect x="{tx+4}" y="{y+h/2-13}" width="6" height="26" rx="1" fill="rgba(238,232,213,0.22)"/>'
        for tx in (X_FAN - 8, X_FAN + FAN_W - 8))
    # Виброопоры по углам: резиновая втулка в стальной обойме.
    mounts = ''.join(
        f'<rect x="{mx-5}" y="{my-4}" width="10" height="8" rx="1.5" fill="#1b2429" '
        f'stroke="rgba(147,161,161,0.30)"/>'
        f'<circle cx="{mx}" cy="{my}" r="2.4" fill="#070d10" stroke="rgba(147,161,161,0.22)"/>'
        for mx in (X_FAN + 14, X_FAN + FAN_W - 14) for my in (y + 7, y + h - 7))
    # Питание: колодка на корпусе, от неё нога с жгутом до ответной части на
    # плате. Нога и провода — часть вентилятора: тянешь его, и они уходят
    # вместе с ним, отцепляясь от платы. Лампа при этом остаётся на плате:
    # горит не вентилятор, а его посадочное место.
    px, py = X_FAN + FAN_W - 26, y + 10
    fy, sx = y + 20, X_PCB + 6
    wires = ''.join(
        f'<path d="M{px+16} {py+4+k*3} C{px+40} {py+4+k*3}, {sx-30} {fy+3+k*3}, {sx} {fy+3+k*3}" '
        f'fill="none" stroke="{c}" stroke-width="1.5" stroke-opacity="0.6"/>'
        for k, c in enumerate(('#dc322f', '#eee8d5', '#b58900', '#268bd2')))
    plug = (f'<rect x="{px}" y="{py}" width="18" height="16" rx="2" fill="#0a1215" '
            f'stroke="rgba(147,161,161,0.34)"/>'
            + ''.join(f'<line x1="{px+4+k*4}" y1="{py+3}" x2="{px+4+k*4}" y2="{py+13}" '
                      f'stroke="rgba(147,161,161,0.26)"/>' for k in range(4)))
    # ответная колодка на конце ноги — она и садится в разъём платы
    foot = (f'<rect x="{sx-4}" y="{fy}" width="14" height="16" rx="2" fill="#101a1e" '
            f'stroke="rgba(147,161,161,0.38)"/>'
            f'<rect x="{sx-1}" y="{fy+3}" width="8" height="10" rx="1" fill="#060d10"/>')

    add(f'''<g class="pick fan" data-fan="{i}">
      <g class="pick-body">
        {tabs}
        <rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="0" fill="#0b1215" stroke="rgba(147,161,161,0.18)"/>
        {mounts}
        {''.join(rotors)}
        {plug}
        {mono(X_FAN + FAN_W / 2, y + h - 6, f"FAN{i+1} · 18000 RPM", 7, op=0.34)}
        <g class="cables">{wires}</g>
        {foot}
      </g>
      {fault_at(sx + 18, fy + 8, 5)}
      {silk_inverse(sx + 30, fy + 2, 'FAN FAULT', 6)}
    </g>''')

# ── ответные разъёмы жгутов ──────────────────────────────────────────────
conn = []
for i in range(6):
    y = 96 + i * 122
    x = X_PCB + 26
    rot = -6 if i % 2 else 5      # разъёмы на плате стоят не идеально ровно
    conn.append(f'<g transform="rotate({rot} {x+11} {y+26})">'
                f'<rect x="{x}" y="{y}" width="22" height="52" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.32)"/>'
                f'<rect x="{x+4}" y="{y+6}" width="14" height="40" rx="1" fill="#0a1417"/></g>')
    conn.append(mono(x + 11, y + 68, f"J{i+1}", 6, op=0.34))
    busy(x - 6, y - 6, 34, 82)
add('<g class="decor">' + ''.join(conn) + '</g>')

# ── память: три банка, у каждого свой ярлык ───────────────────────────────
LETTERS = "ABCDEFGH"

def bank(y0, n, code, label_y, first=1):
    slots = []
    for i in range(n):
        y = y0 + i * PITCH
        # чередование чёрный/синий — как на плате
        outer = '#16314a' if i % 2 else '#101a1f'
        inner = '#0c2033' if i % 2 else '#0a1013'
        # зона наведения шире самой планки и перекрывает щель до соседней:
        # иначе курсор проваливается между слотами и клик уходит в никуда
        slots.append(f'''<g class="pick dimm" data-dimm="{code}{i}">
          <rect class="hit" x="{X_CORE-8}" y="{y-1}" width="326" height="{PITCH}" fill="#000" fill-opacity="0.001"/>
          <g class="pick-body">
            <rect x="{X_CORE}" y="{y}" width="292" height="{SLOT_H}" rx="0" fill="{outer}" stroke="rgba(147,161,161,0.30)"/>
            <rect x="{X_CORE+6}" y="{y+3}" width="280" height="{SLOT_H-6}" rx="0" fill="{inner}"/>
            <rect class="latch-fix" x="{X_CORE-5}" y="{y+1}" width="5" height="{SLOT_H-2}" rx="1"/>
            <rect class="latch" x="{X_CORE+292}" y="{y+1}" width="7" height="{SLOT_H-2}" rx="1"/>
          </g>
          {glow('fault', X_CORE + 304, y + SLOT_H / 2, 2.4, '#dc322f')}
          <circle class="fault" cx="{X_CORE+304}" cy="{y+SLOT_H/2}" r="2.4" fill="#dc322f"/>
          {mono(X_CORE + 312, y + SLOT_H - 1, f"DIMM{first + i}", 8, anchor="start", op=0.42)}
        </g>''')
    return f'''<g class="unit" data-unit="dimm-{code}" data-group="dimm" data-href="https://blog.cosmdandy.dev">
      {hit(X_CORE-8, y0-4, 340, n * PITCH + 6)}
      {''.join(slots)}
    </g>'''

CALLOUTS.append((X_TAG - 6, Y_BANK_C + 110, X_CORE - 10, Y_BANK_C + 110, "Blog", "end", "https://blog.cosmdandy.dev", "dimm"))
add(bank(Y_BANK_L, 8, "L", 104, first=1))
add(bank(Y_BANK_C, 16, "C", 430, first=9))
add(bank(Y_BANK_R, 8, "R", 740, first=25))
add(mono(X_CORE+155, Y_BANK_L-8, "CPU0 · A0–H0", 9, op=0.45))
add(stamp(X_CORE, Y_BANK_L - 20, "память"))
add(mono(X_CORE+155, Y_BANK_C-8, "CPU0 · A1–H1  /  CPU1 · A0–H0", 9, op=0.45))
add(mono(X_CORE+155, Y_BANK_R-8, "CPU1 · A1–H1", 9, op=0.45))

# ── процессоры ────────────────────────────────────────────────────────────
def socket(x, y):
    s = [f'<rect x="{x}" y="{y}" width="{SOCKET_W}" height="{SOCKET_H}" rx="4" fill="#101a1e" stroke="rgba(147,161,161,0.42)"/>',
         f'<rect x="{x+14}" y="{y+14}" width="{SOCKET_W-28}" height="{SOCKET_H-28}" rx="2" fill="#0b1316" stroke="rgba(147,161,161,0.26)"/>',
         f'<rect x="{x+40}" y="{y+34}" width="{SOCKET_W-80}" height="{SOCKET_H-68}" rx="2" fill="#16232a" stroke="rgba(42,161,152,0.30)"/>',
         mono(x + SOCKET_W/2, y + SOCKET_H/2 + 4, "LGA 4677", 10, op=0.55),
         f'<path d="M{x+SOCKET_W/2} {y+24} l-5 8 h10 z" fill="rgba(147,161,161,0.32)"/>',
         mono(x + SOCKET_W/2 + 26, y + 32, "INSTALL", 7, anchor="start", op=0.3)]
    for k, (dx, dy) in enumerate([(11, 11), (SOCKET_W-11, 11), (11, SOCKET_H-11), (SOCKET_W-11, SOCKET_H-11)]):
        s.append(f'<circle cx="{x+dx}" cy="{y+dy}" r="4.5" fill="none" stroke="rgba(147,161,161,0.28)" stroke-width="1.4"/>')
        s.append(mono(x + dx, y + dy + 3, str(k + 1), 7, op=0.34))
    return ''.join(s)

def die(x, y, n):
    """Кристалл под радиатором: по нему наискось бежит цветной перелив.

    Тот же градиент, что на кнопке «скачать» в резюме. Полоса шире окна и
    ездит по диагонали, лишнее срезает clip по крышке процессора.
    """
    dx, dy = x + 40, y + 34
    return (f'<g class="die" clip-path="url(#die-clip-{n})">'
            f'<rect class="die-shine" x="{dx-150}" y="{dy-82}" width="450" height="246" '
            f'fill="url(#die-shine)"/></g>')

def heatsink(x, y):
    # Рёбра вдоль потока воздуха: он идёт спереди назад, слева направо.
    rows = int((SOCKET_H - 24) // 3.4)
    fins = ''.join(f'<line x1="{x+12}" y1="{y+12+i*3.4:.1f}" x2="{x+SOCKET_W-12}" y2="{y+12+i*3.4:.1f}" '
                   f'stroke="rgba(147,161,161,0.22)" stroke-width="1.2"/>' for i in range(rows))
    # Подпружиненные винты по углам — они на самом радиаторе и уезжают с ним.
    screws = ''.join(
        f'<circle cx="{sx}" cy="{sy}" r="7" fill="#162025" stroke="rgba(147,161,161,0.46)" stroke-width="1.4"/>'
        f'<circle cx="{sx}" cy="{sy}" r="3.4" fill="#0c1418" stroke="rgba(147,161,161,0.34)"/>'
        f'<line x1="{sx-3}" y1="{sy}" x2="{sx+3}" y2="{sy}" stroke="rgba(147,161,161,0.5)" stroke-width="1.4"/>'
        f'<line x1="{sx}" y1="{sy-3}" x2="{sx}" y2="{sy+3}" stroke="rgba(147,161,161,0.5)" stroke-width="1.4"/>'
        for sx in (x + 12, x + SOCKET_W - 12) for sy in (y + 12, y + SOCKET_H - 12))
    # Бумажный шильдик: партномер, штрих-код и предупреждение про рычаг.
    # На живом радиаторе он занимает треть верхней плоскости.
    lx, ly, lw, lh = x + 34, y + 30, SOCKET_W - 68, 56
    tag = (f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="2" fill="#e8e3d5" fill-opacity="0.82"/>'
           + ''.join(f'<rect x="{lx+8+k*3}" y="{ly+7}" width="{1.6 if k % 3 else 2.6}" height="14" '
                     f'fill="rgba(10,20,23,0.78)"/>' for k in range(18))
           + f'<text x="{lx+lw-8}" y="{ly+18}" text-anchor="end" fill="rgba(10,20,23,0.7)" '
             f'font-family="ui-monospace, Menlo, monospace" font-size="7">P/N 41Y9033</text>'
           + f'<text x="{lx+lw/2}" y="{ly+36}" text-anchor="middle" fill="rgba(10,20,23,0.62)" '
             f'font-family="ui-monospace, Menlo, monospace" font-size="6">PUSH WHILE ROTATING LEVER</text>'
           + f'<text x="{lx+lw/2}" y="{ly+48}" text-anchor="middle" fill="rgba(10,20,23,0.42)" '
             f'font-family="ui-monospace, Menlo, monospace" font-size="6">MADE IN A CONTAINER</text>')
    return (f'<g class="pick-body heatsink"><rect x="{x}" y="{y}" width="{SOCKET_W}" height="{SOCKET_H}" rx="6" '
            f'fill="#26333a" stroke="rgba(147,161,161,0.38)"/>{fins}{tag}{screws}</g>')

def ilm(x, y):
    """Прижимная скоба сокета: она приклёпана к плате и радиатор не уносит.

    Одна штанга вдоль края, загнутый конец и полукруглая ручка — за неё
    рычаг откидывают. Ручка помечена цветом, как всё, что трогают руками.
    """
    bx, by = x - 14, y + SOCKET_H - 22
    # Штанга вдоль края, поворот влево и загиб внутрь — рычаг заканчивается
    # крючком, который заводят под зацеп. Цветом помечен только сам крючок:
    # это и есть место, за которое берутся.
    stem = f'M{bx} {y+8} V{by}'
    hook = f'M{bx} {by} v5 q0 8 -8 8 q-9 0 -9 -8 v-6'
    return (f'<g class="ilm">'
            f'<path d="{stem}" fill="none" stroke="rgba(147,161,161,0.5)" '
            f'stroke-width="4" stroke-linecap="round"/>'
            f'<path d="{hook}" fill="none" stroke="#cb4b16" stroke-width="4.2" stroke-linecap="butt"/>'
            f'<path d="{hook}" fill="none" stroke="rgba(238,232,213,0.32)" stroke-width="1.3"/>'
            f'<circle cx="{bx}" cy="{y+8}" r="5" fill="#101a1e" stroke="rgba(147,161,161,0.45)" stroke-width="1.6"/>'
            f'</g>')

CALLOUTS.append((X_TAG - 6, Y_CPU0 + 40, X_CORE + 40, Y_CPU0 + 40, "CV", "end", "https://cv.cosmdandy.dev", "cpu"))

X_SOCK = X_CORE + 40
add(stamp(X_CORE + 40, Y_CPU0 - 8, "процессоры"))

# Градиент кристалла и обрезка по крышкам процессоров. Наискось, из левого
# нижнего угла в правый верхний: по прямой он читался как полоса засветки,
# а не как игра на полированном кремнии.
add('<defs>\n'
    '  <linearGradient id="die-shine" x1="0" y1="1" x2="1" y2="0">\n'
    '    <stop offset="0%"   stop-color="#ff3264" stop-opacity="0"/>\n'
    '    <stop offset="22%"  stop-color="#ff3264" stop-opacity="0.55"/>\n'
    '    <stop offset="50%"  stop-color="#7828dc" stop-opacity="0.55"/>\n'
    '    <stop offset="78%"  stop-color="#00dcff" stop-opacity="0.55"/>\n'
    '    <stop offset="100%" stop-color="#00dcff" stop-opacity="0"/>\n'
    '  </linearGradient>\n'
    + ''.join(f'  <clipPath id="die-clip-{n}"><rect x="{X_SOCK+40}" y="{y+34}" '
              f'width="{SOCKET_W-80}" height="{SOCKET_H-68}" rx="2"/></clipPath>\n'
              for n, y in enumerate((Y_CPU0, Y_CPU1)))
    + '</defs>')

for n, (y, label_y) in enumerate(((Y_CPU0, 246), (Y_CPU1, 616))):
    # Подпись — справа сверху, лампа — справа снизу: так они не спорят с
    # шелкографией банков и видны, даже когда радиатор снят.
    add(f'''<g class="unit" data-unit="cpu{n}" data-group="cpu" data-href="https://cv.cosmdandy.dev">
      {hit(X_SOCK-6, y-6, SOCKET_W+58, SOCKET_H+12)}
      {ilm(X_SOCK, y)}
      <g class="pick cpu-slot" data-cpu="{n}">
        {socket(X_SOCK, y)}{die(X_SOCK, y, n)}{heatsink(X_SOCK, y)}
        {fault(X_SOCK+SOCKET_W+16, y+SOCKET_H-10, 5)}
        {silk_inverse(X_SOCK+SOCKET_W+26, y+SOCKET_H-18, f'CPU{n} ERROR', 6)}
      </g>
      {mono(X_SOCK+SOCKET_W+6, y+10, f"CPU{n}", 9, anchor="start", op=0.5)}
    </g>''')

# ── служебная зона ────────────────────────────────────────────────────────
svc = [
    f'<circle cx="{X_SVC+34}" cy="300" r="23" fill="#1a2429" stroke="rgba(147,161,161,0.34)"/>',
    f'<circle cx="{X_SVC+34}" cy="300" r="15" fill="#0e171b"/>',
    mono(X_SVC + 34, 340, "CMOS", 8, op=0.4),
    f'<rect x="{X_SVC+84}" y="288" width="66" height="22" rx="2" fill="#1a2429" stroke="rgba(147,161,161,0.28)"/>',
    mono(X_SVC + 117, 326, "microSD", 8, op=0.4),
    f'<rect x="{X_SVC+12}" y="120" width="52" height="26" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.30)"/>',
    f'<rect x="{X_SVC+90}" y="120" width="52" height="26" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.30)"/>',
    mono(X_SVC + 78, 112, "P1 / P2", 8, op=0.38),
    # Переключатели и легенда перемычки: то, ради чего вообще лезут под крышку
    dip_switch(X_SVC + 10, 390, 4, on=(1, 3)),
    mono(X_SVC + 46, 458, "SW3", 7, op=0.38),
    dip_switch(X_SVC + 92, 390, 4, on=(2,)),
    mono(X_SVC + 128, 458, "SW4", 7, op=0.38),
    jumper_table(X_SVC + 6, 466, "J29 BIOS BOOT FROM",
                 [("1-2", "PRIMARY BIOS"), ("2-3", "BACKUP BIOS")]),
]
for i in range(3):
    x = X_SVC + 8 + i * 48
    svc.append(f'<rect x="{x}" y="188" width="42" height="26" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.30)"/>')
    svc.append(f'<rect x="{x+4}" y="193" width="34" height="16" rx="1" fill="#0a1417"/>')
svc.append(silk_inverse(X_SVC + 26, 226, "SATA / SLIMSAS", 6))
add('<g class="decor">' + ''.join(svc) + '</g>')

# Кнопка крышки стоит ровно над тумблером сервисного режима — и на плате, и
# на самой крышке, в одних и тех же координатах: меняется только надпись.
LID_BTN = (X_SVC + 26, 508, 86)     # x, y, сторона квадрата
add(f'''<g class="lid-on-btn" id="lid-on" role="button" tabindex="0" aria-label="Надеть крышку">
  {hit(LID_BTN[0]-6, LID_BTN[1]-6, LID_BTN[2]+12, LID_BTN[2]+12)}
  <rect x="{LID_BTN[0]}" y="{LID_BTN[1]}" width="{LID_BTN[2]}" height="{LID_BTN[2]}" rx="3"
        fill="#141d22" stroke="rgba(147,161,161,0.38)" stroke-width="1.4"/>
  <path d="M{LID_BTN[0]+26} {LID_BTN[1]+34} h34 M{LID_BTN[0]+43} {LID_BTN[1]+22} v24 m-8 -8 l8 8 8 -8"
        fill="none" stroke="rgba(147,161,161,0.5)" stroke-width="2"/>
  {mono(LID_BTN[0]+43, LID_BTN[1]+66, "НАДЕТЬ", 9, op=0.6)}
  {mono(LID_BTN[0]+43, LID_BTN[1]+78, "КРЫШКУ", 9, op=0.6)}
</g>''')

add(f'''<g class="svc-switch" id="svc-switch" role="button" tabindex="0" aria-label="Сервисный режим">
  {hit(X_SVC+6, 616, 130, 82)}
  <rect x="{X_SVC+14}" y="624" width="110" height="44" rx="6" fill="#0f1619" stroke="rgba(147,161,161,0.32)"/>
  <rect class="svc-knob" x="{X_SVC+20}" y="630" width="46" height="32" rx="4" fill="#22303655" stroke="rgba(147,161,161,0.42)"/>
  {mono(X_SVC+69, 686, "SERVICE", 9, op=0.55)}
  {mono(X_SVC+69, 700, "терминал и диагностика", 7, op=0.34)}
</g>''')

# ── блоки питания: вынимаются назад, за лепестки-ручки ───────────────────
# Ручка и вентилятор сидят на заднем торце — с той стороны, куда модуль
# выходит из шасси. Всё остальное занимает корпус с шильдиком и штрих-кодом.
for k, (y, flip) in enumerate([(22, False), (696, True)]):
    name = f"PSU-{k+1}"
    fan_y = y + (8 if flip else 83)      # вентилятор в дальнем от центра углу
    grip_y = y + (88 if flip else 14)     # ручка — в противоположном
    psu = [f'<rect x="{X_REAR}" y="{y}" width="300" height="145" rx="5" fill="#121a1e" stroke="rgba(147,161,161,0.26)"/>']
    # лепесток-ручка: выступает за задний торец, за него и тянут
    psu.append(f'<path d="M{X_REAR+236} {grip_y} h52 l16 21 -16 21 h-52 Z" fill="#1a242a" '
               f'stroke="rgba(147,161,161,0.36)" stroke-width="1.4"/>')
    psu.append(f'<rect x="{X_REAR+240}" y="{grip_y+6}" width="14" height="30" rx="2" fill="#cb4b16" '
               f'stroke="rgba(238,232,213,0.5)" stroke-width="1.2"/>')
    for g in range(3):
        psu.append(f'<line x1="{X_REAR+248}" y1="{grip_y+12+g*9}" x2="{X_REAR+284}" y2="{grip_y+12+g*9}" '
                   f'stroke="rgba(147,161,161,0.26)" stroke-width="2"/>')
    # вентилятор
    psu.append(f'<rect x="{X_REAR+238}" y="{fan_y-4}" width="58" height="58" rx="4" fill="#0b1215" stroke="rgba(147,161,161,0.22)"/>')
    psu.append(f'<circle cx="{X_REAR+267}" cy="{fan_y+25}" r="25" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>')
    psu.append(f'<path class="fan-blades aux" d="M{X_REAR+267} {fan_y+3} L{X_REAR+275} {fan_y+25} L{X_REAR+267} {fan_y+47} L{X_REAR+259} {fan_y+25} Z '
               f'M{X_REAR+245} {fan_y+25} L{X_REAR+267} {fan_y+17} L{X_REAR+289} {fan_y+25} L{X_REAR+267} {fan_y+33} Z" '
               f'fill="rgba(34,48,54,0.5)" stroke="rgba(147,161,161,0.22)" style="animation-duration:{jitter(k, 0.55, 0.3)}s"/>')
    # шильдик с характеристиками
    psu.append(f'<rect x="{X_REAR+96}" y="{y+30}" width="126" height="86" rx="3" '
               f'fill="#e8e3d5" fill-opacity="0.10" stroke="rgba(147,161,161,0.22)"/>')
    for r in range(6):
        yy = y + 44 + r * 12
        psu.append(f'<line x1="{X_REAR+106}" y1="{yy}" x2="{X_REAR+212}" y2="{yy}" stroke="rgba(147,161,161,0.16)" stroke-width="2"/>')
    # штрих-код вдоль внутреннего торца
    for b in range(20):
        w = 1.4 if b % 3 else 2.8
        psu.append(f'<rect x="{X_REAR+16}" y="{y+34+b*4}" width="24" height="{w}" fill="rgba(147,161,161,0.22)"/>')
    psu.append(mono(X_REAR + 62, y + 24, name, 11, op=0.5))
    psu.append(stamp(X_REAR + 16, y + 138, "блоки питания"))
    # AC, DC и ошибка — ровно тот набор, что подписан на наклейке живого БП.
    # Вход под напряжением всегда: AC горит и на выключенной машине.
    for dy, cls, color, nm in ((0, "led aux", "#859900", "AC"),
                               (17, "led", "#859900", "DC"),
                               (34, "fault-sys", "#b58900", "!")):
        ly = y + 100 + dy
        psu.append(f'{glow(cls, X_REAR + 60, ly, 4, color)}'
                   f'<circle class="{cls}" cx="{X_REAR+60}" cy="{ly}" r="4" fill="{color}"/>')
        psu.append(mono(X_REAR + 76, ly + 3, nm, 7, anchor="start", op=0.44))
    add(f'''<g class="pick psu" data-psu="{k+1}">
      <g class="pick-body">{''.join(psu)}</g>
      {fault_at(X_REAR-14, y + (128 if flip else 16), 5)}
    </g>''')

# ── райзеры: тонкий уголок, широкой частью к задней стенке ────────────────
# Кронштейн действительно тонкий: пара миллиметров стали. Широкая часть у
# задней панели, ножка уходит вперёд, к центру машины.
# Углы штампованной скобы: наружные грани режут прямо по контуру заготовки,
# а внутренний угол всегда скруглён — на прямом угле сталь трескается.
T, RI = 52, 18   # ширина стойки и радиус внутреннего угла

def hexgrid(x, y, w, h, s=7, gap=5.5):
    """Гексагональная перфорация: ею облегчают широкую часть кронштейна."""
    out, dx, dy = [], s * 1.5 + gap, (s + gap / 2) * 1.732
    row = 0
    cy = y + s
    while cy < y + h - s * 0.6:
        cx = x + s + (dx / 2 if row % 2 else 0)
        while cx < x + w - s * 0.9:
            pts = ' '.join(f'{cx + s*0.86*dxx:.1f},{cy + s*dyy:.1f}' for dxx, dyy in
                           ((0, -1), (1, -0.5), (1, 0.5), (0, 1), (-1, 0.5), (-1, -0.5)))
            out.append(f'<polygon points="{pts}" fill="#0a1216" stroke="rgba(147,161,161,0.16)"/>')
            cx += dx
        cy += dy / 2
        row += 1
    return ''.join(out)

for k, (y, up) in enumerate(((186, True), (474, False))):
    x0, x1, hh = X_REAR + 12, X_PCB_END - 6, 192
    if up:
        # полка сверху, стойка справа: вогнутый угол один — (x1-T, y+T)
        d = (f'M{x0} {y} H{x1} V{y+hh} H{x1-T} V{y+T+RI} '
             f'A{RI} {RI} 0 0 0 {x1-T-RI} {y+T} H{x0} Z')
        slot_y = y + T + 14
        hex_y = y + T + 6
    else:
        d = (f'M{x0} {y+hh} H{x1} V{y} H{x1-T} V{y+hh-T-RI} '
             f'A{RI} {RI} 0 0 1 {x1-T-RI} {y+hh-T} H{x0} Z')
        slot_y = y + 14
        hex_y = y + 6

    # Одна карта на райзер — так и стоит в 1U. Разъём у верхнего смотрит
    # вниз, у нижнего вверх: райзеры зеркальны, и карты в них тоже.
    cw = x1 - x0 - T - 46
    if not up:
        slot_y = y + hh - T - 74        # прижимаем к полке: она снизу
    edge_y = slot_y + (-8 if up else 58)
    card = (f'<rect x="{x0+18}" y="{slot_y}" width="{cw}" height="50" rx="1" fill="none" '
            f'stroke="rgba(147,161,161,0.14)" stroke-dasharray="5 5"/>'
            f'<rect x="{x0+18}" y="{edge_y}" width="{cw}" height="8" rx="0" fill="#101a22" '
            f'stroke="rgba(147,161,161,0.26)"/>'
            + ''.join(f'<line x1="{x0+26+j*14}" y1="{edge_y+1}" x2="{x0+26+j*14}" y2="{edge_y+7}" '
                      f'stroke="rgba(133,153,0,0.30)"/>' for j in range(int(cw // 14) - 1))
            + mono(x0 + 18 + cw / 2, slot_y + 30, "PCIe ×16", 8, op=0.36))
    # Лепесток-ручка на внешнем торце: райзер вынимают вверх, взявшись за него.
    ty = y + (-10 if up else hh - 6)
    py = y + (6 if up else hh - T + 6)
    tab = (
        # торцевой: наполовину за габаритом стойки
        f'<rect x="{x1-T+10}" y="{ty}" width="{T-24}" height="16" rx="2" fill="#cb4b16" '
        f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
        f'<rect x="{x1-T+16}" y="{ty+4}" width="{T-36}" height="8" rx="1" fill="rgba(238,232,213,0.22)"/>'
        # на полке, ближе к центру машины: за него райзер и качают
        f'<rect x="{x0-8}" y="{py}" width="16" height="{T-12}" rx="2" fill="#cb4b16" '
        f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
        f'<rect x="{x0-4}" y="{py+5}" width="8" height="{T-22}" rx="1" fill="rgba(238,232,213,0.22)"/>')

    # Ответный слот на плате — под краевыми контактами карты. Он остаётся,
    # когда райзер вынимают: разъём распаян, а кронштейн съёмный.
    add(f'''<g class="decor">
      <rect x="{x0+14}" y="{edge_y-3}" width="{cw+8}" height="14" rx="2" fill="#101a22"
            stroke="rgba(147,161,161,0.34)"/>
      <rect x="{x0+18}" y="{edge_y+1}" width="{cw}" height="6" rx="1" fill="#060d10"/>
      {''.join(f'<line x1="{x0+22+j*9}" y1="{edge_y+1}" x2="{x0+22+j*9}" y2="{edge_y+7}" stroke="rgba(133,153,0,0.22)"/>' for j in range(int(cw // 9) - 1))}
      {mono(x0 + 18 + cw / 2, edge_y + 22, f"RISER_{k+1} · PCIE_G5 ×16", 6, op=0.32)}
    </g>''')
    add(f'''<g class="pick riser" data-riser="{k+1}">
      <g class="pick-body">
        <path d="{d}" fill="#141d22" stroke="rgba(147,161,161,0.30)" stroke-width="1.4"/>
        {hexgrid(x1 - T + 8, hex_y, T - 16, hh - T - 12)}
        {card}
        {tab}
      </g>
      {fault_at(x0-14, y + 96, 5)}
      {stamp(x0 + 18, y + hh - 6 if up else y + 12, "райзеры")}
    </g>''')

# PCH и BMC — в проёме между райзерами.
add(f'''<g class="decor">
  <rect x="{X_REAR+16}" y="398" width="62" height="62" rx="3" fill="#16222a" stroke="rgba(147,161,161,0.34)"/>
  {mono(X_REAR+47, 434, "PCH", 9, op=0.45)}
  <rect x="{X_REAR+94}" y="396" width="66" height="66" rx="4" fill="#26333a" stroke="rgba(147,161,161,0.30)"/>
  {''.join(f'<line x1="{X_REAR+100}" y1="{404+i*8}" x2="{X_REAR+154}" y2="{404+i*8}" stroke="rgba(147,161,161,0.18)" stroke-width="2"/>' for i in range(7))}
  {mono(X_REAR+127, 478, "BMC", 9, op=0.45)}
  <circle class="led-hb" cx="{X_REAR+182}" cy="404" r="5" fill="#859900"/>
  {mono(X_REAR+182, 424, "HB", 7, op=0.36)}
</g>''')

# ── задняя панель: SFP+ 10G, RJ45 1GbE, RJ45 управления ─────────────────
CALLOUTS.append((X_IO - 30, 214, X_IO + 4, 214, "LinkedIn", "end", "https://linkedin.com/in/cosmdandy", "ocp"))
CALLOUTS.append((X_IO - 30, 358, X_IO + 4, 358, "Telegram", "end", "https://t.me/cosmdandy", "eth"))
CALLOUTS.append((X_IO - 30, 404, X_IO + 4, 404, "Twitter", "end", "https://x.com/cosmdandy", "tw"))
CALLOUTS.append((X_IO - 30, 502, X_IO + 4, 502, "Email", "end", "mailto:i@cosmdandy.dev", "bmc"))

# У каждого порта своя пара ламп, как на живой машине: линк и активность.
# Второй SFP+ отдан под связь, которая поднялась на пониженной скорости —
# янтарный линк без трафика. На железе это первое, что бросается в глаза.
add(f'''<g class="unit pick" data-unit="ocp" data-group="ocp" data-href="https://linkedin.com/in/cosmdandy">
  <g class="pick-body">
    <rect x="{X_IO}" y="182" width="86" height="118" rx="5" fill="#13282c" stroke="rgba(42,161,152,0.50)"/>
    {sfp(X_IO+14, 204)}
    {sfp(X_IO+14, 248)}
    <circle class="led-link" cx="{X_IO+20}" cy="196" r="3" fill="#2aa198"/>
    {act_led(3, X_IO+20, 196, 3, "#859900", salt=2)}
    {mono(X_IO+38, 199, "P1", 6, op=0.42)}
    <circle class="led-link" cx="{X_IO+20}" cy="240" r="3" fill="#b58900"/>
    {mono(X_IO+38, 243, "P2", 6, op=0.42)}
  </g>
  {mono(X_IO+43, 318, "2× 10G SFP+", 9, op=0.5)}
  {mono(X_IO+43, 330, "1× 1G · degraded", 7, op=0.34)}
</g>''')

# Две гигабитные розетки — две разные ссылки. Общая рамка остаётся: это одна
# карта, её и вынимают целиком, — но подсвечивается и открывается каждая
# розетка своя, поэтому unit вложен в pick, а не наоборот.
def rj_port(y, group, href, salt, seed):
    """Розетка с полным набором ламп: линк, приём, передача.

    На живой розетке их две — зелёная слева, янтарная справа, — но приём и
    передачу видно по тому, какая моргает; здесь они разнесены явно.
    """
    return (f'<g class="unit" data-group="{group}" data-href="{href}">'
            f'<g class="body">'
            f'<rect x="{X_IO+4}" y="{y-8}" width="78" height="46" rx="3" fill="#0f2226" '
            f'stroke="rgba(42,161,152,0.26)"/>'
            f'{rj45(X_IO+22, y)}'
            # у розетки две лампы: линк горит ровно, активность мигает
            f'<circle class="led-link" cx="{X_IO+12}" cy="{y+2}" r="2.8" fill="#859900"/>'
            + mono(X_IO + 12, y + 12, "LNK", 4, op=0.32)
            + act_led(seed, X_IO + 12, y + 22, 2.8, "#b58900", salt=salt)
            + mono(X_IO + 12, y + 32, "ACT", 4, op=0.32)
            + '</g></g>')

add(f'''<g class="pick" data-unit="eth">
  <g class="pick-body">
    <rect x="{X_IO}" y="336" width="86" height="104" rx="5" fill="#13282c" stroke="rgba(42,161,152,0.45)"/>
    {rj_port(344, "eth", "https://t.me/cosmdandy", 4, 6)}
    {rj_port(390, "tw", "https://x.com/cosmdandy", 7, 11)}
  </g>
  {mono(X_IO+43, 456, "2× 1GbE", 9, op=0.5)}
</g>''')

add(f'''<g class="unit" data-unit="bmc" data-group="bmc" data-href="mailto:i@cosmdandy.dev">
  <g class="pick-body">
    <rect x="{X_IO}" y="470" width="86" height="80" rx="5" fill="#1a1f14" stroke="rgba(181,137,0,0.55)"/>
    {rj45(X_IO+16, 488)}
    {act_led(9, X_IO+8, 484, 3, "#b58900", salt=6, aux=True)}
  </g>
  {mono(X_IO+43, 568, "MLAN · BMC", 9, op=0.55)}
</g>''')

add(stamp(X_IO + 43, 700, "задняя панель", anchor="middle"))
add(f'''<g class="decor">
  <rect x="{X_IO}" y="588" width="86" height="30" rx="4" fill="#121a1e" stroke="rgba(147,161,161,0.22)"/>
  <rect x="{X_IO+12}" y="595" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+34}" y="595" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+56}" y="595" width="12" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  {mono(X_IO+43, 630, "USB · mDP", 8, op=0.42)}
  <circle class="fault-sys" cx="{X_IO+18}" cy="664" r="6" fill="#b58900"/>
  {mono(X_IO+18, 684, "!", 9, op=0.4)}
  <circle class="led-id" cx="{X_IO+62}" cy="664" r="6" fill="#268bd2"/>
  {mono(X_IO+62, 684, "ID", 9, op=0.4)}
</g>''')

# ── обозначения узлов: то, что реально нанесено рядом с разъёмами ────────
# Кладём в конце, поверх всего, и только туда, где действительно свободно —
# регистр занятости уже знает, где стоят детали.
marks = []
CANDIDATES = [
    (X_PCB + 60, Y_BANK_L - 16, "DIMM_CPU0_A0"),
    (X_PCB + 60, Y_BANK_C - 16, "DIMM_CPU0_A1 / CPU1_A0"),
    (X_PCB + 60, Y_BANK_R - 16, "DIMM_CPU1_A1"),
    (X_VRM - 30, Y_CPU0 - 12, "VR_CPU0"),
    (X_VRM - 30, Y_CPU1 - 12, "VR_CPU1"),
    (X_SVC + 8, 96, "PWR_CONN"),
    (X_SVC + 8, 250, "SATA_0-2"),
    (X_SVC + 8, 360, "BAT1 · CR2032"),
    (X_SVC + 8, 468, "M.2_M-KEY"),
    (X_SVC + 8, 512, "TPM_HDR"),
    (X_SVC + 8, 556, "USB_INT"),
    (X_SVC + 8, 600, "NMI_SW"),
    (X_REAR + 14, 378, "PCH · C741"),
    (X_REAR + 92, 378, "BMC · AST2600"),
    (X_REAR + 14, 176, "RISER_1 · PCIE_G5"),
    (X_REAR + 14, 686, "RISER_2 · PCIE_G5"),
    (X_IO - 96, 176, "OCP_3.0 · 2×25G"),
    (X_IO - 96, 330, "LAN_1/2 · 1GbE"),
    (X_IO - 96, 464, "MLAN · IPMI 2.0"),
]
for (x, y, text) in CANDIDATES:
    w = len(text) * 5 + 6
    if not put(x, y - 9, w, 12):
        continue
    marks.append(mono(x, y, text, 7, anchor="start", op=0.46))

# мелочь в оставшихся свободных карманах платы
for i in range(150):
    x = X_PCB + 20 + (i * 173) % (X_REAR - 30 - X_PCB)
    y = 24 + (i * 251) % (H - 50)
    if i % 3 == 0:
        if put(x, y, 10, 6):
            marks.append(f'<rect x="{x}" y="{y}" width="10" height="6" fill="rgba(147,161,161,0.15)"/>')
    elif i % 3 == 1:
        if put(x, y, 8, 8):
            marks.append(f'<circle cx="{x+4}" cy="{y+4}" r="3.6" fill="#131e24" stroke="rgba(147,161,161,0.24)"/>')
    else:
        if put(x, y, 16, 9):
            marks.append(f'<rect x="{x}" y="{y}" width="16" height="9" rx="1" fill="#16212a" stroke="rgba(147,161,161,0.18)"/>')
add('<g class="decor silk">' + ''.join(marks) + '</g>')

# ── выноски: подписи узлов, видимые сразу ───────────────────────────────
add('<g class="callouts">' + ''.join(callout(*c) for c in CALLOUTS) + '</g>')

# ── Light Path Diagnostics ────────────────────────────────────────────────
def lightpath_panel():
    """Панель Light Path Diagnostics полного состава.

    Выросла со 140×118 до 300×150: шестнадцать ламп в три ступенчатых ряда,
    чекпойнт-индикатор и три кнопки в прежний габарит не влезали. Правый край
    оставлен на месте — панель растёт только влево, туда же, куда её выдвигает
    трансформация в CSS.
    """
    def digit(x, y):
        """Семисегментная восьмёрка: горят все сегменты, как при самотесте."""
        w, h, t = 14, 22, 2.6
        c = '#b58900'
        bars = [(x, y, w, t), (x, y + h / 2 - t / 2, w, t), (x, y + h - t, w, t),
                (x, y + t, t, h / 2 - t * 1.4), (x + w - t, y + t, t, h / 2 - t * 1.4),
                (x, y + h / 2 + t / 2, t, h / 2 - t * 1.4),
                (x + w - t, y + h / 2 + t / 2, t, h / 2 - t * 1.4)]
        return ''.join(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="{c}"/>'
                       for bx, by, bw, bh in bars)

    ROWS = [
        (84, 0, [("OVER SPEC", "over-spec"), ("LOG", "log"), ("LINK", "link"),
                 ("PS", "ps"), ("PCI", "pci"), ("SP", "sp")]),
        (107, 63, [("FAN", "fan"), ("TEMP", "temp"), ("MEM", "mem"), ("NMI", "nmi")]),
        (130, 21, [("CNFG", "cnfg"), ("CPU", "cpu"), ("VRM", "vrm"),
                   ("DASD", "dasd"), ("RAID", "raid"), ("BRD", "brd")]),
    ]
    X0, P = -267, 42

    p = ['<rect x="-312" y="20" width="300" height="150" rx="4" fill="#10171a" stroke="rgba(147,161,161,0.34)"/>']
    p.append('<rect x="-300" y="26" width="40" height="30" rx="2" fill="#0b1013" stroke="rgba(147,161,161,0.3)"/>')
    p.append(digit(-296, 30))
    p.append(digit(-278, 30))
    p.append('<circle cx="-136" cy="41" r="10" fill="none" stroke="rgba(147,161,161,0.4)" stroke-width="1.3"/>')
    p.append('<circle cx="-136" cy="41" r="6" fill="#20282d"/>')
    p.append(mono(-136, 59, "REMIND", 6.5, op=0.42))
    p.append('<line x1="-300" y1="68" x2="-24" y2="68" stroke="rgba(147,161,161,0.18)" stroke-width="1"/>')
    for y, shift, items in ROWS:
        for i, (label, key) in enumerate(items):
            x = X0 + shift + i * P
            p.append(f'<circle class="lp lp-{key}" cx="{x}" cy="{y}" r="3.2" fill="#b58900"/>')
            p.append(mono(x, y + 9, label, 6, op=0.42))
    p.append('<line x1="-300" y1="148" x2="-24" y2="148" stroke="rgba(147,161,161,0.18)" stroke-width="1"/>')
    p.append('<circle cx="-292" cy="156" r="6" fill="none" stroke="#dc322f" stroke-width="1.8"/>')
    p.append('<circle cx="-292" cy="156" r="3" fill="rgba(147,161,161,0.85)"/>')
    p.append(mono(-283, 159, "RESET", 6.5, anchor="start", op=0.42))
    p.append('<circle cx="-230" cy="156" r="3.5" fill="#0b1013" stroke="rgba(147,161,161,0.3)"/>')
    p.append(mono(-222, 159, "NMI", 6.5, anchor="start", op=0.42))
    p.append(mono(-162, 166, "LIGHT PATH DIAGNOSTICS", 7, op=0.4))
    return ''.join(p)

add(f'''<g class="lightpath" aria-hidden="true">{lightpath_panel()}</g>''')

# ── гравировка на крышке ─────────────────────────────────────────────────
# Крышка накрывает всю машину, кроме панели управления: кнопка должна
# оставаться доступной. Подписи — не названия железа, а то, куда ведёт узел:
# схема сама объясняет, что где лежит.
L = []
def eng(x):
    L.append(x)

def frame(x, y, w, h, rx=0, op=0.28):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="none" '
            f'stroke="rgba(147,161,161,{op})" stroke-width="1.4"/>')

def label(x, y, t, size=11, anchor_="middle", op=0.42):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor_}" fill="rgba(147,161,161,{op})" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}" letter-spacing="0.1em">{t}</text>')

# тело крышки с вырезом под панель управления
PW, PH = FRONT_W + 8, Y_PANEL - 8
eng(f'<path fill-rule="evenodd" d="M4 4 H{W-4} V{H-4} H4 Z M4 4 H{PW} V{PH} H4 Z" '
    f'fill="#161f24" stroke="rgba(147,161,161,0.30)" stroke-width="1.4"/>')

# корзина — одним блоком
eng(frame(X_FRONT, BAY_TOP, FRONT_W, H - 12 - BAY_TOP, 1, 0.30))
eng(f'<text x="{X_FRONT + FRONT_W/2}" y="{BAY_TOP + (H-12-BAY_TOP)/2}" '
    f'transform="rotate(-90 {X_FRONT + FRONT_W/2} {BAY_TOP + (H-12-BAY_TOP)/2})" text-anchor="middle" '
    f'fill="rgba(147,161,161,0.46)" font-family="ui-monospace, Menlo, monospace" '
    f'font-size="15" letter-spacing="0.14em">GitHub · 6× NVMe</text>')

# стенка вентиляторов
eng(frame(X_FAN, 20, FAN_W, H - 40, 0, 0.26))
for i in range(8):
    y = 26 + i * 101.5
    eng(frame(X_FAN + 4, y, FAN_W - 8, 94, 0, 0.18))
    for k in range(2):
        eng(f'<circle cx="{X_FAN + FAN_W / 4 + k * (FAN_W / 2)}" cy="{y+47}" r="36" fill="none" '
            f'stroke="rgba(147,161,161,0.18)" stroke-width="1.3"/>')

# плата
eng(f'<path d="M{X_PCB} 18 H{X_REAR-4} V{Y_PSU_TOP} H{X_PCB_END} V{Y_PSU_BOT} H{X_REAR-4} V{H-18} H{X_PCB} Z" '
    f'fill="none" stroke="rgba(147,161,161,0.26)" stroke-width="1.4"/>')

# память и процессоры — с назначением, а не с маркировкой
for y0, n in ((Y_BANK_L, 8), (Y_BANK_C, 16), (Y_BANK_R, 8)):
    eng(frame(X_CORE - 6, y0 - 4, 322, n * PITCH + 6, 0, 0.26))
    for i in range(n):
        yy = y0 + i * PITCH + SLOT_H / 2
        eng(f'<line x1="{X_CORE+6}" y1="{yy}" x2="{X_CORE+304}" y2="{yy}" '
            f'stroke="rgba(147,161,161,0.14)" stroke-width="1.2"/>')
eng(label(X_CORE + 155, Y_BANK_C + 16 * PITCH / 2 + 5, "Blog", 15))

for y in (Y_CPU0, Y_CPU1):
    eng(frame(X_SOCK, y, SOCKET_W, SOCKET_H, 4, 0.30))
    eng(frame(X_SOCK + 14, y + 14, SOCKET_W - 28, SOCKET_H - 28, 2, 0.20))
    eng(label(X_SOCK + SOCKET_W / 2, y + SOCKET_H / 2 + 5, "CV", 15))

# задняя часть
for y in (22, 696):
    eng(frame(X_REAR, y, 300, 145, 0, 0.26))
    eng(label(X_REAR + 150, y + 79, "POWER", 11, op=0.34))
for y in (186, 474):
    eng(frame(X_REAR + 12, y, X_PCB_END - 18 - X_REAR, 192, 6, 0.22))

eng(frame(X_IO, 182, 86, 118, 4, 0.26))
eng(label(X_IO - 26, 245, "LinkedIn", 12, anchor_="end"))
eng(frame(X_IO, 336, 86, 98, 4, 0.26))
eng(label(X_IO - 26, 389, "Telegram", 12, anchor_="end"))
eng(frame(X_IO, 470, 86, 80, 4, 0.26))
eng(label(X_IO - 26, 514, "Email", 12, anchor_="end"))

eng(rating_label(X_REAR, 74))
eng(rating_label(X_REAR, 748))
eng(service_label(X_FAN + 30, 300, 300, 120, "HOT-SWAP FANS",
                  ["FAN 1-8 · вынимать по одному",
                   "не оставлять слот пустым дольше 30 с",
                   "неисправность ищется на плате,",
                   "у колодки вентилятора"]))
eng(label((PW + W) / 2, H - 26, "CD93-FS1  ·  SERVICE COVER", 11, op=0.26))
# кнопка снятия — на крышке, в тех же координатах, что кнопка «надеть» на
# плате: место не прыгает, меняется только надпись
bx, by, bs = LID_BTN
eng(f'<g id="lid-remove" class="lid-btn-svg" role="button" tabindex="0" aria-label="Снять крышку">'
    f'<rect x="{bx}" y="{by}" width="{bs}" height="{bs}" rx="3" fill="#1b2429" '
    f'stroke="rgba(147,161,161,0.5)" stroke-width="1.6"/>'
    f'<path d="M{bx+26} {by+46} h34 M{bx+43} {by+58} v-24 m-8 8 l8 -8 8 8" fill="none" '
    f'stroke="rgba(147,161,161,0.6)" stroke-width="2"/>'
    + label(bx + 43, by + 74, "СНЯТЬ", 10, op=0.7)
    + label(bx + 43, by + 86, "КРЫШКУ", 10, op=0.7) + '</g>')

lidart = '\n'.join(L)
with open('board-v17-lid.svg.part', 'w') as f:
    f.write(lidart)

# ── сборка ────────────────────────────────────────────────────────────────
board = '\n'.join(P)
with open('board-v17.svg.part', 'w') as f:
    f.write(board)

try:
    with open('v17.html') as f:
        html = f.read()
except FileNotFoundError:
    print('board-v17.svg.part записан, фрагментов:', len(P))
    raise SystemExit(0) from None

new = re.sub(r'(<!-- BOARD:BEGIN -->).*?(<!-- BOARD:END -->)',
             lambda m: m.group(1) + '\n' + board + '\n' + m.group(2),
             html, flags=re.DOTALL)
new = re.sub(r'(<!-- LIDART:BEGIN -->).*?(<!-- LIDART:END -->)',
             lambda m: m.group(1) + '\n' + lidart + '\n' + m.group(2),
             new, flags=re.DOTALL)
with open('v17.html', 'w') as f:
    f.write(new)
print('board-v17.svg.part записан и вставлен в v17.html, фрагментов:', len(P))
