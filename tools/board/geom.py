"""Coordinates: the single place that says what lies where.

This is the shared table — the one file that cannot be edited in parallel.
Everything else can be: a block takes its bounds from here and draws inside
them without peeking at its neighbours. As long as a unit's coordinate lives
in the unit's own code, the neighbours are tied through it, and "edit them
separately" does not work.

The composition is rotated 90°: front on the left, depth to the right — the
screen is wide and the server is long. So X_* is the depth from the front,
Y_* is the width of the chassis.
"""

W, H = 1314, 863

# ── depth: from the front to the rear wall ───────────────────────────────
X_FRONT  = 6      # front: control panel on top, drive bays below it
X_BP     = 166    # backplane — right behind the cage, past the bay grille
X_FAN    = 198    # fan wall
FAN_N    = 8      # modules in the wall; pitch and height below, traces need them
FAN_W    = 132    # the wall shrinks from its right edge: the left one stays put
                  # and the freed depth goes to the board
X_PCB    = 346    # the board comes right up to the wall: exactly enough gap
                  # for the fan power harnesses to read
X_CORE   = 504    # memory slots
X_SVC    = 842    # service area: battery, microSD, M.2
X_REAR   = 1004   # PSU bays
X_IO     = 1214   # rear panel

# The fan wall pitch is not the wall's business alone: every module's header
# gets its own power bus, and the traces must land on the same point.
FAN_STEP = (H - 52) / FAN_N
FAN_H    = FAN_STEP - 8


def fan_foot_y(i):
    """Y of fan i's header on the board — opposite the middle of the module."""
    return 26 + i * FAN_STEP + FAN_H / 2 - 8


FRONT_W  = 156    # caddies plus a grille of the same width
# Control panel: the cage starts underneath it and therefore moved down.
# The previous 150 was enough for a row of buttons across, but the
# diagnostics panel ended up along the left edge — it needs the full height
# of the block, and the buttons were left the right half.
Y_PANEL  = 196

# ── width: 8 DIMM | CPU0 | 8 DIMM | CPU1 | 8 DIMM ────────────────────────
# Twenty-four slots, twelve per processor. Thirty-two did not fit: 544 units
# of memory plus two sockets of 150 each is the entire width of the chassis
# with nothing to spare, and the banks ran into the sockets. Now every pair
# of neighbours has exactly 28 between them — that is where the bank
# silkscreen and the VRM marking go.
PITCH = 17
SLOT_H = 15
Y_BANK_L, Y_CPU0, Y_BANK_C, Y_CPU1, Y_BANK_R = 34, 194, 368, 528, 702
BANK_N = 8        # DIMMs in a bank; bank width = BANK_N * PITCH
DIMM_SOCK_W = 292  # length of a memory socket along the board's depth
SOCKET_W, SOCKET_H = 202, 150   # LGA 4677 is noticeably rectangular

Y_PSU_TOP, Y_PSU_BOT = 172, 690

# ── rear part: divided vertically with no overlaps ───────────────────────
# Power supply, riser, bridges, low-profile riser, I/O module, second power
# supply. The cover draws exactly the same places as the units themselves —
# which is why the coordinates live here and not inside the blocks. While
# they lived in the blocks, the cover lagged behind every move and covered
# empty space.
PSU_Y = (22, 696)
PSU_W, PSU_H = 300, 145
RISER = ((176, 176), (366, 80))   # y and height: the upper one is full-height
IO_AUX_Y, IO_AUX_H = 452, 60      # USB, mini-DP and the system lamps
IO_Y, IO_H = 512, 180             # onboard I/O module
X_PCB_END = 1206

X_TAG = 470       # core labels — in the empty left part, one under another

# board field: passives, traces and holes are laid out across it
PCB_W, PCB_H = X_REAR - 4 - X_PCB, H - 36

# ── unit places ──────────────────────────────────────────────────────────
# These coordinates used to live inside the blocks, and to learn where a
# socket stands the cover had to import the processors wholesale. Now it is
# the other way round: both the socket and the cover ask the same place here.
X_SOCK = X_CORE + 40                  # processor heatsinks
X_VRM  = X_CORE - 20                  # core power chokes, right by the socket

# The large packages. They used to land in the first free spot the search
# found and bunched up along the left edge; now every place is chosen by
# hand and declared here, because three layers at once lean on it: the
# traces run a bus to the chip, the support components sit in a ring around
# it, the copper flows past it. The strip between the fan headers and the
# memory banks is the only unoccupied part of the board, so the packages run
# along it, but staggered towards the edge. The strip at the left edge is
# narrow, and three parties share it: the packages, the ribbon headers and
# the core power electrolytics. Hence the alternating Y values, and the
# network controller and the TPM moved into the gap between the risers —
# which is where the controller belongs anyway, right by the rear sockets.
CHIPS = (
    ('AST2600',  'U79',  436,  46, 46, 46),   # BMC
    ('PCH C741', 'U31',  438, 120, 44, 44),   # chipset
    ('PCIe SW',  'U44',  436, 380, 42, 42),   # lane switch to the risers
    ('CPLD',     'U12',  442, 700, 34, 34),   # power sequencing logic
    ('X710',     'U21', 1016, 382, 36, 36),   # network controller
    ('TPM 2.0',  'U9',  1080, 384, 32, 26),
)

BAY_TOP, BAY_N, GROUPS = Y_PANEL + 8, 8, 4   # drive cage
GROUP_GAP = 10
# A pair of caddies takes as much depth as one used to: 2.5″ is narrow, and
# a cage of eight of them is a thin pack right at the front. Whatever is
# left of the front depth goes to the ventilation grille — that is where the
# fans pull the air through the drives from.
BAY_DEPTH = 78
BAY_W = BAY_DEPTH / 2
GROUP_H = (H - 12 - BAY_TOP - GROUP_GAP * (GROUPS - 1)) / GROUPS
CAP = 46
# Strip for the bay number: it is on the cage, at the top edge of the caddy,
# and each drive gets its own. While the number stood in the middle of the
# group, both numbers of a pair landed on the same point — a cage of eight
# bays showed four digits.
BAY_NUM_H = 15

LID_BTN = (X_SVC + 26, 508, 86)       # cover button: x, y, side of the square


# ── Assembling the machine ───────────────────────────────────────────────
# The order in which the units drop into their places on the first pass.
# Only the "when" lives here; "from where it flies in and how" lives in the
# unit's own css: a fan is lowered into the wall from above, a drive is
# pushed in from the front, a power supply from the rear.
#
# Seconds are counted from page load. The first one and a half go to the
# cover: the visitor has to see a closed machine, and an empty chassis
# underneath it.
#
# The memory waves are not decoration. DIMMs are not installed one after
# another but by channel: first the first slot of every channel of both
# processors, then the second. That is why the CPU0 bank and the half of the
# middle bank that belongs to CPU1 share a start time: they are filled at
# the same time.
SEAT = {
    'fan':   (2.30, 0.14),    # start, step between neighbours
    'psu':   (2.50, 0.42),
    'cpu':   (3.70, 0.55),
    'dimm':  (4.10, 0.13),    # first wave; the second one is SEAT_WAVE2
    'riser': (6.60, 0.42),
    'bay':   (7.50, 0.17),
}
SEAT_WAVE2 = 5.40             # the second slots of the channels
SEAT_DONE = 9.60              # by this time the machine is fully assembled


def seat(kind, i, base=None):
    """Seating delay of unit i — a ready string for a CSS variable."""
    start, step = SEAT[kind]
    return f'{(base if base is not None else start) + i * step:.2f}s'
