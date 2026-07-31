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


class Canvas:
    def __init__(self):
        self.parts = []      # SVG fragments in drawing order
        self.taken = []      # occupied rectangles (x1, y1, x2, y2)
        self.callouts = []   # callout links: drawn last, on top of everything
        self.lost = []       # what did not fit — the builder reports it
        self.share = {}      # what a block announced to neighbours (see below)

    def add(self, s):
        self.parts.append(s)

    def busy(self, x, y, w, h, pad=3):
        self.taken.append((x - pad, y - pad, x + w + pad, y + h + pad))

    def free(self, x, y, w, h):
        for (x1, y1, x2, y2) in self.taken:
            if x < x2 and x + w > x1 and y < y2 and y + h > y1:
                return False
        return True

    def put(self, x, y, w, h):
        """Take a place if it is free. Returns True if it worked out."""
        if not self.free(x, y, w, h):
            return False
        self.busy(x, y, w, h)
        return True

    def svg(self):
        return '\n'.join(self.parts)
