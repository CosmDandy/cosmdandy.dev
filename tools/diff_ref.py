"""Сверка сборки с эталоном: разрез не имеет права менять картинку.

Единственное, чему разрешено разойтись, — хэши коммитов. Партномер узла и
ревизия платы берутся из git и меняются при каждом коммите, поэтому перед
сравнением их заменяем заглушкой. Всё остальное обязано совпасть побайтово.

    python3 diff_ref.py <каталог с эталоном>
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
FILES = ("board-v17.svg.part", "board-v17-lid.svg.part")

# семь шестнадцатеричных подряд — это хэш; в верхнем регистре он в шелкографии
SHA = re.compile(r"\b[0-9a-fA-F]{7}\b")

def norm(text):
    return SHA.sub("·······", text)

def main(ref_dir):
    ref = Path(ref_dir)
    bad = 0
    for name in FILES:
        a, b = norm((ref / name).read_text(encoding="utf-8")), norm((HERE / name).read_text(encoding="utf-8"))
        if a == b:
            print(f"  {name}: совпадает ({len(b)} симв)")
            continue
        bad += 1
        # где именно разошлось: первый несовпавший символ и его окрестность
        i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
        print(f"  {name}: РАЗОШЛОСЬ на символе {i} (эталон {len(a)}, стало {len(b)})")
        print(f"    эталон: …{a[max(0, i-70):i+70]}…")
        print(f"    стало : …{b[max(0, i-70):i+70]}…")
    print("вывод не изменился" if not bad else f"расхождений: {bad}")
    return 1 if bad else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
