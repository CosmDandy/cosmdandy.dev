"""Indication. Shared by the whole schematic, and so part of the foundation.

An important point about putting lamps out: we use fill-opacity, not opacity.
opacity on an SVG element creates a composited layer, and in the browser these
layers cover the scene whole — that is exactly what the bug "the entire
background went black" looked like.

The fault lamp always lies inside its own .pick — otherwise the selector
`.pick.pulled .fault` does not reach it, and the wrong lamps light up.
"""

from board.palette import GLOW_STOPS, GLOW_TINT

# The common beat of the indication. Everything that blinks and spins changes
# only at moments that are multiples of this step — and in the frame where one
# lamp has clicked, every lamp whose time has come clicks at once. Twenty ticks
# a second: finer than that the eye no longer tells apart, and there is nothing
# to pay more for.
#
# Why: animation in a big SVG is not composited, every change means
# re-rasterising a region and reassembling the scene. Smooth animation does
# this at the monitor's frequency: at 144 Hz, a hundred and forty-four times a
# second. Forty lamps with periods of their own guarantee that something
# changes in any frame, and the price is the same throughout. On the common
# beat there are exactly twenty repaints a second — however many lamps there
# are and whatever monitor is standing there.
TICK = 0.05


def quant(v):
    """Nearest time on the beat grid, but no less than one step."""
    return round(max(TICK, round(v / TICK) * TICK), 2)


def jitter(i, base, spread, salt=0):
    """Deterministic spread: indicators must not blink in unison.

    The spread stays, but it lands on the beat grid: the flashes go out of
    step with one another, while the repaints still meet in the same frames.
    """
    return quant(base + ((i * 37 + salt * 13 + 11) % 100) / 100 * spread)


def glow_id(color):
    """Name of the glow gradient, taken from the lamp colour."""
    return 'glow-' + color.lstrip('#')


def glow_defs():
    """Glow gradients — one per lamp colour, for the whole schematic.

    Declared through objectBoundingBox: the gradient stretches to the bounding
    box of its own circle, so one and the same gradient does for a drive lamp
    of radius three and for a system one of radius five.
    """
    grads = []
    for color, tint in GLOW_TINT.items():
        stops = ''.join(f'<stop offset="{off}%" stop-color="rgba({tint},{op})"/>'
                        for off, op in GLOW_STOPS)
        grads.append(f'<radialGradient id="{glow_id(color)}">{stops}</radialGradient>')
    return '<defs>' + ''.join(grads) + '</defs>'


def socket(cx, cy, r):
    """Гнездо лампы: тёмная посадка и матовый колпачок под цветом.

    Гаснет свечение, а не сама лампа. На живой плате светодиод — это деталь:
    её видно и на обесточенной машине, поэтому понятно, где вообще искать
    индикацию. Пока гнезда не было, погашенная лампа исчезала бесследно, и
    место, где она стоит, приходилось помнить.
    """
    return (f'<circle cx="{cx}" cy="{cy}" r="{r + 2.2:.1f}" fill="#20282d" '
            f'stroke="rgba(147,161,161,0.34)" stroke-width="0.9"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#8d979a" fill-opacity="0.30"/>')


def lamp(cls, cx, cy, r, color, extra=''):
    """Лампа целиком: гнездо, ореол и светящееся ядро.

    Один вызов вместо трёх строк подряд в каждом блоке — иначе гнездо
    появляется там, где о нём вспомнили, и индикация перестаёт быть единым
    языком.
    """
    return (socket(cx, cy, r)
            + glow(cls, cx, cy, r, color, extra)
            + f'<circle class="{cls}" cx="{cx}" cy="{cy}" r="{r}" fill="{color}"{extra}/>')


def glow(cls, cx, cy, r, color, extra=''):
    """Мягкий ореол вокруг лампы: один круг с радиальным градиентом.

    Раньше их было три, с убывающей плотностью, — так изображали затухание
    сплошными заливками. Кроме лишних фигур это давало три видимых кольца
    вместо плавного свечения.
    """
    tint = GLOW_TINT.get(color)
    fill = f'url(#{glow_id(color)})' if tint else 'rgba(147,161,161,0.10)'
    return f'<circle class="{cls} halo" cx="{cx}" cy="{cy}" r="{r*4.2:.1f}" fill="{fill}"{extra}/>'


