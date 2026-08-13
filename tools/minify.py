"""Комментарии остаются в репозитории, а не уезжают гостю.

server.css и server.js — файлы собранные: исходники лежат в tools/board/ и
объясняют каждое решение, а склейка отправляется в браузер целиком, вместе с
объяснениями. В стилях это 62 % символов, в скрипте 35 %. Померено на телефоне
(4G, процессор вчетверо слабее): по проводу 320 → 218 КБ, первая отрисовка
1504 → 836 мс, отзывчивость 2006 → 1434 мс. Стили при этом блокируют кадр, так
что половина выигрыша приходит от одного файла.

Работает по копии в _site, а не по репозиторию: читаемость исходников — не
цена за скорость, платить её незачем.

Почему свой, а не esbuild. Померено: esbuild даёт 37,7 КБ против 42,0 у этого
скрипта. Весь выигрыш здесь от удаления комментариев, а переименование
переменных почти ничего не добавляет — длинные имена brotli сжимает и так.
Четыре килобайта не стоят зависимости в конвейере.

Почему сканер, а не пара регулярок. Пробовал: `\\s*([{};:,>~+])\\s*` съедает
пробелы в `calc(1.15s + var(--tag-order))` — а calc без них невалиден, и
правило молча выпадает. И превращает `.rig :focus` в `.rig:focus`, то есть в
другой селектор. Ни того, ни другого не видно ни в тестах поведения, ни на
глаз — поэтому контекст приходится разбирать честно.

    python3 tools/minify.py _site
"""

import re
import sys
from pathlib import Path

CSS = ('style.css', 'server.css', 'tg/style.css')
JS = ('server.js',)

# At-правила, тело которых — снова правила, а не объявления. Всё остальное
# (@font-face, @property, @page) внутри содержит объявления, и двоеточие там
# разделяет свойство и значение, а не открывает псевдокласс.
NESTED = ('media', 'supports', 'document', 'keyframes', 'layer', 'container', 'scope')


def _at_nested(head):
    """Тело этого at-правила состоит из правил?"""
    m = re.match(r'\s*@(-\w+-)?([a-z-]+)', head)
    return bool(m) and m.group(2) in NESTED


def css(src):
    """Стили: комментарии прочь, пробелы схлопнуть — с оглядкой на контекст.

    Пробел значим в двух местах, и оба выглядят как мусор: комбинатор потомка
    в селекторе и арифметика внутри calc(). Поэтому сканер знает, где стоит:
    в селекторе, в объявлении, в строке или в скобках.
    """
    out = []
    i, n = 0, len(src)
    # Стек контекстов: True — внутри объявлений, False — среди правил.
    decl = [False]
    depth_paren = 0
    head = ''            # то, что набралось до текущей `{`

    def last():
        return out[-1] if out else ''

    while i < n:
        c = src[i]

        # Комментарий. Внутри строк сюда не попадаем — строки съедаются ниже.
        if c == '/' and src[i + 1:i + 2] == '*':
            end = src.find('*/', i + 2)
            i = n if end < 0 else end + 2
            # На месте комментария остаётся граница: `a/**/b` — два токена.
            if last() not in ('', ' ', '{', '}', ';', ':', ',', '('):
                out.append(' ')
            continue

        # Строка целиком, как есть.
        if c in '"\'':
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                elif src[j] == c:
                    break
                else:
                    j += 1
            out.append(src[i:j + 1])
            head += src[i:j + 1]
            i = j + 1
            continue

        # url(...) без кавычек: внутри может быть что угодно, включая `//`.
        if c == 'u' and src[i:i + 4].lower() == 'url(' and depth_paren == 0:
            end = src.find(')', i)
            if end > 0:
                out.append(re.sub(r'\s+', '', src[i:end + 1]))
                i = end + 1
                continue

        if c.isspace():
            j = i
            while j < n and src[j].isspace():
                j += 1
            nxt = src[j] if j < n else ''
            prev = last()[-1:] if last() else ''
            keep = True
            if depth_paren:
                # В скобках пробел значим только вокруг знаков арифметики:
                # calc(a + b). Вокруг запятой и краёв — нет.
                keep = not (prev in '(,' or nxt in '),')
            elif decl[-1]:
                # В объявлении пробел не нужен ни у краёв, ни у разделителей.
                keep = not (prev in '{;:,' or nxt in '};:,!' or prev == '' )
            else:
                # В селекторе пробел — комбинатор потомка. Убираем только
                # рядом с явными комбинаторами и границами блока.
                keep = not (prev in '{},>+~' or nxt in '{},>+~' or prev == '')
            if keep:
                out.append(' ')
                head += ' '
            i = j
            continue

        if c == '(':
            depth_paren += 1
        elif c == ')':
            depth_paren = max(0, depth_paren - 1)
        elif c == '{':
            decl.append(not _at_nested(head))
            head = ''
        elif c == '}':
            # Точка с запятой перед закрывающей скобкой лишняя.
            while out and out[-1] in (' ', ';'):
                out.pop()
            if len(decl) > 1:
                decl.pop()
            head = ''
        elif c == ';':
            while out and out[-1] == ' ':
                out.pop()
            head = ''
        else:
            head += c

        out.append(c)
        i += 1

    return ''.join(out).strip()


