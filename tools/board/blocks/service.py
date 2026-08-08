"""service zone.

service zone
"""

# Own rectangle: the build checks that the block did not leave it.
# Рамка сдвинута влево на семнадцать единиц: переключатель сервиса поставлен по
# числам владельца, x=825, и его зона нажатия начинается на 821. Это тот случай,
# когда двигать надо рамку, а не фигуру: место у детали назначено снаружи, а
# рамка лишь описывает, сколько блок занимает.
BOUNDS = (821, 98, 187, 740)

from board.geom import LID_BTN, SVC_SW, X_SVC
from board.ink import hit, mono, silk_boxed, silk_inverse
from board.palette import SILVER, SILVER_DIM, SILVER_LIT

# Позолота контакта. Тот же тон, что у ножей в слоте памяти: золото на плате
# одно, и разъём, нарисованный своим оттенком, читается чужой деталью.
GOLD = "#cea83a"


def dip_switch(x, y, n=4, on=(1, 3)):
    """A block of DIP switches: amber body, white sliders in their slots.

    on — numbers of the switches in the ON position, counting from one.
    """
    pitch, sw_w, sw_h = 8, 5, 14
    pad_x, pad_y, label_h = 5, 4, 7
    body_w = pad_x * 2 + n * pitch - (pitch - sw_w)
    body_h = label_h + pad_y * 2 + sw_h
    parts = [
        f'<rect x="{x}" y="{y}" width="{body_w}" height="{body_h}" rx="2" '
        f'fill="#c9a06a" stroke="#7a5a34" stroke-width="1"/>',
        f'<rect x="{x+2.5}" y="{y+2.5}" width="{body_w-5}" height="{body_h-5}" rx="1.5" '
        f'fill="none" stroke="rgba(122,90,52,0.4)" stroke-width="0.7"/>',
        f'<text x="{x+4}" y="{y+label_h}" fill="#3a2712" '
        f'font-family="ui-monospace, Menlo, monospace" font-size="4.5" font-weight="600">ON</text>',
    ]
    for i in range(n):
        cx = x + pad_x + i * pitch
        sy = y + label_h + pad_y
        parts.append(f'<rect x="{cx}" y="{sy}" width="{sw_w}" height="{sw_h}" rx="1.5" '
                     f'fill="#1b2429" stroke="rgba(147,161,161,0.30)" stroke-width="0.7"/>')
        is_on = (i + 1) in on
        slider_h = sw_h * 0.46
        slider_y = sy + (1.5 if is_on else sw_h - slider_h - 1.5)
        parts.append(f'<rect x="{cx+1}" y="{slider_y:.1f}" width="{sw_w-2}" height="{slider_h:.1f}" rx="1" '
                     f'fill="#e8e3d5" stroke="#8d979a" stroke-width="0.6"/>')
        parts.append(mono(cx + sw_w / 2, y + body_h - 1, str(i + 1), 4.5, op=0.4))
    return f'<g class="decor dip-switch">{"".join(parts)}</g>'
from board.metal import pad, relief


def jumper_table(x, y, title, rows):
    """Jumper legend table: frame, grid, contact positions.

    One like this is printed right on the laminate next to the jumper itself —
    it is how you tell primary from backup without opening the manual.
    """
    # Развёрнута во весь свободный столбец: кнопка крышки стояла прямо на ней и
    # держала легенду в размере, при котором её читать было нечем. Ширину всё
    # равно ограничивает марка вендора по правой кромке, поэтому растёт она
    # прежде всего вниз — строками и кеглем.
    col1_w, row_h, pad, title_h = 42, 24, 10, 22
    label_w = max(70, max((len(r[1]) for r in rows), default=0) * 8 * 0.6 + 12)
    body_w = max(col1_w + label_w, len(title) * 9 * 0.6 + 18)
    body_h = title_h + len(rows) * row_h + pad
    STROKE = 'rgba(232,227,213,0.55)'
    TEXT = 'rgba(232,227,213,0.62)'
    parts = [
        f'<rect x="{x}" y="{y}" width="{body_w:.1f}" height="{body_h}" rx="1" '
        f'fill="none" stroke="{STROKE}" stroke-width="1"/>',
        f'<text x="{x+body_w/2:.1f}" y="{y+title_h-7}" text-anchor="middle" fill="{TEXT}" '
        f'font-family="ui-monospace, Menlo, monospace" font-size="9" '
        f'font-weight="600" letter-spacing="0.02em">{title}</text>',
        f'<line x1="{x}" y1="{y+title_h}" x2="{x+body_w:.1f}" y2="{y+title_h}" '
        f'stroke="{STROKE}" stroke-width="0.8"/>',
        f'<line x1="{x+col1_w}" y1="{y+title_h}" x2="{x+col1_w}" y2="{y+body_h}" '
        f'stroke="{STROKE}" stroke-width="0.8"/>',
    ]
    for i, (pos, label) in enumerate(rows):
        ry = y + title_h + i * row_h
        if i:
            parts.append(f'<line x1="{x}" y1="{ry}" x2="{x+body_w:.1f}" y2="{ry}" '
                         f'stroke="{STROKE}" stroke-width="0.6" stroke-opacity="0.6"/>')
        parts.append(f'<text x="{x+col1_w/2}" y="{ry+row_h-7}" text-anchor="middle" fill="{TEXT}" '
                     f'font-family="ui-monospace, Menlo, monospace" font-size="8.5">{pos}</text>')
        parts.append(f'<text x="{x+col1_w+8}" y="{ry+row_h-7}" fill="{TEXT}" '
                     f'font-family="ui-monospace, Menlo, monospace" font-size="8.5">{label}</text>')
    return f'<g class="decor jumper-table">{"".join(parts)}</g>'


