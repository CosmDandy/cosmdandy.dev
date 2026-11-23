"""Собранная плата целиком: инварианты, которые видит только вся сборка.

Отдельный блок проверить нечем — он рисует в общий холст и спорит с соседями
только за место. Поэтому здесь плата собирается целиком и на неё задаются
вопросы, на которые до сборки ответа не существует.
"""
# ruff: noqa: I001 — порядок импортов здесь значим: helpers кладёт tools/ в
# sys.path, и board.* становится импортируемым только после него. Сортировка
# по алфавиту поставила бы board выше и сломала бы импорт.
import unittest
import xml.etree.ElementTree as ET

from helpers import ROOT, TOOLS, board, quiet  # noqa: F401

import build
import layers
from board.canvas import RESERVE
from board.spec import EXPECT


class Assembly(unittest.TestCase):
    def test_every_block_in_order_exists(self):
        import importlib
        for name in build.ORDER:
            mod = importlib.import_module(f'board.blocks.{name}')
            self.assertTrue(hasattr(mod, 'render'), f'{name} без render()')

    def test_no_block_is_left_unwired(self):
        """Блок, написанный и не вставленный в ORDER, не рисуется и молчит."""
        files = {p.stem for p in (TOOLS / 'board/blocks').glob('*.py')}
        files -= {'__init__', 'lid'}     # крышка собирается своим холстом
        self.assertEqual(files - set(build.ORDER), set(),
                         'блок есть в blocks/, но не в ORDER')

    def test_order_names_only_existing_blocks(self):
        files = {p.stem for p in (TOOLS / 'board/blocks').glob('*.py')}
        self.assertEqual(set(build.ORDER) - files, set(),
                         'ORDER называет несуществующий блок')

    def test_every_block_leaves_a_trace(self):
        """Блок либо рисует, либо размечает место — иначе он подключён впустую.

        Рисуют не все: pcb_zones не кладёт на плату ни одной фигуры, он только
        держит бронь под узлы, которые придут позже. Поэтому вопрос не «сколько
        нарисовал», а «остался ли от него след вообще».
        """
        cv, _lid, report = board()
        self.assertGreater(len(cv.parts), 0)
        marked = {rect[4] for rects in cv.taken.values() for rect in rects}
        for name, count, _box in report:
            self.assertTrue(count > 0 or name in marked,
                            f'блок {name} не нарисовал и не разметил ничего')

    def test_the_lid_was_drawn(self):
        _cv, lid, _report = board()
        self.assertGreater(len(lid.parts), 0)


class Markup(unittest.TestCase):
    """Разметка обязана быть разбираемой: сломанный SVG — это белый экран."""

    def test_the_board_parses_as_xml(self):
        cv, _lid, _report = board()
        ET.fromstring(f'<svg xmlns:xlink="http://www.w3.org/1999/xlink">{cv.svg()}</svg>')

    def test_the_lid_parses_as_xml(self):
        _cv, lid, _report = board()
        ET.fromstring(f'<svg xmlns:xlink="http://www.w3.org/1999/xlink">{lid.svg()}</svg>')

    def test_the_page_promises_what_the_board_draws(self):
        """Паспорт обещает двадцать четыре планки — их и должно быть нарисовано."""
        cv, _lid, _report = board()
        svg = cv.svg()
        drawn = {'dimm': svg.count('data-dimm="'), 'fan': svg.count('data-fan="'),
                 'bay': svg.count('data-unit="hdd'), 'psu': svg.count('data-psu="'),
                 'riser': svg.count('data-riser="'), 'cpu': svg.count('data-cpu="')}
        for kind, want in EXPECT.items():
            self.assertEqual(drawn[kind], want, f'паспорт обещает {want} ({kind})')


class Register(unittest.TestCase):
    def test_every_reserve_has_an_owner(self):
        """Бронь ищут по хозяину: без него она не отвечает, кого ждёт."""
        cv, _lid, _report = board()
        for rect in cv.taken[RESERVE]:
            self.assertIsNotNone(rect[4], f'бронь без хозяина: {rect[:4]}')

    def test_owners_are_known_blocks(self):
        cv, _lid, _report = board()
        known = set(build.ORDER)
        for kind, rects in cv.taken.items():
            for rect in rects:
                if rect[4] is not None:
                    self.assertIn(rect[4], known, f'{kind}: чужой хозяин {rect[4]}')


class Layers(unittest.TestCase):
    """Слои не должны разъезжаться сильнее, чем они разъехались на сегодня."""

    def test_no_new_overlaps(self):
        base = layers.BASE
        self.assertTrue(base.exists(),
                        'нет базы слоёв: python3 tools/layers.py --update')
        import json
        with quiet():
            now, _hits = layers.survey()
        bad = layers.compare(now, json.loads(base.read_text(encoding='utf-8')))
        self.assertEqual(bad, [], 'слои разошлись с базой')


if __name__ == '__main__':
    unittest.main()