def js(src):
    """Скрипт: комментарии прочь, отступы прочь, переводы строк на месте.

    Переводы строк остаются намеренно: без них правит автоподстановка точки с
    запятой, и `return`, оторванный от своего значения, начинает возвращать
    undefined. Байты, которые они стоят, brotli всё равно съедает.

    Строки, шаблоны и регулярные литералы неприкосновенны — `//` внутри любого
    из них не начинает комментарий, и именно на этом ломаются регулярки.
    """
    out = []
    i, n = 0, len(src)
    prev = ''            # хвост уже разобранного, чтобы отличить деление от regex

    def regex_here():
        t = prev.rstrip()
        return bool(re.search(r'[=(,:\[!&|?{};+\-*%~^]$', t)
                    or re.search(r'\b(return|typeof|case|in|of|new|do|else|void|await|yield)$', t))

    while i < n:
        c = src[i]
        nx = src[i + 1:i + 2]

        if c == '/' and nx == '/':
            while i < n and src[i] != '\n':
                i += 1
            continue

        if c == '/' and nx == '*':
            end = src.find('*/', i + 2)
            i = n if end < 0 else end + 2
            continue

        if c in '"\'`':
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                elif src[j] == c:
                    break
                else:
                    j += 1
            lit = src[i:j + 1]
            out.append(lit)
            prev = (prev + lit)[-48:]
            i = j + 1
            continue

        if c == '/' and regex_here():
            j, cls, ok = i + 1, False, True
            while j < n:
                if src[j] == '\\':
                    j += 2
                elif src[j] == '[':
                    cls, j = True, j + 1
                elif src[j] == ']':
                    cls, j = False, j + 1
                elif src[j] == '/' and not cls:
                    break
                elif src[j] == '\n':
                    ok = False
                    break
                else:
                    j += 1
            if ok and j < n:
                while j + 1 < n and src[j + 1] in 'dgimsuvy':
                    j += 1
                lit = src[i:j + 1]
                out.append(lit)
                prev = (prev + lit)[-48:]
                i = j + 1
                continue

        out.append(c)
        prev = (prev + c)[-48:]
        i += 1

    lines = (ln.strip() for ln in ''.join(out).split('\n'))
    return '\n'.join(ln for ln in lines if ln)


def main(argv):
    if not argv:
        print(__doc__.strip().splitlines()[-1].strip())
        return 1
    root = Path(argv[0])
    total_was = total_now = 0
    for name, fn in [(n, css) for n in CSS] + [(n, js) for n in JS]:
        path = root / name
        if not path.exists():
            continue
        was = path.read_text(encoding='utf-8')
        now = fn(was)
        path.write_text(now, encoding='utf-8')
        a, b = len(was.encode()), len(now.encode())
        total_was, total_now = total_was + a, total_now + b
        print(f'  {name:16} {a:8} → {b:8}  −{100 - b * 100 // a}%')
    if not total_was:
        print('нечего минифицировать: не тот корень?')
        return 1
    print(f'минификация: {total_was} → {total_now} байт, '
          f'−{(total_was - total_now) // 1024} КБ')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
