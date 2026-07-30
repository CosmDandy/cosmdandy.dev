"""вентиляторы: восемь спаренных модулей в общей стенке.

Модуль — пара крыльчаток под одной пластиковой крышкой, поэтому сверху
видна оболочка со швом посередине, а не голые лопасти. Стенка неглубокая:
раньше её глубина вдвое превышала ширину модуля, чего в 1U не бывает, — и
лишнее ушло корзине дисков, которой негде было выдвигаться.

Рисуем после жгутов, поэтому стенка их перекрывает.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (184, 6, 262, 832)

from board.geom import FAN_W, X_FAN, X_PCB, H
from board.ink import mono, silk_inverse
from board.lamps import fault_at, jitter
from board.revision import stamp


def render(cv):
    cv.add(f'<rect class="decor" x="{X_FAN}" y="20" width="{FAN_W}" height="{H-40}" rx="0" fill="#0f1619" stroke="rgba(147,161,161,0.28)"/>')
    cv.add(stamp(X_FAN + 6, 14, "вентиляторы"))
    FAN_N = 8
    FAN_STEP = (H - 52) / FAN_N
    for i in range(FAN_N):
        y = 26 + i * FAN_STEP
        # Крыльчатки нарочно шире своей половины и заходят одна на другую:
        # так и стоят спаренные вентиляторы в 1U, и пара читается одним
        # модулем, а не двумя кружками рядом. Радиус считаем от глубины
        # стенки — числом он разъезжается при каждой правке геометрии.
        rr = FAN_W / 3.6
        rotors = []
        for k in range(2):
            cx, cy = X_FAN + FAN_W / 4 + k * (FAN_W / 2), y + (FAN_STEP - 8) / 2
            bl, bw = rr * 0.92, rr * 0.25
            blades = ' '.join(
                f'M{cx} {cy-bl:.1f} L{cx+bw:.1f} {cy} L{cx} {cy+bl:.1f} L{cx-bw:.1f} {cy} Z' if b % 2 == 0 else
                f'M{cx-bl:.1f} {cy} L{cx} {cy-bw:.1f} L{cx+bl:.1f} {cy} L{cx} {cy+bw:.1f} Z'
                for b in range(2))
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr:.1f}" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>')
            rotors.append(f'<path class="fan-blades" d="{blades}" fill="rgba(34,48,54,0.55)" '
                          f'stroke="rgba(147,161,161,0.26)" style="animation-duration:{jitter(i, 0.42, 0.24, k)}s"/>')
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr*0.3:.1f}" fill="#0a1215" stroke="rgba(147,161,161,0.22)"/>')

        h = FAN_STEP - 8
        # Оранжевые язычки по бокам — за них вентилятор и вынимают на горячую.
        # На живой машине они единственное цветное пятно в корзине. Рисуем их
        # до корпуса: язычок утоплен в раму, и наружу торчит только половина.
        tabs = ''.join(
            f'<rect x="{tx}" y="{y+h/2-19}" width="16" height="38" rx="2" fill="#cb4b16" '
            f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
            f'<rect x="{tx+4}" y="{y+h/2-13}" width="6" height="26" rx="1" fill="rgba(238,232,213,0.22)"/>'
            for tx in (X_FAN - 8, X_FAN + FAN_W - 8))
        # Виброопоры сидят не по углам сами по себе: сквозь модуль проходит
        # шпилька, и на её концах надеты резиновые втулки. Мотор развязан с
        # рамой этой резиной — иначе гул восьми вентиляторов идёт в стойку.
        mounts = ''.join(
            f'<line x1="{mx}" y1="{y+7}" x2="{mx}" y2="{y+h-7}" stroke="rgba(147,161,161,0.16)" '
            f'stroke-width="2.6"/>' for mx in (X_FAN + 14, X_FAN + FAN_W - 14))
        mounts += ''.join(
            f'<rect x="{mx-5}" y="{my-4}" width="10" height="8" rx="4" fill="#1b2429" '
            f'stroke="rgba(147,161,161,0.30)"/>'
            f'<circle cx="{mx}" cy="{my}" r="2.4" fill="#070d10" stroke="rgba(147,161,161,0.22)"/>'
            for mx in (X_FAN + 14, X_FAN + FAN_W - 14) for my in (y + 7, y + h - 7))
        # Питание: колодка на корпусе, от неё нога с жгутом до ответной части на
        # плате. Нога и провода — часть вентилятора: тянешь его, и они уходят
        # вместе с ним, отцепляясь от платы. Лампа при этом остаётся на плате:
        # горит не вентилятор, а его посадочное место.
        px, py = X_FAN + FAN_W - 26, y + 10
        fy, sx = y + 20, X_PCB + 6
        wires = ''.join(
            f'<path d="M{px+16} {py+4+k*3} C{px+40} {py+4+k*3}, {sx-30} {fy+3+k*3}, {sx} {fy+3+k*3}" '
            f'fill="none" stroke="{c}" stroke-width="1.5" stroke-opacity="0.6"/>'
            for k, c in enumerate(('#dc322f', '#eee8d5', '#b58900', '#268bd2')))
        plug = (f'<rect x="{px}" y="{py}" width="18" height="16" rx="2" fill="#0a1215" '
                f'stroke="rgba(147,161,161,0.34)"/>'
                + ''.join(f'<line x1="{px+4+k*4}" y1="{py+3}" x2="{px+4+k*4}" y2="{py+13}" '
                          f'stroke="rgba(147,161,161,0.26)"/>' for k in range(4)))
        # ответная колодка на конце ноги — она и садится в разъём платы
        foot = (f'<rect x="{sx-4}" y="{fy}" width="14" height="16" rx="2" fill="#101a1e" '
                f'stroke="rgba(147,161,161,0.38)"/>'
                f'<rect x="{sx-1}" y="{fy+3}" width="8" height="10" rx="1" fill="#060d10"/>')

        # Оболочка: сверху у живого модуля видна закрытая пластиковая крышка со
        # швом между двумя секциями, а не голые крыльчатки. Рисуем её поверх
        # роторов тонким контуром — так и корпус читается, и вращение видно.
        shell = (f'<rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="3" fill="none" '
                 f'stroke="rgba(147,161,161,0.34)" stroke-width="1.6"/>'
                 f'<line x1="{X_FAN+FAN_W/2}" y1="{y+3}" x2="{X_FAN+FAN_W/2}" y2="{y+h-3}" '
                 f'stroke="rgba(147,161,161,0.30)" stroke-width="1.6"/>'
                 f'<line x1="{X_FAN+FAN_W/2}" y1="{y+3}" x2="{X_FAN+FAN_W/2}" y2="{y+h-3}" '
                 f'stroke="rgba(10,18,21,0.6)" stroke-width="0.7"/>')
        # Поролон по кромкам: им модуль прижат к крышке, чтобы воздух не пошёл
        # в обход. Ворсистый, поэтому рисуем штрихом, а не заливкой.
        foam = ''.join(
            f'<rect x="{X_FAN+8}" y="{fy0}" width="{FAN_W-16}" height="5" rx="2" '
            f'fill="rgba(88,96,92,0.42)"/>'
            + ''.join(f'<line x1="{X_FAN+10+t*7}" y1="{fy0}" x2="{X_FAN+10+t*7}" y2="{fy0+5}" '
                      f'stroke="rgba(147,161,161,0.16)"/>' for t in range(int((FAN_W-20)//7)))
            for fy0 in (y + 2, y + h - 7))

        cv.add(f'''<g class="pick fan" data-fan="{i}">
      <g class="pick-body">
        {tabs}
        <rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="0" fill="#0b1215" stroke="rgba(147,161,161,0.18)"/>
        {mounts}
        {''.join(rotors)}
        {shell}
        {foam}
        {plug}
        {mono(X_FAN + FAN_W / 2, y + h - 6, f"FAN{i+1} · 18000 RPM", 7, op=0.34)}
        <g class="cables">{wires}</g>
        {foot}
      </g>
      {fault_at(cv, sx + 18, fy + 8, 5)}
      {silk_inverse(sx + 30, fy + 2, 'FAN FAULT', 6)}
    </g>''')
