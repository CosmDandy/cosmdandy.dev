"""Партномера: у каждого узла свой, и это хэш его последнего коммита.

Раньше границей узла был заголовок-комментарий, а хэш добывался через
`git log -L <строки>:tools/gen_board.py` — привязка к диапазону строк,
которая держалась на том, что заголовки не разъезжаются.

Теперь узел — это файл, и партномер честный: хэш последнего коммита того
файла, из которого позвали stamp(). Вызов сам сообщает, кто он такой, —
искать себя по имени блоку не нужно.
"""

import inspect
import subprocess
from pathlib import Path

from board.ink import mono

ROOT = Path(__file__).resolve().parents[2]      # корень репозитория
REPO = "https://github.com/CosmDandy/cosmdandy.dev"


def git(*args, default=""):
    try:
        return subprocess.run(("git", "-C", str(ROOT)) + args, check=False,
                              capture_output=True, text=True, timeout=5).stdout.strip() or default
    except OSError:
        return default


# Ревизия платы — это ревизия репозитория: номер сборки равен числу коммитов,
# а серийный номер — хэшу HEAD. С каждым коммитом шелкография меняется, как
# меняется артикул платы при смене ревизии.
BOARD_REV = git("rev-list", "--count", "HEAD", default="0")
BOARD_SHA = git("rev-parse", "--short=7", "HEAD", default="0000000").upper()

_cache = {}


def file_sha(path):
    """Хэш последнего коммита, менявшего этот файл."""
    rel = str(Path(path).resolve().relative_to(ROOT))
    if rel not in _cache:
        out = git("log", "-1", "--format=%h", "--", rel)
        _cache[rel] = (out or "0000000")[:7]
    return _cache[rel]


def stamp(x, y, label=None, anchor="start", op=0.3):
    """Партномер узла ссылкой на коммит, который его последним менял.

    label ни на что не влияет и остаётся ради читаемости вызова: узел
    определяется файлом, а не подписью.
    """
    sha = file_sha(inspect.stack()[1].filename)
    return (f'<a class="stamp" href="{REPO}/commit/{sha}" target="_blank" rel="noopener" '
            f'data-sha="{sha}">'
            + mono(x, y, f"P/N {sha.upper()}", 6, anchor=anchor, op=op)
            + '</a>')
