"""Правило наслоений: кто на кого имел право встать.

Правило направленное, и в этом весь смысл. Корпус, поставленный позже, законно
накрывает уже разведённую под ним мелочь — на живой плате разъём и припаян
поверх дорожек. Нарушение — это когда позже пришедший встал на то, чего обязан
был избегать. Симметричная проверка клеймила и обратный случай: из 75 находок
40 были разрешёнными.
"""
# ruff: noqa: I001 — порядок импортов здесь значим: helpers кладёт tools/ в
# sys.path, и board.* становится импортируемым только после него. Сортировка
# по алфавиту поставила бы board выше и сломала бы импорт.
import unittest

from helpers import TOOLS  # noqa: F401

from board.canvas import BOARD, COPPER, MAJOR, MINOR, RESERVE, SILK
from build import ORDER, broken
from layers import better, compare, signature


class Direction(unittest.TestCase):
    """Кто позже — знает ORDER: место в очереди сборки и есть время."""

    def test_later_unit_may_cover_earlier_passives(self):
        """Разъём припаян поверх того, что развели под ним, — это не поломка."""
        self.assertFalse(broken(MAJOR, MINOR, 'risers', 'pcb_scatter'))

    def test_earlier_passives_under_a_later_unit_are_fine(self):
        """Тот же случай, записанный с другой стороны, — тоже не поломка."""
        self.assertFalse(broken(MINOR, MAJOR, 'pcb_scatter', 'risers'))

    def test_late_passives_on_an_early_unit_are_broken(self):
        """Мелочь, вставшая на уже стоящий корпус, могла спросить и не спросила.

        chassis рисуется первым, pcb_scatter — седьмым: рама уже стоит.
        """
        self.assertTrue(broken(MINOR, MAJOR, 'pcb_scatter', 'chassis'))

    def test_late_silk_on_an_earlier_unit_is_broken(self):
        """Обозначения печатает marks — после райзеров, и на них ему нельзя."""
        self.assertTrue(broken(SILK, MAJOR, 'marks', 'risers'))

    def test_inside_one_block_any_direction_counts(self):
        """Внутри блока порядка нет, и запрет в любую сторону — нарушение."""
        self.assertTrue(broken(MINOR, MAJOR, 'pcb_scatter', 'pcb_scatter'))

    def test_copper_over_copper_is_legal(self):
        """Плата многослойная — шины пересекаются в проекции сверху."""
        self.assertFalse(broken(COPPER, COPPER, 'pcb_traces', 'pcb_traces'))

    def test_copper_past_the_laminate_edge_is_not(self):
        self.assertTrue(broken(COPPER, BOARD, 'pcb_traces', 'pcb_field'))

    def test_unknown_owner_does_not_crash(self):
        """Хозяина может не быть — правило обязано ответить, а не упасть."""
        self.assertIsInstance(broken(MINOR, MAJOR, None, 'risers'), bool)

    def test_order_is_the_clock(self):
        """Проверка правила опирается на ORDER — там не должно быть повторов."""
        self.assertEqual(len(ORDER), len(set(ORDER)))


class Signature(unittest.TestCase):
    """Ключ находки не должен зависеть от того, с какой стороны на неё смотрят."""

    def test_same_hit_from_both_sides_gives_one_key(self):
        a = {'kinds': (MINOR, RESERVE), 'by': ('pcb_scatter', 'pcb_zones')}
        b = {'kinds': (RESERVE, MINOR), 'by': ('pcb_zones', 'pcb_scatter')}
        self.assertEqual(signature(a), signature(b))

    def test_owners_are_ordered_by_assembly(self):
        """В ключе первым стоит тот, кто рисовал раньше: pcb_zones до pcb_scatter."""
        key = signature({'kinds': (MINOR, RESERVE), 'by': ('pcb_scatter', 'pcb_zones')})
        self.assertIn('pcb_zones+pcb_scatter', key)

    def test_key_survives_a_missing_owner(self):
        self.assertIn('?', signature({'kinds': (MINOR, MAJOR), 'by': (None, 'risers')}))


# Слепок базы для проверок сверки. Лежит на уровне модуля, а не в теле класса:
# в классе это изменяемое значение, общее на все его случаи разом.
BASE = {'overlaps': {'minor+major pcb_scatter+risers': 2},
        'lost': ['обозначение J30'], 'hollow': ['pcb_zones']}


class Baseline(unittest.TestCase):
    """Сверка с базой. Ловит ровно одно: стало ли хуже, чем было."""

    BASE = BASE

    def test_same_state_passes(self):
        self.assertEqual(compare(dict(self.BASE), self.BASE), [])

    def test_one_more_overlap_fails(self):
        now = {**self.BASE, 'overlaps': {'minor+major pcb_scatter+risers': 3}}
        self.assertEqual(len(compare(now, self.BASE)), 1)

    def test_a_new_pair_fails(self):
        now = {**self.BASE, 'overlaps': {**self.BASE['overlaps'], 'silk+silk marks+marks': 1}}
        self.assertEqual(len(compare(now, self.BASE)), 1)

    def test_fewer_overlaps_pass(self):
        now = {**self.BASE, 'overlaps': {'minor+major pcb_scatter+risers': 1}}
        self.assertEqual(compare(now, self.BASE), [])
        self.assertEqual(len(better(now, self.BASE)), 1)

    def test_a_new_thing_that_did_not_fit_fails(self):
        now = {**self.BASE, 'lost': ['обозначение J30', 'обозначение J31']}
        self.assertEqual(len(compare(now, self.BASE)), 1)

    def test_a_new_hollow_reserve_fails(self):
        now = {**self.BASE, 'hollow': ['pcb_zones', 'memory']}
        self.assertEqual(len(compare(now, self.BASE)), 1)


if __name__ == '__main__':
    unittest.main()
