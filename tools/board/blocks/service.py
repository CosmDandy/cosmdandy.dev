"""service zone.

service zone
"""

# Own rectangle: the build checks that the block did not leave it.
BOUNDS = (838, 98, 170, 618)

from board.geom import LID_BTN, X_SVC
from board.ink import hit, mono, silk_boxed, silk_inverse


def dip_switch(x, y, n=4, on=(1, 3)):
    """A block of DIP switches: amber body, white sliders in their slots.

    on — numbers of the switches in the ON position, counting from one.
    """
    pitch, sw_w, sw_h = 8, 5, 14
    pad_x, pad_y, label_h = 5, 4, 7
    body_w = pad_x * 2 + n * pitch - (pitch - sw_w)
    body_h = label_h + pad_y * 2 + sw_h
    parts = [
        f'<rect x="{x}" y="{y}" width="{body_w}" height="{body_h}" rx="2" '
        f'fill="#c9a06a" stroke="#7a5a34" stroke-width="1"/>',
        f'<rect x="{x+2.5}" y="{y+2.5}" width="{body_w-5}" height="{body_h-5}" rx="1.5" '
        f'fill="none" stroke="rgba(122,90,52,0.4)" stroke-width="0.7"/>',
        f'<text x="{x+4}" y="{y+label_h}" fill="#3a2712" '
        f'font-family="ui-monospace, Menlo, monospace" font-size="4.5" font-weight="600">ON</text>',
    ]
    for i in range(n):
        cx = x + pad_x + i * pitch
        sy = y + label_h + pad_y
        parts.append(f'<rect x="{cx}" y="{sy}" width="{sw_w}" height="{sw_h}" rx="1.5" '
                     f'fill="#1b2429" stroke="rgba(147,161,161,0.30)" stroke-width="0.7"/>')
        is_on = (i + 1) in on
        slider_h = sw_h * 0.46
        slider_y = sy + (1.5 if is_on else sw_h - slider_h - 1.5)
        parts.append(f'<rect x="{cx+1}" y="{slider_y:.1f}" width="{sw_w-2}" height="{slider_h:.1f}" rx="1" '
                     f'fill="#e8e3d5" stroke="#8d979a" stroke-width="0.6"/>')
        parts.append(mono(cx + sw_w / 2, y + body_h - 1, str(i + 1), 4.5, op=0.4))
    return f'<g class="decor dip-switch">{"".join(parts)}</g>'
from board.metal import pad


def jumper_table(x, y, title, rows):
    """Jumper legend table: frame, grid, contact positions.

    One like this is printed right on the laminate next to the jumper itself —
    it is how you tell primary from backup without opening the manual.
    """
    col1_w, row_h, pad, title_h = 34, 13, 6, 15
    label_w = max(60, max((len(r[1]) for r in rows), default=0) * 6 + 10)
    body_w = max(col1_w + label_w, len(title) * 4.6 + 16)
    body_h = title_h + len(rows) * row_h + pad
    STROKE = 'rgba(232,227,213,0.55)'
    TEXT = 'rgba(232,227,213,0.62)'
    parts = [
        f'<rect x="{x}" y="{y}" width="{body_w:.1f}" height="{body_h}" rx="1" '
        f'fill="none" stroke="{STROKE}" stroke-width="1"/>',
        f'<text x="{x+body_w/2:.1f}" y="{y+10}" text-anchor="middle" fill="{TEXT}" '
        f'font-family="ui-monospace, Menlo, monospace" font-size="7" '
        f'font-weight="600" letter-spacing="0.02em">{title}</text>',
        f'<line x1="{x}" y1="{y+title_h}" x2="{x+body_w:.1f}" y2="{y+title_h}" '
        f'stroke="{STROKE}" stroke-width="0.8"/>',
        f'<line x1="{x+col1_w}" y1="{y+title_h}" x2="{x+col1_w}" y2="{y+body_h}" '
        f'stroke="{STROKE}" stroke-width="0.8"/>',
    ]
    for i, (pos, label) in enumerate(rows):
        ry = y + title_h + i * row_h
        if i:
            parts.append(f'<line x1="{x}" y1="{ry}" x2="{x+body_w:.1f}" y2="{ry}" '
                         f'stroke="{STROKE}" stroke-width="0.6" stroke-opacity="0.6"/>')
        parts.append(f'<text x="{x+col1_w/2}" y="{ry+row_h-4}" text-anchor="middle" fill="{TEXT}" '
                     f'font-family="ui-monospace, Menlo, monospace" font-size="6.5">{pos}</text>')
        parts.append(f'<text x="{x+col1_w+6}" y="{ry+row_h-4}" fill="{TEXT}" '
                     f'font-family="ui-monospace, Menlo, monospace" font-size="6.5">{label}</text>')
    return f'<g class="decor jumper-table">{"".join(parts)}</g>'


