"""разводка.

Плата одного тона выглядит крашеной доской. На живой её тон рвут дорожки:
медь под маской просвечивает иначе, чем текстолит. Держим их еле заметными
— это фактура, а не рисунок: разводка, которую видно, спорит и с деталями,
и с подписями ссылок.

Пучки идут не по кривой, а ступенькой — прямо, скос ровно в 45°, снова
прямо. И идут они между настоящими узлами: от колодок вентиляторов к
питанию ядра, от сокетов к банкам памяти, от коммутатора линий к райзерам.
Разводка «из ниоткуда в никуда» читается как штриховка, а не как плата.

Калибра три, и они означают разное. Магистраль — межпроцессорная шина и
линии PCIe: широкий пучок, по ширине в две трети сокета. Средние — питание
и периферия. Тонкие — короткие связки от магистрали к своей обвязке.

Слой лежит под всем остальным: на живой плате дорожки уходят под корпуса,
а не обходят их поверху, поэтому BUSY здесь не спрашивается.
"""

from itertools import pairwise

from board.canvas import COPPER
from board.geom import (
    BANK_N,
    CHIPS,
    FAN_N,
    PITCH,
    SOCKET_H,
    SOCKET_W,
    X_CORE,
    X_PCB,
    X_PCB_END,
    X_REAR,
    X_SOCK,
    X_SVC,
    X_VRM,
    Y_BANK_C,
    Y_BANK_L,
    Y_BANK_R,
    Y_CPU0,
    Y_CPU1,
    fan_foot_y,
)

BANK_H = BANK_N * PITCH


def spine(ax, ay, bx, by, vertical):
    """Ломаная центральной дорожки пучка — те же изломы, что рисует bundle.

    Шина без бокового сноса идёт прямо, и излома у неё нет вовсе: точка
    посередине только делила бы отрезок надвое двумя одинаковыми записями.
    """
    if vertical:
        d = bx - ax
        if not d:
            return [(ax, ay), (ax, by)]
        my = ay + (by - ay) * 0.38
        return [(ax, ay), (ax, my), (ax + d, my + abs(d)), (ax + d, by)]
    d = by - ay
    if not d:
        return [(ax, ay), (bx, ay)]
    mx = ax + (bx - ax) * 0.38
    step = abs(d) if bx >= ax else -abs(d)
    return [(ax, ay), (mx, ay), (mx + step, by), (bx, by)]


def span_rects(pts, span, vertical):
    """Прямоугольники вдоль ломаной, а не габарит вокруг неё.

    Пучок помечался одним прямоугольником по своим концам, причём с `min()`
    по обеим осям — то есть лентой у начала шины, которая до её конца не
    доходила вовсе: скос не покрывался никак, а перепад в двести единиц
    оставался вне разметки.

    Осевое звено пишется одним прямоугольником, скос — лестницей из звеньев
    длиной в ширину пучка. Мельче дробить смысла нет: у каждого звена свои
    поля, и на коротких кусках они начинают стоить больше, чем экономит
    точность.

    Отступ у скоса даётся только по той оси, вдоль которой разнесены сами
    проводники: у горизонтального пучка они смещены по вертикали, у
    вертикального — по горизонтали, и на скосе это остаётся ровно так же —
    bundle() прибавляет смещение к концам, а не к нормали. Отступ по обеим
    осям сразу и шире нужного, и уже: на стыке осевого звена со скосом
    крайний проводник выходил из разметки на три единицы.
    """
    half = span / 2
    out = []
    for (x0, y0), (x1, y1) in pairwise(pts):
        dx, dy = x1 - x0, y1 - y0
        if not dx and not dy:
            continue
        # Снос проводников: по x у вертикального пучка, по y у горизонтального.
        gx, gy = (half, 0) if vertical else (0, half)
        if not dx or not dy:
            out.append((min(x0, x1) - gx, min(y0, y1) - gy,
                        abs(dx) + gx * 2, abs(dy) + gy * 2))
            continue
        n = max(1, min(12, round(max(abs(dx), abs(dy)) / max(span, 8))))
        for k in range(n):
            sx0, sy0 = x0 + dx * k / n, y0 + dy * k / n
            sx1, sy1 = x0 + dx * (k + 1) / n, y0 + dy * (k + 1) / n
            out.append((min(sx0, sx1) - gx, min(sy0, sy1) - gy,
                        abs(sx1 - sx0) + gx * 2, abs(sy1 - sy0) + gy * 2))
    return out


