# How to work with the card

A static site: `index.html`, `style.css`, `server.css`, `server.js` plus fonts
and images. There is no build step — whatever lies in the repository is what
goes to Cloudflare Workers from CI. The only generated thing is the server
schematic: Python assembles it from separate blocks and inserts it into
`index.html` between the `<!-- BOARD:BEGIN -->` and `<!-- LIDART:BEGIN -->`
markers.

So the local cycle is exactly this:

```
edit a block → tools/sync.sh → node tools/preview.mjs → look at the frame
```

## Rebuild the schematic

```bash
tools/sync.sh
```

Assembles the board, inserts it into `index.html`, runs the overlap audit and
updates the revision strip. Prints how many fragments came out and whether
anything got lost on the way.

Assembly only, without the insertion and the rest: `python3 tools/build.py`.

## Take a look

```bash
node tools/preview.mjs              # server view, frame in tools/preview.png
node tools/preview.mjs --card       # card view
node tools/preview.mjs --service    # service mode: console and teardown
node tools/preview.mjs /tmp/x.png   # frame to a place of your own
```

The script brings the static files up on a free port by itself, opens the
page, counts the nodes and prints console errors. Do not open `index.html` as
a file: over `file://` the browser cuts off the fonts by CORS, and the console
is stuffed with errors that have nothing to do with the matter.

playwright is needed — once, outside the repository:

```bash
mkdir -p /workspaces/.pw && cd /workspaces/.pw && npm init -y
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright pngjs
```

The browser is taken from the nix store. A downloaded playwright browser does
not start here — the container has no `libglib-2.0`.

## Make sure you broke nothing

Three checks, each catching its own class of breakage.

**The picture has not changed.** For edits that must not change the look
(re-wrapping, refactoring):

```bash
cp tools/board-v17*.svg.part /tmp/ref/          # baseline before the edit
python3 tools/diff_ref.py /tmp/ref              # after
```

Compares byte for byte, forgiving only commit hashes and the revision number —
those change from the very fact of doing the work.

**The look has not changed.** For edits in CSS and JS, where comparing text is
meaningless: the order of rules changes the cascade, the order of code changes
behaviour.

```bash
node tools/visual_ref.mjs --save    # baseline before the edit
node tools/visual_ref.mjs           # after: pixel by pixel, five states
```

The states: card, schematic, service mode, dark theme, pulled nodes.
Animations, running graphs, the clock and the input caret are killed —
otherwise the check would be catching those instead of the edits.

**The machine behaves as before.** Thirty-odd scenarios and 127 checks: power,
service mode, pulling nodes out, taking the processor apart in three clicks,
node names in the log, part numbers, sound, the revision strip.

```bash
node tools/behave.mjs
```

**The labels have not run into each other:**

```bash
python3 tools/audit_text.py
```

On top of that the build itself fails if a node went outside its declared
bounds or if a part did not find room on the board.

## The schematic is assembled from blocks

```
tools/build.py          build order, bounds, report, insertion into the page
tools/board/
  geom.py               the only place that says what lies where
  spec.py               the machine spec: what kind of hardware this is
  canvas.py             canvas, register of taken places, share between blocks
  palette ink lamps metal ports revision
  styles/base.css       common schematic styles, with node and part markers
  scripts/base.js       common machine logic, with node and part markers
  blocks/               board nodes: geometry.py + styles + behaviour
  parts/                page parts: terminal, commands, screen
```

A node lives in three files with one name, and that is the whole node:

```
blocks/fans.py     geometry: impellers, tabs, lamps, power pins
blocks/fans.css    look: rotation, spin-up when a neighbour is pulled
blocks/fans.js     behaviour: its name in the log, how it comes apart
```

`server.css` and `server.js` are **generated** — editing them is pointless,
the next build overwrites them. The sources are the base plus the node files;
the `/* @block: name */` and `// @block: name` markers stand exactly where the
pieces lay in the single file. This is not cosmetics: in CSS, with equal
specificity, the dispute is settled by order, and in JS a handler hoisted above
its element will not find it in the DOM.

The behaviour of a node is described through a registry — the block itself
says what it is called and whether it comes apart in a special way:

```js
PICKS.push({
  test: el => el.dataset.fan !== undefined,
  name: el => 'fan ' + (Number(el.dataset.fan) + 1),
  pull: (el, line) => { … },     // optional: the processor has three states
});
```

Editing a node is editing its files. It does not touch the neighbours:
different files, different zones.

```python
BOUNDS = (x, y, w, h)            # its own rectangle, optional

def render(cv):
    cv.add('<g class="pick fan">…</g>')     # put down a fragment
    cv.busy(x, y, w, h)                     # take the place
    if cv.put(x, y, w, h):                  # take it if free
        ...
```

Coordinates come from `geom`, they are not written as numbers. A lamp comes
from `lamps`, not one of your own: indication must look the same on a drive, a
fan and a memory module, otherwise the schematic falls apart into patches.

## The machine spec and the three layers of truth

`geom` answers "what lies where", `spec.py` answers "what it is": the
processor model, the size of a module, which drive sits in which bay. The
build prints it into the page between the `SPEC:BEGIN/END` markers as JSON and
**checks what is promised against what is drawn** — if the spec says
twenty-four modules and there are twenty-three of them in the SVG, the build
fails with the name of the discrepancy.

