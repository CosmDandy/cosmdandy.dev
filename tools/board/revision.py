"""Part numbers: every unit has its own, and it is the hash of its last commit.

The boundary of a unit used to be a heading comment, and the hash was dug out
with `git log -L <lines>:tools/gen_board.py` — a binding to a range of lines
that held only as long as the headings did not drift.

Now a unit is a file, and the part number is honest: the hash of the last
commit to the file that called stamp(). The call reports for itself who it
is — a block does not have to look itself up by name.
"""

import inspect
import subprocess
from pathlib import Path

from board.ink import mono

ROOT = Path(__file__).resolve().parents[2]      # repository root
REPO = "https://github.com/CosmDandy/cosmdandy.dev"


def git(*args, default=""):
    try:
        return subprocess.run(("git", "-C", str(ROOT)) + args, check=False,
                              capture_output=True, text=True, timeout=5).stdout.strip() or default
    except OSError:
        return default


# Ревизия платы — номер той сборки, которой эта плата СТАНЕТ, а не той, от
# которой её собирают. Раньше здесь стоял счётчик коммитов на HEAD, и это
# давало сдвиг на единицу в каждой опубликованной странице: сборка идёт до
# коммита, поэтому в коммит № N уезжала плата, набитая номером N−1. В
# сервисном режиме это и читалось как «интерфейс откатывает на ревизию
# назад» — лента показывала коммит, а плата в нём числилась предыдущим.
# Считаем по коммитам, тронувшим саму страницу: перебрать всю историю
# репозитория плата не может, её ревизия меняется вместе с index.html.
BOARD_REV = str(int(git("rev-list", "--count", "HEAD", "--", "index.html", default="0")) + 1)

# Хэш сборки, от которой набраны штрих-коды на модулях и блоках питания. Он
# и должен смотреть назад: штрихи — это не серийный номер платы, а отметка
# партии, и меняться каждым коммитом им незачем.
BOARD_SHA = git("rev-parse", "--short=7", "HEAD", default="0000000").upper()

# Серийный номер самой платы. Взять его из git нельзя в принципе:
# содержимое коммита не может содержать собственный хэш. Поэтому в разметку
# уходит заполнитель, а build.py по готовому чертежу считает его отпечаток и
# ставит вместо заполнителя. Номер получается свойством самой платы —
# меняется ровно тогда, когда меняется чертёж, и проверяется без git.
SN_SLOT = "SNSNSNS"
BOARD_SN = SN_SLOT

_cache = {}


def file_sha(path):
    """Hash of the last commit that changed this file."""
    rel = str(Path(path).resolve().relative_to(ROOT))
    if rel not in _cache:
        out = git("log", "-1", "--format=%h", "--", rel)
        _cache[rel] = (out or "0000000")[:7]
    return _cache[rel]


def file_date(path):
    """Дата последнего коммита, тронувшего файл: её и показывает партномер."""
    rel = str(Path(path).resolve().relative_to(ROOT))
    key = 'date:' + rel
    if key not in _cache:
        _cache[key] = git("log", "-1", "--format=%ad", "--date=short", "--", rel) or "—"
    return _cache[key]


def stamp(x, y, label=None, anchor="start", op=0.3):
    """Партномер узла — набивка на детали, а не ссылка.

    Ссылкой он был, и это оказалось лишним: партномеров на схеме много, они
    мелкие, и каждый уводил со страницы. Теперь он просто меняется под
    курсором — показывает дату той сборки, номер которой набит рядом. Узнать
    по нему что-то можно, уйти по нему никуда нельзя.

    label ни на что не влияет и оставлен для читаемости вызова: узел
    определяется своим файлом, а не подписью.
    """
    src = inspect.stack()[1].filename
    sha = file_sha(src)
    return (f'<g class="stamp" data-sha="{sha}">'
            + mono(x, y, f"P/N {sha.upper()}", 6, anchor=anchor, op=op)
            + f'<g class="stamp-alt">{mono(x, y, file_date(src), 6, anchor=anchor, op=op)}</g>'
            + '</g>')
