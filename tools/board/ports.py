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
