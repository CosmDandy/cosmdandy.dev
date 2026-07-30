"""обозначения узлов: то, что реально нанесено рядом с разъёмами.

Кладём в конце, поверх всего, и только туда, где действительно свободно —
регистр занятости уже знает, где стоят детали.
"""

from board.geom import X_IO, X_PCB, X_REAR, X_SVC, Y_BANK_C, Y_BANK_L, Y_BANK_R, H
from board.ink import silk_frame
from board.spec import PORTS


def render(cv):
    marks = []
    # Четвёртым полем — «стоит вдоль». Поворачиваем там, где надпись длиннее
    # места: у задней стенки от кромки платы до края всего восемьдесят с
    # небольшим единиц, а «OCP_3.0 · 2× 10G SFP+» занимает почти столько же —
    # поперёк она упиралась в гнёзда. Вдоль стенки места сколько угодно.
    CANDIDATES = [
        (X_PCB + 60, Y_BANK_L - 16, "DIMM_CPU0_A0"),
        (X_PCB + 60, Y_BANK_C - 16, "DIMM_CPU0_A1 / CPU1_A0"),
        (X_PCB + 60, Y_BANK_R - 16, "DIMM_CPU1_A1"),
        (X_SVC + 8, 96, "PWR_CONN"),
        (X_SVC + 8, 250, "SATA_0-2", True),
        (X_SVC + 8, 360, "BAT1 · CR2032"),
        (X_SVC + 8, 468, "M.2_M-KEY"),
        (X_SVC + 8, 512, "TPM_HDR"),
        (X_SVC + 8, 556, "USB_INT", True),
        (X_SVC + 8, 600, "NMI_SW"),
        (X_REAR + 14, 176, "RISER_1 · PCIE_G5", True),
        (X_REAR + 14, 686, "RISER_2 · PCIE_G5", True),
        (X_IO - 96, 176, f"OCP_3.0 · {PORTS['sfp']}", True),
        (X_IO - 96, 330, f"LAN_1/2 · {PORTS['eth']}", True),
        (X_IO - 96, 464, "MLAN · IPMI 2.0", True),
    ]
    for cand in CANDIDATES:
        x, y, text = cand[0], cand[1], cand[2]
        turn = len(cand) > 3 and cand[3]
        w = len(text) * 4.4 + 10
        # Повёрнутая надпись занимает столько же места, только по другой оси:
        # регистру занятости об этом надо сказать, иначе она сядет на деталь.
        box = (x - 4, y - 11 - w, 15, w) if turn else (x, y - 12, w, 15)
        if not cv.put(*box):
            continue
        marks.append(silk_frame(x, y - 11, text, 7, turn=turn))

    # мелочь в оставшихся свободных карманах платы
    for i in range(150):
        x = X_PCB + 20 + (i * 173) % (X_REAR - 30 - X_PCB)
        y = 24 + (i * 251) % (H - 50)
        if i % 3 == 0:
            if cv.put(x, y, 10, 6):
                marks.append(f'<rect x="{x}" y="{y}" width="10" height="6" fill="rgba(147,161,161,0.15)"/>')
        elif i % 3 == 1:
            if cv.put(x, y, 8, 8):
                marks.append(f'<circle cx="{x+4}" cy="{y+4}" r="3.6" fill="#131e24" stroke="rgba(147,161,161,0.24)"/>')
        else:
            if cv.put(x, y, 16, 9):
                marks.append(f'<rect x="{x}" y="{y}" width="16" height="9" rx="1" fill="#16212a" stroke="rgba(147,161,161,0.18)"/>')
    cv.add('<g class="decor silk">' + ''.join(marks) + '</g>')
