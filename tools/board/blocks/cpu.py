"""процессоры.

процессоры
"""

import math

from board.geom import SOCKET_H, SOCKET_W, X_CORE, X_SOCK, X_TAG, Y_CPU0, Y_CPU1
from board.ink import hit, mono, silk_inverse, tag
from board.lamps import fault
from board.metal import ihs_path
from board.revision import stamp


def render(cv):
    def socket(x, y):

        # Крышка процессора: не просто прямоугольник, а лист с ключами. По бокам

        # у неё полукруглые вырезы, а на подложке — выемки под выступы сокета:

        # процессор физически не сядет боком, вставить его неправильно нельзя.

        # В одном углу срезан угол и стоит треугольник — метка первого вывода.

        ihs_x, ihs_y = x + 40, y + 34

        ihs_w, ihs_h = SOCKET_W - 80, SOCKET_H - 68

        notch, cut = 9, 12      # те же ключ и срез, что задаёт ihs_path

        ihs = ihs_path(x, y)

        # Поле контактов: у LGA ножек на процессоре нет, они на сокете —

        # 4677 подпружиненных лепестков. Пока процессор на месте, поля не видно;

        # снимешь — и это самое узнаваемое место на плате. Всё поле рисуем одним

        # путём: отдельными фигурами это были бы тысячи узлов DOM.

        px0, py0 = ihs_x - 2, ihs_y - 2

        pw, ph = ihs_w + 4, ihs_h + 4

        step = 2.6

        dots = ' '.join(

            f'M{px0 + 3 + c * step:.1f} {py0 + 3 + r * step:.1f}h0.5'

            for r in range(int((ph - 6) // step)) for c in range(int((pw - 6) // step)))

        lga = (f'<g class="lga">'

               f'<rect x="{px0}" y="{py0}" width="{pw}" height="{ph}" rx="1" fill="#0a1013" '

               f'stroke="rgba(147,161,161,0.30)"/>'

               f'<path d="{dots}" stroke="rgba(212,175,84,0.62)" stroke-width="1.2" '

               f'stroke-linecap="round" fill="none"/>'

               # рамка держателя с направляющими штырями по углам

               f'<rect x="{px0-4}" y="{py0-4}" width="{pw+8}" height="{ph+8}" rx="2" fill="none" '

               f'stroke="rgba(147,161,161,0.40)" stroke-width="1.6"/>'

               + ''.join(f'<circle cx="{px0 + gx}" cy="{py0 + gy}" r="2.6" fill="#1b2429" '

                         f'stroke="rgba(147,161,161,0.44)"/>'

                         for gx in (-8, pw + 8) for gy in (-8, ph + 8))

               + f'</g>')



        s = [f'<rect x="{x}" y="{y}" width="{SOCKET_W}" height="{SOCKET_H}" rx="4" fill="#101a1e" stroke="rgba(147,161,161,0.42)"/>',

             f'<rect x="{x+14}" y="{y+14}" width="{SOCKET_W-28}" height="{SOCKET_H-28}" rx="2" fill="#0b1316" stroke="rgba(147,161,161,0.26)"/>',

             lga,

             # Сам процессор — отдельная группа: он снимается вторым, после

             # радиатора, и уезжает вниз, открывая поле контактов.

             f'<g class="cpu-lid">',

             # подложка процессора видна из-под крышки узкой каймой

             f'<rect x="{ihs_x-5}" y="{ihs_y-5}" width="{ihs_w+10}" height="{ihs_h+10}" rx="1" '

             f'fill="#123028" stroke="rgba(133,153,0,0.30)"/>',

             f'<path d="{ihs}" fill="#16232a" stroke="rgba(42,161,152,0.30)"/>',

             # металл крышки: блик по верхней кромке, тень по нижней

             f'<path d="M{ihs_x + cut} {ihs_y} H{ihs_x + ihs_w / 2 - notch} M{ihs_x + ihs_w / 2 + notch} '

             f'{ihs_y} H{ihs_x + ihs_w}" fill="none" stroke="rgba(223,232,234,0.28)" stroke-width="1.2"/>',

             f'<path d="M{ihs_x} {ihs_y + ihs_h} H{ihs_x + ihs_w / 2 - notch} M{ihs_x + ihs_w / 2 + notch} '

             f'{ihs_y + ihs_h} H{ihs_x + ihs_w}" fill="none" stroke="rgba(0,0,0,0.40)" stroke-width="1.4"/>',

             f'<path d="M{ihs_x} {ihs_y + cut} L{ihs_x + cut} {ihs_y}" fill="none" '

             f'stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>',

             f'<path d="M{ihs_x + 3} {ihs_y + 12} l7 0 l-3.5 -7 z" fill="rgba(238,232,213,0.5)"/>',

             mono(x + SOCKET_W/2, y + SOCKET_H/2 + 4, "LGA 4677", 10, op=0.55),

             '</g>',

             f'<path d="M{x+SOCKET_W/2} {y+24} l-5 8 h10 z" fill="rgba(147,161,161,0.32)"/>',

             mono(x + SOCKET_W/2 + 26, y + 32, "INSTALL", 7, anchor="start", op=0.3)]

        for k, (dx, dy) in enumerate([(11, 11), (SOCKET_W-11, 11), (11, SOCKET_H-11), (SOCKET_W-11, SOCKET_H-11)]):

            s.append(f'<circle cx="{x+dx}" cy="{y+dy}" r="4.5" fill="none" stroke="rgba(147,161,161,0.28)" stroke-width="1.4"/>')

            s.append(mono(x + dx, y + dy + 3, str(k + 1), 7, op=0.34))

        return ''.join(s)



    def die(x, y, n):

        """Кристалл под радиатором: по нему наискось бежит цветной перелив.

    Тот же градиент, что на кнопке «скачать» в резюме. Полоса шире окна и
    ездит по диагонали, лишнее срезает clip по крышке процессора.
    """

        dx, dy = x + 40, y + 34

        return (f'<g class="die" clip-path="url(#die-clip-{n})">'

                f'<rect class="die-shine" x="{dx-150}" y="{dy-82}" width="450" height="246" '

                f'fill="url(#die-shine)"/></g>')



    def heatsink(x, y):

        # Рёбра вдоль потока воздуха: он идёт спереди назад, слева направо.

        rows = int((SOCKET_H - 24) // 3.4)

        fins = ''.join(f'<line x1="{x+12}" y1="{y+12+i*3.4:.1f}" x2="{x+SOCKET_W-12}" y2="{y+12+i*3.4:.1f}" '

                       f'stroke="rgba(147,161,161,0.22)" stroke-width="1.2"/>' for i in range(rows))

        # Подпружиненные винты по углам — они на самом радиаторе и уезжают с ним.

        # Винт подпружинен: витая пружина сидит между головкой и радиатором и

        # задаёт усилие прижима — затягивать «до упора» тут нечего, момент

        # держит она. Сверху видны её витки вокруг стержня.

        def spring(sx, sy, r=10.5, turns=9):

            pts = []

            for t in range(turns * 6 + 1):

                f = t / (turns * 6)

                ang = f * turns * 2 * math.pi

                rr = r - f * 3.4

                pts.append(f'{sx + rr * math.cos(ang):.1f} {sy + rr * math.sin(ang) * 0.94:.1f}')

            return (f'<path d="M{" L".join(pts)}" fill="none" stroke="rgba(147,161,161,0.30)" '

                    f'stroke-width="1.1"/>')



        screws = ''.join(

            spring(sx, sy) +

            f'<circle cx="{sx}" cy="{sy}" r="7" fill="#162025" stroke="rgba(147,161,161,0.46)" stroke-width="1.4"/>'

            f'<circle cx="{sx}" cy="{sy}" r="3.4" fill="#0c1418" stroke="rgba(147,161,161,0.34)"/>'

            f'<line x1="{sx-3}" y1="{sy}" x2="{sx+3}" y2="{sy}" stroke="rgba(147,161,161,0.5)" stroke-width="1.4"/>'

            f'<line x1="{sx}" y1="{sy-3}" x2="{sx}" y2="{sy+3}" stroke="rgba(147,161,161,0.5)" stroke-width="1.4"/>'

            for sx in (x + 12, x + SOCKET_W - 12) for sy in (y + 12, y + SOCKET_H - 12))

        # Бумажный шильдик: партномер, штрих-код и предупреждение про рычаг.

        # На живом радиаторе он занимает треть верхней плоскости.

        lx, ly, lw, lh = x + 34, y + 30, SOCKET_W - 68, 56

        # Бумага держится на 0.5: непрозрачный шильдик на тёмном радиаторе бил в

        # глаза сильнее подписей ссылок, а он всего лишь фон.

        tag = (f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="2" fill="#cfc9b6" fill-opacity="0.5"/>'

               + ''.join(f'<rect x="{lx+8+k*3}" y="{ly+7}" width="{1.6 if k % 3 else 2.6}" height="14" '

                         f'fill="rgba(10,20,23,0.62)"/>' for k in range(18))

               + f'<text x="{lx+lw-8}" y="{ly+18}" text-anchor="end" fill="rgba(10,20,23,0.66)" '

                 f'font-family="ui-monospace, Menlo, monospace" font-size="7">P/N 41Y9033</text>'

               + f'<text x="{lx+lw/2}" y="{ly+36}" text-anchor="middle" fill="rgba(10,20,23,0.58)" '

                 f'font-family="ui-monospace, Menlo, monospace" font-size="6">PUSH WHILE ROTATING LEVER</text>'

               + f'<text x="{lx+lw/2}" y="{ly+48}" text-anchor="middle" fill="rgba(10,20,23,0.4)" '

                 f'font-family="ui-monospace, Menlo, monospace" font-size="6">MADE IN A CONTAINER</text>')

        return (f'<g class="pick-body heatsink"><rect x="{x}" y="{y}" width="{SOCKET_W}" height="{SOCKET_H}" rx="6" '

                f'fill="#26333a" stroke="rgba(147,161,161,0.38)"/>{fins}{tag}{screws}</g>')



    def ilm(x, y):

        """Прижимная скоба сокета: она приклёпана к плате и радиатор не уносит.

    Одна штанга вдоль края, загнутый конец и полукруглая ручка — за неё
    рычаг откидывают. Ручка помечена цветом, как всё, что трогают руками.
    """

        bx, by = x - 14, y + SOCKET_H - 22

        # Штанга вдоль края, поворот влево и загиб внутрь — рычаг заканчивается

        # крючком, который заводят под зацеп. Цветом помечен только сам крючок:

        # это и есть место, за которое берутся.

        stem = f'M{bx} {y+8} V{by}'

        hook = f'M{bx} {by} v5 q0 8 -8 8 q-9 0 -9 -8 v-6'

        return (f'<g class="ilm">'

                f'<path d="{stem}" fill="none" stroke="rgba(147,161,161,0.5)" '

                f'stroke-width="4" stroke-linecap="round"/>'

                f'<path d="{hook}" fill="none" stroke="#cb4b16" stroke-width="4.2" stroke-linecap="butt"/>'

                f'<path d="{hook}" fill="none" stroke="rgba(238,232,213,0.32)" stroke-width="1.3"/>'

                f'<circle cx="{bx}" cy="{y+8}" r="5" fill="#101a1e" stroke="rgba(147,161,161,0.45)" stroke-width="1.6"/>'

                f'</g>')



    cv.callouts.append((X_TAG - 6, Y_CPU0 + 40, X_CORE + 40, Y_CPU0 + 40, "CV", "end", "https://cv.cosmdandy.dev", "cpu"))



    cv.add(stamp(X_CORE + 40, Y_CPU0 - 8, "процессоры"))



    # Градиент кристалла и обрезка по крышкам процессоров. Наискось, из левого

    # нижнего угла в правый верхний: по прямой он читался как полоса засветки,

    # а не как игра на полированном кремнии.

    cv.add('<defs>\n'

        '  <linearGradient id="die-shine" x1="0" y1="1" x2="1" y2="0">\n'

        '    <stop offset="0%"   stop-color="#ff3264" stop-opacity="0"/>\n'

        '    <stop offset="22%"  stop-color="#ff3264" stop-opacity="0.55"/>\n'

        '    <stop offset="50%"  stop-color="#7828dc" stop-opacity="0.55"/>\n'

        '    <stop offset="78%"  stop-color="#00dcff" stop-opacity="0.55"/>\n'

        '    <stop offset="100%" stop-color="#00dcff" stop-opacity="0"/>\n'

        '  </linearGradient>\n'

        + ''.join(f'  <clipPath id="die-clip-{n}"><path d="{ihs_path(X_SOCK, y)}"/></clipPath>\n'

                  for n, y in enumerate((Y_CPU0, Y_CPU1)))

        + '</defs>')



    for n, (y, label_y) in enumerate(((Y_CPU0, 246), (Y_CPU1, 616))):

        # Подпись — справа сверху, лампа — справа снизу: так они не спорят с

        # шелкографией банков и видны, даже когда радиатор снят.

        cv.add(f'''<g class="unit" data-unit="cpu{n}" data-group="cpu" data-href="https://cv.cosmdandy.dev">
      {hit(X_SOCK-6, y-6, SOCKET_W+58, SOCKET_H+12)}
      {ilm(X_SOCK, y)}
      <g class="pick cpu-slot" data-cpu="{n}">
        {socket(X_SOCK, y)}{die(X_SOCK, y, n)}{heatsink(X_SOCK, y)}
        {fault(X_SOCK+SOCKET_W+16, y+SOCKET_H-10, 5)}
        {silk_inverse(X_SOCK+SOCKET_W+26, y+SOCKET_H-18, f'CPU{n} ERROR', 6)}
      </g>
      {mono(X_SOCK+SOCKET_W+6, y+10, f"CPU{n}", 9, anchor="start", op=0.5)}
    </g>''')