Everything the console prints comes from exactly one of three places:

```
HW spec      what hardware is installed  spec.py → JSON in the page
DOM          what of it is in place now  .dimm.pulled and other selectors
NVRAM nv     how it is configured        localStorage rig-nv, edited by BIOS
```

There must be no literals in the commands. Before, they were absent only on
paper: the board has twenty-four modules while the console promised
thirty-two — and so in six places at once.

The labels on the board itself also come from the spec: the type and size of a
module, the drive model, the socket and the core count on the processor lid,
the channels on the bank frames. Lying is still possible, but now only in the
console and on the laminate at the same time.

## Parts of the page

The terminal and the screen draw nothing on the board, so the "a node lives in
three files" rule does not apply to them. They lie in `parts/`, are wired in
by `@part: name` markers and may consist of a single file:

```
parts/term.js    shell core: command registry, lexer, pipeline, history, Tab
parts/term.css   the completion hint
parts/hw.js      hardware commands: they also compute the sensor readings
parts/fs.js      the file system and the file commands
parts/screen.js  the full-screen layer: POST, BIOS Setup, top
parts/screen.css its styles
parts/sfx.js     the voices of the machine
parts/sfx.css    their indicator
```

The order of insertion is the order of execution: `term` creates the registry,
the rest register themselves in it. Mixing up the markers means getting an
empty help page and silently dead commands, which is why a repeated command
name crashes the page right away instead of quietly overwriting the previous
one.

A command declares itself in full and **returns lines rather than printing
them** — that is the only way the pipeline works:

```js
cmd({ name: 'sensors', group: 'СОСТОЯНИЕ', brief: 'температуры и обороты',
      usage: 'sensors [шаблон]', needs: 'power',
      complete: (argv, i) => [],                 // candidates for Tab
      run: ctx => [{ t: 'CPU0 Temp 47 °C', c: 'ok' }] });
```

### The full-screen layer

`parts/screen.js` raises one `<dialog>` over the machine in three modes: the
self-test at power-on, BIOS Setup and `top`. `showModal()` moves it into the
top layer and makes the rest of the tree inert — otherwise `Enter` and `Space`
would keep pressing the buttons of the schematic under the layer. While the
layer is open, the schematic is paused by the `dormant` class.

Setup is entered by `Enter` or `F2` during the self-test and by `F2` at idle;
on a mac the top row of keys is given to brightness, so `F2` alone is not
enough. The settings live in `localStorage['rig-nv']` separately from
`rig-state`: the firmware is edited by `F10`, while power is toggled every
time, and `F9` must wipe the first without touching the second.

There is **not a single `<input>`** inside the layer — this chromium build
crashes the renderer on any input field, and the BMC address is edited by
typing right in the table row.

The terminal cannot be checked by typing into a field — the chromium build in
the container crashes the renderer on any `<input>`, and the tools remove the
fields before painting. For that there is the `window.__rig` handle: `exec`,
`complete`, `ghost`, `cwd`.

### What must not be edited on its own

- **`ORDER` in `build.py`** — the build order. It is also the layer order and
  also the queue for space: whoever took a rectangle first owns the place. The
  discrete components go late, because they seat in what is left.
- **`geom.py`** — the common table. Moving a node from here means moving
  everything inside it too.
- **The palette and the lamps** — edited rarely and as a whole.

### Links between blocks

Only two, both explicit. Data — through `canvas.share`: the routing puts down
its knots, the vias and the passives take them.

```python
cv.share['knots'] = knots        # pcb_traces
kx, ky = cv.share['knots'][i]    # pcb_vias, pcb_scatter
```

Space — through the register of taken places, in the order given by `ORDER`.

### Part numbers

Every node has its own P/N — the hash of the last commit touching its file.
`stamp()` works out the file from the call stack, so inside a block `stamp(x,
y, 'fans')` is enough; the third argument is only for readability. You edit
`fans.py` — only its number diverges.

## Environment gotchas

- **This chromium build crashes the renderer on any `<input>`.** Reproduced on
  a bare page with a single field. In the checks the input field is removed
  before painting — if you write your own script, do the same.
- **There are no system fonts in the container** (`fc-list` is empty). Frames
  show no monospaced text: the labels on the board look like empty plates.
  That is a capture artefact, not a regression.
- **A downloaded playwright browser does not start** — no `libglib-2.0`, we
  take chromium from the nix store.
- `cd` does not survive between Bash calls — absolute paths.

## Commits and deploy

Commits are signed with an SSH key through a forwarded agent. If the agent has
died (`~/.ssh/ssh_auth_sock` points at a socket that does not exist), signing
fails with `Couldn't get agent socket?`. Then either fix the agent, or commit
without a signature and re-sign later:

```bash
git rebase --exec 'git commit --amend --no-edit -S' <base>
```

There is no need to deploy locally, and nothing to do it with: a `push` to
`master` launches `.github/workflows/deploy.yaml`, which builds `_site/` and
uploads it to the worker. The `server-card` branch is not merged yet — it does
not go to prod.

## Инструменты разметки платы

