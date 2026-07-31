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


# The board revision is the repository revision: the build number equals the
# number of commits, and the serial number is the HEAD hash. With every commit
# the silkscreen changes, the way a board's part number changes with a
# revision.
BOARD_REV = git("rev-list", "--count", "HEAD", default="0")
BOARD_SHA = git("rev-parse", "--short=7", "HEAD", default="0000000").upper()

_cache = {}


def file_sha(path):
    """Hash of the last commit that changed this file."""
    rel = str(Path(path).resolve().relative_to(ROOT))
    if rel not in _cache:
        out = git("log", "-1", "--format=%h", "--", rel)
        _cache[rel] = (out or "0000000")[:7]
    return _cache[rel]


def stamp(x, y, label=None, anchor="start", op=0.3):
    """Part number of a unit, as a link to the commit that last changed it.

    label affects nothing and stays for the readability of the call: a unit is
    defined by its file, not by its caption.
    """
    sha = file_sha(inspect.stack()[1].filename)
    return (f'<a class="stamp" href="{REPO}/commit/{sha}" target="_blank" rel="noopener" '
            f'data-sha="{sha}">'
            + mono(x, y, f"P/N {sha.upper()}", 6, anchor=anchor, op=op)
            + '</a>')
