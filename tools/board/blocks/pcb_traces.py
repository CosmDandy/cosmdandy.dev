"""разводка.

Плата одного тона выглядит крашеной доской. На живой её тон рвут дорожки:
медь под маской просвечивает иначе, чем текстолит. Держим их еле заметными
— это фактура, а не рисунок: разводка, которую видно, спорит и с деталями,
и с подписями ссылок.

Пучки идут не по кривой, а ступенькой — прямо, скос ровно в 45°, снова
прямо. И идут они между узлами: от колодок вентиляторов к питанию ядра, от
сокетов к банкам памяти, от служебной зоны к задней панели. Разводка «из
ниоткуда в никуда» читается как штриховка, а не как плата.

Слой лежит под всем остальным: на живой плате дорожки уходят под корпуса,
а не обходят их поверху, поэтому BUSY здесь не спрашивается.
"""

from board.geom import X_CORE, X_PCB, X_PCB_END, X_REAR, X_SVC, Y_BANK_C, Y_BANK_L, Y_BANK_R, Y_CPU0, Y_CPU1


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
                paths.append(f'M{ax:.0f} {ay:.0f} H{mx:.0f} '
                             f'L{mx + abs(d):.0f} {by:.0f} H{bx:.0f}')
                if k % 3 == 0:
                    knots.append((mx, ay))
                    knots.append((mx + abs(d), by))
        return paths, knots

    # Узлы, между которыми есть что разводить. Координаты взяты из тех же
    # констант, что и сами узлы: сдвинется сокет — поедет и шина к нему.
    J_CONN = [(X_PCB + 48, 96 + i * 122) for i in range(6)]
    SVC_X = X_SVC + 10

    LINKS = []
    # питание и тахометры вентиляторов идут от колодок к VRM обоих сокетов
    for i, (jx, jy) in enumerate(J_CONN):
        # X_VRM объявлен ниже, у самих дросселей; здесь та же кромка сокета
        LINKS.append((jx, jy, X_CORE - 32, (Y_CPU0 if i < 3 else Y_CPU1) + 30 + i * 14,
                      12, 3.0, 'trunk', False))
    # сокет — банки памяти: три шины, по одной на банк
    for by in (Y_BANK_L + 50, Y_BANK_C + 110, Y_BANK_R + 50):
        LINKS.append((X_CORE - 12, by, X_CORE - 12, by + 40, 9, 3.2, 'mid', True))
    # сокеты — служебная зона и дальше на заднюю панель
    for sy, ty in ((Y_CPU0 + 40, 150), (Y_CPU0 + 110, 300), (Y_CPU1 + 40, 560), (Y_CPU1 + 110, 700)):
        LINKS.append((X_CORE + 300, sy, SVC_X + 130, ty, 11, 3.0, 'trunk', False))
    # служебная зона — задняя панель и карман райзеров
    for sy, ty in ((170, 300), (330, 430), (470, 560), (640, 620)):
        LINKS.append((SVC_X + 20, sy, X_REAR + 80, ty, 8, 3.2, 'mid', False))
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
