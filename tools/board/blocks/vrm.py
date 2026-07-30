"""VRM: вплотную к сокетам.

Дроссели питают ядро и физически сидят рядом с ним, а не в стороне.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (444, 134, 66, 562)

from board.geom import SOCKET_H, X_VRM, Y_CPU0, Y_CPU1


def render(cv):
    vrm = []
    for y0 in (Y_CPU0, Y_CPU1):
        n = SOCKET_H // 14
        for i in range(n):
            y = y0 + 4 + i * 14
            vrm.append(f'<rect x="{X_VRM}" y="{y}" width="18" height="10" rx="1.5" '
                       f'fill="#1a2429" stroke="rgba(147,161,161,0.20)"/>')
            vrm.append(f'<rect x="{X_VRM-22}" y="{y+1}" width="15" height="8" rx="1" fill="rgba(147,161,161,0.16)"/>')
        # Планка-радиатор поверх дросселей: силовые ключи греются сильнее ядра
        # в пересчёте на площадь, и в 1U их накрывают общим profile-радиатором
        # на всю длину ряда. Рёбра вдоль потока, как у радиатора процессора.
        sink_y = y0 + 2
        sink_h = n * 14 + 4
        vrm.append(f'<rect x="{X_VRM - 3}" y="{sink_y}" width="24" height="{sink_h}" rx="2" '
                   f'fill="#222d33" fill-opacity="0.92" stroke="rgba(147,161,161,0.34)"/>')
        vrm.extend(f'<line x1="{X_VRM + 1}" y1="{sink_y + 5 + k * 4}" x2="{X_VRM + 17}" '
                   f'y2="{sink_y + 5 + k * 4}" stroke="rgba(147,161,161,0.20)" stroke-width="1.4"/>'
                   for k in range(int((sink_h - 10) // 4)))
        for cy in (sink_y + 7, sink_y + sink_h - 7):
            vrm.append(f'<circle cx="{X_VRM + 9}" cy="{cy}" r="3" fill="#0d1418" '
                       f'stroke="rgba(147,161,161,0.36)"/>')
        # Две банки электролита у ряда: единственные детали, торчащие вверх.
        # Сверху видна крестовая насечка — линия контролируемого разрыва, чтобы
        # при вскипании корпус лопнул по ней, а не выстрелил крышкой.
        for cy in (y0 + 26, y0 + SOCKET_H - 26):
            ccx = X_VRM - 32
            vrm.append(f'<circle cx="{ccx}" cy="{cy}" r="11" fill="#0b1114" fill-opacity="0.55"/>')
            vrm.append(f'<circle cx="{ccx}" cy="{cy}" r="10" fill="#1d272c" '
                       f'stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>')
            vrm.append(f'<circle cx="{ccx}" cy="{cy}" r="7.4" fill="none" '
                       f'stroke="rgba(0,0,0,0.34)" stroke-width="1.6"/>')
            vrm.append(f'<path d="M{ccx-6.4} {cy} h12.8 M{ccx} {cy-6.4} v12.8" '
                       f'stroke="rgba(147,161,161,0.40)" stroke-width="1.3"/>')
            vrm.append(f'<path d="M{ccx-7} {cy-7.4} a10 10 0 0 1 9 -2.4" fill="none" '
                       f'stroke="rgba(223,232,234,0.26)" stroke-width="1.4"/>')
            # минусовая полоса по краю банки
            vrm.append(f'<path d="M{ccx-10} {cy+3.4} a10 10 0 0 0 5.6 5.8" fill="none" '
                       f'stroke="rgba(238,232,213,0.34)" stroke-width="2.4"/>')
    cv.add('<g class="decor">' + ''.join(vrm) + '</g>')
