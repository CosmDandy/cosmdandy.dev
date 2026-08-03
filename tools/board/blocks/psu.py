"""power supplies: they pull out backwards, by the bail handles.

The handle and the fan sit on the rear end face — the side the module leaves
the chassis by. Everything else is taken up by the body with its heatsink and
barcode.
"""

# Own rectangle: the build checks that the block did not leave it.
# Noticeably wider than the body: both the bail handle and the orange latch
# reach past the rear end face — otherwise you cannot get a hand on them in
# the rack. On the left it runs onto the board: the bay lamp stands on the
# laminate and not on the module itself — what lights up is not the module but
# the place it was pulled out of.
BOUNDS = (982, 0, 356, 862)

from board.geom import PSU_H, PSU_W, PSU_Y, X_REAR, seat
from board.ink import mono
from board.lamps import fault_at, jitter, lamp
from board.metal import finned_sink
from board.palette import METAL, METAL_DEEP, ROTOR_BLADE, ROTOR_EDGE, ROTOR_PAD
from board.revision import stamp
from board.rotor import HUB_R, blur_disc, impeller


def render(cv):
    for k, y in enumerate(PSU_Y):
        name = f"PSU-{k+1}"
        # Оба блока одинаковые, и это не придирка к симметрии. Модуль — одна и
        # та же деталь, вставленная в два кармана: вентилятор у него всегда с
        # одной стороны, скоба с ручкой — с другой. Пока второй блок рисовался
        # зеркально, его оранжевый лепесток оказывался под вентилятором, то
        # есть там, где на живом блоке ухватиться не за что.
        fan_y = y + 83
        # The bay pocket: the module is inserted into it, not glued to the
        # wall. Without the pocket the two modules read as a single panel on
        # the rear edge.
        # Карман — вырез в шасси, а не деталь: у выреза углы прямые. Скругление
        # положено корпусу машины и самим модулям, а посадочное место штампуют
        # по прямой.
        bay = [(f'<rect x="{X_REAR}" y="{y-6}" width="306" height="157" fill="{METAL_DEEP}" '
                f'stroke="rgba(147,161,161,0.20)"/>')]
        for gy in (y - 2, y + 143):
            bay.append(f'<line x1="{X_REAR-2}" y1="{gy}" x2="{X_REAR+296}" y2="{gy}" '
                       f'stroke="rgba(147,161,161,0.16)" stroke-width="2.4"/>')
        # Guides and the mating header deep inside the pocket: an empty bay
        # has to read as a seat and not as a hole in the rear wall.
        for gy in (y + 18, y + PSU_H - 18):
            bay.append(f'<line x1="{X_REAR+8}" y1="{gy}" x2="{X_REAR+PSU_W-40}" y2="{gy}" '
                       f'stroke="rgba(147,161,161,0.12)" stroke-width="3"/>')
        bay.append(f'<rect x="{X_REAR+6}" y="{y+PSU_H/2-26}" width="16" height="52" rx="2" '
                   f'fill="#0a1215" stroke="rgba(147,161,161,0.22)"/>')
        bay.extend(f'<line x1="{X_REAR+10}" y1="{y+PSU_H/2-18+j*9}" x2="{X_REAR+18}" '
                   f'y2="{y+PSU_H/2-18+j*9}" stroke="rgba(206,168,58,0.30)" stroke-width="1.6"/>'
                   for j in range(5))
        bay.append(mono(X_REAR + PSU_W / 2, y + PSU_H / 2 + 3, name, 9, op=0.14))
        cv.add('<g class="decor psu-bay">' + ''.join(bay) + '</g>')
        psu = []
        psu.append(f'<rect x="{X_REAR}" y="{y}" width="{PSU_W}" height="{PSU_H}" rx="5" fill="{METAL}" stroke="rgba(147,161,161,0.26)"/>')
        # Жалюзи вдоль обеих длинных кромок корпуса: штампованные прорези,
        # через них уходит горячий воздух. Именно обеих: модуль дышит поперёк
        # себя, и один ряд читался не как охлаждение, а как крышка, которую у
        # второго блока забыли отзеркалить.
        for louver_y in (y + 8, y + PSU_H - 16):
            for lv in range(11):
                lx = X_REAR + 64 + lv * 16
                psu.append(f'<path d="M{lx} {louver_y} h9 a2 2 0 0 1 0 8 h-9 a2 2 0 0 1 0 -8 Z" '
                           f'fill="#0a1013" stroke="rgba(147,161,161,0.18)" stroke-width="0.8"/>')
        # The handle sits in the middle of the end face, next to the air outlet
        # grille, and its bail reaches far past the body — otherwise you cannot
        # take hold of it while the module sits in the pocket. On a real unit
        # it is black, here it is light: on a dark chassis a black bail would
        # simply disappear.
        mid = y + 72
        # The bail reaches far past the end face: it is taken by hand, and a
        # hand does not fit into the gap between the module and the rack wall.
        # The former reach of a dozen units read as a thickening of the body
        # rather than as a handle.
        bail_x = X_REAR + 292
        psu.append(f'<path d="M{bail_x} {mid-30} h30 a15 15 0 0 1 15 15 v30 a15 15 0 0 1 -15 15 h-30" '
                   f'fill="none" stroke="rgba(198,209,213,0.82)" stroke-width="6" '
                   f'stroke-linecap="round" stroke-linejoin="round"/>')
        psu.append(f'<path d="M{bail_x+7} {mid-23} h23 a9 9 0 0 1 9 9 v16 a9 9 0 0 1 -9 9 h-23" '
                   f'fill="none" stroke="rgba(13,20,24,0.5)" stroke-width="1.4"/>')
        for ay in (mid - 30, mid + 30):        # the axles the bail swings on
            psu.append(f'<circle cx="{bail_x}" cy="{ay}" r="4" fill="#0d1418" '
                       f'stroke="rgba(147,161,161,0.5)" stroke-width="1.6"/>')
        # The latch is orange — it is from the same family as the fan tabs and
        # the drive latches: the colour means "this one is touched by hand
        # while live". It reaches past the end face further than the handle,
        # otherwise you cannot get to it.
        # Лепесток стоит выше скобы, а не на ней. Раньше он начинался на
        # шестой единице от оси скобы и ложился прямо поперёк неё: на схеме это
        # читалось одной деталью, а на живом блоке это две разные вещи, и
        # нажимают на них по очереди — сперва лепесток, потом тянут за скобу.
        #
        # Он ещё и гнётся. Нажатие уводит его внутрь, к ручке: класс на группе
        # ставит вытаскивание, а угол и точка вращения живут в css.
        # Между лепестком и верхней осью скобы должен остаться зазор: при
        # нажатии лепесток складывается вниз, к ручке, и на прежних сорока
        # восьми его остриё доходило до самой скобы — две детали читались
        # одной, ровно то, на что и жаловались.
        latch_y = mid - 58
        psu.append(f'<g class="psu-latch">'
                   f'<path d="M{X_REAR+282} {latch_y} h34 l8 8 -8 8 h-34 Z" '
                   f'fill="#cb4b16" stroke="rgba(238,232,213,0.55)" stroke-width="1.3"/>'
                   + ''.join(f'<line x1="{X_REAR+290}" y1="{latch_y+5+g*6}" '
                             f'x2="{X_REAR+312}" y2="{latch_y+5+g*6}" '
                             f'stroke="rgba(20,20,10,0.34)" stroke-width="1.6"/>'
                             for g in range(2))
                   + '</g>')
        # fan
        psu.append(f'<rect x="{X_REAR+238}" y="{fan_y-4}" width="58" height="58" rx="4" fill="#0b1215" stroke="rgba(147,161,161,0.22)"/>')
        # The same impeller as the wall: seven backswept blades, the barrel it
        # turns in, the maker's sticker on the hub. Smaller and slower — the
        # supply cools itself and has a controller of its own — but the same
        # shape, because one machine does not carry two kinds of fan.
        fx, fy_c, fr = X_REAR + 267, fan_y + 25, 25
        psu.append(f'<circle cx="{fx}" cy="{fy_c}" r="{fr}" fill="#0d1417" stroke="rgba(147,161,161,0.18)"/>')
        psu.append(f'<circle cx="{fx}" cy="{fy_c}" r="{fr*0.99:.1f}" fill="none" '
                   f'stroke="{ROTOR_EDGE}" stroke-opacity="0.30"/>')
        psu.append(f'<g class="fan-blades aux" style="animation-delay:-{jitter(k, 0.3, 1.4)}s; '
                   f'transform-origin:{fx}px {fy_c}px">'
                   f'<path class="rotor-vane" d="{impeller(fx, fy_c, fr)}" fill="{ROTOR_BLADE}"/>'
                   f'<g class="rotor-blur">{blur_disc(fx, fy_c, fr)}</g>'
                   f'</g>')
        psu.append(f'<circle cx="{fx}" cy="{fy_c}" r="{fr*HUB_R:.1f}" fill="#0a1215" '
                   f'stroke="rgba(147,161,161,0.22)"/>')
        psu.append(f'<circle cx="{fx}" cy="{fy_c}" r="{fr*HUB_R*0.62:.1f}" fill="{ROTOR_PAD}" '
                   f'fill-opacity="0.55" stroke="{ROTOR_PAD}" stroke-opacity="0.45"/>')
        # Радиатор силовых ключей — самая крупная деталь внутри блока. Он
        # растянут ровно на прогон жалюзи: воздух заходит через один ряд
        # прорезей и уходит через другой, и ребристая часть обязана стоять
        # между ними по всей их длине, иначе половина потока идёт мимо.
        # Рёбра вдоль потока и винты по углам — как на процессорном.
        sink_x, sink_w = X_REAR + 62, 173
        sink_y, sink_h = y + 24, 76
        psu.append(finned_sink(sink_x, sink_y, sink_w, sink_h))
        # barcode along the inner end face
        for b in range(20):
            w = 1.4 if b % 3 else 2.8
            psu.append(f'<rect x="{X_REAR+16}" y="{y+34+b*4}" width="24" height="{w}" fill="rgba(147,161,161,0.22)"/>')
        # The module name runs along the module, not across it: on a real
        # machine the label is stuck to the long side, and you read it by
        # turning your head. The label on the cover is turned the same way.
        nx, ny = X_REAR + 30, y + PSU_H / 2
        psu.append(f'<text x="{nx}" y="{ny}" transform="rotate(-90 {nx} {ny})" '
                   f'text-anchor="middle" fill="rgba(147,161,161,0.5)" '
                   f'font-family="ui-monospace, Menlo, monospace" font-size="11">{name}</text>')
        psu.append(stamp(X_REAR + 16, y + 134, "блоки питания"))
        # AC, DC и неисправность — ровно тот набор, что напечатан на наклейке
        # живого блока. Вход под напряжением всегда: AC горит и на выключенной
        # машине.
        #
        # Строкой поперёк модуля, посередине под радиатором. Столбиком у самой
        # кромки они попадали под жалюзи, и предупреждение — единственная из
        # трёх, которую нормально видно только погашенной, — терялось в
        # прорезях. И каждая теперь через lamp(): у неё есть гнездо, поэтому
        # погашенная лампа остаётся на своём месте, а не исчезает.
        for j, (cls, color, nm) in enumerate((("led aux", "#859900", "AC"),
                                              ("led", "#859900", "DC"),
                                              ("fault-sys", "#b58900", "!"))):
            lx, ly = X_REAR + 106 + j * 44, y + 112
            psu.append(lamp(cls, lx, ly, 3.4, color))
            psu.append(mono(lx + 11, ly + 3, nm, 7, anchor="start", op=0.44))
        cv.add(f'''<g class="pick psu" data-psu="{k+1}" style="--seat:{seat('psu', k)}">
      <g class="pick-body">{''.join(psu)}</g>
      {fault_at(cv, X_REAR-18, y + 26, 5)}
    </g>''')
