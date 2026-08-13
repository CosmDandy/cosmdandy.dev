"""backplane: the board the drives plug into, and the harness that feeds it.

It stands across the chassis right behind the cage: on one side eight U.2
sockets the caddies land in, on the other the cable exits. Nothing on it is
decoration — a backplane without a harness is a board that cannot work, and
that is exactly what stood here before: a strip of laminate with eight dark
rectangles on it.

The harness is drawn by this block and by no other, and that is what makes it
behave like a cable. Everything that comes later in the build order covers it:
the fan wall it passes under, the memory it runs beneath, the service column it
ends in. So the ribbon shows up where a real one shows up — in the channel, in
the gaps of the fan wall, in the lanes between the banks — and disappears under
whatever is bolted on top of it.
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (150, 0, 720, 855)

from board.geom import (
    BAY_N,
    BAY_TOP,
    H,
    SAS_H,
    SAS_W,
    X_BP,
    X_FAN,
    X_SAS,
    fan_gaps,
)
from board.ink import mono, silk_boxed
from board.metal import pad, relief
from board.palette import SILVER_DIM
from board.revision import stamp

# Золочение контактов. Тот же цвет, что у служебных разъёмов: покрытие на плате
# одно, и разъезжаться ему незачем.
GOLD = "#cea83a"

BP_W = 18         # толщина платы бэкплейна
BP_X1 = X_BP + BP_W

# Куда идут шлейфы. Три жгута, и высоты у них не выдуманы: это середины трёх
# просветов стены вентиляторов — единственных мест, где с той стороны стены
# можно попасть на эту. Просветы там не ради проводов, но раз они там есть,
# провод пойдёт через них, а не сквозь металл.
GAPS = fan_gaps()


def u2_socket(x, y, w, h):
    """Гнездо накопителя: корпус, ключ и золочёный гребень.

    Ключ не по центру, а со сдвигом: разъём U.2 несимметричен, и каддик,
    поднесённый не той стороной, в него не входит — это видно и сверху.
    """
    out = [(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#08110f" '
            f'stroke="rgba(147,161,161,0.30)" stroke-width="0.8"/>')]
    # Гребень контактов двумя группами, между ними ключ. Шаг считается от
    # высоты корпуса, а не назначается числом: при шаге в 2.6 девять контактов
    # второй группы уходили на четыре единицы ниже дна разъёма — гребёнка
    # торчала из корпуса, чего у разъёма не бывает.
    top, bot = y + 4, y + h - 4
    step = (bot - top - 4) / 16
    at = top
    for n in (7, 9):
        for _k in range(n):
            out.append(f'<rect x="{x + 3.4}" y="{at:.1f}" width="{w - 6.8}" '
                       f'height="{step * 0.62:.2f}" rx="0.3" fill="{GOLD}" '
                       f'fill-opacity="0.62"/>')
            at += step
        if n == 7:
            # Ключ — разрыв в гребёнке, и он же говорит, какой стороной входит
            # каддик: разъём U.2 несимметричен.
            out.append(f'<rect x="{x + 2}" y="{at:.1f}" width="{w - 4}" height="3.2" '
                       f'rx="0.8" fill="#04090a"/>')
            at += 4
    return ''.join(out)


def blade(x, y, w, h, n):
    """Силовая колодка: широкие ножи, а не штырьки. Через неё бэкплейн питается."""
    out = [(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.2" fill="#12181c" '
            f'stroke="rgba(147,161,161,0.34)" stroke-width="0.9"/>')]
    step = (h - 4) / n
    for k in range(n):
        out.append(f'<rect x="{x + 2}" y="{y + 2 + k * step:.1f}" width="{w - 4}" '
                   f'height="{step * 0.6:.1f}" rx="0.5" fill="{GOLD}" fill-opacity="0.7"/>')
    return ''.join(out)


def header(x, y, cols, rows=2):
    """Гребёнка sideband: по ней бэкплейн рассказывает контроллеру, что в нём стоит."""
    out = [(f'<rect x="{x}" y="{y}" width="{rows * 4 + 2}" height="{cols * 4 + 2}" rx="0.8" '
            f'fill="#0a1215" stroke="rgba(147,161,161,0.30)" stroke-width="0.7"/>')]
    for c in range(cols):
        for r in range(rows):
            out.append(f'<rect x="{x + 1.6 + r * 4}" y="{y + 1.6 + c * 4}" width="2" '
                       f'height="2" rx="0.4" fill="{GOLD}" fill-opacity="0.6"/>')
    return ''.join(out)


def soic(x, y, w, h, text):
    """Расширитель бэкплейна: он и опрашивает отсеки, и зажигает лампы каддиков."""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1" fill="#0b1013" '
            f'stroke="rgba(147,161,161,0.34)" stroke-width="0.8"/>'
            + ''.join(f'<rect x="{x - 1.6}" y="{y + 2 + k * 4:.1f}" width="1.6" height="2" '
                      f'fill="{SILVER_DIM}"/>'
                      f'<rect x="{x + w}" y="{y + 2 + k * 4:.1f}" width="1.6" height="2" '
                      f'fill="{SILVER_DIM}"/>' for k in range(int((h - 4) // 4)))
            + f'<circle cx="{x + 2.6}" cy="{y + 2.6}" r="0.8" fill="rgba(147,161,161,0.5)"/>'
            + mono(x + w / 2, y + h / 2 + 2, text, 4.2, op=0.34))


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

def exit_conn(x, y):
    """Разъём шлейфа на кромке бэкплейна: отсюда жгут уходит к плате."""
    return (f'<rect x="{x}" y="{y - 9}" width="12" height="18" rx="1.4" fill="#0d1417" '
            f'stroke="rgba(147,161,161,0.38)" stroke-width="0.9"/>'
            + ''.join(f'<line x1="{x + 2.5 + k * 2.4:.1f}" y1="{y - 6}" '
                      f'x2="{x + 2.5 + k * 2.4:.1f}" y2="{y + 6}" '
                      f'stroke="rgba(147,161,161,0.24)"/>' for k in range(4)))


def ribbon(x0, y0, pts, w=5.2):
    """Плоский шлейф: широкая тёмная лента и две жилы поверх неё.

    Ленту ведёт одна кривая на все точки — так у неё нет изломов на стыках,
    которых у плоского шлейфа не бывает: он гнётся всей шириной сразу.
    """
    d = f'M{x0} {y0}'
    for (cx1, cy1, cx2, cy2, px, py) in pts:
        d += f' C{cx1} {cy1}, {cx2} {cy2}, {px} {py}'
    return (f'<path d="{d}" fill="none" stroke="#151a1c" stroke-opacity="0.92" '
            f'stroke-width="{w}" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="rgba(190,182,160,0.30)" '
            f'stroke-width="{w - 2.6}" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="rgba(120,128,120,0.35)" stroke-width="0.7"/>')


def render(cv):
    # Плата бэкплейна стоит поперёк корпуса во всю его высоту.
    cv.busy(X_BP, 8, BP_W, H - 16, pad=0)
    bp = [(f'<rect x="{X_BP}" y="8" width="{BP_W}" height="{H - 16}" rx="0" fill="#0e3a40" '
           f'stroke="rgba(133,153,0,0.24)"/>')]

    # ── Гнёзда накопителей ────────────────────────────────────────────────
    step = (H - 12 - BAY_TOP - 70) / BAY_N
    for i in range(BAY_N):
        y = BAY_TOP + 30 + i * step
        bp.append(u2_socket(X_BP + 3, y, 12, 46))
        bp.append(mono(X_BP + 9, y - 3, f'J{i + 1}', 4, op=0.36))

    # ── Питание, sideband и расширитель ───────────────────────────────────
    # Питание приходит снизу, к дальнему от кромки краю: там и на живой корзине
    # стоит силовая колодка, подальше от сигнальных шлейфов.
    bp.append(blade(X_BP + 2, H - 74, 14, 44, 6))
    bp.append(mono(X_BP + 9, H - 80, 'P1', 4.4, op=0.4))
    bp.append(header(X_BP + 4, 34, 5))
    bp.append(mono(X_BP + 9, 26, 'J9', 4, op=0.36))
    bp.append(soic(X_BP + 4, 96, 11, 26, 'PCA'))
    # Партномер набит вдоль платы, у расширителя. Поперёк он в восемнадцать
    # единиц толщины не влезал вовсе — строка уходила за кромку в обе стороны,
    # — и стоял снизу, где его никто не ищет: на живой корзине набивку кладут
    # рядом с тем, что она называет.
    bp.append(f'<g transform="rotate(90 {X_BP + 12} 134)">'
              + stamp(X_BP + 12, 134, "бэкплейн") + '</g>')

    # ── Выводы шлейфов ────────────────────────────────────────────────────
    for k, gy in enumerate(GAPS):
        bp.append(exit_conn(BP_X1 - 12, gy))
        bp.append(mono(X_BP + 9, gy + 16, f'P{k + 2}', 4, op=0.36))
    cv.add('<g class="decor">' + ''.join(bp) + '</g>')

    # ── Порты SlimSAS и жгуты ─────────────────────────────────────────────
    # Порт стоит против своего просвета, шлейф идёт из просвета в порт — всё
    # расстояние от корзины до платы двадцать четыре единицы канала плюс
    # толщина стены. Ради этого разъёмы сюда и переехали: жгут, протянутый
    # через плату поверх процессоров, был бы единственной деталью машины,
    # которой в машине быть не может.
    ports, harness = [], []
    for k, gy in enumerate(GAPS):
        py = gy - SAS_H / 2
        ports.append(slimsas_port(X_SAS, py, SAS_W, SAS_H))
        cv.busy(X_SAS, py, SAS_W, SAS_H)
        cv.refdes(X_SAS, py, SAS_W, SAS_H, f'J3{k}')
        # Лента провисает: жгут не натянут струной, его укладывают с запасом,
        # иначе разъём тянет за собой при первом же движении корзины.
        sag = 7 if k else -7
        harness.append(ribbon(BP_X1, gy, (
            ((BP_X1 + X_SAS) / 2 - 14, gy + sag, (BP_X1 + X_SAS) / 2 + 14, gy + sag,
             X_SAS + 2, gy),
        )))
    cv.add('<g class="decor">' + ''.join(ports) + '</g>')
    cv.add('<g class="decor harness">' + ''.join(harness) + '</g>')
    cv.add('<g class="decor">'
           + silk_boxed(X_SAS + SAS_W / 2, GAPS[1] + SAS_H / 2 + 9, "SLIMSAS → BP", 5)
           + '</g>')

    # Подпись у кромки: по ней в сервисе находят, куда идут шлейфы.
    cv.add('<g class="decor">' + silk_boxed(X_BP + 9, BAY_TOP + 12, "BP", 5) + '</g>')
