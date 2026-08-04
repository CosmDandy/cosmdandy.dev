"""callouts: block labels, readable at once.

Assembled last and drawn on top of everything: they are the only thing on the
diagram that has to read immediately, without hovering.
"""

from board.ink import callout


def render(cv):
    # Кольца наведения стоят здесь по той же причине, что и бирки: лежать
    # обязаны поверх машины, но под подписями. Рисует их скрипт по габаритам
    # самих узлов, поэтому в разметке группа пустая.
    #
    # Второго экземпляра геометрии узлов тут нет намеренно. Блоки двигают свои
    # детали, и кольцо, нарисованное по переписанным координатам, начало бы
    # промахиваться на первой же правке.
    cv.add('<g class="spot-rings" fill="none"></g>')
    cv.add('<g class="callouts">'
           + ''.join(callout(*c, order=i) for i, c in enumerate(cv.callouts))
           + '</g>')
