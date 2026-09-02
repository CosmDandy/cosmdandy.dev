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

**The machine behaves as before.** Seventeen scenarios: power, service mode,
pulling nodes out, taking the processor apart in three clicks, node names in
the log, part numbers.

```bash
node tools/behave.mjs
```

**The labels have not run into each other:**

```bash
python3 tools/audit_text.py
```

On top of that the build itself fails if a node went outside its declared
bounds or if a part did not find room on the board.

## Сцены открытия

Щелчок по узлу уводит на его раздел, и между щелчком и уходом играет пролог:
машина показывает, чем этот раздел является в её собственных понятиях.
Процессор снимает радиатор и раскладывает кремний под крышкой, память идёт
циклом обновления по банку. Сцен пока две — у процессора и у памяти; у
остальных узлов щелчок работает как прежде, уходом сразу.

```bash
node tools/opening.mjs          # обе сцены
node tools/opening.mjs cpu      # одна
```

Проверяется то, чего не видно на снимке: что сцена вообще случилась, что
камера навелась на узел, что нарисованного столько же, сколько в паспорте,
что сцена кончилась уходом и туда, куда надо, что `escape` прерывает её и
возвращает камеру, и что на `prefers-reduced-motion` пролога нет вовсе.

**Уход всегда в этой же вкладке.** Это не вкус, а условие: после анимации
`window.open` в новую вкладку уже не пустит — жест к тому времени остыл, и
блокировщик всплывающих окон съест переход молча. Заодно это единственный
способ довезти имя до соседней страницы. Зовём именно `window.open`, а не
`location`: страница подменяет его собой и адрес резюме перехватывает своим
переездом, а остальное передаёт браузеру.

**Камера — это `viewBox` схемы**, а не `transform` поверх неё. Наезд через
`transform` ломает разом две вещи: обрезка кристалла задана в пользовательских
координатах и уезжает вместе с группой, а наклон сцены складывается с
масштабом и уводит кадр вбок. У окна нет ни того, ни другого.

Сцена принадлежит узлу и живёт в его файлах — так же, как разбор:

```js
OPENERS.push({
  test: el => el.dataset.group === 'cpu',
  play: (el, done) => { …; sceneWait(2300, done); },
});
```

Ждать внутри сцены надо через `sceneWait`, а не через `setTimeout`:
прерывание обязано снять все её таймеры разом. Камера наводится
`camera(frameOf(el, pad), ms)`, возвращается сама при прерывании и при
возврате «назад» из кеша.

**Мелочи, которых в разметке нет нарочно.** Кристаллы под крышкой и
микросхемы на планках строит скрипт в тот миг, когда их собрались показать:
сто девяносто два прямоугольника в статике — это два десятка килобайт,
которые качает каждый гость ради сцены, которую откроет один из ста. Оба
числа — сколько ядер и сколько корпусов на планке — считаются из паспорта, а
не выбираются на глаз: врать на плате нельзя ровно так же, как в консоли.

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
BOUNDS = (178, 6, 274, 832)      # its own rectangle, optional

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
и спрашивает чужое `cv.free(...)` / `cv.put(...)`. Видов семь, и у каждого своё
правило, чего он избегает:

| вид | что это | ложится поверх | не лезет на |
|---|---|---|---|
| `COPPER` | дорожки, переходные, площадки | — | вырезы |
| `MINOR` | рассыпуха | медь | корпуса, крупную рассыпуху, краску, бронь, вырезы |
| `SILK` | подписи и шелкография | медь, мелочь, бронь | корпуса, крупную рассыпуху, другую краску, вырезы |
| `PART` | крупная рассыпуха: SOIC, дроссели, кварцы | медь | корпуса, другую крупную рассыпуху, бронь, вырезы |
| `MAJOR` | узлы: разъёмы, гнёзда, сокеты, лампы | медь | другие узлы, крупную рассыпуху, вырезы |
| `RESERVE` | бронь под будущий узел | медь | вырезы |
| `BOARD` | вырезы и края текстолита | — | — |

Ключевое различие — **бронь против корпуса**. Корпус говорит «здесь стоит
деталь», бронь — «сюда придёт узел». Под планкой памяти и вокруг сокета на живой
плате шелкографии полно: краску наносят до того, как в плату что-то вставили.
Пока это был один вид, слой обозначений не рисовался вовсе — ему негде было
встать. После разделения их стало 142 вместо 15.

Второе различие — **узел против крупной рассыпухи**. Узлу место назначено в
`geom` и к нему ведёт бирка, крупной рассыпухе место найдено обходом `place()`
и назвать её нечем. Пока они были одним видом, адрес `B14` не отвечал на вопрос,
о чём речь: под одной буквой лежали и разъём, который двигать нельзя, и
дроссель, вставший туда, где нашлось место.

Отсюда и разное отношение к брони. Узел в брони — это то, ради чего бронь и
держат, поэтому `MAJOR` её не избегает. Крупная рассыпуха избегает: найти себе
место в чужой брони значит встать под планкой памяти или под кронштейном
райзера. Пока правило молчало, `place()` спрашивал только про корпуса и вырезы,
и брони банков его не держали — после запрета `problems` в `audit_text.py` упал
с 11 до 6.

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
- **границы занятости** — 7 видов. Галочка показывает прямоугольники регистра
  поверх приглушённой схемы.
- **поверх всего** — координатная сетка и наслоения.

Панель строит списки из самой разметки: группы блоков (`.blk[data-blk]`) и
границ (`.bnd`) подписаны генератором. Второй список разошёлся бы с первым в
первую же правку — как разошлись бронь и райзеры.

### Адреса

У каждого прямоугольника занятости буква вида и номер по порядку сборки:
`C` медь, `M` мелочь, `S` подписи, `B` узлы, `D` крупная рассыпуха, `R` бронь,
`E` края. `R7` — седьмая бронь, `B14` — четырнадцатый узел. Адрес подписан на
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

Сейчас таких мест 19 — это рабочий список, а не поломка: бронь законно бывает с
запасом, поэтому сборка не падает, а говорит вслух.

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

Сейчас находок 41: 22 узел на узле, 7 медь за кромкой текстолита, остальное
мелочью по три-пять.

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
   (сейчас 11 — сравнивай с числом до правки, а не с нулём), список
   `БРОНЬ ПОЧТИ ПУСТА` и `DID NOT FIT`.
5. Проверяй снимком, а не на глаз по коду. В безголовом браузере схема считается
   невидимой: ставится класс `dormant`, анимации стоят, самотест не доигрывает и
   `tags-off` висит вечно — перед съёмкой эти классы надо снимать вручную.
