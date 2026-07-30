"""гравировка на крышке.

Крышка накрывает всю машину, кроме панели управления: кнопка должна
оставаться доступной. Подписи — не названия железа, а то, куда ведёт узел:
схема сама объясняет, что где лежит.
"""

from board.geom import BAY_TOP, FAN_W, FRONT_W, H, LID_BTN, PITCH, SLOT_H, SOCKET_H, SOCKET_W, W, X_CORE, X_FAN, X_FRONT, X_IO, X_PCB, X_PCB_END, X_REAR, X_SOCK, Y_BANK_C, Y_BANK_L, Y_BANK_R, Y_CPU0, Y_CPU1, Y_PANEL, Y_PSU_BOT, Y_PSU_TOP
from board.metal import rating_label, service_label


def render(cv):
    def frame(x, y, w, h, rx=0, op=0.28):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="none" '
                f'stroke="rgba(147,161,161,{op})" stroke-width="1.4"/>')

    def label(x, y, t, size=11, anchor_="middle", op=0.42):
        return (f'<text x="{x}" y="{y}" text-anchor="{anchor_}" fill="rgba(147,161,161,{op})" '
                f'font-family="ui-monospace, Menlo, monospace" font-size="{size}" letter-spacing="0.1em">{t}</text>')

    # тело крышки с вырезом под панель управления
    PW, PH = FRONT_W + 8, Y_PANEL - 8
    cv.add(f'<path fill-rule="evenodd" d="M4 4 H{W-4} V{H-4} H4 Z M4 4 H{PW} V{PH} H4 Z" '
        f'fill="#161f24" stroke="rgba(147,161,161,0.30)" stroke-width="1.4"/>')

    # Рёбра жёсткости: лист крышки в 1U тонкий, и без продольной формовки он
    # играет под рукой. Два ребра идут во всю длину, поперёк — короткие, у
    # кромок. Видны они как пара параллельных линий: это складка металла.
    for ry in (150, H - 150):
        cv.add(f'<path d="M{X_FAN + 40} {ry} H{W - 60}" fill="none" '
            f'stroke="rgba(147,161,161,0.20)" stroke-width="3.4"/>')
        cv.add(f'<path d="M{X_FAN + 40} {ry} H{W - 60}" fill="none" '
            f'stroke="rgba(147,161,161,0.13)" stroke-width="1"/>')
    for rx in (X_FAN + 60, (X_FAN + W) / 2, W - 150):
        cv.add(f'<path d="M{rx} 40 V{H - 40}" fill="none" '
            f'stroke="rgba(147,161,161,0.10)" stroke-width="2.6"/>')

    # корзина — одним блоком
    cv.add(frame(X_FRONT, BAY_TOP, FRONT_W, H - 12 - BAY_TOP, 1, 0.30))
    cv.add(f'<text x="{X_FRONT + FRONT_W/2}" y="{BAY_TOP + (H-12-BAY_TOP)/2}" '
        f'transform="rotate(-90 {X_FRONT + FRONT_W/2} {BAY_TOP + (H-12-BAY_TOP)/2})" text-anchor="middle" '
        f'fill="rgba(147,161,161,0.46)" font-family="ui-monospace, Menlo, monospace" '
        f'font-size="15" letter-spacing="0.14em">GitHub · 6× NVMe</text>')

    # стенка вентиляторов
    cv.add(frame(X_FAN, 20, FAN_W, H - 40, 0, 0.26))
    for i in range(8):
        y = 26 + i * 101.5
        cv.add(frame(X_FAN + 4, y, FAN_W - 8, 94, 0, 0.18))
        for k in range(2):
            cv.add(f'<circle cx="{X_FAN + FAN_W / 4 + k * (FAN_W / 2)}" cy="{y+47}" r="36" fill="none" '
                f'stroke="rgba(147,161,161,0.18)" stroke-width="1.3"/>')

    # плата
    cv.add(f'<path d="M{X_PCB} 18 H{X_REAR-4} V{Y_PSU_TOP} H{X_PCB_END} V{Y_PSU_BOT} H{X_REAR-4} V{H-18} H{X_PCB} Z" '
        f'fill="none" stroke="rgba(147,161,161,0.26)" stroke-width="1.4"/>')

    # память и процессоры — с назначением, а не с маркировкой
    for y0, n in ((Y_BANK_L, 8), (Y_BANK_C, 16), (Y_BANK_R, 8)):
        cv.add(frame(X_CORE - 6, y0 - 4, 322, n * PITCH + 6, 0, 0.26))
        for i in range(n):
            yy = y0 + i * PITCH + SLOT_H / 2
            cv.add(f'<line x1="{X_CORE+6}" y1="{yy}" x2="{X_CORE+304}" y2="{yy}" '
                f'stroke="rgba(147,161,161,0.14)" stroke-width="1.2"/>')
    cv.add(label(X_CORE + 155, Y_BANK_C + 16 * PITCH / 2 + 5, "Blog", 15))

    for y in (Y_CPU0, Y_CPU1):
        cv.add(frame(X_SOCK, y, SOCKET_W, SOCKET_H, 4, 0.30))
        cv.add(frame(X_SOCK + 14, y + 14, SOCKET_W - 28, SOCKET_H - 28, 2, 0.20))
        cv.add(label(X_SOCK + SOCKET_W / 2, y + SOCKET_H / 2 + 5, "CV", 15))

    # задняя часть
    for y in (22, 696):
        cv.add(frame(X_REAR, y, 300, 145, 0, 0.26))
        cv.add(label(X_REAR + 150, y + 79, "POWER", 11, op=0.34))
    for y in (186, 474):
        cv.add(frame(X_REAR + 12, y, X_PCB_END - 18 - X_REAR, 192, 6, 0.22))

    cv.add(frame(X_IO, 182, 86, 118, 4, 0.26))
    cv.add(label(X_IO - 26, 245, "LinkedIn", 12, anchor_="end"))
    cv.add(frame(X_IO, 336, 86, 98, 4, 0.26))
    cv.add(label(X_IO - 26, 389, "Telegram", 12, anchor_="end"))
    cv.add(frame(X_IO, 470, 86, 80, 4, 0.26))
    cv.add(label(X_IO - 26, 514, "Email", 12, anchor_="end"))

    cv.add(rating_label(X_REAR, 74, 1))
    cv.add(rating_label(X_REAR, 748, 2))
    cv.add(service_label(X_FAN + 30, 300, 300, 120, "HOT-SWAP FANS",
                      ["FAN 1-8 · вынимать по одному",
                       "не оставлять слот пустым дольше 30 с",
                       "неисправность ищется на плате,",
                       "у колодки вентилятора"]))
    cv.add(label((PW + W) / 2, H - 26, "CD93-FS1  ·  SERVICE COVER", 11, op=0.26))
    # кнопка снятия — на крышке, в тех же координатах, что кнопка «надеть» на
    # плате: место не прыгает, меняется только надпись
    bx, by, bs = LID_BTN
    cv.add(f'<g id="lid-remove" class="lid-btn-svg" role="button" tabindex="0" aria-label="Снять крышку">'
        f'<rect x="{bx}" y="{by}" width="{bs}" height="{bs}" rx="3" fill="#1b2429" '
        f'stroke="rgba(147,161,161,0.5)" stroke-width="1.6"/>'
        f'<path d="M{bx+26} {by+46} h34 M{bx+43} {by+58} v-24 m-8 8 l8 -8 8 8" fill="none" '
        f'stroke="rgba(147,161,161,0.6)" stroke-width="2"/>'
        + label(bx + 43, by + 74, "СНЯТЬ", 10, op=0.7)
        + label(bx + 43, by + 86, "КРЫШКУ", 10, op=0.7) + '</g>')
