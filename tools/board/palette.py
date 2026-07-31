"""Colours. One file for the whole schematic — or shades drift between blocks.

A lamp on a drive, on a fan and on memory has to look the same: the eye reads
indication as a single language, and the moment one block takes a yellow of
its own, the schematic falls apart into patches.
"""

PCB_DARK = "#0a3037"      # laminate; the routing lies over it, lighter

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