def power_conn(x, y, w=52, h=26, cols=4):
    """Силовой разъём 2×4: капролоновая рамка, гнёзда, нож в каждом.

    Гнёзда двух форм не для красоты — это ключ. У Mini-Fit Jr под +12 В
    гнездо квадратное, под землю со скруглёнными углами, и вилку иначе не
    посадишь. С экрана это первое, по чему разъём отличают от гребёнки
    данных: там гнёзда одинаковые и вчетверо мельче.
    """
    ix, iy, iw, ih = x + 2.4, y + 2.4, w - 4.8, h - 4.8
    gap = 1.6
    bw, bh = (iw - (cols + 1) * gap) / cols, (ih - 3 * gap) / 2
    out = [(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="#161f24" '
            f'stroke="rgba(147,161,161,0.40)" stroke-width="1.2"/>'),
           (f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="1" fill="#0b1114" '
            f'stroke="rgba(0,0,0,0.45)" stroke-width="0.8"/>')]
    for r in range(2):
        for c in range(cols):
            bx = ix + gap + c * (bw + gap)
            by = iy + gap + r * (bh + gap)
            # Ряд у стенки с защёлкой — квадратный, дальний скруглён.
            out.append(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" '
                       f'rx="{0.4 if r else bh * 0.46:.1f}" fill="#05090b" '
                       f'stroke="rgba(0,0,0,0.5)" stroke-width="0.6"/>')
            # Нож виден не весь: гнездо глубокое, и наружу выходит только
            # облужённая верхушка.
            out.append(pad(bx + bw * 0.34, by + bh * 0.3, bw * 0.32, bh * 0.4, 0.3))
    # Защёлка на стенке: вилка держится ею, а не трением.
    out.append(f'<path d="M{x + w / 2 - 6} {y + h} v3.6 h12 v-3.6" fill="none" '
               f'stroke="rgba(147,161,161,0.42)" stroke-width="1.3"/>')
    out.append(f'<path d="M{x + w / 2 - 4} {y + h + 3.6} h8" stroke="rgba(223,232,234,0.20)" '
               f'stroke-width="0.9"/>')
    out.append(relief(x, y, w, h, 1.5))
    return ''.join(out)