Плата плотная, и главный вопрос при любой правке один: куда можно поставить и
что там уже есть. Раньше на него отвечали вслепую — двигали число, пересобирали,
смотрели глазами. Ниже описано, чем на него отвечают теперь.

Всё это — инструменты разработки. Панель видна только там, где есть штамп сборки
(`<meta name="build">`): локально и на превью-стендах. На продакшене штамп стирает
пайплайн выкатки, и панели не будет.

### Регистр занятости

`tools/board/canvas.py`. Блок помечает своё место `cv.busy(x, y, w, h, kind=…)`
и спрашивает чужое `cv.free(...)` / `cv.put(...)`. Видов восемь, и у каждого
своё правило, чего он избегает:

| вид | что это | ложится поверх | не лезет на |
|---|---|---|---|
| `COPPER` | дорожки, переходные, площадки | — | вырезы |
| `MINOR` | рассыпуха | медь | корпуса, крупную рассыпуху, краску, бронь, вырезы |
| `SILK` | подписи и шелкография | медь, мелочь, бронь | корпуса, крупную рассыпуху, другую краску, вырезы |
| `PART` | крупная рассыпуха: SOIC, дроссели, кварцы | медь | корпуса, другую крупную рассыпуху, бронь, вырезы |
| `MAJOR` | узлы: разъёмы, гнёзда, сокеты, лампы | медь | другие узлы, крупную рассыпуху, вырезы |
| `RESERVE` | бронь под будущий узел | медь | вырезы |
| `COVER` | бронь, которую узел накроет целиком | медь | вырезы |
| `BOARD` | вырезы и края текстолита | — | — |

`COVER` отделён от `RESERVE` ради краски. Под планкой памяти шелкография на
живой плате есть — её наносят до сборки, — но схема показывает машину
СОБРАННОЙ, и такой надписи не видит никто, при этом место она занимает.
Запретить же краске всю бронь разом нельзя: брони покрывают плату почти
целиком, и обозначений осталось бы десять из полусотни.

Ключевое различие — **бронь против корпуса**. Корпус говорит «здесь стоит
деталь», бронь — «сюда придёт узел». Под планкой памяти и вокруг сокета на живой
плате шелкографии полно: краску наносят до того, как в плату что-то вставили.
Пока это был один вид, слой обозначений не рисовался вовсе — ему негде было
встать. После разделения он появился: прямоугольников вида `SILK` в регистре
сейчас 124, и это видно в панели слоёв.

Второе различие — **узел против крупной рассыпухи**. Узлу место назначено в
`geom` и к нему ведёт бирка, крупной рассыпухе место найдено обходом `place()`
и назвать её нечем. Пока они были одним видом, адрес `B14` не отвечал на вопрос,
о чём речь: под одной буквой лежали и разъём, который двигать нельзя, и
дроссель, вставший туда, где нашлось место.

Отсюда и разное отношение к брони. Узел в брони — это то, ради чего бронь и
держат, поэтому `MAJOR` её не избегает. Крупная рассыпуха избегает: найти себе
место в чужой брони значит встать под планкой памяти или под кронштейном
райзера. Пока правило молчало, `place()` спрашивал только про корпуса и вырезы,
и брони банков его не держали — запрет убрал эту причину наложений. Сейчас
`problems` в `audit_text.py` равен нулю; число печатается прогоном, сверять
надо с ним.

**Медь размечается вдоль пути, а не по концам пучка.** Шина идёт ступенькой —
прямо, скос в 45°, снова прямо, — и одним прямоугольником по её концам скос не
описывается вовсе: лента ложилась у начала пучка и до его конца не доходила.
`spine()` даёт ломаную, `span_rects()` — прямоугольники по её звеньям, скос
лестницей. Отступ у скоса уже, чем у осевого звена, ровно в корень из двух:
он меряется по нормали к пучку, а она к осям наклонена.

Умолчание `kind=MAJOR` — самое строгое: блок, не знающий про виды, ведёт себя
как раньше.

Хозяина брони проставляет сборка: перед вызовом блока она ставит `cv.by = name`.
Дописывать источник в каждый вызов не нужно — первый же забытый оставил бы бронь
без хозяина, а именно по хозяину её и ищут.

### Панель слоёв

Слева по центру, сворачивается нажатием на заголовок (состояние помнится).
Три раздела:

- **рисунок** — 23 блока сборки с числом фигур. Галочка гасит блок целиком:
  видно, что он рисовал и что лежит под ним.
- **границы занятости** — 8 видов. Галочка показывает прямоугольники регистра
  поверх приглушённой схемы.
- **поверх всего** — координатная сетка, наслоения регистра и наслоения
  рисунка. Первые считает сборка по регистру занятости, вторые — браузер по
  готовой разметке через `getBBox`: регистр знает, что блок объявил, а
  рисунок — что получилось.

Панель строит списки из самой разметки: группы блоков (`.blk[data-blk]`) и
границ (`.bnd`) подписаны генератором. Второй список разошёлся бы с первым в
первую же правку — как разошлись бронь и райзеры.

### Адреса