def square_led(x, y, cls, color, mark='', s=16):
    """Квадратная лампа с трафаретом: светится подложка, знак остаётся тёмным.

    Так они сделаны на панели: белый квадрат с чёрным трафаретом, а при
    неисправности сам квадрат разгорается вокруг знака. Знак рисуется
    последним, поэтому лежит поверх заливки и не перекрашивается вместе с ней.

    Лежит здесь, а не во фронте: те же две лампы продублированы на задней
    панели, а лампа, нарисованная в двух местах по-разному, перестаёт быть
    одной и той же лампой.
    """
    return (f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="1.5" '
            f'fill="rgba(226,235,231,0.34)" stroke="rgba(147,161,161,0.34)" stroke-width="0.8"/>'
            f'<rect class="{cls} sq-led" x="{x}" y="{y}" width="{s}" height="{s}" rx="1.5" fill="{color}"/>'
            + mark)


def fault_mark(x, y):
    """Трафарет неисправности: восклицательный знак в квадратной лампе."""
    cx = x + 8
    return (f'<rect x="{cx-1.3}" y="{y+3.5}" width="2.6" height="6.6" rx="1" fill="#0a1013"/>'
            f'<circle cx="{cx}" cy="{y+12.6}" r="1.5" fill="#0a1013"/>')


def id_mark(x, y):
    """Трафарет опознания: конус света вниз и лучи в стороны.

    Лучи разведены шире конуса, иначе знак слипается в пятно.
    """
    cx = x + 8
    return (f'<path d="M{cx-5} {y+13} L{cx-1.4} {y+6} H{cx+1.4} L{cx+5} {y+13} Z" fill="#0a1013"/>'
            f'<line x1="{cx-7}" y1="{y+2.4}" x2="{cx-4.4}" y2="{y+4.6}" stroke="#0a1013" stroke-width="1.3"/>'
            f'<line x1="{cx+7}" y1="{y+2.4}" x2="{cx+4.4}" y2="{y+4.6}" stroke="#0a1013" stroke-width="1.3"/>'
            f'<line x1="{cx}" y1="{y+1.8}" x2="{cx}" y2="{y+4}" stroke="#0a1013" stroke-width="1.3"/>')


def act_led(i, cx, cy, r, color, salt=0, aux=False, extra_cls=''):
    """Лампа активности: резкая, ступенчатая, у каждой своя фаза.

    aux=True — узел питается от дежурки и работает при выключенной машине:
    так живут BMC, порт управления и сами блоки питания.

    extra_cls добавляет классы поверх обычных. Нужен там, где лампа мигает не
    только яркостью: у сетевой розетки приём и передача — одна лампа на два
    цвета, и цвет ей меняет отдельное правило.
    """
    # Период у всех ламп общий и задан в css; вразнобой их разводит сдвиг
    # фазы. Свой период у каждой означал бы, что вспышки расходятся с общим
    # тактом и перерисовки размазываются по всем кадрам подряд.
    delay = -jitter(i, 0, 2.0, salt + 5)
    cls = 'led led-act aux' if aux else 'led led-act'
    if extra_cls:
        cls += ' ' + extra_cls
    style = f' style="animation-delay:{delay}s"'
    return lamp(cls, cx, cy, r, color, style)


def fault(cx, cy, r=4.5):
    """Лампа неисправности: в покое матовая, при сбое горит.

    Гнездо она получает от общего lamp() — раньше подложку рисовала себе
    сама, и была единственной лампой на схеме, которую видно погашенной.
    """
    return lamp('fault', cx, cy, r, '#f4d03f')


def fault_at(c, cx, cy, r=4.5, shift=18):
    """Лампа со сдвигом, если выбранное место уже занято креплением.

    Единственная лампа, которой нужен холст: она сама ищет себе место.
    """
    for dy in (0, -shift, shift, -2 * shift, 2 * shift):
        if c.free(cx - r - 4, cy + dy - r - 4, 2 * r + 8, 2 * r + 8):
            c.busy(cx - r - 4, cy + dy - r - 4, 2 * r + 8, 2 * r + 8)
            return fault(cx, cy + dy, r)
    c.busy(cx - r - 4, cy - r - 4, 2 * r + 8, 2 * r + 8)
    return fault(cx, cy, r)
