"""Assembly canvas: where blocks put what they draw and how they share space.

One Canvas per assembly. A block gets it in render(c) and reaches for nothing
else — neither for its neighbours nor for global state. That is why two blocks
can be edited at the same time: the only way they can collide is over space on
the board, and space is handed out by the canvas, which also knows how to
report about it.

The register of taken places is needed because the board is dense: passives and
silkscreen kept landing on mounting holes and on other people's captions. A
large element marks out its rectangle; a small part asks before it goes in.

share is the only legitimate way for blocks to know about each other. Vias are
placed at the nodes of the routing, not just anywhere: the routing puts its
nodes into share, the vias take them from there. That way the link is visible
in the code of both, not hidden in a shared variable anyone can edit.
"""


# ── Виды занятости ────────────────────────────────────────────────────────
# Регистр занятости был один на всех: дорожка, корпус чипа, подпись и
# конденсатор писали в общий список, и спрашивающий не мог сказать, чего
# именно он избегает. На живой плате так не бывает — там обозначение спокойно
# лежит поверх меди и поверх мелочи, но никогда не залезает на корпус детали.
#
# Из-за общего списка слой обозначений не рисовался вовсе: к его очереди поле
# было занято целиком, включая дорожки, на которые ему как раз можно.
#
# Виды, снизу вверх по «неприкосновенности»:
#   copper — дорожки, переходные, площадки. Поверх них печатают всё.
#   minor  — рассыпуха. Мелочь друг на друга не лезет, но краску поверх неё
#            кладут: на живой плате обозначение часто перекрывает соседний
#            конденсатор.
#   silk   — подписи и шелкография. Не должны налезать друг на друга.
#   part   — крупная рассыпуха: SOIC, дроссели, транзисторы, кварцы, мелкие
#            радиаторы. Тоже объём, но это не узел: у неё нет ни имени на
#            схеме, ни бирки, и место ей ищут обходом, а не назначают.
#   major  — узлы: разъёмы, гнёзда, сокеты, лампы, микросхемы с именем.
#            Через них не рисует никто: это объём, а не краска.
#   board  — вырезы и края текстолита. Туда нельзя вообще ничего.
#
# part отделён от major нарочно. Пока они были одним видом, адрес «B14» не
# отвечал на вопрос, о чём речь: под одной буквой лежали и разъём, к которому
# ведёт бирка, и дроссель, вставший туда, где нашлось место. Правила у них
# одинаковые — разное у них происхождение, и именно оно нужно, чтобы понять,
# что двигать, а что трогать нельзя.
#
# Отдельно от корпуса стоит бронь. Это разные вещи, и путать их дорого: корпус
# говорит «здесь стоит деталь», бронь — «сюда придёт узел». Под планкой памяти
# и вокруг сокета на живой плате шелкографии полно: краска нанесена на
# текстолит до того, как в него что-то вставили. А вот мелочь туда ставить
# нельзя — она окажется под планкой.
COPPER, MINOR, SILK, MAJOR, BOARD = 'copper', 'minor', 'silk', 'major', 'board'
RESERVE = 'reserve'
PART = 'part'

# Чего избегает каждый вид по умолчанию, если спрашивающий не сказал иначе.
AVOID = {
    COPPER: (BOARD,),
    MINOR: (BOARD, MAJOR, PART, SILK, RESERVE),
    SILK: (BOARD, MAJOR, PART, SILK),
    # Узел в брони — это то, ради чего бронь и держат, поэтому MAJOR её не
    # избегает. А вот крупная рассыпуха — избегает: место ей не назначено, а
    # найдено обходом, и найти его в чужой брони значит встать под планкой
    # памяти или под кронштейном райзера. Пока правило молчало, обход place()
    # спрашивал только про корпуса и вырезы, и бронь банков его не держала.
    MAJOR: (BOARD, MAJOR, PART),
    PART: (BOARD, MAJOR, PART, RESERVE),
    RESERVE: (BOARD,),
    BOARD: (BOARD,),
}


class Canvas:
    def __init__(self):
        self.parts = []      # SVG fragments in drawing order
        # Занятые прямоугольники по видам: {вид: [(x1, y1, x2, y2, кто), …]}.
        self.taken = {kind: [] for kind in AVOID}
        # Кто сейчас рисует. Ставит сборка перед вызовом блока, а busy() берёт
        # отсюда — иначе источник пришлось бы дописывать в сотню вызовов, и
        # первый же забытый оставил бы бронь без хозяина.
        self.by = None
        self.callouts = []   # callout links: drawn last, on top of everything
        self.lost = []       # what did not fit — the builder reports it
        self.share = {}      # what a block announced to neighbours (see below)

    def add(self, s):
        self.parts.append(s)

    def busy(self, x, y, w, h, pad=3, kind=MAJOR, by=None):
        """Пометить место занятым. Вид по умолчанию — самый строгий из тех,
        что ставят блоки: корпус детали. Так старый код, не знающий про виды,
        продолжает вести себя как раньше."""
        self.taken[kind].append(
            (x - pad, y - pad, x + w + pad, y + h + pad, by or self.by))

    def free(self, x, y, w, h, kind=MAJOR, avoid=None):
        """Свободно ли место для того, кто рисует `kind`.

        `avoid` перебивает умолчание: блок может знать про свой случай больше
        общего правила — например, обозначение у самой детали кладут вплотную.
        """
        for k in (avoid if avoid is not None else AVOID[kind]):
            for (x1, y1, x2, y2, _by) in self.taken[k]:
                if x < x2 and x + w > x1 and y < y2 and y + h > y1:
                    return False
        return True

    def put(self, x, y, w, h, kind=MAJOR, avoid=None, pad=3, by=None):
        """Take a place if it is free. Returns True if it worked out."""
        if not self.free(x, y, w, h, kind, avoid):
            return False
        self.busy(x, y, w, h, pad, kind, by)
        return True

    def bounds(self):
        """Границы занятости по видам — для режима показа слоёв."""
        return {kind: list(rects) for kind, rects in self.taken.items()}

    def svg(self):
        return '\n'.join(self.parts)
