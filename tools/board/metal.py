"""Металл: выводы, площадки, контакты, штампованные детали.

Делаем их серебром, а не той же серой краской, что и шелкография: на живой
плате олово — единственное, что бликует, и именно по нему глаз отделяет
деталь от рисунка под ней.
"""

from board.geom import SOCKET_H, SOCKET_W
from board.ink import mono
from board.palette import COLD, HOT, SILVER, SILVER_DIM, SILVER_LIT


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


def service_label(x, y, w, h, title, lines, head=HOT, arrow=None):
    """Сервисная табличка на крышке: кирпичная шапка и светлое поле.

    Поле держим на fill-opacity, а не сплошной белой заливкой: крышка тёмная,
    и непрозрачная бумага на ней выжигает глаза.

    Цвет шапки — не оформление, а сам код замены: HOT (терракота) значит
    «можно менять на ходу», COLD (голубой) значит «сначала обесточить». Это
    единственные два тона, что тут уместны, и оба уже определены в palette,
    рядом с обвязкой, которая красит этим же языком живые узлы.

    Строки с префиксом NOTE:/Attention: — два разных предупреждения с живой
    наклейки: первое просто к сведению, второе про риск испортить железо,
    поэтому оно жирнее и темнее прочих строк.

    `arrow` — направление, в котором деталь покидает шасси ('left'/'right'):
    не у каждой наклейки есть смысл рисовать его, но там, где стрелка на
    живой табличке есть, она часть языка, а не украшение.
    """
    head_h = h * 0.19
    body_y = y + head_h
    body_h = h - head_h
    parts = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="#e8e3d5" fill-opacity="0.78" '
        f'stroke="rgba(147,161,161,0.35)" stroke-width="1.2"/>',
        f'<path d="M{x} {y+head_h:.1f} V{y+3} Q{x} {y} {x+3} {y} H{x+w-3} Q{x+w} {y} {x+w} {y+3} '
        f'V{y+head_h:.1f} Z" fill="{head}"/>',
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
        if ln.startswith("Attention:"):
            fill, fop, wt = "#7a1c0f", 0.92, 700
        elif ln.startswith("NOTE:"):
            fill, fop, wt = "#161005", 0.60, 400
        else:
            fill, fop, wt = "#161005", 0.82, 400
        parts.append(f'<text x="{x+10}" y="{body_y + line_h*(i+1):.1f}" text-anchor="start" fill="{fill}" '
                     f'fill-opacity="{fop}" font-family="ui-monospace, Menlo, monospace" font-size="7.5" '
                     f'font-weight="{wt}">{ln}</text>')
    if arrow:
        ay = y + h - 9
        ax0, ax1 = x + 12, x + w - 12
        x1, x2 = (ax1, ax0) if arrow == "left" else (ax0, ax1)
        tip = -1 if arrow == "left" else 1
        parts.append(f'<path d="M{x1:.1f} {ay:.1f} H{x2:.1f}" stroke="#161005" stroke-opacity="0.55" '
                     f'stroke-width="1.6" fill="none"/>'
                     f'<path d="M{x2:.1f} {ay:.1f} l{-tip*7:.1f} -4.5 v9 Z" fill="#161005" fill-opacity="0.55"/>')
    return ''.join(parts)


def service_legend(x, y, w, h):
    """Легенда цветового кода: без неё шапки наклеек — просто цветные полоски.

    Стоит один раз на всей крышке: остальные таблички лишь используют код,
    который здесь объяснён, и повторять его на каждой было бы тем же самым
    текстом восемь раз подряд.
    """
    parts = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="#e8e3d5" fill-opacity="0.78" '
        f'stroke="rgba(147,161,161,0.35)" stroke-width="1.2"/>',
        f'<text x="{x+10}" y="{y+h*0.22:.1f}" text-anchor="start" fill="#161005" fill-opacity="0.85" '
        f'font-family="ui-monospace, Menlo, monospace" font-size="8" font-weight="700" '
        f'letter-spacing="0.04em">КОД ЗАМЕНЫ</text>',
    ]
    rows = ((HOT, "горячая замена"), (COLD, "обесточить машину"))
    sw = h * 0.16
    for i, (color, text) in enumerate(rows):
        ry = y + h * 0.42 + i * h * 0.32
        parts.append(f'<rect x="{x+10}" y="{ry-sw*0.72:.1f}" width="{sw*1.6:.1f}" height="{sw:.1f}" rx="1.5" '
                     f'fill="{color}"/>'
                     f'<text x="{x+10+sw*1.6+7:.1f}" y="{ry:.1f}" text-anchor="start" fill="#161005" '
                     f'fill-opacity="0.82" font-family="ui-monospace, Menlo, monospace" '
                     f'font-size="7.5">{text}</text>')
    return ''.join(parts)