У каждого прямоугольника занятости буква вида и номер по порядку сборки:
`C` медь, `M` мелочь, `S` подписи, `B` узлы, `D` крупная рассыпуха, `R` бронь,
`V` бронь под накрывающий узел, `E` края. `R7` — седьмая бронь, `B14` — четырнадцатый узел. Адрес подписан на
самом квадрате (в мелкие не влезает — там он только в разметке, `data-id`).

Под курсором всплывает ярлык: адрес, вид и блок-хозяин. Работает, пока границы
показаны; в обычном состоянии слой мышь не ловит.

**Координатная сетка** адресует не деталь, а место: шаг 100 единиц, клетки
`A1`…`N9`. Нужна там, где деталь назвать нечем — «в D4 слишком плотно».

### Сверка брони с фактом

Считает при каждой сборке. Если внутри брони настоящих корпусов меньше четверти
площади, в вывод `tools/sync.sh` попадает строка:

```
БРОНЬ ПОЧТИ ПУСТА: pcb_zones держит 55872 единиц (1013,167)–(1301,361), корпусами занято 11%
```

Сравнивать бронь с габаритом блока бесполезно: блок памяти занимает всю свою
полосу, и любая бронь внутри выглядит оправданной. Вопрос в том, сколько внутри
брони настоящих корпусов.

Сейчас такое место одно — это рабочий список, а не поломка: бронь законно
бывает с запасом, поэтому сборка не падает, а говорит вслух.

### Наслоения

Галочка «наслоения» в разделе «поверх всего». Показывает места, где два
прямоугольника перекрылись больше чем на четверть площади меньшего **вопреки
правилу** — то есть где пришедший позже залез на тот вид, который в `AVOID`
объявлен для него запретным. Границы этого не показывают: верхний квадрат
просто закрывает нижний, и наслоение выглядит как один прямоугольник.

Критерий берётся из самого `AVOID`, а не задаётся списком. Первая версия
сравнивала квадраты только внутри одного вида и молчала ровно там, где смотреть
интереснее всего: под банками памяти, где на брони стоят и краска, и разъёмы, и
крупная рассыпуха — виды там разные.

**Правило направленное, и порядок берётся из `ORDER`.** «Мелочь не лезет на
корпус» не значит «корпус не лезет на мелочь»: корпус ставится позже и накрывает
уже стоящую мелочь законно — на живой плате разъём и припаян поверх того, что
развели под ним. Нарушение — это когда позже пришедший встал на то, чего обязан
был избегать: он мог спросить и не спросил. Симметричная проверка давала 75
находок, из которых 40 были разрешёнными.

Медь отсеивается сама собой, без исключений: `COPPER` себя не избегает, потому
что плата многослойная и шины в проекции сверху пересекаются законно. А медь за
кромкой текстолита правило запрещает — и слой её показывает.

Под курсором — оба адреса и оба хозяина: `M20+R4 · pcb_scatter + pcb_zones`.
Вопрос к наслоению всегда «кто с кем», а не «что это».

Сейчас находок 97: 32 краска под накрывающей бронью, 30 узел на узле, 7 медь
за кромкой текстолита, остальное по три-шесть. Число печатает
`python3 tools/layers.py`, и сверять его надо с ним, а не с этой строкой.

### Как этим пользоваться агенту

1. Правишь раскладку — сначала посмотри, что в этом месте уже занято: включи
   нужный вид в панели или прочитай `data-id`/`data-by` в собранном `index.html`.
2. Ставишь новый элемент — выбери вид осознанно. Узел с именем и биркой это
   `MAJOR`, крупная безымянная деталь `PART`, мелочь `MINOR`, подпись `SILK`,
   место под будущий узел `RESERVE`.
3. Бронь пиши там же, откуда берутся координаты рисунка. Числа, записанные
   отдельно, расходятся молча: бронь под нижний райзер стояла на сотню единиц
   мимо самого райзера, и заметить это удалось только когда границы стали
   видимыми.
4. После правки прогони `cd tools && bash sync.sh` и прочитай вывод: `problems`
   (сравнивай с числом до правки), список
   `БРОНЬ ПОЧТИ ПУСТА` и `DID NOT FIT`.
5. Проверяй снимком, а не на глаз по коду. В безголовом браузере схема считается
   невидимой: ставится класс `dormant`, анимации стоят, самотест не доигрывает и
   `tags-off` висит вечно — перед съёмкой эти классы надо снимать вручную.

## Проверки

Раньше проверок было пять и запускались они по памяти: та, о которой вспомнил.
Ни одна не гонялась в CI, поэтому поломка доезжала до продакшена ровно так же
быстро, как правка. Теперь у всех одна дверь:

```bash
tools/test.sh              быстрые: полторы секунды, без браузера
tools/test.sh --browser    плюс браузерные: карточка, поведение, скорость
tools/test.sh --live       плюс живой сайт
tools/test.sh --all        всё
```

Разделение по времени, а не по важности. Быстрые гоняются после каждой правки;
браузерные поднимают chromium и меряют время; живые ходят в интернет и
проверяют не код, а то, что из него развернулось.

### Что чем ловится

