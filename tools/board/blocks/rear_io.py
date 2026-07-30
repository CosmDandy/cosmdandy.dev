"""задняя панель: то, что распаяно на самой плате.

Гигабитные розетки и порт управления выходят прямо с платы, поэтому
остаются на месте, когда райзер с сетевой картой вынут. Сами SFP+ живут в
блоке райзеров: они торец карты, а не отверстия в стенке.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
# Модуль интерфейсов стоит на плате и уходит вглубь от задней стенки.
BOUNDS = (1060, 448, 240, 274)

from board.geom import IO_H, IO_Y, X_IO
from board.ink import mono
from board.lamps import act_led
from board.ports import rj45
from board.revision import stamp
from board.spec import PORTS


def render(cv):
    # Встроенные интерфейсы — не дырки в стенке, а модуль, который стоит на
    # плате и в неё же входит: снизу у него ряд контактов, как у карты в
    # райзере. Разница с картой в том, что этот модуль несъёмный — он и
    # держит гнёзда на месте, когда райзер вынут.
    # Полоса между нижним райзером и вторым блоком питания — всё, что
    # осталось от задней части. Модуль вписан ровно в неё.
    BX, BY, BW, BH = X_IO - 148, IO_Y, 234, IO_H
    cv.callouts.append((X_IO - 30, BY + 22, X_IO + 4, BY + 40, "Telegram", "end", "https://t.me/cosmdandy", "eth"))
    cv.callouts.append((X_IO - 30, BY + 74, X_IO + 4, BY + 74, "Twitter", "end", "https://x.com/cosmdandy", "tw"))
    cv.callouts.append((X_IO - 30, BY + 126, X_IO + 4, BY + 112, "Email", "end", "mailto:i@cosmdandy.dev", "bmc"))

    cv.add(f'''<g class="decor">
  <rect x="{BX}" y="{BY}" width="{BW}" height="{BH}" rx="3" fill="#0f2226"
        stroke="rgba(42,161,152,0.34)"/>
  {"".join(f'<line x1="{BX + 12 + c * 7}" y1="{BY + BH}" x2="{BX + 12 + c * 7}" y2="{BY + BH + 7}" stroke="rgba(206,168,58,0.5)" stroke-width="1.6"/>' for c in range(int((BW - 30) // 7)))}
  <rect x="{BX + 8}" y="{BY + 8}" width="46" height="34" rx="2" fill="#16222a"
        stroke="rgba(147,161,161,0.30)"/>
  {mono(BX + 31, BY + 56, "PHY", 6, op=0.36)}
</g>''')

    # Две гигабитные розетки — две разные ссылки. Общая рамка остаётся: это одна
    # карта, её и вынимают целиком, — но подсвечивается и открывается каждая
    # розетка своя, поэтому unit вложен в pick, а не наоборот.
    def rj_port(y, group, href, salt, seed):
        """Розетка с полным набором ламп: линк, приём, передача.

    На живой розетке их две — зелёная слева, янтарная справа, — но приём и
    передачу видно по тому, какая моргает; здесь они разнесены явно.
    """
        return (f'<g class="unit" data-group="{group}" data-href="{href}">'
                f'<g class="body">'
                f'<rect x="{X_IO+4}" y="{y-8}" width="78" height="40" rx="3" fill="#0f2226" '
                f'stroke="rgba(42,161,152,0.26)"/>'
                f'{rj45(X_IO+22, y)}'
                # у розетки две лампы: линк горит ровно, активность мигает
                f'<circle class="led-link" cx="{X_IO+12}" cy="{y+2}" r="2.8" fill="#859900"/>'
                + mono(X_IO + 12, y + 12, "LNK", 4, op=0.32)
                + act_led(seed, X_IO + 12, y + 22, 2.8, "#b58900", salt=salt)
                + '</g></g>')

    cv.add(f'''<g class="pick" data-unit="eth">
  <g class="pick-body">
    {rj_port(BY + 28, "eth", "https://t.me/cosmdandy", 4, 6)}
    {rj_port(BY + 70, "tw", "https://x.com/cosmdandy", 7, 11)}
  </g>
  {mono(X_IO-96, BY + 116, PORTS['eth'], 8, op=0.5)}
</g>''')

    # Порт управления живёт своей жизнью: он на дежурном питании и работает,
    # когда машина выключена, поэтому и подписан отдельно.
    cv.add(f'''<g class="unit" data-unit="bmc" data-group="bmc" data-href="mailto:i@cosmdandy.dev">
  <g class="pick-body">
    <rect x="{X_IO}" y="{BY + 100}" width="86" height="52" rx="5" fill="#1a1f14"
          stroke="rgba(181,137,0,0.55)"/>
    {rj45(X_IO+16, BY + 110)}
    {act_led(9, X_IO+8, BY + 108, 3, "#b58900", salt=6, aux=True)}
  </g>
  {mono(X_IO+43, BY + 166, PORTS['mgmt'], 8, op=0.55)}
</g>''')

    cv.add(stamp(X_IO + 43, BY - 12, "задняя панель", anchor="middle"))
    cv.add(f'''<g class="decor">
  <rect x="{X_IO}" y="{BY - 92}" width="86" height="30" rx="4" fill="#121a1e" stroke="rgba(147,161,161,0.22)"/>
  <rect x="{X_IO+12}" y="{BY - 85}" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+34}" y="{BY - 85}" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+56}" y="{BY - 85}" width="12" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  {mono(X_IO+43, BY - 50, "USB · mDP", 8, op=0.42)}
  <circle class="fault-sys" cx="{X_IO+18}" cy="{BY - 26}" r="6" fill="#b58900"/>
  {mono(X_IO+18, BY - 8, "!", 9, op=0.4)}
  <circle class="led-id" cx="{X_IO+62}" cy="{BY - 26}" r="6" fill="#268bd2"/>
  {mono(X_IO+62, BY - 8, "ID", 9, op=0.4)}
</g>''')