def rating_label(x, y, num, w=136, h=42):
    """Шильдик питания своего ввода: номер блока на всех метках один.

    Жёлтый квадрат с молнией — предупреждение, что вводов два и обесточить
    надо оба; оранжевый рядом — рука, то есть «под напряжением не лезть».
    Раньше эта пара стояла дважды, зеркально по краям, и наклейка читалась
    как две разные: на живой машине каждый знак нанесён по одному разу.
    """
    yw, ow = h * 0.86, h * 0.62
    dw = w - yw - ow

    def bolt(cx, cy, sz):
        tri = (f'<path d="M{cx:.1f} {cy-sz:.1f} L{cx+sz*0.9:.1f} {cy+sz*0.75:.1f} '
               f'L{cx-sz*0.9:.1f} {cy+sz*0.75:.1f} Z" fill="none" stroke="#161005" '
               f'stroke-width="{max(1, sz*0.14):.1f}"/>')
        zig = (f'<path d="M{cx+sz*0.10:.1f} {cy-sz*0.55:.1f} L{cx-sz*0.30:.1f} {cy+sz*0.08:.1f} '
               f'L{cx+sz*0.02:.1f} {cy+sz*0.08:.1f} L{cx-sz*0.16:.1f} {cy+sz*0.62:.1f} '
               f'L{cx+sz*0.40:.1f} {cy-sz*0.10:.1f} L{cx+sz*0.08:.1f} {cy-sz*0.10:.1f} Z" fill="#161005"/>')
        return tri + zig

    yellow = (f'<rect x="{x}" y="{y}" width="{yw:.1f}" height="{h}" fill="#f2c200" '
              f'stroke="rgba(20,20,10,0.5)" stroke-width="1"/>'
              + bolt(x + yw * 0.36, y + h * 0.42, h * 0.26)
              + f'<text x="{x+yw*0.74:.1f}" y="{y+h*0.68:.1f}" text-anchor="middle" fill="#161005" '
                f'font-family="ui-monospace, Menlo, monospace" font-size="{h*0.44:.1f}" '
                f'font-weight="700">{num}</text>')
    ox = x + yw
    orange = (f'<rect x="{ox:.1f}" y="{y}" width="{ow:.1f}" height="{h}" fill="#cb4b16" '
              f'stroke="rgba(20,20,10,0.4)" stroke-width="1"/>'
              f'<path d="M{ox+ow*0.22:.1f} {y+h*0.32:.1f} q{ow*0.14:.1f} -{h*0.16:.1f} {ow*0.28:.1f} 0 '
              f'q{ow*0.14:.1f} {h*0.16:.1f} {ow*0.28:.1f} 0" fill="none" stroke="#161005" stroke-width="1.4"/>'
              + f'<text x="{ox+ow/2:.1f}" y="{y+h*0.80:.1f}" text-anchor="middle" fill="#161005" '
                f'font-family="ui-monospace, Menlo, monospace" font-size="{h*0.36:.1f}" '
                f'font-weight="700">{num}</text>')

    # Токи с таблички живой машины, разбитые по строкам: наклейка стоит вдоль
    # блока, а не поперёк, и полная строка в её длину не влезает.
    dx = x + yw + ow
    rows = ["100-127V 5,3A", "200-240V 2,6A", "-48…-60V 18,3A"]
    line_h = h / (len(rows) + 1)
    dark = (f'<rect x="{dx:.1f}" y="{y}" width="{dw:.1f}" height="{h}" fill="#10171a" '
            f'stroke="rgba(147,161,161,0.28)" stroke-width="1"/>'
            + ''.join(f'<text x="{dx+5:.1f}" y="{y+line_h*(i+1)+1:.1f}" text-anchor="start" '
                      f'fill="rgba(238,232,213,0.72)" font-family="ui-monospace, Menlo, monospace" '
                      f'font-size="6">{ln}</text>' for i, ln in enumerate(rows)))
    return (yellow + orange + dark
            + f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" '
              f'stroke="rgba(20,20,10,0.55)" stroke-width="1.2"/>')