| проверка | что ловит | чем запускается |
|---|---|---|
| `tests/` | правила регистра, паспорт, собранная страница, кэш | `python3 -m unittest discover -s tests -t tests` |
| `tools/layers.py` | наслоения слоёв стали хуже, чем были | `python3 tools/layers.py` |
| `tools/audit_text.py` | подпись легла на чужую непрозрачную фигуру | `python3 tools/audit_text.py` |
| `tools/mobile.mjs` | карточка на телефоне: граница вида, ссылки, перекрытия | `node tools/mobile.mjs` |
| `tools/anim.mjs` | анимации карточки: наведение, появление, вечные, reduced-motion | `node tools/anim.mjs` |
| `tools/a11y.mjs` | доступность: axe по правилам A и AA, обход табом, видимость фокуса | `node tools/a11y.mjs` |
| `tools/security-headers.mjs` | заголовки безопасности объявлены и осмысленны | `node tools/security-headers.mjs` |
| `tools/rum-check.mjs` | воркер: метка версии, отказы на приёме мерок, страница под политикой | `node tools/rum-check.mjs` |
| `tools/behave.mjs` | машина ведёт себя как прежде: 127 проверок | `node tools/behave.mjs` |
| `tools/perf-matrix.mjs` | скорость на пяти устройствах, с кэшем и без | `node tools/perf-matrix.mjs` |
| `tools/live-check.mjs` | что развернулось в Cloudflare | `node tools/live-check.mjs` |
| `tools/overlap.mjs` | наложения в движении, после каждого хода | `timeout 400 node tools/overlap.mjs` |
| `tools/visual_ref.mjs` | картинка не поехала: пять состояний по пикселям | `node tools/visual_ref.mjs` |
| `tools/diff_ref.py` | сборка не изменила разметку ни на байт | `python3 tools/diff_ref.py /tmp/ref` |

### Слои: база вместо нуля

`tools/layers.py` считает наслоения тем же правилом, что и сборка, и сверяет их
с `tools/layers.json`. Требовать нуля бессмысленно: девяносто семь находок —
это не девяносто семь поломок, половина из них законные решения, которых
правило не умеет отличить от ошибки. Вопрос, который задают после правки,
другой: **стало ли хуже, чем было**.

Находка опознаётся парой видов и парой блоков-хозяев, а не адресом: адреса
нумеруются по порядку сборки, и правка одного блока сдвинула бы номера у всех
следующих. База разошлась бы от переименования, а не от поломки.

```bash
python3 tools/layers.py            сверить, упасть на регрессе
python3 tools/layers.py --list     все находки с адресами и хозяевами
python3 tools/layers.py --update   принять текущее состояние за базу
```

### Скорость: пять устройств, два захода

`tools/perf-matrix.mjs` меряет матрицу «устройство × кэш»: телефон подешевле,
телефон, планшет, ноутбук, десктоп — каждое со своим разрешением, плотностью
пикселей, сетью и душением процессора. Каждое заходит дважды: первый раз с
пустым кэшем, второй — тем же контекстом, как возвращается гость.

Локальный сервер отдаёт **те же заголовки, что стоят в `_headers`**, и жмёт
brotli, как Cloudflare. Без этого тёплый заход неотличим от холодного, а вес
разметки завышается вдесятеро.

Отдельная проверка, не зависящая ни от какой базы: на втором заходе то, что
объявлено вечным, не имеет права поехать снова. Это не про скорость, это про
исправность `_headers`, и ломается оно молча.

**LCP на этой странице не существует.** Выяснено измерением: кандидатами Chrome
считает картинки, видео и текстовые блоки, а вся схема — inline `<svg>`. Больше
того, на узком экране не наступает и FCP: там показывается карточка, и её
содержимое Chrome contentful не признаёт — проверено с душением процессора и
без, с флагом мобильного устройства и без, с ожиданием в двенадцать секунд.
Поэтому момент появления страницы снимается кадрами: screencast отдаёт картинки
с отметками времени, и первый заметно потяжелевший против первого кадра — это и
есть «гость увидел страницу». Отсчёт именно от первого кадра, а не от самого
лёгкого из всех: минимум по всей ленте берёт кадр из середины, где страница
успела потемнеть, и появление находится позже самого появления.

На тёплом заходе это число печатается, но бюджета ему нет: браузер часто
оставляет на экране картинку прошлого захода, и первый же кадр приходит
непустым — на неизменной странице оно скакало от 0 до 1020 мс.

Бюджеты лежат в `tools/perf-budget.json`, и запас у них разный, потому что
разного качества числа. Вес по проводу детерминирован — те же файлы, то же
сжатие, — ему хватает пяти процентов. Времена шумят, но не сами по себе: три
прогона подряд расходятся на пять процентов, а вот сразу после `behave.mjs` TTI
подскакивает вдвое — 2093 мс против 814, 829, 858 в изоляции. Поэтому запас по
временам двойной, снимать их надо с `--repeat 3`, а `tools/test.sh` ждёт, пока
предыдущая проверка отпустит свои браузеры, прежде чем мерить.

**Времена бюджетируются только от трёх прогонов** (`--repeat 3`). Одиночному
замеру здесь верить нельзя, и это не осторожность, а измерение: одно и то же
неизменное состояние давало по TTI 682, 696 и 1943 мс, а по появлению страницы
— 162 и 1151 мс. Причина одна: длинные задачи здесь — это отрисовка схемы, и
она конкурирует со всем, что на машине; стоит рядом отработать другой
браузерной проверке, и число уезжает втрое. Вес по проводу от машины не зависит
вовсе и проверяется всегда — вместе с работой кэша.

