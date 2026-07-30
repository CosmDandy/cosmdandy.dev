"""фронт: блок управления.

Слева вдоль всей кромки — лицевая часть панели диагностики: за неё панель и
выдвигают, и на ней же стоят лампы, которые видно, не выдвигая ничего. Так
устроен operator information panel живой машины: индикация на неподвижной
части, подробности — на выезжающей.

Правее остаются питание и VGA. USB убран — место нужнее отсекам.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (0, 0, 168, 190)

from board.geom import FRONT_W, X_FRONT, Y_PANEL
from board.ink import hit, mono
from board.lamps import glow
from board.metal import hexgrid

# Лицевая часть панели диагностики. По высоте совпадает с выдвижной частью:
# это одна деталь, просто видно её торец. Числа те же, что у панели в
# lightpath.py, — она выезжает ровно на этой полосе.
TAB_X, TAB_Y, TAB_W, TAB_H = X_FRONT + 4, 20, 30, 150


def square_led(x, y, cls, color, mark):
    """Квадратная лампа со знаком: горит подложка, знак остаётся тёмным.

    Так они и сделаны на панели: белый квадрат с чёрным трафаретом, и при
    сбое светится сам квадрат вокруг знака. Знак рисуем последним, поэтому
    он лежит поверх заливки и не меняет цвет вместе с ней.
    """
    s = 16
    return (f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="1.5" '
            f'fill="rgba(226,235,231,0.34)" stroke="rgba(147,161,161,0.34)" stroke-width="0.8"/>'
            f'<rect class="{cls} sq-led" x="{x}" y="{y}" width="{s}" height="{s}" rx="1.5" fill="{color}"/>'
            + mark)


def render(cv):
    cv.add(f'''<g class="decor">
  <rect x="{X_FRONT}" y="6" width="{FRONT_W}" height="{Y_PANEL-14}" rx="4" fill="#151d21" stroke="rgba(147,161,161,0.28)"/>
  <line x1="{TAB_X+TAB_W+6}" y1="94" x2="{X_FRONT+FRONT_W-10}" y2="94" stroke="rgba(147,161,161,0.14)" stroke-width="1"/>
</g>''')

    # Гнездо VGA: на серверах оно доживает там, где давно нет ни одного другого
    # аналогового порта — им подключают тележку с монитором прямо в стойке.
    # Трапеция D-Sub с двумя винтовыми стойками по бокам. Гнездо развёрнуто
    # поперёк: на узкой панели длинной стороной оно легло вдоль кромки.
    VGA_CX, VGA_CY, VGA_W, VGA_H = X_FRONT + 128, 122, 54, 20
    vx, vy = VGA_CX - VGA_W / 2, VGA_CY - VGA_H / 2
    cv.add(f'''<g class="decor" transform="rotate(90 {VGA_CX} {VGA_CY})">
  <path d="M{vx+3} {vy} H{vx+VGA_W-3} L{vx+VGA_W} {vy+VGA_H} H{vx} Z"
        fill="#12303f" stroke="rgba(147,161,161,0.34)" stroke-width="1.2"/>
  {''.join(f'<circle cx="{vx+9+c*6.4:.1f}" cy="{vy+6+r*6}" r="1.2" fill="rgba(147,161,161,0.34)"/>'

           for r in range(2) for c in range(6 if r == 0 else 5))}
  {''.join(f'<circle cx="{sx}" cy="{vy+VGA_H/2}" r="3.4" fill="#1b2429" stroke="rgba(147,161,161,0.30)"/>'

           for sx in (vx - 6, vx + VGA_W + 6))}
</g>
<g class="decor">{mono(VGA_CX, VGA_CY + 40, "VGA", 7, op=0.4)}</g>''')

    # Воздухозаборник: между блоком управления и отсеками фронт перфорирован —
    # через эти соты вентиляторы и тянут воздух. Сетка мелкая, иначе панель
    # теряет жёсткость.
    cv.add(f'<g class="decor" opacity="0.5">{hexgrid(TAB_X + TAB_W + 10, 100, 66, 70, s=4, gap=3)}</g>')

    PWR_X = TAB_X + TAB_W + 48
    cv.add(f'''<g class="power-btn" id="power" role="button" tabindex="0" aria-label="Питание">
  {hit(PWR_X-32, 16, 64, 76)}
  <circle cx="{PWR_X}" cy="50" r="21" fill="#0f1619" stroke="rgba(147,161,161,0.34)"/>
  <circle class="pwr-ring" cx="{PWR_X}" cy="50" r="12" fill="none" stroke="#586e75" stroke-width="2.2"/>
  <line x1="{PWR_X}" y1="38" x2="{PWR_X}" y2="48" stroke="#586e75" stroke-width="2.2" stroke-linecap="round"/>
  <circle class="pwr-led" cx="{PWR_X}" cy="50" r="25" fill="none" stroke="#859900" stroke-width="2.2"/>
  {mono(PWR_X, 86, "POWER", 7, op=0.42)}
</g>''')

    # ── лицевая часть панели диагностики ────────────────────────────────
    cx = TAB_X + TAB_W / 2
    # Насечка со стрелкой: за неё берутся пальцем и тянут панель на себя.
    grip = ''.join(f'<line x1="{cx-9+k*4.5}" y1="{TAB_Y+8}" x2="{cx-9+k*4.5}" y2="{TAB_Y+26}" '
                   f'stroke="rgba(147,161,161,0.5)" stroke-width="2"/>' for k in range(5))
    # Стрелка показывает, куда панель идёт: наружу, то есть влево.
    grip += (f'<path d="M{cx+8} {TAB_Y+36} h-10 m0 -5 l-6 5 6 5 z" fill="rgba(38,139,210,0.75)" '
             f'stroke="rgba(38,139,210,0.75)" stroke-width="1.6" stroke-linejoin="round"/>')

    # Ошибка системы: жёлтый квадрат с восклицательным знаком.
    err_y = TAB_Y + 50
    err_mark = (f'<rect x="{cx-1.3}" y="{err_y+3.5}" width="2.6" height="6.6" rx="1" fill="#0a1013"/>'
                f'<circle cx="{cx}" cy="{err_y+12.6}" r="1.5" fill="#0a1013"/>')
    # Информация: то же событие, но не отказ — круглая лампа с «i».
    inf_y = err_y + 26
    # Опознание в стойке: синий квадрат с маячком. Он же кнопка — по ней
    # жмут, чтобы найти машину в ряду одинаковых.
    id_y = inf_y + 22

    cv.add(f'''<g class="lp-tab" id="lp-tab" role="button" tabindex="0" aria-label="Панель диагностики">
  {hit(TAB_X, TAB_Y, TAB_W, 48)}
  <rect x="{TAB_X}" y="{TAB_Y}" width="{TAB_W}" height="{TAB_H}" rx="2" fill="#0f1619" stroke="rgba(147,161,161,0.3)"/>
  {grip}
  <g class="decor">
    {square_led(cx - 8, err_y, 'fault-sys', '#b58900', err_mark)}
    {glow('fault-sys', cx, err_y + 8, 8, '#b58900')}
    <circle cx="{cx}" cy="{inf_y+8}" r="8" fill="none" stroke="rgba(147,161,161,0.42)" stroke-width="1.1"/>
    <circle class="led-info" cx="{cx}" cy="{inf_y+8}" r="8" fill="#b58900"/>
    {mono(cx, inf_y + 11, "i", 9, op=0.62)}
  </g>
</g>''')

    # Маячок: конус света книзу и лучи по сторонам — тот же знак, что выбит на
    # живой панели. Лучи разносим шире конуса, иначе знак слипается в кляксу.
    id_mark = (f'<path d="M{cx-5} {id_y+13} L{cx-1.4} {id_y+6} H{cx+1.4} L{cx+5} {id_y+13} Z" fill="#0a1013"/>'
               f'<line x1="{cx-7}" y1="{id_y+2.4}" x2="{cx-4.4}" y2="{id_y+4.6}" stroke="#0a1013" stroke-width="1.3"/>'
               f'<line x1="{cx+7}" y1="{id_y+2.4}" x2="{cx+4.4}" y2="{id_y+4.6}" stroke="#0a1013" stroke-width="1.3"/>'
               f'<line x1="{cx}" y1="{id_y+1.8}" x2="{cx}" y2="{id_y+4}" stroke="#0a1013" stroke-width="1.3"/>')
    cv.add(f'''<g class="id-btn" id="id-btn" role="button" tabindex="0" aria-label="Опознание в стойке">
  {hit(TAB_X+2, id_y-3, TAB_W-4, 22)}
  {square_led(cx - 8, id_y, 'led-id', '#268bd2', id_mark)}
  {glow('led-id', cx, id_y + 8, 8, '#268bd2')}
</g>''')

    # Четыре лампы сетевых портов — по одной на порт, как на живой панели:
    # по ним видно, что линк есть, ещё до того, как машина покажет что-либо.
    net_y = id_y + 26
    net = [(f'<path d="M{cx-9} {net_y} h6 M{cx-6} {net_y} v10 M{cx-6} {net_y+5} h6 M{cx-6} {net_y+10} h6" '
            f'fill="none" stroke="rgba(147,161,161,0.38)" stroke-width="1.1"/>')]
    for p in range(4):
        lx, ly = cx - 3 + (p % 2) * 11, net_y + (p // 2) * 12
        net.append(f'<circle cx="{lx}" cy="{ly}" r="2.6" fill="#0a1013" stroke="rgba(147,161,161,0.22)"/>')
        net.append(f'<circle class="led-link" cx="{lx}" cy="{ly}" r="2.6" fill="#859900"/>')
    cv.add(f'<g class="decor">{"".join(net)}'
           f'{mono(cx, TAB_Y + TAB_H - 6, "LP", 6.5, op=0.34)}</g>')
