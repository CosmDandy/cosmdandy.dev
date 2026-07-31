"""Compare a build against a reference: splitting the code may not change the picture.

The only thing allowed to differ is commit hashes. A unit's part number and
the board revision come from git and change with every commit, so we replace
them with a placeholder before comparing. Everything else has to match byte
for byte.

    python3 diff_ref.py <reference directory>
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
FILES = ("board-v17.svg.part", "board-v17-lid.svg.part")

# seven hex digits in a row is a hash; the silkscreen carries it uppercase
SHA = re.compile(r"\b[0-9a-fA-F]{7}\b")
# the revision number equals the commit count and grows from the work itself
REV = re.compile(r"REV \d+")

def norm(text):
    return REV.sub("REV ##", SHA.sub("·······", text))

def main(ref_dir):
    ref = Path(ref_dir)
    bad = 0
    for name in FILES:
        a, b = norm((ref / name).read_text(encoding="utf-8")), norm((HERE / name).read_text(encoding="utf-8"))
        if a == b:
            print(f"  {name}: matches ({len(b)} chars)")
            continue
        bad += 1
        # where exactly it diverged: the first mismatching char and its surroundings
        i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
        print(f"  {name}: DIVERGED at char {i} (reference {len(a)}, now {len(b)})")
        print(f"    reference: …{a[max(0, i-70):i+70]}…")
        print(f"    now      : …{b[max(0, i-70):i+70]}…")
    print("output unchanged" if not bad else f"divergences: {bad}")
    return 1 if bad else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