В CI применяется только бюджет по весу: секунды чужого раннера не наши.

```bash
node tools/perf-matrix.mjs                 вся матрица
node tools/perf-matrix.mjs --device phone  одно устройство
node tools/perf-matrix.mjs --repeat 3      медиана трёх прогонов
node tools/perf-matrix.mjs --url https://cosmdandy.dev   по живому адресу
node tools/perf-matrix.mjs --update        принять текущее за бюджет
```

### Карточка отдельно от схемы

Ниже 821 пикселя схемы нет вовсе — страница показывает карточку со ссылками,
и все остальные проверки смотрят ровно на то, чего мобильный гость не увидит
никогда. `tools/mobile.mjs` проверяет то, что он увидит: граница вида там, где
обещано; ссылки на месте и у каждой есть адрес; ничего не торчит вбок; в цель
попадают пальцем; консоль молчит.

Перекрытие проверяется попаданием, а не разметкой: берётся центр ссылки и
спрашивается, кто окажется под пальцем. Прозрачный слой поверх кнопки в
разметке не виден никак, а нажатие съедает целиком.

За что мобильный гость платит зря, говорит вслух другая мерка —
`perf-matrix.mjs`: на устройствах уже́ порога она дописывает строку со счётом.
Стили схемы теперь не едут вовсе (см. ниже), а скрипт и разметка едут:
`server.js` и около 111 КБ разметки внутри страницы. Число считается прогоном
и уезжает от любой правки платы.

### Анимации карточки

`tools/anim.mjs` проверяет то, чего не видит ни снимок, ни разбор разметки.
Снимок показывает состояние, а вопрос к анимации — как она в это состояние
пришла и пришла ли вообще.

Ломается это молча и всегда одинаково: правило с той же специфичностью ниже по
файлу отбирает у ссылки её `transition`, и наведение начинает срабатывать
мгновенно. На картинке разницы нет никакой.

Что проверяется:

- **наведение** на каждую из шести ссылок: переход существует, длится от
  ста миллисекунд до полутора секунд, задевает те свойства, что объявлены,
  ссылка доезжает до приподнятого состояния и возвращается, когда мышь ушла.
  Незакрытый возврат оставляет на карточке две поднятые ссылки сразу;
- **появление**: у каждой ссылки своя ступень — 220, 280, 340, 400, 460,
  520 мс, — и порядок здесь и есть эффект. Анимация стоит с `backwards`, то
  есть до старта ссылка прозрачна: не доиграв, она такой и останется, и гость
  увидит пустое место;
- **вечные**: всё объявленное бесконечным обязано крутиться — сейчас это
  `livePulse` и `badgeShimmer`; остановка означает, что их согнали с
  композитора;
- **выключение движения**: при `prefers-reduced-motion: reduce` не должно
  двигаться ничего и не должно остаться невидимых элементов.

Длительности спрашиваются у самого браузера через `getAnimations()`, а не
сверяются с числами из `style.css`: браузер читает тот же файл, и такая сверка
была бы тавтологией.

```bash
node tools/anim.mjs             все проверки
node tools/anim.mjs --link CV   одна ссылка, с раскладкой хода по кадрам
```

### Живой сайт

Между репозиторием и гостем стоят четыре шага пайплайна: минификация, пересчёт
версий, стирание отметки о сборке и вырезание отладочных слоёв. Любой может не
сработать молча — страница откроется и будет выглядеть правильно.

`tools/live-check.mjs` ходит на живой адрес и спрашивает то, чего локально не
спросить ни у кого: какие заголовки ставит воркер, сжимает ли он ответ, то ли
содержимое лежит под версией из ссылки, стёрта ли отметка, вырезаны ли слои,
отвечает ли 404 своей страницей, собралась ли лента ревизий.

```bash
node tools/live-check.mjs                              продакшен
node tools/live-check.mjs --url https://… --preview    превью-стенд
```

На превью ожидания обратные: отметка и отладочные слои обязаны быть на месте —
этим стенд и отличается от продакшена.

Отдельно от отказов стоят предупреждения — «СТОИТ ПОЧИНИТЬ». Они печатаются и
не роняют прогон. Нужны там, где проверка говорит правду про сегодняшний
продакшен: ронять ею выкатку значит держать пайплайн красным до тех пор, пока
руки не дойдут до починки, а красный пайплайн перестают читать на второй день.

Так было с кэшем страницы. Раздача отдаёт её с `max-age=0, must-revalidate` по
умолчанию — правила для `/` в `_headers` нет вовсе, — и замысел там объяснён
прямо: «ETag revalidation is both cheaper and more honest for them». Но ни
`ETag`, ни `Last-Modified` в ответе не было: переспрашивать браузер
переспрашивал, а сверять было нечем, и вместо пустого 304 каждый повторный
заход вёз страницу целиком — 138 КБ, измерено `perf-matrix --url`.

Это и чинит воркер, см. «Воркер перед статикой» ниже.

