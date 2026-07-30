"""задняя панель: то, что распаяно на самой плате.

Гигабитные розетки и порт управления выходят прямо с платы, поэтому
остаются на месте, когда райзер с сетевой картой вынут. Сами SFP+ живут в
блоке райзеров: они торец карты, а не отверстия в стенке.
"""

# Свой прямоугольник: сборка проверит, что узел из него не вышел.
BOUNDS = (1204, 172, 92, 540)

from board.geom import X_IO
from board.ink import mono
from board.lamps import act_led
from board.ports import rj45, sfp
from board.revision import stamp


def render(cv):
    cv.callouts.append((X_IO - 30, 358, X_IO + 4, 358, "Telegram", "end", "https://t.me/cosmdandy", "eth"))
    cv.callouts.append((X_IO - 30, 404, X_IO + 4, 404, "Twitter", "end", "https://x.com/cosmdandy", "tw"))
    cv.callouts.append((X_IO - 30, 502, X_IO + 4, 502, "Email", "end", "mailto:i@cosmdandy.dev", "bmc"))

    # SFP+ здесь больше нет: они уехали на торец карты в райзере, где им и
    # место. На стенке остаётся только то, что распаяно на самой плате —
    # гигабитные розетки и порт управления. Разница видна сразу: эти гнёзда
    # остаются, когда райзер вынут.

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
                f'<rect x="{X_IO+4}" y="{y-8}" width="78" height="46" rx="3" fill="#0f2226" '
                f'stroke="rgba(42,161,152,0.26)"/>'
                f'{rj45(X_IO+22, y)}'
                # у розетки две лампы: линк горит ровно, активность мигает
                f'<circle class="led-link" cx="{X_IO+12}" cy="{y+2}" r="2.8" fill="#859900"/>'
                + mono(X_IO + 12, y + 12, "LNK", 4, op=0.32)
                + act_led(seed, X_IO + 12, y + 22, 2.8, "#b58900", salt=salt)
                + mono(X_IO + 12, y + 32, "ACT", 4, op=0.32)
                + '</g></g>')

    cv.add(f'''<g class="pick" data-unit="eth">
  <g class="pick-body">
    <rect x="{X_IO}" y="336" width="86" height="104" rx="5" fill="#13282c" stroke="rgba(42,161,152,0.45)"/>
    {rj_port(344, "eth", "https://t.me/cosmdandy", 4, 6)}
    {rj_port(390, "tw", "https://x.com/cosmdandy", 7, 11)}
  </g>
  {mono(X_IO+43, 456, "2× 1GbE", 9, op=0.5)}
</g>''')

    cv.add(f'''<g class="unit" data-unit="bmc" data-group="bmc" data-href="mailto:i@cosmdandy.dev">
  <g class="pick-body">
    <rect x="{X_IO}" y="470" width="86" height="80" rx="5" fill="#1a1f14" stroke="rgba(181,137,0,0.55)"/>
    {rj45(X_IO+16, 488)}
    {act_led(9, X_IO+8, 484, 3, "#b58900", salt=6, aux=True)}
  </g>
  {mono(X_IO+43, 568, "MLAN · BMC", 9, op=0.55)}
</g>''')

    cv.add(stamp(X_IO + 43, 700, "задняя панель", anchor="middle"))
    cv.add(f'''<g class="decor">
  <rect x="{X_IO}" y="588" width="86" height="30" rx="4" fill="#121a1e" stroke="rgba(147,161,161,0.22)"/>
  <rect x="{X_IO+12}" y="595" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+34}" y="595" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+56}" y="595" width="12" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  {mono(X_IO+43, 630, "USB · mDP", 8, op=0.42)}
  <circle class="fault-sys" cx="{X_IO+18}" cy="664" r="6" fill="#b58900"/>
  {mono(X_IO+18, 684, "!", 9, op=0.4)}
  <circle class="led-id" cx="{X_IO+62}" cy="664" r="6" fill="#268bd2"/>
  {mono(X_IO+62, 684, "ID", 9, op=0.4)}
</g>''')
