"""rear panel: what is soldered onto the board itself.

The gigabit jacks and the management port come straight off the board, so
they stay in place when the riser with the network card is pulled out. The
SFP+ themselves live in the risers block: they are the end face of a card,
not holes in the wall.

The small stuff — two USB, mini-DP and the system lamps — stands as its own
block above the module: on a real machine that is a separate bracket, not
part of the network block.

The three callouts of this block — Telegram, Twitter and mail — are the
tightest on the drawing: the jacks sit inside one module, while the labels
are four times larger than the jacks. That is why the labels are spread wider
apart in height than the sockets themselves, and each reaches its own jack
with a line. While they stood strictly opposite the sockets, the three
callouts stuck together into one plate and the address could not be read.
"""

# Own rectangle: the build checks that the block did not leave it.
# The interface module stands on the board and reaches inwards from the rear
# wall.
BOUNDS = (1060, 430, 240, 290)

from board.geom import IO_AUX_Y, IO_H, IO_Y, X_IO
from board.ink import mono
from board.lamps import act_led, lamp
from board.ports import rj45
from board.revision import stamp
from board.spec import PORTS

# The jack width is needed twice over — to draw the jack and to place the
# lamps beside it — so it is stated here and handed to rj45() explicitly.
# Three lamps have to stand where two stood, hence the smaller bulb.
JACK_W, LED_R = 52, 2.4


def rj_leds(seed, jx, y, salt, aux=False):
    """Lamps of one jack: activity left of it, link right of it.

    Traffic is one lamp, not two. A live jack has a single activity LED with
    two dies in it, and which way the packet went is told by the colour it
    flashes — amber out, green in. Two separate lamps said the same thing
    twice and made the panel look busier than the machine is.
    """
    left, right = jx - 9, jx + JACK_W + 9
    return (act_led(seed, left, y + 12, LED_R, "#b58900",
                    salt=salt, aux=aux, extra_cls='led-txrx')
            + mono(left, y + 22, "TX/RX", 4, op=0.32)
            # Link is a state, not an event: it holds steady while the cable
            # is in, and that is the whole difference the viewer reads.
            + lamp('led-link aux' if aux else 'led-link', right, y + 12, LED_R, "#859900")
            + mono(right, y + 22, "LNK", 4, op=0.32))


def render(cv):
    # The on-board interfaces are not holes in the wall but a module that
    # stands on the board and plugs into it: underneath it has a row of
    # contacts, like a card in a riser. The difference from a card is that
    # this module is not removable — it is what holds the jacks in place when
    # the riser is pulled out.
    BX, BY, BW, BH = X_IO - 148, IO_Y, 234, IO_H
    cv.callouts.append((X_IO - 30, 480, X_IO - 8, BY + 46, "Telegram", "end",
                        "https://t.me/cosmdandy", "eth", "написать", "telegram"))
    cv.callouts.append((X_IO - 30, 574, X_IO - 8, BY + 104, "Twitter", "end",
                        "https://x.com/cosmdandy", "tw", "мысли", "twitter"))
    cv.callouts.append((X_IO - 30, 668, X_IO - 8, BY + 153, "Email", "end",
                        "mailto:i@cosmdandy.dev", "bmc", "i@cosmdandy.dev", "email"))

    cv.add(f'''<g class="decor">
  <rect x="{BX}" y="{BY}" width="{BW}" height="{BH}" rx="3" fill="#0f2226"
        stroke="rgba(42,161,152,0.34)"/>
  {"".join(f'<line x1="{BX + 12 + c * 7}" y1="{BY + BH}" x2="{BX + 12 + c * 7}" y2="{BY + BH + 7}" stroke="rgba(206,168,58,0.5)" stroke-width="1.6"/>' for c in range(int((BW - 30) // 7)))}
  <rect x="{BX + 8}" y="{BY + 8}" width="46" height="34" rx="2" fill="#16222a"
        stroke="rgba(147,161,161,0.30)"/>
  {mono(BX + 31, BY + 54, "PHY", 6, op=0.36)}
</g>''')

    # Two gigabit jacks — two different links. The common frame stays: it is one
    # card and it is pulled out as a whole — but each jack lights up and opens
    # on its own, so the unit is nested inside the pick and not the other way
    # round.
    def rj_port(y, group, href, salt, seed):
        """A jack with the full set of lamps: link, receive, transmit."""
        # The boss now spans the full width of the wall module, like the
        # management port below it: a lamp column on each side of the jack
        # does not fit into anything narrower.
        return (f'<g class="unit" data-group="{group}" data-href="{href}">'
                f'<g class="body">'
                f'<rect x="{X_IO}" y="{y-8}" width="86" height="40" rx="3" fill="#0f2226" '
                f'stroke="rgba(42,161,152,0.26)"/>'
                f'{rj45(X_IO+17, y, JACK_W)}'
                + rj_leds(seed, X_IO + 17, y, salt)
                + '</g></g>')

    cv.add(f'''<g class="pick" data-unit="eth">
  <g class="pick-body">
    {rj_port(BY + 34, "eth", "https://t.me/cosmdandy", 4, 6)}
    {rj_port(BY + 92, "tw", "https://x.com/cosmdandy", 7, 11)}
  </g>
  {mono(X_IO-96, BY + 118, PORTS['eth'], 8, op=0.5)}
</g>''')

    # The management port lives its own life: it runs on standby power and
    # works while the machine is off, which is why it is labelled separately.
    cv.add(f'''<g class="unit" data-unit="bmc" data-group="bmc" data-href="mailto:i@cosmdandy.dev">
  <g class="pick-body">
    <rect x="{X_IO}" y="{BY + 128}" width="86" height="50" rx="5" fill="#1a1f14"
          stroke="rgba(181,137,0,0.55)"/>
    {rj45(X_IO+17, BY + 138, JACK_W)}
    {rj_leds(9, X_IO + 17, BY + 138, 6, aux=True)}
  </g>
  {mono(X_IO-96, BY + 162, PORTS['mgmt'], 8, op=0.55)}
</g>''')

    cv.add(stamp(X_IO + 43, BY - 10, "задняя панель", anchor="middle"))
    # The bracket of small stuff: two USB, mini-DP and two system lamps. It has
    # its own place between the lower riser and the network module — it used to
    # hang right above the module and read as a part of it.
    AY = IO_AUX_Y
    cv.add(f'''<g class="decor">
  <rect x="{X_IO}" y="{AY}" width="86" height="30" rx="4" fill="#121a1e"
        stroke="rgba(147,161,161,0.22)"/>
  <rect x="{X_IO+12}" y="{AY+7}" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+34}" y="{AY+7}" width="18" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  <rect x="{X_IO+56}" y="{AY+7}" width="12" height="11" rx="1.5" fill="#0a1417" stroke="rgba(147,161,161,0.2)"/>
  {mono(X_IO+43, AY + 26, "USB · mDP", 7, op=0.42)}
  {lamp('fault-sys', X_IO + 18, AY + 44, 6, '#b58900')}
  {mono(X_IO+18, AY + 60, "!", 8, op=0.4)}
  {lamp('led-id', X_IO + 62, AY + 44, 6, '#268bd2')}
  {mono(X_IO+62, AY + 60, "ID", 8, op=0.4)}
</g>''')
