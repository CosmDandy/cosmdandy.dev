"""Краска: всё, что на плате нанесено, а не установлено.

Шелкография, подписи, выноски и зоны захвата. Общая на всю схему — если
каждый блок заведёт своё начертание подписи, плата перестанет читаться как
одна вещь.
"""

from board.palette import PCB_DARK


def mono(x, y, text, size=11, anchor="middle", op=0.5):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" fill="rgba(147,161,161,{op})" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text>')


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


def silk_inverse(x, y, text, size=7):
    """Инверсная шелкография: светлая плашка, тёмный выбитый текст.

    Так подписывают то, что человек с отвёрткой должен найти сразу.

    Краска на текстолите не бумажно-белая, а сероватая, и держим её заметно
    глуше выносок: подписи ссылок — первое, что должно читаться на схеме, а
    белая плашка того же тона забивала их даже будучи вчетверо мельче.
    """
    pad_x, pad_y = 5, 3
    w = len(text) * size * 0.62 + pad_x * 2
    h = size + pad_y * 2
    return (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h}" rx="1.5" '
            f'fill="#c6c0ad" fill-opacity="0.55" stroke="rgba(147,161,161,0.24)" stroke-width="0.6"/>'
            f'<text x="{x+w/2:.1f}" y="{y+h-pad_y-1:.1f}" text-anchor="middle" fill="#0a1417" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text>')


def silk_frame(x, y, text, size=7, op=0.6):
    """Обозначение разъёма: светлый текст в тонкой рамке.

    Так на плате помечают позиции — J-номера, колодки питания, банки. Рамку
    печатают той же краской, что и текст, и она отделяет обозначение от
    разводки под ним: без неё надпись теряется в дорожках.
    """
    w = len(text) * size * 0.62 + 8
    h = size + 6
    return (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="{h}" rx="1" fill="none" '
            f'stroke="rgba(232,227,213,{op * 0.62:.2f})" stroke-width="0.7"/>'
            f'<text x="{x+4}" y="{y+h-4.5:.1f}" fill="rgba(232,227,213,{op})" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text>')


def block_frame(x, y, w, h, title, refs):
    """Контурная рамка функционального блока со списком позиций.

    Приём IBM: группа обводится по текстолиту, рядом печатается перечень
    refdes. Инженер по такой рамке видит границы узла, не открывая схему.
    Держим её глухой: рамка крупная, и в полную силу она перетянула бы на
    себя внимание с подписей ссылок.
    """
    return (f'<g class="decor block-frame">'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="none" '
            f'stroke="rgba(232,227,213,0.16)" stroke-width="1" stroke-dasharray="7 4"/>'
            f'<rect x="{x + 6}" y="{y - 5}" width="{len(title) * 4.4 + 8:.1f}" height="10" '
            f'rx="1" fill="{PCB_DARK}"/>'
            + mono(x + 10, y + 3, title, 6, anchor="start", op=0.42)
            + mono(x + 10, y + h - 4, refs, 5, anchor="start", op=0.26)
            + '</g>')


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