def render(cv):
    svc = [
        f'<circle cx="{X_SVC+34}" cy="300" r="23" fill="#1a2429" stroke="rgba(147,161,161,0.34)"/>',
        f'<circle cx="{X_SVC+34}" cy="300" r="15" fill="#0e171b"/>',
        silk_boxed(X_SVC + 34, 338, "CMOS", 7),
        f'<rect x="{X_SVC+84}" y="288" width="66" height="22" rx="2" fill="#1a2429" stroke="rgba(147,161,161,0.28)"/>',
        silk_boxed(X_SVC + 117, 324, "microSD", 7),
        f'<rect x="{X_SVC+12}" y="120" width="52" height="26" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.30)"/>',
        f'<rect x="{X_SVC+90}" y="120" width="52" height="26" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.30)"/>',
        silk_boxed(X_SVC + 78, 110, "P1 / P2", 7),
        # Switches and the jumper legend: what one goes under the cover for
        dip_switch(X_SVC + 10, 396, 4, on=(1, 3)),
        silk_boxed(X_SVC + 29, 436, "SW3", 6),
        dip_switch(X_SVC + 66, 396, 4, on=(2,)),
        silk_boxed(X_SVC + 85, 436, "SW4", 6),
        jumper_table(X_SVC + 6, 466, "J29 BIOS BOOT FROM",
                     [("1-2", "PRIMARY BIOS"), ("2-3", "BACKUP BIOS")]),
    ]
    for i in range(3):
        x = X_SVC + 8 + i * 48
        svc.append(f'<rect x="{x}" y="188" width="42" height="26" rx="1" fill="#1e2a2f" stroke="rgba(147,161,161,0.30)"/>')
        svc.append(f'<rect x="{x+4}" y="193" width="34" height="16" rx="1" fill="#0a1417"/>')
    svc.append(silk_inverse(X_SVC + 26, 226, "SATA / SLIMSAS", 6))
    cv.add('<g class="decor">' + ''.join(svc) + '</g>')

    # The cover button stands exactly above the service-mode toggle — both on
    # the board and on the cover itself, at the very same coordinates: only the
    # label changes.
    cv.add(f'''<g class="lid-on-btn" id="lid-on" role="button" tabindex="0" aria-label="Надеть крышку">
  {hit(LID_BTN[0]-6, LID_BTN[1]-6, LID_BTN[2]+12, LID_BTN[2]+12)}
  <rect x="{LID_BTN[0]}" y="{LID_BTN[1]}" width="{LID_BTN[2]}" height="{LID_BTN[2]}" rx="3"
        fill="#141d22" stroke="rgba(147,161,161,0.38)" stroke-width="1.4"/>
  <path d="M{LID_BTN[0]+26} {LID_BTN[1]+34} h34 M{LID_BTN[0]+43} {LID_BTN[1]+22} v24 m-8 -8 l8 8 8 -8"
        fill="none" stroke="rgba(147,161,161,0.5)" stroke-width="2"/>
  {mono(LID_BTN[0]+43, LID_BTN[1]+66, "НАДЕТЬ", 9, op=0.6)}
  {mono(LID_BTN[0]+43, LID_BTN[1]+78, "КРЫШКУ", 9, op=0.6)}
</g>''')

    cv.add(f'''<g class="svc-switch" id="svc-switch" role="button" tabindex="0" aria-label="Сервисный режим">
  {hit(X_SVC+6, 616, 130, 82)}
  <rect x="{X_SVC+14}" y="624" width="110" height="44" rx="6" fill="#0f1619" stroke="rgba(147,161,161,0.32)"/>
  <rect class="svc-knob" x="{X_SVC+20}" y="630" width="46" height="32" rx="4" fill="#22303655" stroke="rgba(147,161,161,0.42)"/>
  {mono(X_SVC+69, 686, "SERVICE", 9, op=0.55)}
  {mono(X_SVC+69, 700, "терминал и диагностика", 7, op=0.34)}
</g>''')
