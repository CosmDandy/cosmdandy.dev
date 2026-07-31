"""memory: three banks, each with its own tag.

The module is shorter than it used to be: 292 units is almost half the depth
of the board, while a real DIMM takes up a third of the chassis width at
most. It also freed the field to the right of the banks, where the discrete
components sit.
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (488, 4, 360, 850)

from board.geom import (
    BANK_N,
    DIMM_SOCK_W,
    PITCH,
    SEAT,
    SEAT_WAVE2,
    SLOT_H,
    X_CORE,
    X_TAG,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
)

# Module dimensions along the depth of the board. Everything else in the socket
# is derived from them: the contacts, the key and the chips have to line up at
# any width.
SOCK_W = DIMM_SOCK_W
DIMM_W = SOCK_W - 6
from board.ink import hit, silk_inverse
from board.revision import stamp
from board.spec import DIMM


def render(cv):
    # Modules are populated not one after another but by channel: first the
    # first slot of every channel on both processors, then the second. That is
    # why the middle bank is filled from both ends — its halves belong to
    # different processors.
    start, step = SEAT['dimm']

    def wave(base):
        return lambda i: f'{base + i * step:.2f}s'

    # The spec is printed on a paper sticker glued over the chips, so it goes
    # inside pick-body and travels with the module — before it stayed by the
    # socket and the pulled DIMM left its own label behind.
    #
    # Muted on purpose: twenty-four white stickers at full strength read as a
    # second row of labels and pull the eye off the link tags.
    def sticker(x, y):
        text = f"{DIMM['size_gb']}GB {DIMM['kind']} {DIMM['speed']}"
        w = len(text) * 5 * 0.62 + 8
        return (f'<rect x="{x}" y="{y}" width="{w:.1f}" height="8" rx="1" '
                f'fill="#e8e3d5" fill-opacity="0.34" stroke="rgba(147,161,161,0.18)" '
                f'stroke-width="0.5"/>'
                f'<text x="{x+4}" y="{y+5.8}" fill="rgba(10,20,23,0.78)" '
                f'font-family="ui-monospace, Menlo, monospace" font-size="5">{text}</text>')

    def bank(y0, n, code, label_y, first=1, delay=None):
        slots = []
        for i in range(n):
            y = y0 + i * PITCH
            # The socket stays on the board when the module is pulled out, so
            # it is a separate shape and not part of the module. Inside are the
            # gold-plated contacts and the off-centre key ridge: it is what
            # stops the module from going in backwards.
            socket = (f'<rect x="{X_CORE-2}" y="{y-1}" width="{SOCK_W}" height="{SLOT_H+2}" rx="1" '
                      f'fill="#05090b" stroke="rgba(147,161,161,0.26)"/>'
                      + ''.join(f'<line x1="{X_CORE+8+c*6}" y1="{y+2}" x2="{X_CORE+8+c*6}" '
                                f'y2="{y+SLOT_H-2}" stroke="rgba(206,168,58,0.62)" '
                                f'stroke-width="1.4"/>'
                                for c in range(46))
                      + f'<rect x="{X_CORE+112}" y="{y+1}" width="4" height="{SLOT_H-2}" '
                        f'fill="#0f1a20"/>')
            # The module: from above you see its light edge — the end face of
            # the laminate — and the chips below it. On a photo of a real bank
            # that is the first thing that catches the eye: a row of light
            # stripes, not black ones.
            edge = '#3f7d76' if i % 2 else '#397169'
            # the hover zone is wider than the module itself and covers the gap
            # to the next one: otherwise the cursor falls through between the
            # slots and the click goes nowhere
            slots.append(f'''<g class="pick dimm" data-dimm="{code}{i}" style="--seat:{delay(i)}">
          <rect class="hit" x="{X_CORE-8}" y="{y-1}" width="{SOCK_W+28}" height="{PITCH}" fill="#000" fill-opacity="0.001"/>
          {socket}
          <g class="pick-body">
            <rect x="{X_CORE}" y="{y}" width="{DIMM_W}" height="{SLOT_H}" rx="0" fill="#13323a" stroke="rgba(147,161,161,0.30)"/>
            <rect x="{X_CORE+2}" y="{y+1}" width="{DIMM_W-4}" height="3.4" rx="1" fill="{edge}"/>
            {''.join(f'<rect x="{X_CORE+12+c*44}" y="{y+5.4}" width="32" height="{SLOT_H-7}" rx="0.6" fill="#0d1519"/>' for c in range(6))}
            {sticker(X_CORE + 10, y + 5.4)}
          </g>
          <path class="latch latch-l" d="M{X_CORE-7} {y+1} h6 v{SLOT_H-2} h-6 a2 2 0 0 1 -2 -2 v{-(SLOT_H-6)} a2 2 0 0 1 2 -2 Z"/>
          <path class="latch latch-r" d="M{X_CORE+DIMM_W+1} {y+1} h6 a2 2 0 0 1 2 2 v{SLOT_H-6} a2 2 0 0 1 -2 2 h-6 Z"/>
          {silk_inverse(X_CORE + DIMM_W + 18, y - 1, f"DIMM{first + i}", 6.5)}
        </g>''')
        return f'''<g class="unit" data-unit="dimm-{code}" data-group="dimm" data-href="https://blog.cosmdandy.dev">
      {hit(X_CORE-8, y0-4, SOCK_W + 42, n * PITCH + 6)}
      {''.join(slots)}
    </g>'''

    # The label goes into the gap between packages: the strip at the edge is
    # taken up by them entirely, and in its old place the plate lay right on
    # the network controller.
    cv.callouts.append((X_TAG - 44, Y_BANK_C + 32, X_CORE - 10, Y_BANK_C + 110,
                        "Blog", "end", "https://blog.cosmdandy.dev", "dimm",
                        "заметки", "blog"))
    half = BANK_N // 2
    cv.add(bank(Y_BANK_L, BANK_N, "L", 104, first=1, delay=wave(start)))
    # The upper half of the middle bank is CPU0's second slots, the lower one
    # is CPU1's first slots: the former go in the second wave, the latter in
    # the first.
    cv.add(bank(Y_BANK_C, BANK_N, "C", 430, first=9,
                delay=lambda i: (wave(SEAT_WAVE2)(i) if i < half else wave(start)(i - half))))
    cv.add(bank(Y_BANK_R, BANK_N, "R", 740, first=17, delay=wave(SEAT_WAVE2)))
    # The middle bank is shared by both processors: half of its channels go to
    # one, half to the other. Twelve modules per processor is the usual layout
    # for 1U, where there is no board room left for all eight channels.
    # The bank designation is printed on its frame — see blocks/frames.py.
    cv.add(stamp(X_CORE, Y_BANK_L - 20, "память"))