def render(cv):
    TIERS = {                       # тон и толщина по калибру шины
        'trunk': ("rgba(52,170,178,0.17)", 2.4),
        'mid':   ("rgba(44,150,160,0.15)", 1.3),
        'fine':  ("rgba(38,132,142,0.13)", 0.8),
    }

    def bundle(x0, y0, x1, y1, n=6, pitch=4, vertical=False):
        """Пучок параллельных дорожек со скосом в 45° посередине.

    Возвращает пути и точки, где пучок ломается: на изломах разводки и
    сидят переходные отверстия — там дорожка меняет слой.
    """
        paths, knots = [], []
        for k in range(n):
            off = (k - (n - 1) / 2) * pitch
            if vertical:
                ax, ay, bx, by = x0 + off, y0, x1 + off, y1
                d = bx - ax
                my = ay + (by - ay) * 0.38
                paths.append(f'M{ax:.0f} {ay:.0f} V{my:.0f} '
                             f'L{ax + d:.0f} {my + abs(d):.0f} V{by:.0f}')
                if k % 3 == 0:
                    knots.append((ax, my))
                    knots.append((ax + d, my + abs(d)))
            else:
                ax, ay, bx, by = x0, y0 + off, x1, y1 + off
                d = by - ay
                mx = ax + (bx - ax) * 0.38
                # Скос идёт туда же, куда и сам пучок. Пока все шины шли слева
                # направо, знак был не нужен; на шине, идущей справа налево,
                # скос без него уводит дорожку обратно вперёд, и она возвращается
                # петлёй — а на плате дорожка так не ходит.
                step = abs(d) if bx >= ax else -abs(d)
                paths.append(f'M{ax:.0f} {ay:.0f} H{mx:.0f} '
                             f'L{mx + step:.0f} {by:.0f} H{bx:.0f}')
                if k % 3 == 0:
                    knots.append((mx, ay))
                    knots.append((mx + step, by))
        return paths, knots

    chip = {name: (x, y, w, h) for name, _sub, x, y, w, h in CHIPS}

    def right_of(name, dy=0):
        """Точка выхода шины из корпуса — от правого борта, к центру платы."""
        x, y, w, h = chip[name]
        return x + w, y + h / 2 + dy

    def left_of(name, dy=0):
        """То же от левого борта: у корпуса, стоящего у задней стенки, всё, с
        чем он разговаривает, лежит левее, и шина обязана выходить с той
        стороны, в которую идёт."""
        x, y, _w, h = chip[name]
        return x, y + h / 2 + dy

    LINKS = []
    # Межпроцессорная шина: самая широкая на плате. Ширина пучка — две трети
    # сокета, ровно как выглядит UPI между двумя LGA на живой машине.
    LINKS.append((X_SOCK + SOCKET_W / 2, Y_CPU0 + SOCKET_H, X_SOCK + SOCKET_W / 2, Y_CPU1,
                  25, 4, 'trunk', True))
    # Сокет — свои банки: каждый процессор держит два банка, ближний и средний.
    for cy, by, bx in ((Y_CPU0, Y_BANK_L + BANK_H, X_CORE + 70),
                       (Y_CPU0 + SOCKET_H, Y_BANK_C, X_CORE + 120),
                       (Y_CPU1, Y_BANK_C + BANK_H, X_CORE + 180),
                       (Y_CPU1 + SOCKET_H, Y_BANK_R, X_CORE + 230)):
        LINKS.append((bx, min(cy, by), bx, max(cy, by), 13, 4, 'trunk', True))
    # Питание и тахометры вентиляторов: своя шина от каждой колодки к VRM того
    # сокета, который этот модуль продувает.
    for i in range(FAN_N):
        fy = fan_foot_y(i) + 8
        LINKS.append((X_PCB + 22, fy, X_VRM - 26, (Y_CPU0 if i < 4 else Y_CPU1) + 20 + (i % 4) * 30,
                      6, 3.0, 'mid', False))
    # Коммутатор линий — райзеры: две широкие шины PCIe в карман между блоками
    # питания. Это второй по калибру пучок после межпроцессорной шины.
    for ty, n in ((250, 16), (500, 12)):
        LINKS.append((right_of('PCIe SW')[0], right_of('PCIe SW')[1], X_REAR + 60, ty,
                      n, 3.6, 'trunk', False))
    # Коммутатор берёт линии у обоих сокетов
    for cy in (Y_CPU0 + SOCKET_H - 30, Y_CPU1 + 30):
        LINKS.append((right_of('PCIe SW')[0], right_of('PCIe SW')[1], X_CORE - 26, cy,
                      9, 3.2, 'mid', False))
    # Сетевой контроллер сидит у первого сокета: линии от коммутатора приходят
    # к нему, а от него шина уходит через всю плату к гнёздам задней панели.
    LINKS.append((*right_of('PCIe SW', 24), *left_of('X710'), 8, 3.2, 'mid', False))
    # Шина от контроллера идёт не в пустоту у стенки, а в гигабитный PHY: между
    # ними MII, и на плате это одна из немногих цепей, которую видно целиком.
    LINKS.append((*right_of('X710'), *left_of('BCM54210'), 7, 3.0, 'mid', False))
    # BMC — служебная зона и оба сокета: он опрашивает всё, поэтому шин у него
    # много, но узких. Стоит он у задней стенки, и всё, что он опрашивает,
    # лежит левее — поэтому шины выходят из левого борта.
    LINKS.append((*left_of('AST2600'), X_SVC + 20, 190, 7, 3.0, 'mid', False))
    for cy in (Y_CPU0 + 40, Y_CPU1 + 100):
        LINKS.append((*left_of('AST2600', 10), X_CORE - 30, cy, 5, 2.8, 'fine', False))
    # Чипсет — сокет и служебная зона
    LINKS.append((*right_of('PCH C741'), X_CORE - 30, Y_CPU0 + 70, 11, 3.2, 'mid', False))
    LINKS.append((*right_of('PCH C741', 12), X_SVC + 20, 300, 6, 3.0, 'fine', False))
    # Логика питания — к дросселям обоих сокетов и к TPM
    for cy in (Y_CPU0 + 120, Y_CPU1 + 60):
        LINKS.append((*right_of('CPLD'), X_VRM - 30, cy, 5, 3.0, 'fine', False))
    LINKS.append((*right_of('TPM 2.0'), X_SVC + 20, 620, 5, 3.0, 'fine', False))
    # служебная зона — задняя панель и карман райзеров
    for sy, ty in ((170, 300), (330, 430), (470, 560), (640, 620)):
        LINKS.append((X_SVC + 30, sy, X_REAR + 80, ty, 8, 3.2, 'mid', False))
    for sy, ty in ((250, 300), (420, 380), (560, 610)):
        LINKS.append((X_REAR + 20, sy, X_PCB_END - 20, ty, 7, 3.4, 'mid', False))
    # гребёнки вдоль кромок — шины земли и питания
    LINKS.append((X_PCB + 12, 40, X_PCB + 12, 800, 5, 3.0, 'trunk', True))
    LINKS.append((X_REAR - 16, 40, X_REAR - 16, 800, 5, 3.0, 'trunk', True))

    tiers = {k: [] for k in TIERS}
    knots = []
    for ax, ay, bx, by, n, pitch, tier, vert in LINKS:
        paths, kn = bundle(ax, ay, bx, by, n, pitch, vert)
        tiers[tier].extend(paths)
        knots.extend(kn)
        # Магистраль отмечается в регистре как медь. Никому она не мешает —
        # поверх дорожек ставят и детали, и краску, — но пока её там не было,
        # регистр знал о плате только то, где стоят корпуса, и показать, как
        # разведена машина, было нечем. Ширина пучка — число проводников на
        # шаг между ними, а отмечается шина звеньями вдоль своего пути.
        for rx, ry, rw, rh in span_rects(spine(ax, ay, bx, by, vert), n * pitch, vert):
            cv.busy(rx, ry, rw, rh, pad=0, kind=COPPER)

    # Одиночные длинные трассы: не всё на плате идёт пучком, часть цепей
    # тянется через полплаты сама по себе. Они и разбивают регулярность
    # пучков, из-за которой разводка читалась штриховкой.
    for i, (ax, ay, bx, by) in enumerate((
            (X_PCB + 30, 60, X_SVC + 40, 120),
            (X_PCB + 30, 806, X_SVC + 40, 740),
            (X_CORE - 40, 26, X_REAR - 30, 96),
            (X_CORE - 40, 838, X_REAR - 30, 770),
            (X_PCB + 40, 430, X_REAR - 40, 430))):
        paths, kn = bundle(ax, ay, bx, by, 1 + i % 2, 5, False)
        tiers['mid'].extend(paths)
        knots.extend(kn)

    # Тонкая мелочь: короткие связки от магистрали к ближайшей детали. Их много
    # и они узкие — именно они дают плате зернистость вблизи.
    for i in range(150):
        kx, ky = knots[(i * 7) % len(knots)]
        dx = (16 + (i % 5) * 11) * (1 if i % 3 else -1)
        dy = (12 + (i % 4) * 9) * (1 if i % 2 else -1)
        paths, kn = bundle(kx, ky, kx + dx, ky + dy, 2 + i % 3, 2.6, i % 5 == 4)
        tiers['fine'].extend(paths)
        if i % 4 == 0:
            knots.extend(kn)

    cv.add('<g class="decor traces" clip-path="url(#pcb-clip)" fill="none">'
        + ''.join(f'<path d="{" ".join(tiers[t])}" stroke="{c}" stroke-width="{w}"/>'
                  for t, (c, w) in TIERS.items() if tiers[t])
        + '</g>')
    # Узлы разводки — то, на что опираются переходные отверстия: медь
    # затягивают там, где дорожки меняют слой, а не в случайных точках.
    cv.share['knots'] = knots
