"""Тема — одним исходником на три страницы, но без четвёртого запроса.

`tools/theme.js` остаётся единственным местом, где живёт выключатель светлой
темы и предотрисовочная логика. Отдельным файлом он и грузился — и это был
блокирующий запрос перед первым кадром на каждой странице: на мобильной
задержке это сотня-другая миллисекунд впустую, а весит он четыре килобайта.

Поэтому исходник один, а в страницы он вставляется сборкой — тем же способом,
которым туда попадает схема: между метками. Правится по-прежнему одно место,
запросов больше не делается ни одного.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "theme.js"
PAGES = ("index.html", "404.html", "tg/index.html")

BEGIN = "<!-- THEME:BEGIN -->"
END = "<!-- THEME:END -->"


def main():
    body = SRC.read_text(encoding="utf-8").rstrip("\n")
    # Отступ у вставки свой на каждой странице: он берётся от метки, а не
    # задаётся здесь, — иначе разметка после сборки выглядит съехавшей.
    done = []
    for name in PAGES:
        page = ROOT / name
        s = page.read_text(encoding="utf-8")
        m = re.search(r"([ \t]*)" + re.escape(BEGIN) + r".*?" + re.escape(END),
                      s, re.S)
        if not m:
            print(f"  {name}: меток нет, пропущено")
            continue
        pad = m.group(1)
        inner = "\n".join(pad + "    " + ln if ln else "" for ln in body.split("\n"))
        block = f"{pad}{BEGIN}\n{pad}<script>\n{inner}\n{pad}</script>\n{pad}{END}"
        if s[m.start():m.end()] != block:
            page.write_text(s[:m.start()] + block + s[m.end():], encoding="utf-8")
        done.append(name)
    print(f"theme: {len(body)} байт вставлено в {len(done)} страниц ({', '.join(done)})")


if __name__ == "__main__":
    sys.exit(main())
