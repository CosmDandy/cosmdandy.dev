"""Политика безопасности — с хэшами встроенных скриптов, а не разрешением всему.

    python3 tools/csp.py [корень]

Зачем она вообще нужна статическому сайту. Сервера тут нет, ломать нечего —
уязвим не сервер, а браузер гостя: без политики он выполнит любой скрипт,
который окажется в разметке, откуда бы тот там ни взялся. На статике вектор
узкий, но политика стоит один заголовок, а закрывает целый класс.

Почему хэши, а не `'unsafe-inline'`. Разрешение «всё встроенное» делает
политику декоративной: ровно то, чем пользуется внедрённый скрипт, ею и
разрешено. Хэш разрешает шесть конкретных скриптов, которые мы сами написали,
и ничего больше. Встроенных обработчиков (`onclick=`) на странице нет ни
одного, поэтому `'unsafe-hashes'` не нужен — а он бы всю строгость и снял.

Стилям `'unsafe-inline'` оставлен: шестьдесят атрибутов `style=` в схеме, и
хэшируются такие атрибуты только вместе с `'unsafe-hashes'`, то есть ценой
дыры в скриптах. Атрибут стиля сам по себе кода не исполняет.

Считается по собранным страницам и переписывает `_headers` рядом с ними.
В конвейере запускается ПОСЛЕ минификации: она меняет тела скриптов, а значит
и хэши. Посчитанные до неё политика отвергла бы собственную страницу целиком.
"""

import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ("index.html", "404.html", "tg/index.html")

# Скрипт без src и без типа (или с явным javascript) — исполняемый, ему нужен
# хэш. `application/json` и `ld+json` браузер не исполняет: это данные, и
# политика их не проверяет.
#
# Правила предзагрузки — исключение, о котором легко забыть: кода они не
# содержат, но политика проверяет их наравне со скриптами, и без хэша браузер
# молча их не применит. Молча — потому что предзагрузка не обязана случиться,
# и её отсутствие ничем не отличается от «гость не наводил».
SCRIPT = re.compile(
    r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', re.DOTALL | re.IGNORECASE)
TYPE = re.compile(r'\btype\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+))', re.IGNORECASE)

# Типы, которые политика проверяет. Пустой — это обычный скрипт.
CHECKED = {"", "text/javascript", "module", "speculationrules"}


def checked(attrs):
    """Проверяет ли политика этот тег — то есть нужен ли ему хэш.

    Тип разбирается явно, а не отрицательным просмотром вперёд в одной
    регулярке: с необязательной кавычкой движок пробует вариант без неё,
    просмотр смотрит на саму кавычку и проходит — и `speculationrules`
    оказывался «данными». Хэш для него не считался, политика его не
    разрешала, а браузер молча не применял правила предзагрузки: она не
    обязана случиться, и её отсутствие ничем не отличается от «не наводили».
    """
    m = TYPE.search(attrs)
    if not m:
        return True
    value = next(g for g in m.groups() if g is not None)
    return value.strip().lower() in CHECKED

BEGIN = "# CSP:BEGIN"
END = "# CSP:END"


def hashes(root):
    """sha256 каждого исполняемого встроенного скрипта на всех страницах."""
    found = set()
    for name in PAGES:
        page = root / name
        if not page.exists():
            continue
        html = page.read_text(encoding="utf-8")
        for attrs, body in SCRIPT.findall(html):
            if not checked(attrs):
                continue      # это данные, политика их не смотрит
            digest = hashlib.sha256(body.encode("utf-8")).digest()
            found.add("'sha256-" + base64.b64encode(digest).decode() + "'")
    return sorted(found)


def policy(script_hashes):
    """Строка политики. Каждая директива — с причиной, по которой она такая."""
    return "; ".join([
        # Всё своё и ничего чужого: сторонних запросов на сайте нет ни одного,
        # и появление такого — само по себе повод узнать.
        "default-src 'self'",
        # Скрипты — только перечисленные поимённо плюс собственный файл схемы.
        "script-src 'self' " + " ".join(script_hashes),
        # Атрибуты style в схеме; кода они не исполняют.
        "style-src 'self' 'unsafe-inline'",
        # Значок сайта нарисован прямо в разметке.
        "img-src 'self' data:",
        "font-src 'self'",
        # Мерки уходят на свой же /rum.
        "connect-src 'self'",
        # Встроить страницу в чужой фрейм нельзя: это защита от подмены
        # нажатий поверх невидимой копии сайта.
        "frame-ancestors 'none'",
        # base-uri закрывает подмену адресной базы, form-action — увод формы
        # на чужой сервер. Форм на сайте нет, и пусть не появятся незаметно.
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
    ])


BLOCK = """{begin}
# Сгенерировано tools/csp.py по собранным страницам — правится там, а не здесь.
# Хэши перечисляют встроенные скрипты поимённо: любой другой браузер выполнять
# откажется. Считать их надо после минификации, иначе они не от тех тел.
/*
  Content-Security-Policy: {csp}
  # Первый заход по http можно перехватить; после него браузер год ходит
  # только по https, не спрашивая.
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  # Без него браузер угадывает тип файла по содержимому и может выполнить
  # картинку как скрипт.
  X-Content-Type-Options: nosniff
  # По умолчанию на чужой сайт уезжает полный адрес страницы, с которой ушли.
  # Здесь уедет только имя домена, и только по https.
  Referrer-Policy: strict-origin-when-cross-origin
  # Ничего из этого сайту не нужно, и просить это от его имени не должен никто.
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  # Вкладка изолируется от той, что её открыла.
  Cross-Origin-Opener-Policy: same-origin
{end}"""


def main(argv):
    root = Path(argv[0]) if argv else ROOT
    headers = root / "_headers"
    if not headers.exists():
        print(f"нет {headers}", file=sys.stderr)
        return 1

    script_hashes = hashes(root)
    if not script_hashes:
        print("встроенных скриптов не найдено — политика вышла бы пустой", file=sys.stderr)
        return 1

    block = BLOCK.format(begin=BEGIN, end=END, csp=policy(script_hashes))
    text = headers.read_text(encoding="utf-8")
    if BEGIN in text and END in text:
        text = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END), block,
                      text, flags=re.DOTALL)
    else:
        text = text.rstrip("\n") + "\n\n" + block + "\n"
    headers.write_text(text, encoding="utf-8")
    print(f"csp: {len(script_hashes)} встроенных скриптов разрешено поимённо")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