Проверка стоит в `deploy.yaml` после выкатки и после подъёма превью. Красная
проверка там означает, что выкатка прошла, а развернулось не то, — и узнать об
этом надо сразу, а не от гостя.

### Что гоняется в CI

`.github/workflows/test.yml`, две работы. Быстрая не поднимает браузер и
отвечает за полторы секунды: тесты, слои, подписи и детерминированность
генератора — две сборки подряд обязаны совпасть байт в байт. Рассыпуха
раскладывается обходом, краска сливается, места раздаются по очереди, и любая
случайность без посева всплыла бы тем, что схема тихо ездит от сборки к сборке,
а сверка картинки начала бы врать.

**Сверять пересборку с закоммиченной страницей нельзя**, и это выяснилось
попыткой: номер ревизии — счётчик коммитов, тронувших `index.html`; номер
детали — хэш последнего коммита по её файлу; серийный номер — отпечаток всей
разметки, в которую входит номер ревизии; а штрих-коды на наклейках памяти,
блоков питания и текстолита сосчитаны из серийного номера, `ord(символа) % 3`
на толщину штриха. Автор собирает страницу ДО коммита, CI пересобрал бы ПОСЛЕ —
и все четыре разошлись бы всегда, ничего при этом не сломав. По той же причине
из сверки паспорта в `tests/test_page.py` выпадают `rev` и `sha`.

Браузерная ставит chromium по файлу блокировки `tools/ci/package-lock.json` и
гоняет карточку, анимации, доступность, воркер, поведение и скорость. Файл блокировки лежит в стороне от сайта
нарочно: у сайта нет ни сборки, ни `node_modules`, и это должно остаться правдой.

### Где взять браузер

`tools/browser.mjs` — один ответ для тех проверок, что гоняются в CI:
`mobile`, `anim`, `a11y`, `behave`, `perf-matrix`. Раньше путь был записан в
каждом инструменте отдельно и записан для одной машины: `/nix/store`. В CI
такого пути нет вовсе, и любая проверка падала бы на первой строке.

Остальные мерки — `visual_ref`, `overlap`, `motion`, `physics`, `perf`,
`perf-load`, `pixdiff`, `splitcmp`, `preview` — по-прежнему берут chromium из
`/nix/store` и работают только в контейнере разработки. Им это и нужно: они
запускаются руками, когда правят плату.

Там же живёт `dropInputs`: этот сборник chromium роняет рендерер на любом
`<input>`, и проверки убирают поля до первой отрисовки. Наблюдателем, а не
событием — с тех пор как стили схемы перестали блокировать отрисовку на узком
экране, обработчик на `DOMContentLoaded` опаздывал, и падал уже рендерер.

Порядок: `CHROME_PATH`, если сказано прямо; `/nix/store` — контейнер разработки,
где скачанный playwright не стартует из-за отсутствия `libglib-2.0`; собственный
браузер playwright — так это работает в CI.

## Воркер перед статикой

`worker.js` делает две вещи, которых файлы сами не умеют. Всё остальное едет
мимо него: `run_worker_first` в `wrangler.jsonc` перечисляет только страницы и
`/rum`, и на каждый шрифт лишний вызов не тратится.

### Метка версии

Заголовок обещает `must-revalidate`, но исполнить это было нечем: раздача не
ставит на HTML ни `ETag`, ни `Last-Modified`. Каждый повторный заход вёз 138 КБ
страницы заново вместо пустого «не менялось».

Метка берётся из версии самого воркера (`version_metadata`), а не считается от
тела: тело — мегабайт разметки, и хэшировать его на каждый запрос дороже, чем
отдать. Версия меняется ровно при выкатке и не меняется, когда не выкатывали, —
это и есть правильный ключ. Метка слабая (`W/`): сравнивается смысл, а не
байты, ведь тело может приехать сжатым по-разному.

### Мерки от живого гостя

Лабораторная мерка меряет контейнер разработки с эмуляцией телефона. Поле — это
телефон в метро, чужой Wi-Fi и процессор, которого у нас нет. `tools/rum.js`
собирает TTFB, FCP, LCP, CLS, INP, DCL и load и отправляет их одним пакетом на
выгрузке страницы через `sendBeacon`.

Отправляется **только с продакшена**, и опознаётся он отсутствием содержимого в
отметке о сборке — по тому же признаку, по которому показывается панель слоёв.
Тег обязан быть и обязан быть пустым: «нет тега» — это не продакшен, а страница,
которую забыли проштамповать. Поэтому отметка теперь стоит на всех трёх
страницах, включая `/tg`.

Метрики падают в журнал воркера — `wrangler tail` и панель Logs. Отдельного
хранилища нет нарочно: вопрос к ним не «сколько их всего», а «стало ли хуже
после выкатки», и на него отвечает лента последних записей. Понадобятся
агрегаты — в `wrangler.jsonc` добавляется Analytics Engine, место указано.

Своя горстка кода вместо библиотеки — потому что готовые считают пять метрик
Web Vitals, из которых на этой странице две не существуют: LCP не наступает
вовсе, а на узком экране не наступает и FCP.

