"""Регистр занятости: кто куда может встать.

Это единственное место, где записано, чему на плате можно лежать поверх чего.
Ошибка здесь не падает и не видна на картинке — она проявляется тем, что слой
молча не рисуется (ему негде встать) или две детали садятся в одну точку.
"""
# ruff: noqa: I001 — порядок импортов здесь значим: helpers кладёт tools/ в
# sys.path, и board.* становится импортируемым только после него. Сортировка
# по алфавиту поставила бы board выше и сломала бы импорт.
import unittest

from helpers import TOOLS  # noqa: F401  — ставит tools/ в sys.path

from board.canvas import (AVOID, BOARD, COPPER, COVER, MAJOR, MINOR, PART,
                          RESERVE, SILK, Canvas)


class Register(unittest.TestCase):
    def test_free_place_is_free(self):
        cv = Canvas()
        self.assertTrue(cv.free(0, 0, 10, 10))

    def test_taken_place_is_not(self):
        cv = Canvas()
        cv.busy(0, 0, 10, 10, kind=MAJOR)
        self.assertFalse(cv.free(5, 5, 10, 10, kind=MAJOR))

    def test_pad_grows_the_rectangle(self):
        """Отступ по умолчанию — три единицы вокруг, и он занимает место."""
        cv = Canvas()
        cv.busy(0, 0, 10, 10, kind=MAJOR)
        self.assertFalse(cv.free(11, 0, 5, 5, kind=MAJOR))   # 11 < 10+3
        self.assertTrue(cv.free(14, 0, 5, 5, kind=MAJOR))

    def test_put_takes_the_place(self):
        cv = Canvas()
        self.assertTrue(cv.put(0, 0, 10, 10, kind=MAJOR))
        self.assertFalse(cv.put(5, 5, 10, 10, kind=MAJOR))

    def test_put_does_not_take_on_refusal(self):
        """Отказ не должен оставлять следа: иначе место занял бы тот, кто не встал."""
        cv = Canvas()
        cv.busy(0, 0, 10, 10, kind=MAJOR)
        before = len(cv.taken[MAJOR])
        cv.put(5, 5, 10, 10, kind=MAJOR)
        self.assertEqual(len(cv.taken[MAJOR]), before)

    def test_touching_edges_are_not_a_clash(self):
        """Впритык — это стык, а не наслоение; иначе не встала бы ни одна лестница."""
        cv = Canvas()
        cv.busy(0, 0, 10, 10, pad=0, kind=MAJOR)
        self.assertTrue(cv.free(10, 0, 10, 10, kind=MAJOR))

    def test_owner_comes_from_the_canvas(self):
        """Хозяина проставляет сборка: забытый источник оставил бы бронь ничьей."""
        cv = Canvas()
        cv.by = 'pcb_zones'
        cv.busy(0, 0, 10, 10, kind=RESERVE)
        self.assertEqual(cv.taken[RESERVE][0][4], 'pcb_zones')

    def test_explicit_owner_wins(self):
        cv = Canvas()
        cv.by = 'pcb_zones'
        cv.busy(0, 0, 10, 10, kind=RESERVE, by='memory')
        self.assertEqual(cv.taken[RESERVE][0][4], 'memory')

    def test_avoid_override(self):
        """Блок может знать про свой случай больше общего правила."""
        cv = Canvas()
        cv.busy(0, 0, 10, 10, kind=MAJOR)
        self.assertFalse(cv.free(5, 5, 5, 5, kind=SILK))
        self.assertTrue(cv.free(5, 5, 5, 5, kind=SILK, avoid=()))


class Rules(unittest.TestCase):
    """Сам список запретов. Каждый пункт здесь оплачен поломкой."""

    def test_every_kind_has_a_rule(self):
        kinds = {COPPER, MINOR, SILK, MAJOR, PART, RESERVE, COVER, BOARD}
        self.assertEqual(set(AVOID), kinds)

    def test_every_rule_names_known_kinds(self):
        for kind, avoids in AVOID.items():
            for other in avoids:
                self.assertIn(other, AVOID, f'{kind} избегает неизвестного {other}')

    def test_minor_avoids_itself(self):
        """Две детали в одной точке физически невозможны."""
        self.assertIn(MINOR, AVOID[MINOR])

    def test_silk_avoids_itself(self):
        """Две подписи одна поверх другой не читаются ни одна."""
        self.assertIn(SILK, AVOID[SILK])

    def test_copper_does_not_avoid_itself(self):
        """Плата многослойная: шины в проекции сверху пересекаются законно."""
        self.assertNotIn(COPPER, AVOID[COPPER])

    def test_nothing_may_lie_on_a_cutout(self):
        for kind, avoids in AVOID.items():
            self.assertIn(BOARD, avoids, f'{kind} не избегает вырезов')

    def test_major_ignores_reserve_but_part_does_not(self):
        """Узел в брони — то, ради чего бронь и держат; рассыпуха туда не лезет."""
        self.assertNotIn(RESERVE, AVOID[MAJOR])
        self.assertIn(RESERVE, AVOID[PART])

    def test_silk_lies_on_reserve_but_not_under_a_unit(self):
        """Краску наносят до сборки — но под планкой её не видит никто."""
        self.assertNotIn(RESERVE, AVOID[SILK])
        self.assertIn(COVER, AVOID[SILK])


if __name__ == '__main__':
    unittest.main()
