"""Общие скрипты — одним исходником на три страницы, но без лишних запросов.

`tools/theme.js` остаётся единственным местом, где живёт выключатель светлой
темы и предотрисовочная логика; `tools/rum.js` — единственным, где живёт сбор
мерок от гостя. Отдельными файлами они и грузились бы — блокирующий запрос
перед первым кадром на каждой странице: на мобильной задержке это сотня-другая
миллисекунд впустую, а весит тема четыре килобайта.

Поэтому исходник один, а в страницы он вставляется сборкой — тем же способом,
которым туда попадает схема: между метками. Правится по-прежнему одно место,
запросов больше не делается ни одного.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ("index.html", "404.html", "tg/index.html")

# Метка → исходник. Страница, где метки нет, просто пропускается: мерка стоит
# не везде, и молчаливый пропуск здесь правильнее, чем требование поставить
# метку ради пустоты.
PARTS = (
    ("THEME", ROOT / "tools" / "theme.js"),
    ("RUM", ROOT / "tools" / "rum.js"),
)


def splice(name, mark, body):
    """Вставить тело между метками одной страницы. Возвращает, нашлись ли метки."""
    begin, end = f"<!-- {mark}:BEGIN -->", f"<!-- {mark}:END -->"
    page = ROOT / name
    s = page.read_text(encoding="utf-8")
    m = re.search(r"([ \t]*)" + re.escape(begin) + r".*?" + re.escape(end), s, re.DOTALL)
    if not m:
        return False
    # Отступ у вставки свой на каждой странице: он берётся от метки, а не
    # задаётся здесь, — иначе разметка после сборки выглядит съехавшей.
    pad = m.group(1)
    inner = "\n".join(pad + "    " + ln if ln else "" for ln in body.split("\n"))
    block = f"{pad}{begin}\n{pad}<script>\n{inner}\n{pad}</script>\n{pad}{end}"
    if s[m.start():m.end()] != block:
        page.write_text(s[:m.start()] + block + s[m.end():], encoding="utf-8")
    return True


def main():
    for mark, src in PARTS:
        body = src.read_text(encoding="utf-8").rstrip("\n")
        done = [name for name in PAGES if splice(name, mark, body)]
        print(f"{mark.lower()}: {len(body)} байт вставлено в {len(done)} страниц "
              f"({', '.join(done) or '—'})")


if __name__ == "__main__":
    sys.exit(main())
