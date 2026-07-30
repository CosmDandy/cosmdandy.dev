"""Light Path Diagnostics.

Light Path Diagnostics
"""

from board.ink import mono


def render(cv):
    def lightpath_panel():

        """Панель Light Path Diagnostics полного состава.

    Выросла со 140×118 до 300×150: шестнадцать ламп в три ступенчатых ряда,
    чекпойнт-индикатор и три кнопки в прежний габарит не влезали. Правый край
    оставлен на месте — панель растёт только влево, туда же, куда её выдвигает
    трансформация в CSS.
    """

        def digit(x, y):

            """Семисегментная восьмёрка: горят все сегменты, как при самотесте."""

            w, h, t = 14, 22, 2.6

            c = '#b58900'

            bars = [(x, y, w, t), (x, y + h / 2 - t / 2, w, t), (x, y + h - t, w, t),

                    (x, y + t, t, h / 2 - t * 1.4), (x + w - t, y + t, t, h / 2 - t * 1.4),

                    (x, y + h / 2 + t / 2, t, h / 2 - t * 1.4),

                    (x + w - t, y + h / 2 + t / 2, t, h / 2 - t * 1.4)]

            return ''.join(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="{c}"/>'

                           for bx, by, bw, bh in bars)



        ROWS = [

            (84, 0, [("OVER SPEC", "over-spec"), ("LOG", "log"), ("LINK", "link"),

                     ("PS", "ps"), ("PCI", "pci"), ("SP", "sp")]),

            (107, 63, [("FAN", "fan"), ("TEMP", "temp"), ("MEM", "mem"), ("NMI", "nmi")]),

            (130, 21, [("CNFG", "cnfg"), ("CPU", "cpu"), ("VRM", "vrm"),

                       ("DASD", "dasd"), ("RAID", "raid"), ("BRD", "brd")]),

        ]

        X0, P = -267, 42



        p = ['<rect x="-312" y="20" width="300" height="150" rx="4" fill="#10171a" stroke="rgba(147,161,161,0.34)"/>']

        p.append('<rect x="-300" y="26" width="40" height="30" rx="2" fill="#0b1013" stroke="rgba(147,161,161,0.3)"/>')

        p.append(digit(-296, 30))

        p.append(digit(-278, 30))

        p.append('<circle cx="-136" cy="41" r="10" fill="none" stroke="rgba(147,161,161,0.4)" stroke-width="1.3"/>')

        p.append('<circle cx="-136" cy="41" r="6" fill="#20282d"/>')

        p.append(mono(-136, 59, "REMIND", 6.5, op=0.42))

        p.append('<line x1="-300" y1="68" x2="-24" y2="68" stroke="rgba(147,161,161,0.18)" stroke-width="1"/>')

        for y, shift, items in ROWS:

            for i, (label, key) in enumerate(items):

                x = X0 + shift + i * P

                p.append(f'<circle class="lp lp-{key}" cx="{x}" cy="{y}" r="3.2" fill="#b58900"/>')

                p.append(mono(x, y + 9, label, 6, op=0.42))

        p.append('<line x1="-300" y1="148" x2="-24" y2="148" stroke="rgba(147,161,161,0.18)" stroke-width="1"/>')

        p.append('<circle cx="-292" cy="156" r="6" fill="none" stroke="#dc322f" stroke-width="1.8"/>')

        p.append('<circle cx="-292" cy="156" r="3" fill="rgba(147,161,161,0.85)"/>')

        p.append(mono(-283, 159, "RESET", 6.5, anchor="start", op=0.42))

        p.append('<circle cx="-230" cy="156" r="3.5" fill="#0b1013" stroke="rgba(147,161,161,0.3)"/>')

        p.append(mono(-222, 159, "NMI", 6.5, anchor="start", op=0.42))

        p.append(mono(-162, 166, "LIGHT PATH DIAGNOSTICS", 7, op=0.4))

        return ''.join(p)



    cv.add(f'''<g class="lightpath" aria-hidden="true">{lightpath_panel()}</g>''')


