"""Отметка о сборке: где развёрнуто, из чего и когда.

Стендов три — локальный, превью на воркере и продакшен, — и с виду они
неотличимы. Отсюда и отметка: строка в углу страницы, по которой сразу видно,
на что смотришь и насколько оно свежее.

Штампует не генератор, а тот пайплайн, который развёртывает. Причина в том,
что index.html лежит в репозитории уже собранным, и хэш, проставленный
генератором, был бы хэшем ПРЕДЫДУЩЕГО коммита: сборка идёт до коммита. Ровно
на этом уже обжигались с ревизией платы. Пайплайн же знает правду — GitHub
передаёт ему и коммит, и ветку, и номер pull request.

Локально штампует sync.sh, и там честнее всего HEAD с плюсом, если в дереве
есть несохранённое: смотришь ты именно на дерево, а не на коммит.

    python3 tools/stamp_build.py _site/index.html _site/404.html \\
        --env cloudflare --sha "$SHA" --ref "$REF" --pr 2

Без --sha берётся состояние рабочего дерева.
"""

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META = re.compile(r'(<meta name="build" content=")[^"]*(">)')


def git(*args, default=""):
    try:
        out = subprocess.run(("git", "-C", str(ROOT)) + args, check=False,
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or default
    except OSError:
        return default


def local():
    """Что показывает рабочее дерево прямо сейчас."""
    sha = git("rev-parse", "--short=7", "HEAD", default="0000000")
    # Плюс к хэшу — знак того, что в дереве есть несохранённое. Без него легко
    # смотреть на страницу и думать, что видишь коммит.
    if git("status", "--porcelain"):
        sha += "+"
    return sha, git("rev-parse", "--abbrev-ref", "HEAD", default="—")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pages", nargs="+", help="страницы, куда ставить отметку")
    ap.add_argument("--env", default="local", choices=("local", "cloudflare"))
    # На продакшене отметки нет вовсе — этим он и отличается от стендов. Но и
    # оставить как есть нельзя: в закоммиченной странице лежит штамп локальной
    # сборки, и без стирания на продакшен уехало бы «локально».
    ap.add_argument("--clear", action="store_true", help="стереть отметку (продакшен)")
    ap.add_argument("--sha", default="")
    ap.add_argument("--ref", default="")
    ap.add_argument("--pr", default="")
    ap.add_argument("--repo", default="CosmDandy/cosmdandy.dev")
    args = ap.parse_args()

    if args.clear:
        stamp = ""
    else:
        sha, ref = (args.sha[:7], args.ref) if args.sha else local()
        at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        parts = [f"env={args.env}", f"repo={args.repo}", f"ref={ref or '—'}",
                 f"sha={sha}", f"at={at}"]
        if args.pr:
            parts.append(f"pr={args.pr}")
        stamp = ";".join(parts)

    for name in args.pages:
        p = Path(name)
        s = p.read_text(encoding="utf-8")
        s, n = META.subn(lambda m: m.group(1) + stamp + m.group(2), s)
        if not n:
            print(f"{name}: метки build нет — отметку ставить некуда", file=sys.stderr)
            return 1
        p.write_text(s, encoding="utf-8")
        print(f"{name}: {stamp or 'отметка стёрта'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
