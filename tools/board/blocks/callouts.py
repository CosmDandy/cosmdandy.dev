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
    # Очередь показа — не очередь сборки. Порядок в cv.callouts задан тем, в
    # каком порядке блоки рисуют свои узлы, и резюме оказывалось в нём
    # последним: процессор собирается в конце. Приходят же на визитку чаще
    # всего именно за резюме, а его бирка ждала лишние полсекунды. Поэтому
    # показываем её первой; порядок отрисовки не трогаем — он про то, что
    # поверх чего лежит.
    queue = sorted(cv.callouts, key=lambda c: c[4] != 'CV')
    rank = {c[4]: i for i, c in enumerate(queue)}
    cv.add('<g class="callouts">'
           + ''.join(callout(*c, order=rank[c[4]]) for c in cv.callouts)
           + '</g>')
