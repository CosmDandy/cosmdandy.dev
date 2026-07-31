"""Ink: everything printed on the board rather than mounted on it.

Silkscreen, labels, callouts and hit areas. Shared across the whole
schematic — if every block invents its own lettering for labels, the board
stops reading as one thing.
"""



def mono(x, y, text, size=11, anchor="middle", op=0.5):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" fill="rgba(147,161,161,{op})" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text>')


def tag(x_center, y, text):
    """Ярлык узла. Держим внутри габарита: за краем его срезает."""
    return (f'<g class="tag"><rect x="{x_center-78}" y="{y-15}" width="156" height="30" rx="6"/>'
            f'<text x="{x_center}" y="{y+6}" text-anchor="middle">{text}</text></g>')


CALLOUT_H = 62
ICON_BOX = 26          # сторона квадрата, в который вписан значок сервиса

# Значки те же, что в карточке ссылок: узнаваемость важнее рисовки, а
# гость видит один и тот же знак в обоих видах визитки. Пути — из карточки,
# они нарисованы в сетке 24×24, поэтому масштабируются одним числом.
ICONS = {
    'blog':     '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>'
                '<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    'cv':       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
                '<polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>'
                '<line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    'github':   '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 '
                '6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 '
                '2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 '
                '5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
    'linkedin': '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>'
                '<rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
    'telegram': '<path d="M21.2 4.4L2.4 11.5c-.6.2-.6 1.1.1 1.3l4.8 1.6 1.8 5.8c.2.5.8.7 1.2.4l2.7-2.2 '
                '5.3 3.9c.5.4 1.2.1 1.3-.5L22.8 5.5c.2-.7-.5-1.4-1.6-1.1z"/><path d="M8.3 14.4l9.2-7.8"/>',
    'twitter':  '<path d="M3 3l7.6 9.7L3.4 21h2.3l5.9-6.8 5.3 6.8H21l-8-10.3L20.3 3H18l-5.5 6.4L7.7 3z"/>',
    'email':    '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
}

# Цвет корешка. Он же различает бирки между собой: семь одинаковых белых
# плашек читаются списком, а не набором адресов.
ACCENT = {
    'blog': '#b58900', 'cv': '#268bd2', 'github': '#93a1a1', 'linkedin': '#6c71c4',
    'telegram': '#2aa198', 'twitter': '#859900', 'email': '#cb4b16',
}


def callout_box(tx, ty, text, anchor="start", sub=""):
    """Габарит бирки: сборка проверяет, что они не наезжают друг на друга."""
    body = max(len(text) * 15, len(sub) * 8.4)
    w = ICON_BOX + 22 + body + 40
    x0 = tx if anchor == "start" else tx - w
    return (x0, ty - CALLOUT_H / 2, w, CALLOUT_H)


def callout(tx, ty, ax, ay, text, anchor="start", href=None, unit=None,
            sub="", icon=None, order=0):
    """Постоянная выноска-ссылка: якорь на узле, линия и подпись.

    На визитке подписи обязаны быть видны сразу и вести по адресу — гость не
    должен догадываться, что по железу надо водить курсором. Поэтому бирка
    выглядит как строка меню, а не как шильдик: значок сервиса, название,
    назначение мелким и стрелка «наружу» в углу.

    Бирка крупная нарочно. Сцена наклонена на 46°, и всё, что на ней
    нарисовано, теряет по высоте треть: подпись, читавшаяся на пустой плате,
    на собранной тонет среди деталей. Тёмная подложка со сдвигом отрывает её
    от фона надёжнее обводки, а тень фильтром в Safari внутри preserve-3d
    заливает сцену белым.
    """
    x0, y0, w, h = callout_box(tx, ty, text, anchor, sub)
    accent = ACCENT.get(icon, 'var(--cyan)')
    edge_x = x0 if anchor == "start" else x0 + w - 6
    ix, iy = x0 + 20, y0 + (h - ICON_BOX) / 2
    tx0 = ix + ICON_BOX + 12
    # Блик проходит по бирке один раз, поэтому его надо обрезать её же
    # контуром — иначе светлая полоса уезжает на плату.
    cid = f'co-clip-{unit or order}'
    inner = (f'<circle class="co-dot" cx="{ax}" cy="{ay}" r="5"/>'
             f'<path class="co-line" d="M{ax} {ay} L{tx + (12 if anchor == "start" else -12)} {ty}" fill="none"/>'
             f'<rect class="co-shadow" x="{x0+4}" y="{y0+5}" width="{w}" height="{h}" rx="6"/>'
             f'<rect class="co-box" x="{x0}" y="{y0}" width="{w}" height="{h}" rx="6"/>'
             f'<rect class="co-edge" x="{edge_x}" y="{y0}" width="6" height="{h}" rx="2.5" fill="{accent}"/>'
             f'<g class="co-icon" transform="translate({ix} {iy}) scale({ICON_BOX / 24:.3f})" '
             f'stroke="{accent}">{ICONS.get(icon, "")}</g>'
             f'<text class="co-text" x="{tx0}" y="{y0 + 27}">{text}</text>'
             f'<text class="co-sub" x="{tx0}" y="{y0 + 46}">{sub}</text>'
             # стрелка «наружу»: та же, что помечает внешние ссылки в вебе
             f'<g class="co-ext" transform="translate({x0 + w - 26} {y0 + 12})">'
             f'<path d="M2 10 L10 2 M4 2 H10 V8" fill="none"/></g>'
             f'<clipPath id="{cid}"><rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="6"/></clipPath>'
             f'<g clip-path="url(#{cid})"><rect class="co-shine" x="{x0 - 40}" y="{y0}" '
             f'width="26" height="{h}"/></g>')
    # data-for связывает подпись с узлом: наводишь на сетевую карту — горит её
    # подпись, наводишь на подпись — горит карта. Без него подсветка
    # односторонняя, и непонятно, к чему относится ярлык.
    attr = f' data-for="{unit}"' if unit else ''
    # Порядок нужен показу: бирки проступают одна за другой, и глаз проходит
    # по ним как по списку, а не встречает семь плашек разом.
    # Цвет сервиса уходит переменной: им красится не только полоска у кромки
    # бирки и значок, но и линия с точкой на узле. Выноска — одна вещь, а
    # линия, идущая к плате бирюзовой, пока сама бирка помечена терракотой,
    # разваливала её на две.
    style = f' style="--tag-order:{order};--accent:{accent}"'
    if href:
        return (f'<a class="callout" href="{href}" target="_blank" rel="noopener"'
                f'{attr}{style}>{inner}</a>')
    return f'<g class="callout"{attr}{style}>{inner}</g>'


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


