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
from board.revision import BOARD_REV, BOARD_SN
from board.rotor import BLADE_N

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

# Caddies: three bays carry fillers — same as on a live machine, a fully packed
# cage gives away a render. The bottom pair is empty together, the way a cage
# filled from the top runs out at the far end; the odd one in the middle is the
# bay whose drive went out and has not come back, which is how a real cage ends
# up looking a few months in. Every populated bay carries the same drive: the
# owner standardised the fleet on Optane, so there is no per-bay split to track.
FILLER_BAYS = (4, BAY_N - 2, BAY_N - 1)
BAYS = tuple(
    {'bay': i, 'filler': True} if i in FILLER_BAYS else
    {'bay': i, 'model': 'INTEL OPTANE P5800X', 'kind': 'Optane', 'tb': 1.6, 'life': 100}
    for i in range(BAY_N))

# Лопастей столько же, сколько рисует rotor.py, и число это в паспорте не для
# красоты: на нём держится звук машины. Тон вентилятора — лопаточная частота,
# лопасти × об/мин ÷ 60, и синтезатор берёт её отсюда, а не из своей константы.
# Иначе появилось бы второе место, знающее устройство вентилятора, и однажды
# схема запела бы не на своей ноте.
FAN = {'n': FAN_N, 'model': '40×56 dual-rotor', 'blades': BLADE_N,
       'rpm_nom': 12100, 'rpm_max': 18000,
       # Политика оборотов живёт не в BIOS, а в контроллере управления — там же,
       # где она стоит на живой машине: Cooling в меню IMM, а не Advanced в
       # Setup. Обороты каждого режима здесь, потому что их спрашивают трое
       # сразу — рисунок (период оборота крыльчатки), звук (лопаточная частота)
       # и команда fans. Разъедься они, и машина завертелась бы на одной ноте,
       # а отчиталась о другой.
       'policy': (
           {'id': 'Acoustic', 'rpm': 3025},
           {'id': 'Efficiency', 'rpm': 6050},
           {'id': 'Balanced', 'rpm': 12100},
           {'id': 'Performance', 'rpm': 18000},
       ),
       'policy_default': 'Balanced'}
PSU = {'n': len(PSU_Y), 'watt': 1300, 'model': 'CRPS 80 PLUS Titanium'}

RISERS = (
    {'slot': 1, 'link': 'PCIe Gen5 ×16', 'card': '2× 10G SFP+', 'empty': False},
    {'slot': 2, 'link': 'PCIe Gen5 ×16', 'card': None, 'empty': True},
)

# Клеймо изготовителя. Одна строка на всю машину: она набита и на шелкографии
# платы, и на шильдике радиатора, и менять её надо в одном месте — иначе на
# одной детали написано одно, на соседней другое.
MADE = 'FROM RUSSIA WITH LOVE'

PORTS = {'sfp': '2× 10G SFP+', 'sfp_degraded': '1× 1G · degraded',
         'eth': '2× 1GbE', 'mgmt': 'SYSTEM MGMT'}

# Прошивок на машине не одна. BIOS — только та, что показывает экран; под ней
# лежит контроллер управления со своей версией и своей датой, а внутри
# процессора — микрокод и опорный код платформы. AGESA спрашивают первым делом,
# когда машина на EPYC ведёт себя странно с памятью: у AMD именно он отвечает за
# обучение каналов, и его версию читают с экрана Main, а не из документации.
FIRMWARE = {'bios_vendor': 'AMI Aptio V', 'bios': '2.6.1', 'bios_date': '2026-05-14',
            'bmc': '2.14.3', 'bmc_chip': 'AST2600', 'bmc_date': '2026-04-02',
            'agesa': 'TurinPI-SP5 1.0.0.7', 'psp': '1.5.0.28', 'smu': '92.15.0',
            'ucode': '0x0b002116',
            'uuid': '4c4f5645-cd93-11f0-b42e-990cd93f0001',
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

    Ревизия и серийный номер здесь ровно те же, что набиты на текстолите:
    берутся из board.revision, а не считаются заново. Поэтому самотест и
    плата разойтись не могут — а расходились они раньше именно тем, что
    номер брался от HEAD, то есть от предыдущей сборки.
    """
    return {
        'board': {**BOARD, 'rev': int(BOARD_REV), 'sha': BOARD_SN},
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
