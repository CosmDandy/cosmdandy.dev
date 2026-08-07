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
#   major  — корпуса, разъёмы, гнёзда, лампы, радиаторы. Через них не рисует
#            никто: это объём, а не краска.
#   board  — вырезы и края текстолита. Туда нельзя вообще ничего.
COPPER, MINOR, SILK, MAJOR, BOARD = 'copper', 'minor', 'silk', 'major', 'board'

# Чего избегает каждый вид по умолчанию, если спрашивающий не сказал иначе.
AVOID = {
    COPPER: (BOARD,),
    MINOR: (BOARD, MAJOR, SILK),
    SILK: (BOARD, MAJOR, SILK),
    MAJOR: (BOARD, MAJOR),
    BOARD: (BOARD,),
}


class Canvas:
    def __init__(self):
        self.parts = []      # SVG fragments in drawing order
        # Занятые прямоугольники по видам: {вид: [(x1, y1, x2, y2), …]}.
        self.taken = {kind: [] for kind in AVOID}
        self.callouts = []   # callout links: drawn last, on top of everything
        self.lost = []       # what did not fit — the builder reports it
        self.share = {}      # what a block announced to neighbours (see below)

    def add(self, s):
        self.parts.append(s)

    def busy(self, x, y, w, h, pad=3, kind=MAJOR):
        """Пометить место занятым. Вид по умолчанию — самый строгий из тех,
        что ставят блоки: корпус детали. Так старый код, не знающий про виды,
        продолжает вести себя как раньше."""
        self.taken[kind].append((x - pad, y - pad, x + w + pad, y + h + pad))

    def free(self, x, y, w, h, kind=MAJOR, avoid=None):
        """Свободно ли место для того, кто рисует `kind`.

        `avoid` перебивает умолчание: блок может знать про свой случай больше
        общего правила — например, обозначение у самой детали кладут вплотную.
        """
        for k in (avoid if avoid is not None else AVOID[kind]):
            for (x1, y1, x2, y2) in self.taken[k]:
                if x < x2 and x + w > x1 and y < y2 and y + h > y1:
                    return False
        return True

    def put(self, x, y, w, h, kind=MAJOR, avoid=None, pad=3):
        """Take a place if it is free. Returns True if it worked out."""
        if not self.free(x, y, w, h, kind, avoid):
            return False
        self.busy(x, y, w, h, pad, kind)
        return True

    def bounds(self):
        """Границы занятости по видам — для режима показа слоёв."""
        return {kind: list(rects) for kind, rects in self.taken.items()}

    def svg(self):
        return '\n'.join(self.parts)
