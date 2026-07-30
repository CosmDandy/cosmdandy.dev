"""Паспорт машины: что это за железо.

`geom` отвечает на вопрос «что где лежит», `spec` — «что это такое». Разные
вопросы, разные файлы: координата сокета и модель процессора меняются по
разным поводам.

Зачем он вообще понадобился. Раньше числа жили в шелкографии блоков, а
консоль повторяла их литералами по памяти — и разошлась: на плате двадцать
четыре планки, в консоли тридцать две, и так в шести местах сразу. Теперь
числа живут здесь, блоки берут отсюда свои надписи, а страница получает тот
же паспорт целиком в машиночитаемом виде. Соврать по-прежнему можно, но уже
только одновременно и в консоли, и на текстолите.

Правило трёх слоёв, на котором держится честность вывода:

    паспорт  — что за железо стоит          (этот файл)
    DOM      — что из него сейчас на месте  (вынутые узлы считает скрипт)
    NVRAM    — как оно настроено            (что человек поменял в setup)

Литералов в командах не остаётся: любое число приходит из одного из трёх.
"""

from board.geom import BANK_N, BAY_N, CHIPS, FAN_N, PSU_Y
from board.revision import BOARD_REV, BOARD_SHA

BOARD = {'model': 'CD93-FS1', 'form': '1U', 'vendor': 'CodeKVT'}

# Два EPYC 9965: 192 ядра Zen 5c на сокет — предел плотности x86. Двенадцать
# каналов памяти на процессор объясняют наши двадцать четыре слота ровно: по
# одной планке на канал, без второго ранга и потери скорости.
CPU = {
    'n': 2, 'model': 'AMD EPYC 9965', 'short': 'EPYC 9965', 'socket': 'SP5',
    'family': 'Turin · Zen 5c', 'cores': 192, 'threads': 384, 'tdp': 500,
    'base': 2.25, 'boost': 3.7, 'channels': 12, 'l3': 384,
}

# Планки: по одной на канал. Банк L целиком принадлежит CPU0, банк R — CPU1,
# средний делят пополам — отсюда по двенадцать планок на процессор.
DIMM = {
    'kind': 'DDR5 RDIMM', 'size_gb': 96, 'speed': 6400, 'ranks': '2Rx8',
    'banks': (
        {'code': 'L', 'n': BANK_N, 'ch': 'A–H', 'cpu': 0, 'first': 1},
        {'code': 'C', 'n': BANK_N, 'ch': 'I–L / A–D', 'cpu': 'split', 'first': BANK_N + 1},
        {'code': 'R', 'n': BANK_N, 'ch': 'E–L', 'cpu': 1, 'first': BANK_N * 2 + 1},
    ),
}

# Каддики: два отсека заняты заглушками — так и на живой машине, полностью
# набитая корзина выдаёт рендер. Заглушки стоят вразбивку, а не подряд: диски
# в парк доезжают по мере надобности, и дырки в корзине остаются где попало.
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
    """Строка для шелкографии: столько памяти держит эта плата."""
    return f"{dimm_slots()}× {DIMM['kind']} · {total_ram_gb() / 1024:.2f} TiB"


def passport():
    """Паспорт целиком — его же получает страница в виде JSON.

    Ревизия и серийник берутся из git тем же способом, что и шелкография на
    текстолите: номер сборки — число коммитов, серийник — хэш HEAD. Значит
    консоль и плата не могут разойтись даже в них.
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
        # Микросхемы с позиционными обозначениями — из них собирается честный
        # lspci: что нарисовано, то и перечислено.
        'chips': [{'mark': mark, 'ref': ref} for mark, ref, *_ in CHIPS],
    }


# Сколько чего должно оказаться на плате. Сборка сверяет это с фактически
# нарисованным и падает при расхождении: пусть ошибку ловит генератор, а не
# гость, набравший dimm.
EXPECT = {
    'dimm': dimm_slots(),
    'fan': FAN['n'],
    'bay': BAY_N - len(FILLER_BAYS),   # заглушка узлом не считается: её не вынуть
    'psu': PSU['n'],
    'riser': len(RISERS),
    'cpu': CPU['n'],
}
