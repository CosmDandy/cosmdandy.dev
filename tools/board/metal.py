"""Металл: выводы, площадки, контакты, штампованные детали.

Делаем их серебром, а не той же серой краской, что и шелкография: на живой
плате олово — единственное, что бликует, и именно по нему глаз отделяет
деталь от рисунка под ней.
"""

from board.geom import SOCKET_H, SOCKET_W
from board.ink import mono
from board.palette import SILVER, SILVER_DIM, SILVER_LIT


def pad(x, y, w, h, r=0.6):
    """Контактная площадка: олово с бликом сверху и тенью снизу."""
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{SILVER_DIM}"/>'
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h - 0.8:.1f}" rx="{r}" fill="{SILVER}"/>'
            f'<rect x="{x + 0.4:.1f}" y="{y + 0.3:.1f}" width="{max(0.6, w - 0.8):.1f}" height="0.6" '
            f'fill="{SILVER_LIT}" fill-opacity="0.55"/>')

def relief(x, y, w, h, rx=1):
    """Фаска корпуса: светлая кромка сверху, тень снизу. Дешевле тени и не
    создаёт слоя композитинга, в отличие от filter."""
    return (f'<path d="M{x + rx:.1f} {y:.1f} H{x + w - rx:.1f}" stroke="rgba(223,232,234,0.20)" '
            f'stroke-width="0.9" fill="none"/>'
            f'<path d="M{x + rx:.1f} {y + h:.1f} H{x + w - rx:.1f}" stroke="rgba(0,0,0,0.38)" '
            f'stroke-width="1.1" fill="none"/>')

def ihs_path(x, y):
    """Контур крышки процессора: ключи по бокам и срез у первого вывода.

    Живёт отдельной функцией, потому что по этому же контуру режется
    перелив кристалла: прямоугольный клип превращал крышку обратно в
    плашку и съедал ключи, ради которых всё и делалось.
    """
    ix, iy = x + 40, y + 34
    iw, ih = SOCKET_W - 80, SOCKET_H - 68
    notch, cut = 9, 12
    return (f'M{ix + cut} {iy} '
            f'H{ix + iw / 2 - notch} '
            f'a{notch} {notch} 0 0 0 {notch * 2} 0 '
            f'H{ix + iw} '
            f'V{iy + ih / 2 - notch} '
            f'a{notch} {notch} 0 0 0 0 {notch * 2} '
            f'V{iy + ih} '
            f'H{ix + iw / 2 + notch} '
            f'a{notch} {notch} 0 0 0 -{notch * 2} 0 '
            f'H{ix} '
            f'V{iy + cut} Z')

def idc_header(x, y, pins, label, vertical=False):
    """Шлейфовая гребёнка: два ряда контактов в пластиковом бортике.

    К таким идут плоские шлейфы на переднюю панель, к кнопке питания, к
    USB и к датчику вскрытия. Прорезь-ключ с одной стороны — чтобы шлейф
    не воткнули наоборот; на живой плате её видно сразу.
    """
    n = pins // 2
    w, h = n * 4.4 + 8, 13
    if vertical:
        w, h = h, w
    body = (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h:.1f}" rx="1" fill="#12191d" '
            f'stroke="rgba(147,161,161,0.34)" stroke-width="1.1"/>')
    pins_svg = []
    for k in range(n):
        for r in range(2):
            if vertical:
                px, py = x + 3.4 + r * 5.2, y + 5 + k * 4.4
            else:
                px, py = x + 5 + k * 4.4, y + 3.4 + r * 5.2
            pins_svg.append(pad(px, py, 2.2, 2.2, 0.3))
    # ключ: вырез в бортике посередине длинной стороны
    if vertical:
        key = (f'<rect x="{x + w - 2.6:.1f}" y="{y + h / 2 - 3:.1f}" width="2.6" height="6" '
               f'fill="#0a1013"/>')
    else:
        key = (f'<rect x="{x + w / 2 - 3:.1f}" y="{y + h - 2.6:.1f}" width="6" height="2.6" '
               f'fill="#0a1013"/>')
    tag = (mono(x + w / 2, y + h + 8, label, 5.5, op=0.34) if not vertical
           else mono(x + w + 2, y + h / 2, label, 5.5, anchor="start", op=0.34))
    return body + ''.join(pins_svg) + key + relief(x, y, w, h) + tag


def power_header(x, y, label="P12V_BP"):
    """Питающий хедер 2×4: восемь толстых контактов в рамке с защёлкой.

    От разъёмов данных отличается сразу — шаг крупнее, контакты втрое
    толще: через них идёт ток в десятки ампер, а не сигнал.
    """
    w, h = 30, 20
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#161f24" '
           f'stroke="rgba(147,161,161,0.40)" stroke-width="1.3"/>']
    for r in range(2):
        for c in range(4):
            out.append(pad(x + 3.6 + c * 6.2, y + 4 + r * 7, 4, 4.6, 0.8))
    # защёлка на верхней стенке
    out.append(f'<path d="M{x + w / 2 - 5} {y} v-3.4 h10 v3.4" fill="none" '
               f'stroke="rgba(147,161,161,0.40)" stroke-width="1.3"/>')
    out.append(relief(x, y, w, h, 2))
    out.append(mono(x + w / 2, y + h + 9, label, 5.5, op=0.36))
    return ''.join(out)


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


def rating_label(x, y, num):
    """Шильдик питания своего ввода: номер блока на всех метках один.

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
    return (yellow(x, num) + orange(x_o2, num) + dark + orange(x_o1, num) + yellow(x_y1, num)
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" '
              f'stroke="rgba(20,20,10,0.55)" stroke-width="1.2"/>')