**Ручка публичная, и половина её кода — отказы.** Чужой источник, отсутствие
источника, мусор вместо тела, `null` (тоже валидный JSON, и обращение к его
полю роняло обработчик), тело не по размеру. Размер меряется по прочитанному, а
не по `Content-Length`: заголовка может не быть вовсе или он соврёт, и двести
килобайт заходили без возражений.

## Заголовки безопасности

Статический сайт кажется неуязвимым — сервера нет, ломать нечего. Уязвим не
сервер, а браузер гостя: без правил он выполнит любой скрипт, оказавшийся в
разметке, отправит полный адрес страницы на чужой сайт в `Referer`, даст
встроить себя в чужой фрейм и угадает тип файла по содержимому.

`tools/csp.py` собирает политику по хэшам встроенных скриптов и пишет её в
`_headers` между метками. Хэши, а не `'unsafe-inline'`: разрешение «всё
встроенное» делает политику декоративной — ровно то, чем пользуется внедрённый
скрипт, ею и разрешено. Встроенных обработчиков (`onclick=`) на странице нет ни
одного, поэтому `'unsafe-hashes'` не нужен, а он бы всю строгость и снял.

Правила предзагрузки политика проверяет наравне со скриптами, и хэш нужен им
тоже. Забыть это легко: без хэша браузер молча их не применит — предзагрузка не
обязана случиться, и её отсутствие неотличимо от «гость не наводил».

Считается **после минификации**: она меняет тела скриптов, а значит и хэши.
Посчитанные до неё, они не сошлись бы ни с одним скриптом на странице, и
браузер отказался бы выполнить их все разом. В конвейере шаг стоит между
минификацией и версиями статики; локально — в `tools/sync.sh` после вставок.

`tests/test_page.py` сверяет, что каждый встроенный скрипт разрешён политикой:
поправил скрипт, забыл пересчитать — тест краснеет. А `rum-check.mjs` открывает
страницу под настоящими заголовками и проверяет, что политика не отвергла её же
скрипты.

## Предзагрузка

`/tg/` — единственная внутренняя ссылка на сайте, и ведут к ней две: кнопка на
карточке и бирка на схеме. Правила предзагрузки поднимают её при наведении
(`eagerness: moderate`) — до нажатия остаются сотни миллисекунд, и их хватает,
чтобы страница была уже готова. Заранее, без наведения, не грузим: это был бы
трафик за того, кто никуда не собирался.

## Схема на узком экране: почему она всё-таки едет

Ниже 821 px схемы нет вовсе, а её стили и логика приезжают всё равно: 57 КБ и
91 КБ поверх brotli — больше половины веса страницы, впустую для того, кто
зашёл с телефона. Попытка это починить была, дошла до конца и откачена; ниже
то, что она показала, чтобы следующая попытка начиналась не с нуля.

**Скрипт нельзя подключать из кода.** Он стоит с `defer`, и это не украшение:
defer обещает выполнение после того, как разобрана вся страница, а скрипт берёт
по идентификаторам ползунок ленты ревизий, поле ввода консоли и ещё десяток
узлов из низа разметки. Атрибут действует только на теги, написанные в
разметке; созданный из кода ведёт себя как `async` — проверено: скрипт падал на
первом же `addEventListener` и не доигрывал вовсе, страница оставалась
разметкой без поведения. Отложить его до `DOMContentLoaded` тоже мало: к этому
моменту успевает отработать чужой код, рассчитывающий на те же элементы.

**Стили нельзя подключать по ширине.** Схему прятал как раз `server.css`; без
него пять тысяч фигур раскладываются во весь рост, и эта сборка chromium просто
роняет рендерер — страница закрывается раньше, чем догружается. Скрыть её
базовым файлом через `display: none` помогает от краха, но ломает другое:
анимации посадки живут в `server.css`, и пока его нет, сборка отыгрывает
вхолостую. Померено сценарием «сузить окно, подождать, расширить»: со
статическими стилями при расширении запускаются 44 анимации посадки, с
динамическими — ноль, а класс `assembly` к этому моменту уже снят.

Значит вынос схемы — это работа не по загрузке, а по самой машине: научить её
переживать поздний старт, отсутствие необязательных узлов и приход стилей после
разметки. Пока этого нет, статические `<link>` и `<script defer>` остаются, и
`perf-matrix.mjs` на узких устройствах печатает счёт: за что гость заплатил, не
увидев.

## Доступность

`tools/a11y.mjs` проверяет карточку и схему по отдельности: у них разная
разметка, и общего только шапка.

Первый род проверок — `axe` по правилам A и AA: контраст, ссылки без текста,
кнопки без имени, заголовки через уровень. Уровень AAA не берём — он требует
контраста 7:1, недостижимого ни для одной тёмной темы с приглушённым текстом.

Второй — то, чего axe не видит: обход табом настоящими нажатиями и видимость
фокуса. Фокус проверяется пикселями, потому что `outline: none` в чужом правиле
разметка не показывает никак; снимается область **вокруг** элемента, а не сам
элемент — обводка рисуется снаружи границы, и снимок элемента обрезал бы ровно
то, что проверяется.

Первая находка этой проверки: схема была объявлена картинкой (`role="img"`), а
внутри неё восемнадцать интерактивных узлов — экранный диктор до них не
добирался. Теперь это `role="group"` с тем же именем.