def slimsas_port(x, y, w=42, h=26):
    """Гнездо SlimSAS x8 (SFF-8654) — к нему шлейфом приходит бэкплейн корзины.

    Диски в лоб не подключаются: они сидят в бэкплейне, а бэкплейн кабелем
    заходит сюда. Восемь отсеков U.2 NVMe требуют именно такого разъёма, и
    от SATA он отличается ровно тем, что глазу и надо показать: щель во всю
    ширину корпуса и частая гребёнка ножей вместо семи толстых.

    Ключ — не форма корпуса, а разрыв в гребёнке: он стоит не по центру, и
    вилка входит одной стороной.
    """
    # Стенки у такого разъёма тонкие: сверху он почти весь — щель, и лишний
    # запас пластика вокруг превращал его обратно в прямоугольник.
    sx, sw = x + 4, w - 8
    sy, sh = y + 7, 10
    pitch, key_at = sw / 21, 7            # разрыв на седьмом ноже — он и ключ
    out = [(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="#12191d" '
            f'stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>'),
           (f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="0.8" fill="#05090b" '
            f'stroke="rgba(0,0,0,0.5)" stroke-width="0.8"/>')]
    for k in range(21):
        if k == key_at:
            continue
        out.append(f'<rect x="{sx + 1 + k * pitch:.1f}" y="{sy+1.4}" width="{pitch-0.7:.1f}" '
                   f'height="{sh-2.8}" fill="{GOLD}" fill-opacity="0.68"/>')
    out.append(f'<rect x="{sx + 1 + key_at * pitch:.1f}" y="{sy+0.8}" width="{pitch-0.7:.1f}" '
               f'height="{sh-1.6}" rx="0.4" fill="#1c262b" '
               f'stroke="rgba(147,161,161,0.24)" stroke-width="0.4"/>')
    # Зацепы по торцам щели: вилку держат они, тянут её за язычок.
    for lx in (sx - 1.6, sx + sw - 0.4):
        out.append(f'<rect x="{lx:.1f}" y="{sy+2}" width="2" height="4" rx="0.6" '
                   f'fill="#1c262b" stroke="rgba(147,161,161,0.30)" stroke-width="0.5"/>')
    # Поясок отливки по низу корпуса — по нему разъём и садится на плату.
    out.append(f'<path d="M{x+4} {y+h-4.5} H{x+w-4}" stroke="rgba(223,232,234,0.14)" '
               f'stroke-width="1.1"/>')
    # Лапки, которыми корпус припаян: ими гнездо и держится, кабель выдёргивают
    # не глядя.
    for px in (x + 2, x + w - 8):
        out.append(pad(px, y + h - 3, 6, 3.4, 0.5))
    out.append(relief(x, y, w, h, 1.5))
    return ''.join(out)


def coin_cell(cx, cy, r=20):
    """CR2032 в держателе: обойма, лапка-прижим и сама таблетка.

    Батарейку на плате узнают по стальному кругу с плюсом, а не по тёмному
    кружку. Держим сталь приглушённой: круг крупный, и в полную силу он
    становится самым светлым пятном платы.
    """
    bx, by, bw, bh = cx - r - 6, cy - r - 4, (r + 6) * 2, r * 2 + 10
    out = [(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="3" fill="#12191d" '
            f'stroke="rgba(147,161,161,0.32)" stroke-width="1.1"/>')]
    # Выводы обоймы: держатель припаян двумя лапками, минус снизу.
    for px in (bx + 3, bx + bw - 11):
        out.append(pad(px, by + bh - 3.4, 8, 3.6, 0.6))
    # Стенка обоймы: она обхватывает таблетку сбоку и не даёт ей выйти вверх.
    out.append(f'<path d="M{cx + r * 0.5:.1f} {cy - r - 1:.1f} '
               f'a{r + 3} {r + 3} 0 0 1 0 {2 * r + 2}" fill="none" stroke="{SILVER_DIM}" '
               f'stroke-width="3.4" stroke-linecap="round"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#8f9ca1" fill-opacity="0.72" '
               f'stroke="rgba(10,20,23,0.45)" stroke-width="1"/>')
    # Завальцовка: кромку таблетки загибают на изолятор, и сверху она видна
    # кольцом чуть ниже краёв.
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r - 4}" fill="none" '
               f'stroke="rgba(10,20,23,0.26)" stroke-width="1.2"/>')
    out.append(f'<path d="M{cx - r * 0.72:.1f} {cy - r * 0.5:.1f} '
               f'a{r} {r} 0 0 1 {r * 0.62:.1f} -{r * 0.62:.1f}" fill="none" '
               f'stroke="{SILVER_LIT}" stroke-opacity="0.5" stroke-width="2"/>')
    # Прижимная лапка заходит на таблетку только краем: она держит, а не
    # закрывает — под ней должно остаться видно и плюс, и марку.
    out.append(f'<path d="M{bx + 2} {cy - r * 0.34:.1f} H{cx - r * 0.42:.1f} '
               f'a2.6 2.6 0 0 1 0 5.2 H{bx + 2} Z" fill="{SILVER}" fill-opacity="0.5" '
               f'stroke="rgba(10,20,23,0.4)" stroke-width="0.7"/>')
    out.append(f'<text x="{cx + r * 0.36:.1f}" y="{cy + r * 0.62:.1f}" text-anchor="middle" '
               f'fill="rgba(10,20,23,0.62)" font-family="ui-monospace, Menlo, monospace" '
               f'font-size="6">CR2032</text>')
    out.append(f'<path d="M{cx - r * 0.52:.1f} {cy + r * 0.42:.1f} h7 m-3.5 -3.5 v7" '
               f'stroke="rgba(10,20,23,0.62)" stroke-width="1.6"/>')
    out.append(relief(bx, by, bw, bh, 3))
    return ''.join(out)


