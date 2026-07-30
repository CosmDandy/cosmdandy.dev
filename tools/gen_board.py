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

import math
import re

from board.canvas import Canvas
from board.geom import (
    BAY_N, BAY_TOP, BAY_W, CAP, FAN_W, FRONT_W, GROUP_GAP, GROUP_H, GROUPS, H,
    PITCH, SLOT_H, SOCKET_H, SOCKET_W, W, X_BP, X_CORE, X_FAN, X_FRONT, X_IO,
    X_PCB, X_PCB_END, X_REAR, X_SOCK, X_SVC, X_TAG, X_VRM, Y_BANK_C, Y_BANK_L,
    Y_BANK_R, Y_CPU0, Y_CPU1, Y_PANEL, Y_PSU_BOT, Y_PSU_TOP, LID_BTN,
)
from board.ink import block_frame, callout, empty_pads, hit, mono, silk_frame, silk_inverse, tag
from board.lamps import act_led, fault, glow, jitter
from board.lamps import fault_at as _fault_at
from board.metal import (
    hexgrid, idc_header, ihs_path, pad, power_header, rating_label, relief, service_label,
)
from board.ports import rj45, sfp
from board.palette import GLOW, GLOW3, PCB_DARK, SILVER, SILVER_DIM, SILVER_LIT

# Холст сборки. Алиасы — чтобы код блоков остался дословно тем же: на этом
# шаге переносим определения, а не переписываем вызовы.
_C = Canvas()
add, busy, free, put = _C.add, _C.busy, _C.free, _C.put
P, BUSY, CALLOUTS = _C.parts, _C.taken, _C.callouts

def fault_at(cx, cy, r=4.5, shift=18):
    return _fault_at(_C, cx, cy, r, shift)

def _run(name):
    """Отрисовать блок-узел.

    Порядок вызовов — он же порядок слоёв и он же очередь на место: кто
    первым занял, того и место. Поэтому задаётся явно, а не порядком импортов.
    """
    import importlib
    importlib.import_module(f'board.blocks.{name}').render(_C)

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









# ── Регистр занятых мест ──────────────────────────────────────────────────
# Плата плотная, и мелочь то и дело садилась на монтажные отверстия и на
# чужие подписи. Каждый крупный элемент отмечает свой прямоугольник, а мелочь
# и шелкография перед вставкой спрашивают, свободно ли.

# ── зоны по глубине ───────────────────────────────────────────────────────

# ── зоны по ширине: 8 DIMM | CPU0 | 16 DIMM | CPU1 | 8 DIMM ───────────────
# Планки стали толще, зазоры между ними и до сокета — меньше.









# ── металл ────────────────────────────────────────────────────────────────
# Выводы, площадки и контакты делаем серебром, а не той же серой краской,
# что и шелкография: на живой плате олово — единственное, что бликует, и
# именно по нему глаз отделяет деталь от рисунка под ней.






_run('chassis')
_run('pcb_field')
_run('pcb_zones')
_run('pcb_edge')
_run('pcb_traces')
_run('pcb_vias')
_run('pcb_scatter')
_run('vrm')
_run('front_panel')
_run('drives')
_run('backplane')
_run('cables')
_run('fans')
_run('cable_ends')
_run('memory')
_run('cpu')
_run('service')
_run('psu')
_run('risers')
_run('rear_io')
_run('marks')
_run('frames')
_run('callouts')
_run('lightpath')
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

# Рёбра жёсткости: лист крышки в 1U тонкий, и без продольной формовки он
# играет под рукой. Два ребра идут во всю длину, поперёк — короткие, у
# кромок. Видны они как пара параллельных линий: это складка металла.
for ry in (150, H - 150):
    eng(f'<path d="M{X_FAN + 40} {ry} H{W - 60}" fill="none" '
        f'stroke="rgba(147,161,161,0.20)" stroke-width="3.4"/>')
    eng(f'<path d="M{X_FAN + 40} {ry} H{W - 60}" fill="none" '
        f'stroke="rgba(147,161,161,0.13)" stroke-width="1"/>')
for rx in (X_FAN + 60, (X_FAN + W) / 2, W - 150):
    eng(f'<path d="M{rx} 40 V{H - 40}" fill="none" '
        f'stroke="rgba(147,161,161,0.10)" stroke-width="2.6"/>')

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

eng(rating_label(X_REAR, 74, 1))
eng(rating_label(X_REAR, 748, 2))
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
