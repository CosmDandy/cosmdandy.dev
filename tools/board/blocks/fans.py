"""fans: eight twin modules in a common wall.

A module is a pair of impellers under one plastic cover, so from above you
see the shell with a seam down the middle, not bare blades. The wall is
shallow: its depth used to be twice the width of a module, which does not
happen in 1U — and the excess went to the drive cage, which had nowhere to
slide out to.

Drawn after the harnesses, so the wall covers them.
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (184, 6, 244, 832)

from board.geom import FAN_H, FAN_N, FAN_STEP, FAN_W, X_FAN, X_PCB, H, fan_foot_y, seat
from board.ink import mono, silk_inverse
from board.lamps import fault_at, jitter
from board.revision import stamp


def render(cv):
    cv.add(f'<rect class="decor" x="{X_FAN}" y="20" width="{FAN_W}" height="{H-40}" rx="0" fill="#0f1619" stroke="rgba(147,161,161,0.28)"/>')
    cv.add(stamp(X_FAN + 6, 14, "вентиляторы"))
    for i in range(FAN_N):
        y = 26 + i * FAN_STEP
        # The impellers are deliberately wider than their own half and overlap
        # each other: that is how twin fans stand in 1U, and the pair reads as
        # one module rather than two circles side by side. The radius is
        # derived from the depth of the wall — as a plain number it drifted
        # apart on every edit of the geometry.
        rr = FAN_W / 3.6
        rotors = []
        for k in range(2):
            cx, cy = X_FAN + FAN_W / 4 + k * (FAN_W / 2), y + (FAN_STEP - 8) / 2
            bl, bw = rr * 0.92, rr * 0.25
            blades = ' '.join(
                f'M{cx} {cy-bl:.1f} L{cx+bw:.1f} {cy} L{cx} {cy+bl:.1f} L{cx-bw:.1f} {cy} Z' if b % 2 == 0 else
                f'M{cx-bl:.1f} {cy} L{cx} {cy-bw:.1f} L{cx+bl:.1f} {cy} L{cx} {cy+bw:.1f} Z'
                for b in range(2))
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr:.1f}" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>')
            # The impellers spin with one period and different phases: that way
            # they run out of step but click to a common beat. The shift is a
            # multiple of the beat step, otherwise the repaint frames drift
            # apart.
            rotors.append(f'<path class="fan-blades" d="{blades}" fill="rgba(34,48,54,0.55)" '
                          f'stroke="rgba(147,161,161,0.26)" style="animation-delay:-{jitter(i, 0.1, 2.2, k)}s"/>')
            rotors.append(f'<circle cx="{cx}" cy="{cy}" r="{rr*0.3:.1f}" fill="#0a1215" stroke="rgba(147,161,161,0.22)"/>')

        h = FAN_H
        # The module seat: the guides and the mating header stay in the wall
        # when the fan is pulled out. Without them the wall looked, during the
        # build, like a blind box the blocks fly into who knows where.
        cv.add(f'''<g class="decor fan-seat">
      <rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="0" fill="#070d10"
            stroke="rgba(147,161,161,0.16)" stroke-dasharray="7 5"/>
      <line x1="{X_FAN+14}" y1="{y+6}" x2="{X_FAN+14}" y2="{y+h-6}"
            stroke="rgba(147,161,161,0.12)" stroke-width="2.2"/>
      <line x1="{X_FAN+FAN_W-14}" y1="{y+6}" x2="{X_FAN+FAN_W-14}" y2="{y+h-6}"
            stroke="rgba(147,161,161,0.12)" stroke-width="2.2"/>
      <rect x="{X_FAN+FAN_W-30}" y="{y+8}" width="20" height="18" rx="2" fill="#0a1215"
            stroke="rgba(147,161,161,0.20)"/>
      {mono(X_FAN + FAN_W / 2, y + h / 2 + 3, f"FAN{i+1}", 8, op=0.16)}
    </g>''')
        # The orange tabs on the sides — the fan is pulled out live by them.
        # On a real machine they are the only spot of colour in the cage. They
        # are drawn before the body: a tab is recessed into the frame, and only
        # half of it sticks out.
        tabs = ''.join(
            f'<rect x="{tx}" y="{y+h/2-19}" width="16" height="38" rx="2" fill="#cb4b16" '
            f'stroke="rgba(238,232,213,0.55)" stroke-width="1.2"/>'
            f'<rect x="{tx+4}" y="{y+h/2-13}" width="6" height="26" rx="1" fill="rgba(238,232,213,0.22)"/>'
            for tx in (X_FAN - 8, X_FAN + FAN_W - 8))
        # The vibration mounts do not sit in the corners on their own: a stud
        # runs through the module, and rubber bushings are fitted on its ends.
        # The motor is decoupled from the frame by that rubber — otherwise the
        # hum of eight fans goes into the rack.
        mounts = ''.join(
            f'<line x1="{mx}" y1="{y+7}" x2="{mx}" y2="{y+h-7}" stroke="rgba(147,161,161,0.16)" '
            f'stroke-width="2.6"/>' for mx in (X_FAN + 14, X_FAN + FAN_W - 14))
        mounts += ''.join(
            f'<rect x="{mx-5}" y="{my-4}" width="10" height="8" rx="4" fill="#1b2429" '
            f'stroke="rgba(147,161,161,0.30)"/>'
            f'<circle cx="{mx}" cy="{my}" r="2.4" fill="#070d10" stroke="rgba(147,161,161,0.22)"/>'
            for mx in (X_FAN + 14, X_FAN + FAN_W - 14) for my in (y + 7, y + h - 7))
        # Power: a header on the body, and from it a leg with a harness down to
        # the mating part on the board. The leg and the wires are part of the
        # fan: pull it and they go with it, detaching from the board. The lamp
        # stays on the board though: what lights up is not the fan but its seat.
        # The connector is in the top corner of the module, which is where it
        # stands on a real fan. The mating header on the board, however, comes
        # opposite the middle of the module: the seat lamp has to be across
        # from its own fan.
        # The ordinate of the header is computed by geom — the traces route the
        # bus to it by the same value.
        px, py = X_FAN + FAN_W - 26, y + 10
        fy, sx = fan_foot_y(i), X_PCB + 6
        wires = ''.join(
            f'<path d="M{px+16} {py+4+k*3} C{px+40} {py+4+k*3}, {sx-30} {fy+3+k*3}, {sx} {fy+3+k*3}" '
            f'fill="none" stroke="{c}" stroke-width="1.5" stroke-opacity="0.6"/>'
            for k, c in enumerate(('#dc322f', '#eee8d5', '#b58900', '#268bd2')))
        plug = (f'<rect x="{px}" y="{py}" width="18" height="16" rx="2" fill="#0a1215" '
                f'stroke="rgba(147,161,161,0.34)"/>'
                + ''.join(f'<line x1="{px+4+k*4}" y1="{py+3}" x2="{px+4+k*4}" y2="{py+13}" '
                          f'stroke="rgba(147,161,161,0.26)"/>' for k in range(4)))
        # the mating header at the end of the leg — it seats into the board
        foot = (f'<rect x="{sx-4}" y="{fy}" width="14" height="16" rx="2" fill="#101a1e" '
                f'stroke="rgba(147,161,161,0.38)"/>'
                f'<rect x="{sx-1}" y="{fy+3}" width="8" height="10" rx="1" fill="#060d10"/>')

        # The shell: from above a real module shows a closed plastic cover with
        # a seam between the two sections, not bare impellers. It is drawn over
        # the rotors as a thin outline — that way the body reads and the
        # rotation stays visible.
        shell = (f'<rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="3" fill="none" '
                 f'stroke="rgba(147,161,161,0.34)" stroke-width="1.6"/>'
                 f'<line x1="{X_FAN+FAN_W/2}" y1="{y+3}" x2="{X_FAN+FAN_W/2}" y2="{y+h-3}" '
                 f'stroke="rgba(147,161,161,0.30)" stroke-width="1.6"/>'
                 f'<line x1="{X_FAN+FAN_W/2}" y1="{y+3}" x2="{X_FAN+FAN_W/2}" y2="{y+h-3}" '
                 f'stroke="rgba(10,18,21,0.6)" stroke-width="0.7"/>')
        # Foam along the edges: it presses the module against the cover so the
        # air does not take a detour. It is fluffy, so it is drawn with
        # hatching rather than a fill.
        foam = ''.join(
            f'<rect x="{X_FAN+8}" y="{fy0}" width="{FAN_W-16}" height="5" rx="2" '
            f'fill="rgba(88,96,92,0.42)"/>'
            + ''.join(f'<line x1="{X_FAN+10+t*7}" y1="{fy0}" x2="{X_FAN+10+t*7}" y2="{fy0+5}" '
                      f'stroke="rgba(147,161,161,0.16)"/>' for t in range(int((FAN_W-20)//7)))
            for fy0 in (y + 2, y + h - 7))

        cv.add(f'''<g class="pick fan" data-fan="{i}" style="--seat:{seat('fan', i)}">
      <g class="pick-body">
        {tabs}
        <rect x="{X_FAN+4}" y="{y}" width="{FAN_W-8}" height="{h}" rx="0" fill="#0b1215" stroke="rgba(147,161,161,0.18)"/>
        {mounts}
        {''.join(rotors)}
        {shell}
        {foam}
        {plug}
        {mono(X_FAN + FAN_W / 2, y + h - 6, f"FAN{i+1} · 18000 RPM", 7, op=0.34)}
        <g class="cables">{wires}</g>
        {foot}
      </g>
      {fault_at(cv, sx + 18, fy + 8, 5)}
      {silk_inverse(sx + 30, fy + 2, 'FAN FAULT', 6)}
    </g>''')
