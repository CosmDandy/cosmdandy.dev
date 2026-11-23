"""Общее для тестов: пути, сборка платы, глушилка вывода.

Сборка кладётся в кэш модуля нарочно. Она стоит полсекунды и печатает
несколько строк отчёта — на десяток тестов это уже и заметно, и шумно, а
результат от теста к тесту один и тот же: генератор детерминирован, случайность
в нём посеяна константой.
"""
import contextlib
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / 'tools'

if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

_built = None


@contextlib.contextmanager
def quiet():
    """Сборка отчитывается в stdout, и в выводе тестов это шум."""
    with contextlib.redirect_stdout(io.StringIO()):
        yield


def board():
    """Собранная плата: (canvas платы, canvas крышки, отчёт по блокам)."""
    global _built
    if _built is None:
        import build
        with quiet():
            _built = build.build()
    return _built


def page():
    """Собранная страница как она лежит в репозитории."""
    return (ROOT / 'index.html').read_text(encoding='utf-8')
