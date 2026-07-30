"""Выгрузка истории платы: по одному SVG на коммит.

Плата генерируется кодом, но в git лежит уже собранной — между маркерами
BOARD:BEGIN/END в index.html. Значит история платы у нас и так есть, её
достаточно разложить по файлам, чтобы страница могла подгружать любую
версию по требованию.

Берём именно то, что было на сайте, а не пересборку старого генератора:
пересборка дала бы сегодняшний вид со старым кодом, а нужен тот вид,
который реально видели.
"""

import json
import re
import subprocess
from pathlib import Path

REPO = Path("/workspaces/cosmdandy.dev")
OUT = REPO / "history"
BOARD = re.compile(r"<!-- BOARD:BEGIN -->(.*?)<!-- BOARD:END -->", re.DOTALL)
VIEWBOX = re.compile(r'<svg viewBox="([^"]+)"[^>]*>\s*<!-- BOARD:BEGIN -->')


def git(*args):
    return subprocess.run(("git", "-C", str(REPO)) + args,
                          capture_output=True, text=True, check=True).stdout


def main():
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.svgz"):
        old.unlink()
    for old in OUT.glob("*.svg"):
        old.unlink()

    log = git("log", "--format=%h\t%ad\t%s", "--date=short", "--reverse", "--", "index.html")
    versions, seen = [], set()
    for line in log.strip().split("\n"):
        sha, date, subject = line.split("\t", 2)
        html = git("show", f"{sha}:index.html")
        m = BOARD.search(html)
        if not m:
            continue                      # коммиты до появления схемы
        body = m.group(1).strip()
        digest = hash(body)
        if digest in seen:
            continue                      # пересборка без изменений в плате
        seen.add(digest)
        vb = VIEWBOX.search(html)
        name = f"{len(versions):02d}-{sha}.svg"
        (OUT / name).write_text(body, encoding="utf-8")
        versions.append({
            "sha": sha,
            "date": date,
            "subject": subject,
            "file": name,
            "viewBox": vb.group(1) if vb else "-158 -12 1478 887",
            "size": len(body.encode()),
        })

    (OUT / "index.json").write_text(
        json.dumps(versions, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(v["size"] for v in versions)
    print(f"версий: {len(versions)}, суммарно {total / 1024 / 1024:.1f} МБ")
    for v in versions:
        print(f'  {v["sha"]} {v["date"]} {v["size"] // 1024:4d} КБ  {v["subject"][:56]}')


if __name__ == "__main__":
    main()