def silk_boxed(cx, cy, text, size=7, op=0.5):
    """Центрированная подпись в тонкой рамке.

    То же, что silk_frame, но от середины: подписи узлов набирались по центру
    детали, и без рамки светлый текст висел прямо на разводке. Рамка отделяет
    его от фона — на живой плате обозначение печатают именно так.
    """
    w = len(text) * size * 0.62 + 8
    h = size + 6
    return (f'<rect x="{cx-w/2:.1f}" y="{cy-h/2:.1f}" width="{w:.1f}" height="{h}" rx="1" fill="none" '
            f'stroke="rgba(232,227,213,{op * 0.55:.2f})" stroke-width="0.7"/>'
            f'<text x="{cx:.1f}" y="{cy+size/2-0.5:.1f}" text-anchor="middle" '
            f'fill="rgba(232,227,213,{op:.2f})" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text>')


def silk_frame(x, y, text, size=7, op=0.6, turn=False):
    """Обозначение разъёма: светлый текст в тонкой рамке.

    Так на плате помечают позиции — J-номера, колодки питания, банки. Рамку
    печатают той же краской, что и текст, и она отделяет обозначение от
    разводки под ним: без неё надпись теряется в дорожках.

    turn=True ставит обозначение вдоль, поворотом на 90°. На живой плате так
    подписана половина позиций, и причина не в красоте: длинная надпись
    ложится вдоль узкой полосы, где поперёк она не поместилась бы вовсе.
    """
    w = len(text) * size * 0.62 + 8
    h = size + 6
    spin = f' transform="rotate(-90 {x} {y})"' if turn else ''
    return (f'<g{spin}><rect x="{x}" y="{y}" width="{w:.1f}" height="{h}" rx="1" fill="none" '
            f'stroke="rgba(232,227,213,{op * 0.62:.2f})" stroke-width="0.7"/>'
            f'<text x="{x+4}" y="{y+h-4.5:.1f}" fill="rgba(232,227,213,{op})" '
            f'font-family="ui-monospace, Menlo, monospace" font-size="{size}">{text}</text></g>')


def block_frame(x, y, w, h, title, refs, title_dx=6):
    """Контурная рамка функционального блока со списком позиций.

    Приём IBM: группа обводится по текстолиту, рядом печатается перечень
    refdes. Инженер по такой рамке видит границы узла, не открывая схему.
    Держим её глухой: рамка крупная, и в полную силу она перетянула бы на
    себя внимание с подписей ссылок.

    Заголовок стоит в своей рамочке, а не на плашке. Плашка была заливкой
    цвета текстолита и глушила всё, что под ней, — а стоит она поверх платы,
    где хватает и деталей, и разводки. Ширина считается по фактической
    метрике моноширинного шрифта: прежняя была взята с запасом и торчала за
    текст на треть строки.
    """
    tw = len(title) * 6 * 0.62 + 7
    return (f'<g class="decor block-frame">'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="none" '
            f'stroke="rgba(232,227,213,0.16)" stroke-width="1" stroke-dasharray="7 4"/>'
            f'<rect x="{x + title_dx}" y="{y - 5}" width="{tw:.1f}" height="10" rx="1" '
            f'fill="none" stroke="rgba(232,227,213,0.24)" stroke-width="0.7"/>'
            + mono(x + title_dx + 3.5, y + 3, title, 6, anchor="start", op=0.5)
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
