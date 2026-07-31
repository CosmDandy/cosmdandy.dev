"""Machine passport: what kind of hardware this is.

`geom` answers the question "what lies where", `spec` answers "what it is".
Different questions, different files: the coordinate of a socket and the model
of a processor change for different reasons.

Why it was needed at all. The numbers used to live in the silkscreen of the
blocks, and the console repeated them as literals from memory — and drifted
apart: twenty-four DIMMs on the board, thirty-two in the console, and like that
in six places at once. Now the numbers live here, the blocks take their
captions from here, and the page gets the same passport whole in a
machine-readable form. Lying is still possible, but only in the console and on
the laminate at the same time.

The rule of three layers that keeps the output honest:

    passport — what hardware is fitted     (this file)
    DOM      — what of it is in place now  (the script counts pulled units)
    NVRAM    — how it is configured        (what a person changed in setup)

No literals are left in the commands: every number comes from one of the three.
"""

from board.geom import BANK_N, BAY_N, CHIPS, FAN_N, PSU_Y
from board.revision import BOARD_REV, BOARD_SHA

BOARD = {'model': 'CD93-FS1', 'form': '1U', 'vendor': 'CodeKVT'}

# Two EPYC 9965: 192 Zen 5c cores per socket — the density limit of x86. Twelve
# memory channels per processor explain our twenty-four slots exactly: one DIMM
# per channel, without a second rank and the loss of speed.
CPU = {
    'n': 2, 'model': 'AMD EPYC 9965', 'short': 'EPYC 9965', 'socket': 'SP5',
    'family': 'Turin · Zen 5c', 'cores': 192, 'threads': 384, 'tdp': 500,
    'base': 2.25, 'boost': 3.7, 'channels': 12, 'l3': 384,
}

# DIMMs: one per channel. Bank L belongs to CPU0 entirely, bank R to CPU1, and
# the middle one is split in half — hence twelve DIMMs per processor.
DIMM = {
    'kind': 'DDR5 RDIMM', 'size_gb': 96, 'speed': 6400, 'ranks': '2Rx8',
    'banks': (
        {'code': 'L', 'n': BANK_N, 'ch': 'A–H', 'cpu': 0, 'first': 1},
        {'code': 'C', 'n': BANK_N, 'ch': 'I–L / A–D', 'cpu': 'split', 'first': BANK_N + 1},
        {'code': 'R', 'n': BANK_N, 'ch': 'E–L', 'cpu': 1, 'first': BANK_N * 2 + 1},
    ),
}

# Caddies: two bays are taken by fillers — same as on a live machine, a fully
# packed cage gives away a render. The fillers sit apart rather than side by
# side: drives reach the fleet as the need arises, and the gaps in the cage are
# left wherever they happen to fall.
OPTANE_BAY = 2
FILLER_BAYS = (4, BAY_N - 1)
BAYS = tuple(
    {'bay': i, 'filler': True} if i in FILLER_BAYS else
    {'bay': i, 'model': 'INTEL OPTANE P5800X', 'kind': 'Optane', 'tb': 1.6, 'life': 100}
    if i == OPTANE_BAY else
    {'bay': i, 'model': 'U.2 NVMe Gen4', 'kind': 'NVMe U.2', 'tb': 3.84, 'life': 98}
    for i in range(BAY_N))

FAN = {'n': FAN_N, 'model': '40×56 dual-rotor', 'rpm_nom': 12100, 'rpm_max': 18000}
PSU = {'n': len(PSU_Y), 'watt': 1300, 'model': 'CRPS 80 PLUS Titanium'}

RISERS = (
    {'slot': 1, 'link': 'PCIe Gen5 ×16', 'card': '2× 10G SFP+', 'empty': False},
    {'slot': 2, 'link': 'PCIe Gen5 ×16', 'card': None, 'empty': True},
)

PORTS = {'sfp': '2× 10G SFP+', 'sfp_degraded': '1× 1G · degraded',
         'eth': '2× 1GbE', 'mgmt': 'SYSTEM MGMT'}

FIRMWARE = {'bios_vendor': 'AMI Aptio V', 'bios': '2.6.1', 'bios_date': '2026-05-14',
            'bmc': '2.14.3', 'bmc_chip': 'AST2600',
            'mac': 'b4:2e:99:0c:d9:3f', 'ip': '192.168.10.42'}


def dimm_slots():
    return sum(b['n'] for b in DIMM['banks'])


def total_ram_gb():
    return dimm_slots() * DIMM['size_gb']


def ram_label():
    """Line for the silkscreen: this is how much memory the board holds."""
    return f"{dimm_slots()}× {DIMM['kind']} · {total_ram_gb() / 1024:.2f} TiB"


def passport():
    """The whole passport — the same one the page receives as JSON.

    The revision and the serial are taken from git the same way as the
    silkscreen on the laminate: the build number is the commit count, the
    serial is the HEAD hash. Which means the console and the board cannot
    drift apart even in those.
    """
    return {
        'board': {**BOARD, 'rev': int(BOARD_REV), 'sha': BOARD_SHA},
        'fw': FIRMWARE,
        'cpu': CPU,
        'dimm': {**DIMM, 'slots': dimm_slots(), 'total_gb': total_ram_gb()},
        'bay': [dict(b) for b in BAYS],
        'fan': FAN,
        'psu': PSU,
        'riser': [dict(r) for r in RISERS],
        'ports': PORTS,
        # Chips with their reference designators — an honest lspci is built out
        # of them: what is drawn is what is listed.
        'chips': [{'mark': mark, 'ref': ref} for mark, ref, *_ in CHIPS],
    }


# How much of what has to end up on the board. The build checks this against
# what was actually drawn and fails on a mismatch: let the generator catch the
# error, not a visitor who typed dimm.
EXPECT = {
    'dimm': dimm_slots(),
    'fan': FAN['n'],
    'bay': BAY_N - len(FILLER_BAYS),   # a filler is not a unit: it cannot be pulled
    'psu': PSU['n'],
    'riser': len(RISERS),
    'cpu': CPU['n'],
}
