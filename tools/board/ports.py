"""Sockets: the things you plug into from the outside.

The shape of a socket is a language: the keying notch says RJ45, the cage with
a tab says SFP+. That is why they are shared here instead of being hidden
inside the rear panel: a socket has to look the same wherever it stands.
"""


def rj45(x, y, w=52, h=30):
    """RJ45 socket: a rectangle with the keying notch on top."""
    k = w * 0.46
    return (f'<path d="M{x} {y+h} V{y+8} H{x+(w-k)/2} V{y} H{x+(w+k)/2} V{y+8} H{x+w} V{y+h} Z" '
            f'fill="#0a1417" stroke="rgba(42,161,152,0.38)" stroke-width="1.2"/>'
            f'<rect x="{x+6}" y="{y+h-9}" width="{w-12}" height="4" fill="rgba(147,161,161,0.18)"/>')


def sfp(x, y, w=58, h=26):
    """SFP+ cage: a slot with a latch tab and a row of contacts."""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#0a1417" '
            f'stroke="rgba(42,161,152,0.42)" stroke-width="1.2"/>'
            f'<rect x="{x+4}" y="{y+5}" width="{w-8}" height="{h-14}" rx="1" fill="#060e11" '
            f'stroke="rgba(147,161,161,0.16)"/>'
            f'<rect x="{x+w-16}" y="{y+h-7}" width="12" height="4" rx="1" fill="rgba(42,161,152,0.34)"/>')


def qsfp(x, y, w=70, h=32):
    """QSFP28 cage: four lanes, so a wider mouth and a stacked contact block.

    Не «широкий SFP»: под сотню идут четыре линии вместо одной, и снаружи это
    видно — корпус шире и выше, а модуль тянут за язычок, а не за проволочную
    скобу. Язычок и рисуем: он торчит из клетки и есть у всякого живого
    QSFP-модуля.
    """
    inner_h = h - 16
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2.5" fill="#0a1417" '
            f'stroke="rgba(42,161,152,0.42)" stroke-width="1.4"/>'
            f'<rect x="{x+5}" y="{y+5}" width="{w-10}" height="{inner_h}" rx="1" fill="#060e11" '
            f'stroke="rgba(147,161,161,0.18)"/>'
            # Четыре линии: контактный гребень внутри клетки разбит на четыре
            # группы, и это единственное, чем клетка честно отличается от SFP+.
            + ''.join(f'<line x1="{x+11+k*(w-22)/3:.1f}" y1="{y+7}" '
                      f'x2="{x+11+k*(w-22)/3:.1f}" y2="{y+5+inner_h-2}" '
                      f'stroke="rgba(42,161,152,0.30)" stroke-width="1.1"/>'
                      for k in range(4))
            # Язычок: им модуль и вынимают.
            + f'<rect x="{x+w-22}" y="{y+h-8}" width="18" height="5" rx="2.5" '
              f'fill="rgba(42,161,152,0.40)"/>')
