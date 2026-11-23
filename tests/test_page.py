"""Собранная страница: то, что реально уедет гостю.

Всё здесь проверяется по файлам на диске, без браузера. Класс поломок,
который этим ловится, — тихий: страница открывается, выглядит правильно, и
при этом консоль врёт про железо или вернувшийся гость получает вчерашние
стили из кэша, потому что ссылка на них не сдвинулась.
"""
# ruff: noqa: I001 — порядок импортов здесь значим: helpers кладёт tools/ в
# sys.path, и board.* становится импортируемым только после него. Сортировка
# по алфавиту поставила бы board выше и сломала бы импорт.
import hashlib
import json
import re
import unittest
from pathlib import Path

from helpers import ROOT, TOOLS, page  # noqa: F401

from board.spec import passport

PAGES = ('index.html', '404.html', 'tg/index.html')
# Файлы, чья ссылка обязана нести версию: их разрешено кэшировать навсегда.
VERSIONED = ('style.css', 'server.css', 'server.js')


def digest(path):
    """Тот же хэш, что ставит stamp_assets: восемь знаков sha256."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


class Markers(unittest.TestCase):
    """Сборка вставляет своё между метками — пустая метка значит, что не вставила."""

    def between(self, name):
        m = re.search(rf'<!-- {name}:BEGIN -->(.*?)<!-- {name}:END -->',
                      page(), re.DOTALL)
        self.assertIsNotNone(m, f'нет меток {name}')
        return m.group(1).strip()

    def test_board_is_spliced_in(self):
        self.assertGreater(len(self.between('BOARD')), 10000)

    def test_lid_art_is_spliced_in(self):
        self.assertGreater(len(self.between('LIDART')), 1000)

    def test_theme_is_spliced_in(self):
        """Тема — один исходник на три страницы, и вставлена она в каждую."""
        for name in PAGES:
            html = (ROOT / name).read_text(encoding='utf-8')
            self.assertIn('THEME:BEGIN', html, name)


class Passport(unittest.TestCase):
    def test_spec_json_matches_the_python(self):
        """Консоль читает железо отсюда: разойдясь, она начнёт врать гостю."""
        m = re.search(r'<!-- SPEC:BEGIN -->(.*?)<!-- SPEC:END -->', page(), re.DOTALL)
        self.assertIsNotNone(m, 'нет меток SPEC')
        text = re.sub(r'</?script[^>]*>', '', m.group(1)).strip().replace('<\\/', '</')
        got = json.loads(text)
        # Через JSON и обратно: в питоне банки и райзеры — кортежи, а в странице
        # они уже списки, и сравнение спорило бы о типе, а не о содержимом.
        want = json.loads(json.dumps(passport(), ensure_ascii=False))
        # Два поля приходят из git, а не из паспорта, и расходятся от самого
        # факта коммита: серийный номер подставляется на месте заполнителя уже
        # после сборки, а ревизия — это счётчик коммитов, тронувших страницу.
        # Автор собирает страницу до коммита, читается она после.
        for side in (got, want):
            side['board'].pop('sha', None)
            side['board'].pop('rev', None)
        self.assertEqual(got, want)


class Cache(unittest.TestCase):
    """Версии в ссылках и заголовки кэша — одна связка, и врозь они не работают."""

    def headers(self):
        return (ROOT / '_headers').read_text(encoding='utf-8')

    def immutable_paths(self):
        out, current = [], None
        for line in self.headers().splitlines():
            if line.startswith('/'):
                current = line.strip()
            elif 'immutable' in line and current:
                out.append(current)
        return out

    def test_versioned_links_carry_a_hash(self):
        html = page()
        for name in VERSIONED:
            m = re.search(rf'{re.escape(name)}\?v=([0-9a-f]{{8}})', html)
            self.assertIsNotNone(m, f'{name} без версии в ссылке')

    def test_the_hash_is_the_hash_of_the_file(self):
        """Иначе год кэша обещан не тому содержимому, что уедет по проводу."""
        html = page()
        for name in VERSIONED:
            m = re.search(rf'{re.escape(name)}\?v=([0-9a-f]{{8}})', html)
            self.assertEqual(m.group(1), digest(ROOT / name),
                             f'{name}: версия в ссылке не от этого файла')

    def test_everything_versioned_is_cached_forever(self):
        paths = self.immutable_paths()
        for name in VERSIONED:
            self.assertIn(f'/{name}', paths, f'{name} версионируется, но не кэшируется')

    def test_everything_cached_forever_is_versioned_or_named_by_content(self):
        """Постоянное имя без версии под immutable значит правку, которая не дойдёт."""
        html = page()
        # Шрифты и ленту ревизий версия не нужна: имя шрифта не меняется никогда,
        # а имя ревизии несёт хэш коммита — новая приходит под новым именем.
        by_name = ('/fonts/', '/history/')
        for path in self.immutable_paths():
            if path.startswith(by_name):
                continue
            name = path.lstrip('/')
            if name.startswith('tg/'):
                html_tg = (ROOT / 'tg/index.html').read_text(encoding='utf-8')
                self.assertRegex(html_tg, rf'{re.escape(Path(name).name)}\?v=[0-9a-f]{{8}}',
                                 f'{path} кэшируется навсегда без версии')
            else:
                self.assertRegex(html, rf'{re.escape(name)}\?v=[0-9a-f]{{8}}',
                                 f'{path} кэшируется навсегда без версии')

    def test_pages_themselves_are_not_immutable(self):
        """Страница обязана переспрашиваться: в ней и лежат текущие версии."""
        for path in self.immutable_paths():
            self.assertFalse(path.endswith('.html') or path == '/',
                             f'{path} закэширован навсегда — правка не дойдёт ни до кого')


class Security(unittest.TestCase):
    """Политика и предзагрузка. Обе ломаются молча и по одной причине.

    Политика перечисляет встроенные скрипты по хэшам. Поправил скрипт, не
    пересчитал политику — браузер отказывается выполнить его, и страница
    остаётся голой разметкой. Правила предзагрузки под ту же политику
    подпадают, но их отказ не виден вообще ничем: предзагрузка не обязана
    случиться, и её отсутствие неотличимо от «гость не наводил».
    """

    def headers(self):
        return (ROOT / '_headers').read_text(encoding='utf-8')

    def test_policy_is_declared(self):
        self.assertIn('Content-Security-Policy:', self.headers())

    def test_every_inline_script_is_allowed_by_hash(self):
        import csp
        headers = self.headers()
        found = csp.hashes(ROOT)
        self.assertTrue(found, 'встроенных скриптов не найдено вовсе')
        for digest in found:
            self.assertIn(digest, headers,
                          'скрипт не разрешён политикой — нужен python3 tools/csp.py')

    def test_policy_has_no_blanket_permissions(self):
        """Разрешение «всё встроенное» делает политику декоративной."""
        line = next(l for l in self.headers().splitlines()
                    if 'Content-Security-Policy:' in l)
        script_src = line.split('script-src')[1].split(';')[0]
        self.assertNotIn("unsafe-inline", script_src)
        self.assertNotIn("unsafe-eval", script_src)

    def test_data_scripts_are_not_hashed(self):
        """JSON на странице браузер не исполняет, и хэшировать его незачем."""
        self.assertFalse(csp_checked('application/json'))
        self.assertFalse(csp_checked('application/ld+json'))

    def test_speculation_rules_are_hashed(self):
        """А правила предзагрузки политика проверяет наравне со скриптами."""
        self.assertTrue(csp_checked('speculationrules'))

    def test_speculation_rules_are_valid(self):
        m = re.search(r'<script type="speculationrules">(.*?)</script>',
                      page(), re.DOTALL)
        self.assertIsNotNone(m, 'правил предзагрузки нет')
        rules = json.loads(m.group(1))
        targets = [r['where']['href_matches'] for r in rules.get('prerender', [])]
        self.assertTrue(targets, 'правила есть, но ничего не предзагружают')
        for path in targets:
            # Предзагружать имеет смысл только своё: у чужого домена свои
            # заголовки, и браузер такую попытку молча отменит.
            self.assertTrue(path.startswith('/'), f'{path} — не свой адрес')
            self.assertTrue((ROOT / path.strip('/') / 'index.html').exists(),
                            f'{path} — такой страницы нет')


def csp_checked(script_type):
    """Считает ли политика скрипт такого типа своим — то есть нужен ли ему хэш."""
    import csp
    return csp.checked(f'type="{script_type}"')


class Hygiene(unittest.TestCase):
    def test_ids_are_unique(self):
        """Повтор id ломает и ссылку по якорю, и <use xlink:href>."""
        ids = re.findall(r'\sid="([^"]+)"', page())
        doubled = {i for i in ids if ids.count(i) > 1}
        self.assertEqual(doubled, set(), 'повторяющиеся id')

    def test_nothing_is_loaded_from_outside(self):
        """Внешний запрос — это чужой сервер между гостем и первым кадром.

        Ссылка-переход внешней быть обязана, и canonical тоже: считаются только
        те теги, что тянут файл, — стили, шрифты, значки, скрипты, картинки.
        """
        html = page()
        loads = re.findall(
            r'<script[^>]*\ssrc="(https?://[^"]+)"'
            r'|<img[^>]*\ssrc="(https?://[^"]+)"'
            r'|<link[^>]*\srel="(?:stylesheet|preload|icon|apple-touch-icon|manifest)"'
            r'[^>]*\shref="(https?://[^"]+)"', html)
        outside = [u for group in loads for u in group if u]
        self.assertEqual(outside, [], 'страница тянет ресурс со стороны')

    def test_head_is_complete(self):
        html = page()
        for needle in ('<title>', 'name="viewport"', 'name="description"', 'lang="'):
            self.assertIn(needle, html, f'в странице нет {needle}')

    def test_every_page_has_a_title(self):
        for name in PAGES:
            html = (ROOT / name).read_text(encoding='utf-8')
            self.assertRegex(html, r'<title>[^<]+</title>', name)


if __name__ == '__main__':
    unittest.main()
