"""Паспорт машины: что обещано и что из этого следует.

Литералов в командах быть не должно — раньше их отсутствие было только на
бумаге: плата несла двадцать четыре планки, а консоль обещала тридцать две, и
так в шести местах сразу. Здесь проверяется, что паспорт сам себе не
противоречит; сверку паспорта с рисунком делает сборка.
"""
# ruff: noqa: I001 — порядок импортов здесь значим: helpers кладёт tools/ в
# sys.path, и board.* становится импортируемым только после него. Сортировка
# по алфавиту поставила бы board выше и сломала бы импорт.
import unittest

from helpers import TOOLS  # noqa: F401

from board import spec


class Consistency(unittest.TestCase):
    def test_slots_are_the_sum_of_the_banks(self):
        self.assertEqual(spec.dimm_slots(), sum(b['n'] for b in spec.DIMM['banks']))

    def test_total_ram_follows_the_slots(self):
        self.assertEqual(spec.total_ram_gb(),
                         spec.dimm_slots() * spec.DIMM['size_gb'])

    def test_silkscreen_label_says_the_same(self):
        """Подпись на текстолите не может расходиться с паспортом."""
        label = spec.ram_label()
        self.assertIn(str(spec.dimm_slots()), label)
        self.assertIn(spec.DIMM['kind'], label)

    def test_fillers_are_not_units(self):
        """Заглушка не вынимается, и в счёт узлов она не идёт."""
        self.assertEqual(spec.EXPECT['bay'], spec.BAY_N - len(spec.FILLER_BAYS))
        self.assertLess(spec.EXPECT['bay'], spec.BAY_N)

    def test_filler_bays_exist(self):
        for i in spec.FILLER_BAYS:
            self.assertLess(i, spec.BAY_N, f'заглушка {i} вне корзины')


class Passport(unittest.TestCase):
    def test_every_expectation_has_a_number(self):
        for kind, want in spec.EXPECT.items():
            self.assertIsInstance(want, int, kind)
            self.assertGreater(want, 0, kind)

    def test_passport_carries_the_counted_fields(self):
        """Консоль читает их из паспорта: пересчитывать их ей нечем."""
        p = spec.passport()
        self.assertEqual(p['dimm']['slots'], spec.dimm_slots())
        self.assertEqual(p['dimm']['total_gb'], spec.total_ram_gb())

    def test_passport_is_json_ready(self):
        """Паспорт уезжает в страницу как JSON — несериализуемое поле сломает её."""
        import json
        json.dumps(spec.passport(), ensure_ascii=False)

    def test_chips_have_reference_designators(self):
        """Честный lspci строится из них: что нарисовано, то и перечислено."""
        for chip in spec.passport()['chips']:
            self.assertTrue(chip['mark'], chip)
            self.assertTrue(chip['ref'], chip)

    def test_reference_designators_are_unique(self):
        refs = [c['ref'] for c in spec.passport()['chips']]
        self.assertEqual(len(refs), len(set(refs)), 'повторяющийся номер по схеме')


if __name__ == '__main__':
    unittest.main()
