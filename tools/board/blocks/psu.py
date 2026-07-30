"""блоки питания: вынимаются назад, за лепестки-ручки.

Ручка и вентилятор сидят на заднем торце — с той стороны, куда модуль
выходит из шасси. Всё остальное занимает корпус с шильдиком и штрих-кодом.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
# Заметно шире корпуса: и петля-ручка, и оранжевый фиксатор выходят за
# задний торец — иначе за них не взяться рукой в стойке. Слева выходит на
# плату: лампа посадочного места стоит на текстолите, а не на самом блоке —
# горит не блок, а место, из которого его вынули.
BOUNDS = (982, 0, 356, 862)

from board.geom import PSU_H, PSU_W, PSU_Y, X_REAR, seat
from board.ink import mono
from board.lamps import fault_at, glow, jitter
from board.revision import stamp


def render(cv):
    for k, (y, flip) in enumerate(zip(PSU_Y, (False, True))):
        name = f"PSU-{k+1}"
        fan_y = y + (8 if flip else 83)      # вентилятор в дальнем от центра углу
        grip_y = y + (88 if flip else 14)     # ручка — в противоположном
        # Карман отсека: блок вставляется в него, а не приклеен к стенке.
        # Без кармана два модуля читаются одной панелью на задней кромке.
        bay = [(f'<rect x="{X_REAR-6}" y="{y-6}" width="312" height="157" rx="6" fill="#0c1316" '
                f'stroke="rgba(147,161,161,0.20)"/>')]
        for gy in (y - 2, y + 143):
            bay.append(f'<line x1="{X_REAR-2}" y1="{gy}" x2="{X_REAR+296}" y2="{gy}" '
                       f'stroke="rgba(147,161,161,0.16)" stroke-width="2.4"/>')
        # Направляющие и ответная колодка в глубине кармана: пустой отсек
        # должен читаться посадочным местом, а не дырой в задней стенке.
        for gy in (y + 18, y + PSU_H - 18):
            bay.append(f'<line x1="{X_REAR+8}" y1="{gy}" x2="{X_REAR+PSU_W-40}" y2="{gy}" '
                       f'stroke="rgba(147,161,161,0.12)" stroke-width="3"/>')
        bay.append(f'<rect x="{X_REAR+6}" y="{y+PSU_H/2-26}" width="16" height="52" rx="2" '
                   f'fill="#0a1215" stroke="rgba(147,161,161,0.22)"/>')
        bay.extend(f'<line x1="{X_REAR+10}" y1="{y+PSU_H/2-18+j*9}" x2="{X_REAR+18}" '
                   f'y2="{y+PSU_H/2-18+j*9}" stroke="rgba(206,168,58,0.30)" stroke-width="1.6"/>'
                   for j in range(5))
        bay.append(mono(X_REAR + PSU_W / 2, y + PSU_H / 2 + 3, name, 9, op=0.14))
        cv.add('<g class="decor psu-bay">' + ''.join(bay) + '</g>')
        psu = []
        psu.append(f'<rect x="{X_REAR}" y="{y}" width="{PSU_W}" height="{PSU_H}" rx="5" fill="#121a1e" stroke="rgba(147,161,161,0.26)"/>')
        # Жалюзи по верху корпуса: штампованные прорези, через них уходит
        # горячий воздух. Ряд идёт вдоль всего модуля, кроме торцов.
        louver_y = y + (128 if flip else 8)
        for lv in range(14):
            lx = X_REAR + 26 + lv * 16
            psu.append(f'<path d="M{lx} {louver_y} h9 a2 2 0 0 1 0 8 h-9 a2 2 0 0 1 0 -8 Z" '
                       f'fill="#0a1013" stroke="rgba(147,161,161,0.18)" stroke-width="0.8"/>')
        # Ручка сидит посередине торца, рядом с решёткой выхода воздуха, и
        # петлёй уходит далеко за корпус — иначе за неё не взяться, когда блок
        # сидит в кармане. На живом блоке она чёрная, у нас светлая: на тёмном
        # шасси чёрная петля просто пропадала бы.
        mid = y + 72
        # Петля уходит далеко за торец: за неё берутся рукой, а рука не
        # помещается в зазор между блоком и стенкой стойки. Прежний вылет в
        # десяток единиц читался как утолщение корпуса, а не как ручка.
        bail_x = X_REAR + 292
        psu.append(f'<path d="M{bail_x} {mid-30} h30 a15 15 0 0 1 15 15 v30 a15 15 0 0 1 -15 15 h-30" '
                   f'fill="none" stroke="rgba(198,209,213,0.82)" stroke-width="6" '
                   f'stroke-linecap="round" stroke-linejoin="round"/>')
        psu.append(f'<path d="M{bail_x+7} {mid-23} h23 a9 9 0 0 1 9 9 v16 a9 9 0 0 1 -9 9 h-23" '
                   f'fill="none" stroke="rgba(13,20,24,0.5)" stroke-width="1.4"/>')
        for ay in (mid - 30, mid + 30):        # оси, на которых петля откидывается
            psu.append(f'<circle cx="{bail_x}" cy="{ay}" r="4" fill="#0d1418" '
                       f'stroke="rgba(147,161,161,0.5)" stroke-width="1.6"/>')
        # Фиксатор оранжевый — он из того же ряда, что язычки вентиляторов и
        # защёлки дисков: цвет означает «это трогают руками на горячую».
        # Выходит за торец дальше ручки, иначе до него не дотянуться.
        psu.append(f'<path d="M{X_REAR+286} {mid-32} h34 l8 11 -8 11 h-34 Z" '
                   f'fill="#cb4b16" stroke="rgba(238,232,213,0.55)" stroke-width="1.3"/>')
        for g in range(2):
            psu.append(f'<line x1="{X_REAR+294}" y1="{mid-26+g*8}" x2="{X_REAR+316}" y2="{mid-26+g*8}" '
                       f'stroke="rgba(20,20,10,0.34)" stroke-width="1.6"/>')
        # вентилятор
        psu.append(f'<rect x="{X_REAR+238}" y="{fan_y-4}" width="58" height="58" rx="4" fill="#0b1215" stroke="rgba(147,161,161,0.22)"/>')
        psu.append(f'<circle cx="{X_REAR+267}" cy="{fan_y+25}" r="25" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>')
        psu.append(f'<path class="fan-blades aux" d="M{X_REAR+267} {fan_y+3} L{X_REAR+275} {fan_y+25} L{X_REAR+267} {fan_y+47} L{X_REAR+259} {fan_y+25} Z '
                   f'M{X_REAR+245} {fan_y+25} L{X_REAR+267} {fan_y+17} L{X_REAR+289} {fan_y+25} L{X_REAR+267} {fan_y+33} Z" '
                   f'fill="rgba(34,48,54,0.5)" stroke="rgba(147,161,161,0.22)" style="animation-delay:-{jitter(k, 0.3, 1.4)}s"/>')
        # шильдик с характеристиками
        psu.append(f'<rect x="{X_REAR+96}" y="{y+30}" width="126" height="86" rx="3" '
                   f'fill="#e8e3d5" fill-opacity="0.10" stroke="rgba(147,161,161,0.22)"/>')
        for r in range(6):
            yy = y + 44 + r * 12
            psu.append(f'<line x1="{X_REAR+106}" y1="{yy}" x2="{X_REAR+212}" y2="{yy}" stroke="rgba(147,161,161,0.16)" stroke-width="2"/>')
        # штрих-код вдоль внутреннего торца
        for b in range(20):
            w = 1.4 if b % 3 else 2.8
            psu.append(f'<rect x="{X_REAR+16}" y="{y+34+b*4}" width="24" height="{w}" fill="rgba(147,161,161,0.22)"/>')
        # Имя блока идёт вдоль модуля, а не поперёк: на живой машине шильдик
        # наклеен по длинной стороне, и читают его, повернув голову. Так же
        # развёрнут и шильдик на крышке.
        nx, ny = X_REAR + 30, y + PSU_H / 2
        psu.append(f'<text x="{nx}" y="{ny}" transform="rotate(-90 {nx} {ny})" '
                   f'text-anchor="middle" fill="rgba(147,161,161,0.5)" '
                   f'font-family="ui-monospace, Menlo, monospace" font-size="11">{name}</text>')
        psu.append(stamp(X_REAR + 16, y + 138, "блоки питания"))
        # AC, DC и ошибка — ровно тот набор, что подписан на наклейке живого БП.
        # Вход под напряжением всегда: AC горит и на выключенной машине.
        for dy, cls, color, nm in ((0, "led aux", "#859900", "AC"),
                                   (17, "led", "#859900", "DC"),
                                   (34, "fault-sys", "#b58900", "!")):
            ly = y + 100 + dy
            psu.append(f'{glow(cls, X_REAR + 60, ly, 4, color)}'
                       f'<circle class="{cls}" cx="{X_REAR+60}" cy="{ly}" r="4" fill="{color}"/>')
            psu.append(mono(X_REAR + 76, ly + 3, nm, 7, anchor="start", op=0.44))
        cv.add(f'''<g class="pick psu" data-psu="{k+1}" style="--seat:{seat('psu', k)}">
      <g class="pick-body">{''.join(psu)}</g>
      {fault_at(cv, X_REAR-18, y + (118 if flip else 26), 5)}
    </g>''')
