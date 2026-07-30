"""Аудит наложений: текст поверх чужих фигур в декоре платы.

Метрика моноширинного: продвижение 0.6 em, высота прописных ~0.72 em.
Считаем bbox текста и ищем непустое пересечение с фигурами, нарисованными
ПОСЛЕ него (те лягут сверху) и ДО него (текст ляжет на них).
"""
import re
from pathlib import Path

SRC = str(Path(__file__).parent / "board-v17.svg.part")
s = open(SRC, encoding="utf-8").read()

# Ограничиваемся декором: интерактивные узлы разложены руками.
def spans(tag_open):
    out, i = [], 0
    while True:
        i = s.find(tag_open, i)
        if i < 0:
            return out
        # ищем закрывающий </g> с учётом вложенности
        depth, j = 1, i + len(tag_open)
        while depth:
            ng, cg = s.find("<g", j), s.find("</g>", j)
            if cg < 0:
                return out
            if 0 <= ng < cg:
                depth += 1
                j = ng + 2
            else:
                depth -= 1
                j = cg + 4
        out.append(s[i:j])
        i = j

blocks = spans('<g class="decor parts">') + spans('<g class="decor silk">')
print("блоков декора:", len(blocks), "суммарно", sum(len(b) for b in blocks), "симв")

TEXT = re.compile(
    r'<text ([^>]*?)>([^<]*)</text>')
RECT = re.compile(r'<rect ([^>]*?)/>')
CIRC = re.compile(r'<circle ([^>]*?)/>')

def attrs(a):
    return dict(re.findall(r'([a-z-]+)="([^"]*)"', a))

def num(d, k, dflt=0.0):
    try:
        return float(d.get(k, dflt))
    except ValueError:
        return dflt

texts, shapes = [], []
for b in blocks:
    for m in TEXT.finditer(b):
        d, body = attrs(m.group(1)), m.group(2)
        size = num(d, "font-size", 10)
        w = len(body) * size * 0.6
        anchor = d.get("text-anchor", "start")
        x, y = num(d, "x"), num(d, "y")
        x0 = x if anchor == "start" else (x - w / 2 if anchor == "middle" else x - w)
        box = (x0, y - size * 0.72, w, size * 0.72)
        if "rotate(-90" in d.get("transform", ""):
            # поворот вокруг (x,y): ширина уходит вверх
            box = (x - size * 0.72, y - w, size * 0.72, w)
        texts.append((box, body, m.start(), size))
    for m in RECT.finditer(b):
        d = attrs(m.group(1))
        if d.get("fill", "") in ("none", ""):
            continue
        shapes.append(((num(d, "x"), num(d, "y"), num(d, "width"), num(d, "height")),
                       "rect " + d.get("fill", ""), m.start(), float(d.get("fill-opacity", 1))))
    for m in CIRC.finditer(b):
        d = attrs(m.group(1))
        if d.get("fill", "") in ("none", ""):
            continue
        r = num(d, "r")
        shapes.append(((num(d, "cx") - r, num(d, "cy") - r, 2 * r, 2 * r),
                       "circle " + d.get("fill", ""), m.start(), float(d.get("fill-opacity", 1))))

print("текстов:", len(texts), " непрозрачных фигур:", len(shapes))

def hit(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ox = min(ax + aw, bx + bw) - max(ax, bx)
    oy = min(ay + ah, by + bh) - max(ay, by)
    return ox > 0.6 and oy > 0.6, ox, oy

def inside(a, b, slack=0.5):
    """a целиком внутри b."""
    return (b[0] <= a[0] + slack and b[1] <= a[1] + slack
            and b[0] + b[2] >= a[0] + a[2] - slack and b[1] + b[3] >= a[1] + a[3] - slack)

bad = []
for tbox, body, tpos, size in texts:
    # подложка текста — последняя фигура, нарисованная до него и накрывающая его центр
    cx, cy = tbox[0] + tbox[2] / 2, tbox[1] + tbox[3] / 2
    under = [s for s in shapes
             if s[2] < tpos and s[0][0] <= cx <= s[0][0] + s[0][2] and s[0][1] <= cy <= s[0][1] + s[0][3]]
    base = under[-1] if under else None
    if base and not inside(tbox, base[0]):
        bad.append(("вылезает за подложку", body[:26], base[1], round(tbox[0]), round(tbox[1])))
    for sbox, kind, spos, op in shapes:
        if spos <= tpos:
            continue                       # нарисована раньше — текст поверх неё, это норма
        ok, ox, oy = hit(tbox, sbox)
        if ok:
            bad.append((f"перекрыт на {min(ox, oy):.1f}", body[:26], kind,
                        round(tbox[0]), round(tbox[1])))

print("проблем:", len(bad))
for r in sorted(bad):
    print(" ", r)