def microsd_slot(x, y, w=66, h=22):
    """Гнездо microSD push-push: стальной кожух, щель и восемь ножей.

    Ножи видно через штампованное окно в кожухе — на живом гнезде оно есть,
    и это единственный ракурс сверху, в котором контакты вообще читаются.
    """
    out = [(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="#1b2429" '
            f'stroke="{SILVER_DIM}" stroke-width="1.1"/>'),
           # Щель, куда заходит карта: по верхней кромке, во всю ширину карты.
           (f'<rect x="{x+6}" y="{y-0.6}" width="{w-12}" height="3.4" rx="0.8" fill="#05090b" '
            f'stroke="rgba(0,0,0,0.5)" stroke-width="0.6"/>'),
           (f'<rect x="{x+8}" y="{y+6.5}" width="{w-16}" height="11" rx="1" fill="#070c0f" '
            f'stroke="rgba(0,0,0,0.5)" stroke-width="0.7"/>')]
    step = (w - 20) / 8
    for k in range(8):
        out.append(f'<rect x="{x + 10 + k * step:.1f}" y="{y+8}" width="{step - 1.8:.1f}" '
                   f'height="8" rx="0.4" fill="{GOLD}" fill-opacity="0.7"/>')
    # Штампованные лунки кожуха и пружина выброса вдоль правой стенки.
    for dx in (x + 4, x + w - 4):
        out.append(f'<circle cx="{dx}" cy="{y + h - 4}" r="1.4" fill="none" '
                   f'stroke="rgba(223,232,234,0.22)" stroke-width="0.8"/>')
    out.append(f'<path d="M{x + w - 3.4} {y+5} V{y + h - 5}" stroke="rgba(223,232,234,0.18)" '
               f'stroke-width="1"/>')
    # Кожух припаян лапками по углам — он же и держит гнездо на плате.
    for px in (x + 1, x + w - 9):
        out.append(pad(px, y + h - 2.4, 8, 3.4, 0.5))
    out.append(relief(x, y, w, h, 1.5))
    return ''.join(out)


