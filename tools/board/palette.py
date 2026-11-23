"""Colours. One file for the whole schematic — or shades drift between blocks.

A lamp on a drive, on a fan and on memory has to look the same: the eye reads
indication as a single language, and the moment one block takes a yellow of
its own, the schematic falls apart into patches.
"""

# ── What the theme moves ─────────────────────────────────────────────────
# The light theme is not this drawing lightened. It is the same machine under
# daylight instead of a rack lamp, and daylight does not change what the parts
# are made of: the sheet metal is galvanized steel and finally shows itself as
# steel, the plastic is black and stays black, the laminate is dark and stays
# dark. So exactly two kinds of thing move — the steel surfaces below, and the
# seams drawn on them (see `steel_edge`). Everything else is written once.
#
# This is also the answer to the objection that kept the light theme switched
# off for a long time: that a third of all the paint here is light grey —
# solder, silkscreen, lit edges — and in a light theme would have nothing to
# shine on. Counted, it is 1553 light fills out of 5139, and the objection
# holds only if the laminate lightens with the frame. It does not: a live board
# is dark, and every one of those fills lies on it. What lies on the steel is
# 164 edge strokes, and those do invert.
#
# The values are written as variables with a fallback, and the fallback is
# needed in earnest: revision frames are saved as separate SVG files, without
# the page and its styles, and without it the strip would come out colourless.
def themed(name, dark):
    return f'var(--{name}, {dark})'


PCB_DARK = themed('pcb', '#0a3037')       # laminate; the routing lies over it
CHASSIS = themed('chassis', '#141c20')    # the chassis sheet
METAL = themed('metal', '#121a1e')        # body of a removable module
METAL_DEEP = themed('metal-deep', '#0c1316')   # the pocket it goes into
STEEL = themed('steel', '#1b2429')        # rail, bracket, blank plate
# The service cover has a token of its own rather than sharing the tray's: it
# is the one panel seen from outside, and outside is where the light falls.
LID_SHEET = themed('lid', '#161f24')      # the cover, from above


# The bail of the power supply. On a live unit it is black, and here it was
# drawn light for one reason only: on a dark chassis a black bail disappears.
# In daylight it does not, so the light theme puts the real colour back — the
# one place where the second theme makes the drawing more truthful, not less.
BAIL = themed('bail', 'rgba(198,209,213,0.82)')


def steel_edge(op):
    """A seam between two steel parts: where one pressing meets the next.

    In the dark theme this is the lit edge of the metal, so it is drawn light.
    In daylight the same seam is a shadow line, so it is drawn dark. Only the
    colour moves; the opacity the caller asked for is kept. That split matters
    — the weight of a seam says how far apart the two parts sit, and that does
    not change with the light.

    Written through `color-mix` and not `rgba(var(--seam), op)` for one reason:
    a bare number triple cannot be registered with `@property`, and an
    unregistered custom property does not interpolate. The seam would then snap
    to its new colour in the middle of the page's own fade — which is one of
    the two things that got the light theme switched off the first time. As a
    `<color>` it is registered, and it crossfades with the surface under it.

    Only for strokes that lie on steel. The same grey outlines parts against
    the laminate and against black plastic too, and those do not invert,
    because what they lie on does not.
    """
    return f'color-mix(in srgb, var(--steel-edge, #93a1a1) {op * 100:g}%, transparent)'

# The replacement code is the language of the service label, and the language
# of the machine itself. On live hardware this colour is painted on whatever
# the hands take hold of, and it says whether the part may be touched live:
#
#   terracotta — hot-swap: drives, fans, power supplies
#   blue       — power down first: processors, memory, risers
#
# So the colour is not picked to a unit's taste: it follows from the way the
# part is replaced. Both tones live here so they do not drift between blocks.
HOT = "#cb4b16"        # can be replaced on a running machine
COLD = "#3a8fc4"       # only with the power off

# The impeller. An industrial 40-mm rotor is graphite and sand: a dark frame,
# blades a shade lighter than the wall they sit in, a pale sticker on the hub.
#
# Why the blades are muted rather than the ivory they are on the real thing.
# There are sixteen impellers in the wall, and at full strength they would be
# the brightest place on the board — brighter than memory, brighter than the
# processors — and the eye would start reading the schematic from a unit that
# is not the point of it. What carries the recognition is the pairing of a dark
# frame with a light rotor, not how bright the rotor is.
#
# The corner pads keep their sand tone at full: they are small, and on a real
# fan they are the one part that is deliberately not the colour of the frame.
ROTOR_BLADE = "#7d7461"     # blade, seen from above
ROTOR_EDGE = "#a89a7d"      # the lit edge of a blade and the rim gap
ROTOR_PAD = "#c9b899"       # anti-vibration corner pads and the hub sticker

# Solder: the only thing on a live board that catches a highlight. It is what
# the eye separates a part from the drawing under it by, so it is not painted
# with the same colour as the silkscreen.
SILVER = "#b8c4c8"          # tinned lead
SILVER_DIM = "#7e8f95"      # the same in shadow
SILVER_LIT = "#dfe8ea"      # highlight along the top edge

# Halo around a lamp: the colour of the glow follows the colour of the lamp.
GLOW = {'#2aa198': 'rgba(42,161,152,0.20)', '#859900': 'rgba(133,153,0,0.20)',
        '#b58900': 'rgba(181,137,0,0.22)', '#268bd2': 'rgba(38,139,210,0.22)',
        '#dc322f': 'rgba(220,50,47,0.22)'}

# The glow around a lamp. Every lamp used to carry three circles of falling
# density — the fade-out was drawn with them, because a gradient was believed
# not to work in a scene with perspective. It does: the sheen over the
# processor die has lived on a gradient from the very start. One circle instead
# of three means a soft fade-out instead of three visible rings, and three
# times fewer shapes.
GLOW_TINT = {
    '#2aa198': '42,161,152',
    '#859900': '133,153,0',
    '#b58900': '181,137,0',
    '#268bd2': '38,139,210',
    '#dc322f': '220,50,47',
    '#f4d03f': '244,208,63',
}
# Density at the centre, at mid-radius and at the edge of the halo. Плотнее и
# длиннее прежнего: у квадратных ламп Light Path ореол вчетверо шире самой
# лампы и потому читался свечением, а у круглых — тонкой каймой. Свет теперь
# один на всю схему: у всех ламп он и ярче в центре, и дольше затухает.
GLOW_STOPS = ((0, 0.5), (30, 0.26), (62, 0.09), (100, 0))
