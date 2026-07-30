"""Индикация. Общая на всю схему и потому — часть фундамента.

Важно про гашение: используем fill-opacity, а не opacity. opacity на
SVG-элементе создаёт composited layer, и в браузере эти слои перекрывают
сцену целиком — именно так выглядел баг «весь фон стал чёрным».

Лампа неисправности всегда лежит внутри своего .pick — иначе селектор
`.pick.pulled .fault` до неё не достаёт, и горят не те лампы.
"""

from board.palette import GLOW3


def jitter(i, base, spread, salt=0):
    """Детерминированный разброс: индикаторы не должны мигать в такт."""
    return round(base + ((i * 37 + salt * 13 + 11) % 100) / 100 * spread, 2)


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


def fault(cx, cy, r=4.5):
    """Лампа на плате: в покое матовая и всё равно заметная, при сбое горит.

    Подложка нужна, чтобы лампу было видно и на выключенной машине — иначе
    непонятно, где вообще искать индикацию.
    """
    return (f'<circle cx="{cx}" cy="{cy}" r="{r+2.5}" fill="#20282d" stroke="rgba(147,161,161,0.34)" stroke-width="1"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#8d979a"/>'
            + glow('fault', cx, cy, r, '#f4d03f')
            + f'<circle class="fault" cx="{cx}" cy="{cy}" r="{r}" fill="#f4d03f"/>')


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
