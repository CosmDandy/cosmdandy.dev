"""процессоры.

процессоры
"""

import math

from board.geom import SOCKET_H, SOCKET_W, X_CORE, X_SOCK, X_TAG, Y_CPU0, Y_CPU1, seat
from board.ink import hit, mono, silk_boxed, silk_inverse
from board.lamps import fault
from board.metal import IHS_INSET, ihs_path, substrate_path
from board.palette import COLD
from board.revision import stamp
from board.spec import CPU, MADE


def render(cv):
    def socket(x, y, n):
        # Крышка процессора: лист металла со срезанным углом первого вывода.
        # Ни полукруглых вырезов по бокам, ни дырок в теле — на живой крышке
        # их нет, а срез один и он на текстолите подложки.
        # Крышка уже поля контактов на IHS_INSET с каждой стороны — те же
        # числа, что и в ihs_path: контур и то, что по нему рисуется, обязаны
        # считаться из одного места.
        ihs_x, ihs_y = x + 40 + IHS_INSET, y + 34 + IHS_INSET
        ihs_w, ihs_h = SOCKET_W - 80 - 2 * IHS_INSET, SOCKET_H - 68 - 2 * IHS_INSET
        cut = 10
        ihs = ihs_path(x, y)
        # Поле контактов: у LGA ножек на процессоре нет, они на сокете —
        # 4677 подпружиненных лепестков. Пока процессор на месте, поля не видно;
        # снимешь — и это самое узнаваемое место на плате. Всё поле рисуем одним
        # путём: отдельными фигурами это были бы тысячи узлов DOM.
        #
        # Поле отцентровано в держателе честно: считаем, сколько лепестков
        # помещается с шагом, и раскладываем их от середины. Раньше ряды шли от
        # левого верхнего угла, а остаток добирался справа и снизу — поле
        # сидело в рамке наискось.
        # Площадка сокета — по размеру текстолита подложки: она под него и
        # рассчитана, процессор ложится на неё всей подложкой, а не крышкой.
        # Значит и срезанный угол у неё тот же и там же.
        px0, py0 = x + 35, y + 29
        pw, ph = SOCKET_W - 70, SOCKET_H - 58
        step = 2.9
        # Само поле ножек — по кристаллу, а не по площадке: контакт идёт там,
        # где над ним крышка, и ряды за её габарит не выходят.
        cols, rows = int((ihs_w - 4) // step), int((ihs_h - 4) // step)
        ox = ihs_x + (ihs_w - (cols - 1) * step) / 2
        oy = ihs_y + (ihs_h - (rows - 1) * step) / 2
        dots = ' '.join(f'M{ox + c * step:.1f} {oy + r * step:.1f}h0.7'
                        for r in range(rows) for c in range(cols))
        # Держатель — часть сокета, а не процессора: рамка с направляющими
        # штырями приклёпана к плате и никуда не девается. Поэтому она рисуется
        # отдельно от поля контактов: поле видно только на снятом процессоре, а
        # рамку — всегда. Раньше они лежали в одной группе, и на собранной
        # машине держателя не было вовсе, а появлялся он вместе с процессором в
        # руках.
        holder = (f'<g class="ilm-frame">'
                  f'<rect x="{px0-4}" y="{py0-4}" width="{pw+8}" height="{ph+8}" rx="2" fill="none" '
                  f'stroke="rgba(147,161,161,0.40)" stroke-width="1.6"/>'
                  + ''.join(f'<circle cx="{px0 + gx}" cy="{py0 + gy}" r="2.6" fill="#1b2429" '
                            f'stroke="rgba(147,161,161,0.44)"/>'
                            for gx in (-8, pw + 8) for gy in (-8, ph + 8))
                  + '</g>')
        # Площадка со срезанным углом, как и подложка над ней: край у них общий,
        # и прямоугольная площадка под срезанной подложкой читалась двумя
        # разными деталями вместо одной пары.
        lga_cut = 10
        lga_d = (f'M{px0 + lga_cut} {py0} H{px0 + pw} V{py0 + ph} H{px0} '
                 f'V{py0 + lga_cut} Z')
        lga = (f'<g class="lga">'
               f'<path d="{lga_d}" fill="#0a1013" stroke="rgba(147,161,161,0.30)"/>'
               f'<path d="{dots}" stroke="rgba(212,175,84,0.66)" stroke-width="1.5" '
               f'stroke-linecap="round" fill="none"/>'
               + '</g>')

        s = [f'<rect x="{x}" y="{y}" width="{SOCKET_W}" height="{SOCKET_H}" rx="4" fill="#101a1e" stroke="rgba(147,161,161,0.42)"/>',
             f'<rect x="{x+14}" y="{y+14}" width="{SOCKET_W-28}" height="{SOCKET_H-28}" rx="2" fill="#0b1316" stroke="rgba(147,161,161,0.26)"/>',
             lga, holder,
             # Номера болтов — снаружи внутренней рамки и до самой крышки:
             # снятый процессор уезжает влево-вниз ровно на третий номер, и
             # цифра оказывалась поверх детали в руке.
             *[f'<circle cx="{x+dx}" cy="{y+dy}" r="4.5" fill="none" '
               f'stroke="rgba(147,161,161,0.28)" stroke-width="1.4"/>'
               + mono(x + dx, y + dy + 3, str(k + 1), 7, op=0.34)
               for k, (dx, dy) in enumerate([(7, 7), (SOCKET_W-7, 7),
                                             (7, SOCKET_H-7), (SOCKET_W-7, SOCKET_H-7)])],
             # Сам процессор — отдельная группа: он снимается вторым, после
             # радиатора, и уезжает вниз, открывая поле контактов.
             '<g class="cpu-lid">',
             # Текстолит подложки виден из-под крышки узкой каймой, и срез угла
             # у первого вывода — на нём.
             f'<path d="{substrate_path(x, y)}" fill="#10261f" stroke="rgba(133,153,0,0.26)"/>',
             f'<path d="{ihs}" fill="#16232a" stroke="rgba(42,161,152,0.30)"/>',
             # металл крышки: блик по верхней кромке, тень по нижней
             (f'<path d="M{ihs_x} {ihs_y} H{ihs_x + ihs_w}" fill="none" '
              f'stroke="rgba(223,232,234,0.28)" stroke-width="1.2"/>'),
             (f'<path d="M{ihs_x} {ihs_y + ihs_h} H{ihs_x + ihs_w}" fill="none" '
              f'stroke="rgba(0,0,0,0.40)" stroke-width="1.4"/>'),

             # Метки первого вывода тут больше нет — ни на процессоре, ни на
             # сокете ниже. Пара треугольников в углу гнезда мешала смотреть на
             # само гнездо: ключ у SP5 и так задан срезом угла подложки, и он
             # виден без указателей.
             # На живой крышке выбито, что за процессор под ней. Число ядер
             # раньше не было написано на плате нигде — консоль называла его
             # с потолка, и проверить её было нечем.
             mono(x + SOCKET_W/2, y + SOCKET_H/2 - 6, CPU['short'], 10, op=0.55),
             mono(x + SOCKET_W/2, y + SOCKET_H/2 + 8, f"{CPU['socket']} · {CPU['cores']}c/{CPU['threads']}t", 7, op=0.4),
             '</g>',

             # Надпись «вставлять сюда» — в нижней полосе держателя. Наверху она
             # ложилась прямо на поле контактов.
             # Без плашки и по середине полосы между площадкой и кромкой
             # гнезда: подложка под четырьмя буквами читалась ярлыком, а не
             # набивкой, а прижатая к нижней кромке надпись — обрезком.
             mono(x + SOCKET_W / 2, y + 29 + (SOCKET_H - 58) + (SOCKET_H - 29 - (SOCKET_H - 58)) / 2 + 2,
                  "INSTALL", 4.4, op=0.34)]
        return ''.join(s)

    def die(x, y, n):
        """Кристалл под радиатором: по нему наискось бежит цветной перелив.

    Тот же градиент, что на кнопке «скачать» в резюме. Полоса шире окна и
    ездит по диагонали, лишнее срезает clip по крышке процессора.
    """
        dx, dy = x + 40, y + 34
        return (f'<g class="die" clip-path="url(#die-clip-{n})">'
                # Полоса накрывает крышку целиком и с запасом на весь ход блика:
                # видна не она, а её градиент, у которого края сведены в ноль.
                # Пока она была уже крышки, из-под обрезки торчала её
                # собственная кромка — половина крышки цветная, половина нет.
                f'<rect class="die-shine" x="{x-24}" y="{y+24}" width="196" height="132" '
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
                 f'font-family="ui-monospace, Menlo, monospace" font-size="6">{MADE}</text>')
        return (f'<g class="pick-body heatsink"><rect x="{x}" y="{y}" width="{SOCKET_W}" height="{SOCKET_H}" rx="6" '
                f'fill="#26333a" stroke="rgba(147,161,161,0.38)"/>{fins}{tag}{screws}</g>')

    def ilm(x, y):
        """Прижимная скоба сокета: она приклёпана к плате и радиатор не уносит.

    Одна штанга вдоль края, загнутый конец и полукруглая ручка — за неё
    рычаг откидывают. Ручка голубая, а не терракотовая: по коду замены это
    значит «сначала обесточь». Процессор на горячую не меняют нигде.
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
                f'<path d="{hook}" fill="none" stroke="{COLD}" stroke-width="4.2" stroke-linecap="butt"/>'
                f'<path d="{hook}" fill="none" stroke="rgba(238,232,213,0.32)" stroke-width="1.3"/>'
                f'<circle cx="{bx}" cy="{y+8}" r="5" fill="#101a1e" stroke="rgba(147,161,161,0.45)" stroke-width="1.6"/>'
                f'</g>')

    cv.callouts.append((X_TAG - 44, Y_CPU0 - 44, X_CORE + 40, Y_CPU0 + 40, "CV", "end", "https://cv.cosmdandy.dev", "cpu",
                        "резюме", "cv"))

    cv.add(stamp(X_CORE + 40, Y_CPU0 - 8, "процессоры"))

    # Градиент кристалла и обрезка по крышкам процессоров. Наискось, из левого
    # нижнего угла в правый верхний: по прямой он читался как полоса засветки,
    # а не как игра на полированном кремнии.
    cv.add('<defs>\n'
        '  <linearGradient id="die-shine" x1="0" y1="1" x2="1" y2="0">\n'
        # Края сведены в ноль на трети длины с каждой стороны. Полоса теперь
        # шире крышки — иначе из-под обрезки торчала её собственная кромка, —
        # и «блик, а не заливка» держится не размером прямоугольника, а
        # прозрачностью его концов: по краям крышки виден сам металл.
        '    <stop offset="0%"   stop-color="#ff3264" stop-opacity="0"/>\n'
        '    <stop offset="32%"  stop-color="#ff3264" stop-opacity="0.50"/>\n'
        '    <stop offset="50%"  stop-color="#7828dc" stop-opacity="0.55"/>\n'
        '    <stop offset="68%"  stop-color="#00dcff" stop-opacity="0.50"/>\n'
        '    <stop offset="100%" stop-color="#00dcff" stop-opacity="0"/>\n'
        '  </linearGradient>\n'
        + ''.join(f'  <clipPath id="die-clip-{n}"><path d="{ihs_path(X_SOCK, y)}"/></clipPath>\n'
                  for n, y in enumerate((Y_CPU0, Y_CPU1)))
        + '</defs>')

    for n, (y, label_y) in enumerate(((Y_CPU0, 246), (Y_CPU1, 616))):
        # Гнездо занимает место — и это надо сказать вслух. Блок рисуется
        # последним, когда всё уже расставлено, и молчание сходило ему с рук:
        # никто после него места не просит. Но регистр — не только очередь, он
        # ещё и то, по чему сверяют бронь с фактом, и в нём двух самых крупных
        # узлов платы не было вовсе. Бронь под сокеты числилась пустой.
        cv.busy(X_SOCK, y, SOCKET_W, SOCKET_H, pad=0)
        # Подпись — справа сверху, лампа — справа снизу: так они не спорят с
        # шелкографией банков и видны, даже когда радиатор снят.
        #
        # Стоит она до самого гнезда, а не после: набивка на плате лежит под
        # деталью, а не поверх неё. Снятый радиатор уезжает вправо и накрывал
        # собой обозначение — деталь в руке оказывалась под краской.
        cv.add(f'''<g class="unit" data-unit="cpu{n}" data-group="cpu" data-href="https://cv.cosmdandy.dev">
      {hit(X_SOCK-6, y-6, SOCKET_W+58, SOCKET_H+12)}
      {ilm(X_SOCK, y)}
      {silk_boxed(X_SOCK+SOCKET_W+24, y+10, f"CPU{n}", 8)}
      <g class="pick cpu-slot" data-cpu="{n}" style="--seat:{seat('cpu', n)}">
        {socket(X_SOCK, y, n)}{die(X_SOCK, y, n)}{heatsink(X_SOCK, y)}
        {fault(X_SOCK+SOCKET_W+16, y+SOCKET_H-10, 5)}
        {silk_inverse(X_SOCK+SOCKET_W+26, y+SOCKET_H-18, f'CPU{n} ERROR', 6)}
      </g>
    </g>''')
