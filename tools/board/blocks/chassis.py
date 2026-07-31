"""chassis.

chassis
"""

from board.geom import X_FRONT, H, W
from board.lamps import glow_defs
from board.rotor import blur_defs

EAR_D, EAR_OUT = 58, 26   # ear depth and its reach past the side wall
RAIL_X = (250, 452, 654, 856)   # where the rail studs sit on the side wall


def rack_ears():
    """Rack ears: on the front, but sticking out sideways rather than forward.

    An ear bolts to the chassis side wall and reaches past it — otherwise it
    cannot meet the rack posts, which stand to either side of the machine.
    They used to point forward, the same way the drives slide out, and a 1U
    built like that mounts in no rack at all.

    Top view: just the plate outline and the darker recess inside it.
    """

    def one(top):
        s = -1 if top else 1                 # which way the ear grows
        y_edge = 4 if top else H - 4         # chassis side wall
        y_out = y_edge + s * EAR_OUT         # far face of the ear
        y_lo, y_hi = sorted((y_out, y_edge + s * -18))
        # Inset is equal on all four sides: with the latch and the screw slot
        # gone there is nothing left to make room for, and an even border reads
        # as a milled recess instead of an empty frame.
        return f'''<g class="decor rack-ear">
  <rect x="{X_FRONT - 2}" y="{y_lo}" width="{EAR_D}" height="{y_hi - y_lo}" rx="3"
        fill="#1b2429" stroke="rgba(147,161,161,0.30)"/>
  <rect x="{X_FRONT + 4}" y="{y_lo + 6}" width="{EAR_D - 12}" height="{y_hi - y_lo - 12}" rx="2"
        fill="#0f1619" stroke="rgba(147,161,161,0.20)"/>
</g>'''

    return one(True) + one(False)


def rails():
    """Rail studs on the side walls: this is what the chassis hangs by.

    The slides have keyhole cutouts for them: the chassis is laid down, pushed
    back, and the studs settle into the narrow part of the cutout. Without
    them the machine hangs in the rack on the front ears alone, and that is
    half of the fastening.
    """
    studs = []
    for x in RAIL_X:
        for top in (True, False):
            s = -1 if top else 1
            y_edge = 4 if top else H - 4
            studs.append(
                f'<rect x="{x - 9}" y="{y_edge + (-11 if top else -2)}" width="18" height="13" '
                f'rx="3" fill="#222d33" stroke="rgba(147,161,161,0.34)"/>'
                f'<circle cx="{x}" cy="{y_edge + s * 5}" r="2.6" fill="#0a1417" '
                f'stroke="rgba(147,161,161,0.30)"/>')
    return '<g class="decor rack-rail">' + ''.join(studs) + '</g>'


def render(cv):
    # The lamp glow gradients are shared by the whole drawing, so they are
    # declared in the very first block: everyone who places a lamp refers to
    # them afterwards.
    cv.add(glow_defs())
    cv.add(blur_defs())
    cv.add(f'<rect x="4" y="4" width="{W-8}" height="{H-8}" rx="14" fill="#141c20" stroke="rgba(147,161,161,0.30)"/>')
    cv.add(rails())
    cv.add(rack_ears())
