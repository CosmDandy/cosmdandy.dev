#!/usr/bin/env python3
"""Слои платы: сверка наслоений с базой.

  python3 tools/layers.py            сверить с базой, упасть на регрессе
  python3 tools/layers.py --update   переписать базу текущим состоянием
  python3 tools/layers.py --list     все находки с адресами и хозяевами
  python3 tools/layers.py --json     машиночитаемо

Зачем отдельно от сборки. Сборка уже считает наслоения — но кладёт их в слой
разметки, который смотрят глазами, включив галочку в панели. Глаз держит в
памяти «вроде было столько же», и незамеченным проходит ровно то, что и надо
ловить: одна новая находка среди девяноста старых.

Почему база, а не ноль. Наслоений сейчас девяносто семь, и половина из них —
законные решения, которые правило не умеет отличить от ошибки: узел, стоящий
в чужой брони по замыслу; медь, выходящая за кромку там, где кромка нарисована
с запасом. Требовать нуля значит требовать переписать плату целиком, а до тех
пор держать проверку выключенной. База отвечает на вопрос, который на самом
деле задают после правки: «стало хуже, чем было?»

Сигнатура находки — не адрес. Адреса (`B14`, `R7`) нумеруются по порядку
сборки, и любая правка блока сдвигает номера у всего, что идёт после него:
база разошлась бы с реальностью от переименования, а не от поломки. Поэтому
находка опознаётся парой видов и парой блоков-хозяев — `minor+reserve
pcb_scatter+pcb_zones`, — а число под этим ключом говорит, сколько их там.
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from build import ORDER, build, overlaps, reserve_report

BASE = Path(__file__).parent / 'layers.json'


def signature(hit):
    """Ключ, по которому находка узнаётся между сборками."""
    a, b = hit['kinds']
    by, who = (x or '?' for x in hit['by'])
    # Хозяева сортируются в порядке сборки, а не по алфавиту: пара «кто на кого
    # залез» читается по ORDER, и обратный порядок в ключе означал бы другую
    # находку там, где она та же самая.
    at = lambda n: ORDER.index(n) if n in ORDER else -1
    if at(by) > at(who):
        (a, b), (by, who) = (b, a), (who, by)
    return f'{a}+{b} {by}+{who}'


def survey():
    """Текущее состояние платы: наслоения, что не поместилось, пустая бронь."""
    board, _lid, report = build()
    hits = list(overlaps(board))
    return {
        'overlaps': dict(sorted(Counter(signature(h) for h in hits).items())),
        # Сборка кладёт находки одной строкой через запятую: «обозначения
        # J30, J31». Сравнивая её целиком, база считала бы регрессом любое
        # изменение состава — в том числе такое, где половина как раз
        # поместилась. Разбираем на отдельные имена.
        'lost': sorted(part.strip() for line in board.lost
                       for part in str(line).split(',') if part.strip()),
        'hollow': sorted(
            line.split(':')[1].split('держит')[0].strip()
            for line in reserve_report(board, report)
        ),
    }, hits


def compare(now, base):
    """Что стало хуже. Пустой список — можно выкатывать."""
    bad = []
    for key, count in now['overlaps'].items():
        was = base.get('overlaps', {}).get(key, 0)
        if count > was:
            bad.append(f'наслоений {key}: было {was}, стало {count}')
    for name in now['lost']:
        if name not in base.get('lost', []):
            bad.append(f'не поместилось: {name}')
    for name in now['hollow']:
        if name not in base.get('hollow', []):
            bad.append(f'бронь почти пуста: {name}')
    return bad


def better(now, base):
    """Что стало лучше — база устарела и её стоит обновить."""
    good = []
    for key, was in base.get('overlaps', {}).items():
        count = now['overlaps'].get(key, 0)
        if count < was:
            good.append(f'наслоений {key}: было {was}, стало {count}')
    for name in base.get('lost', []):
        if name not in now['lost']:
            good.append(f'поместилось: {name}')
    for name in base.get('hollow', []):
        if name not in now['hollow']:
            good.append(f'бронь наполнилась: {name}')
    return good


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--update', action='store_true', help='переписать базу')
    ap.add_argument('--list', action='store_true', help='все находки поимённо')
    ap.add_argument('--json', action='store_true', help='машиночитаемый вывод')
    args = ap.parse_args()

    now, hits = survey()
    total = sum(now['overlaps'].values())

    if args.json:
        print(json.dumps(now, ensure_ascii=False, indent=2))
        return 0

    if args.list:
        for hit in sorted(hits, key=lambda h: -h['share']):
            a, b = hit['kinds']
            by, who = hit['by']
            i, j = hit['nums']
            x, y, w, h = hit['rect']
            print(f'{a}{i}+{b}{j}  {by} + {who}  '
                  f'({x:.0f},{y:.0f}) {w:.0f}×{h:.0f}  {hit["share"]:.0%}')
        print(f'\nвсего {total}')
        return 0

    if args.update:
        BASE.write_text(json.dumps(now, ensure_ascii=False, indent=2) + '\n',
                        encoding='utf-8')
        print(f'база переписана: {total} наслоений, {len(now["lost"])} не влезло, '
              f'{len(now["hollow"])} пустых броней')
        return 0

    if not BASE.exists():
        print(f'базы нет. Снять текущее состояние: python3 {Path(__file__).name} --update',
              file=sys.stderr)
        return 2

    base = json.loads(BASE.read_text(encoding='utf-8'))
    bad, good = compare(now, base), better(now, base)

    print(f'наслоений {total}, не влезло {len(now["lost"])}, '
          f'пустых броней {len(now["hollow"])}')
    for line in good:
        print(f'  лучше: {line}')
    for line in bad:
        print(f'  ХУЖЕ: {line}')

    if bad:
        print(f'\nСлои разошлись с базой. Если так и задумано — '
              f'python3 tools/{Path(__file__).name} --update', file=sys.stderr)
        return 1
    if good:
        print('\nСтало лучше — стоит обновить базу: python3 tools/layers.py --update')
    return 0


if __name__ == '__main__':
    sys.exit(main())