def render(cv):
    # Номер по схеме объявляется там же, где стоит сам разъём, и одними и теми
    # же числами. Печатает его блок marks — он идёт в очереди почти последним и
    # только там известно, с какой стороны у гнезда осталось поле.
    #
    # Прежняя общая подпись «P1 / P2» на две колодки отсюда убрана: одна
    # надпись на два разъёма не отвечает на вопрос, какой из них какой, а
    # именно за этим номер и печатают.
    svc = []

    def unit(frag, x, y, w, h, ref=None):
        """Корпус на своём месте: рисуем, занимаем поле, объявляем номер.

        Три вещи одними и теми же числами. Полосу под служебную колонку
        держит `pcb_zones` бронью — она не пускает туда объём, — а вот краску
        от самого разъёма держит только эта отметка: под корпусом печатать
        нечего, надпись окажется скрыта им ещё на монтаже.
        """
        svc.append(frag)
        cv.busy(x, y, w, h)
        if ref:
            cv.refdes(x, y, w, h, ref)

    for px, ref in ((X_SVC + 12, "P1"), (X_SVC + 90, "P2")):
        unit(power_conn(px, 120), px, 120, 52, 26, ref)
    for i in range(3):
        px = X_SVC + 8 + i * 48
        unit(slimsas_port(px, 188), px, 188, 42, 26, f'J3{i}')
    svc.append(silk_inverse(X_SVC + 26, 226, "SLIMSAS → BP", 6))
    unit(coin_cell(X_SVC + 34, 300, 20), X_SVC + 8, 276, 52, 50, "BAT1")
    svc.append(silk_boxed(X_SVC + 34, 338, "CMOS", 7))
    unit(microsd_slot(X_SVC + 84, 288), X_SVC + 84, 288, 66, 22, "J14")
    svc.append(silk_boxed(X_SVC + 117, 324, "microSD", 7))
    # Switches and the jumper legend: what one goes under the cover for
    unit(dip_switch(X_SVC + 10, 396, 4, on=(1, 3)), X_SVC + 10, 396, 37, 25)
    svc.append(silk_boxed(X_SVC + 29, 436, "SW3", 6))
    unit(dip_switch(X_SVC + 66, 396, 4, on=(2,)), X_SVC + 66, 396, 37, 25)
    svc.append(silk_boxed(X_SVC + 85, 436, "SW4", 6))
    svc.append(jumper_table(X_SVC + 6, 466, "J29 BIOS BOOT FROM",
                            [("1-2", "PRIMARY BIOS"), ("2-3", "BACKUP BIOS")]))
    cv.busy(X_SVC + 6, 466, 150, 80)
    cv.add('<g class="decor">' + ''.join(svc) + '</g>')

    # Тумблер остался на своём месте и только подрос: он шире кнопки крышки, и
    # именно он задаёт ширину всей колонки. Слева её держит шелкография правого
    # банка памяти, справа — марка вендора по кромке; между ними ровно 114, а
    # прежние 110 тумблер брал, залезая на марку.
    #
    # Блик: выключенный тумблер — тёмный прямоугольник на тёмной плате, и его
    # приходилось искать глазом. Раз в несколько секунд по нему проходит
    # полоса — тот же приём, что у бирок-ссылок, только повторяющийся: там блик
    # представляет узел один раз, здесь — зовёт нажать, пока не нажали.
    # Место задано владельцем числами: x=825, y=570 при ширине 114. На прежних
    # 616 переключатель попадал ровно под бирки Twitter и Email, которые лежат
    # поверх всего. От X_SVC он теперь не считается: это точка, а не отступ.
    sx, sy, sw, sh = SVC_SW
    # Обе кнопки занимают своё место в реестре: рассыпуха и позиционные
    # обозначения кладутся туда, где свободно, а на кнопку им нельзя — она
    # непрозрачная, и всё, что нарисовано позже, ложится прямо на неё.
    cv.busy(sx - 4, sy - 10, sw + 8, sh + 52)
    cv.busy(LID_BTN[0] - 6, LID_BTN[1], LID_BTN[2] + 12, LID_BTN[2] + 6)
    cv.add(f'''<g class="svc-switch" id="svc-switch" role="button" tabindex="0" aria-label="Сервисный режим">
  {hit(sx-4, sy-10, sw+8, sh+52)}
  <rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="8" fill="#0f1619" stroke="rgba(147,161,161,0.32)"/>
  <rect class="svc-knob" x="{sx+6}" y="{sy+6}" width="50" height="{sh-12}" rx="5" fill="#22303655" stroke="rgba(147,161,161,0.42)"/>
  <linearGradient id="svc-shine-grad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%"   stop-color="#eee8d5" stop-opacity="0"/>
    <stop offset="35%"  stop-color="#eee8d5" stop-opacity="0.75"/>
    <stop offset="62%"  stop-color="#eee8d5" stop-opacity="0.85"/>
    <stop offset="100%" stop-color="#eee8d5" stop-opacity="0"/>
  </linearGradient>
  <clipPath id="svc-shine-clip"><rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="8"/></clipPath>
  <g clip-path="url(#svc-shine-clip)">
    <rect class="svc-shine" x="{sx}" y="{sy}" width="46" height="{sh}"/>
  </g>
  {mono(sx+sw/2, sy+74, "SERVICE", 11, op=0.6)}
  {mono(sx+sw/2, sy+90, "терминал и диагностика", 8, op=0.36)}
</g>''')

    # Кнопка крышки уехала под тумблер, к самому нижнему краю текстолита, и
    # выросла с 86 до 114 — до ширины тумблера. Наверху она стояла прямо на
    # легенде перемычек, а внизу лежал пустой текстолит. Рисунок тот же, только
    # пересчитан от стороны квадрата: ту же кнопку рисует и крышка, и разъезжаться
    # им нельзя.
    bx, by, bs = LID_BTN
    k = bs / 86
    cv.add(f'''<g class="lid-on-btn" id="lid-on" role="button" tabindex="0" aria-label="Надеть крышку">
  {hit(bx-6, by, bs+12, bs+6)}
  <rect x="{bx}" y="{by}" width="{bs}" height="{bs}" rx="4"
        fill="#141d22" stroke="rgba(147,161,161,0.38)" stroke-width="1.6"/>
  <path d="M{bx+26*k:.0f} {by+34*k:.0f} h{34*k:.0f} M{bx+43*k:.0f} {by+22*k:.0f} v{24*k:.0f} m{-8*k:.0f} {-8*k:.0f} l{8*k:.0f} {8*k:.0f} {8*k:.0f} {-8*k:.0f}"
        fill="none" stroke="rgba(147,161,161,0.5)" stroke-width="{2*k:.1f}"/>
  {mono(bx+43*k, by+66*k, "НАДЕТЬ", 9 * k, op=0.6)}
  {mono(bx+43*k, by+78*k, "КРЫШКУ", 9 * k, op=0.6)}
</g>''')
