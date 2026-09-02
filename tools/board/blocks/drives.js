  // A drive comes out in two moves, the way hands do it: first the handle
  // unlatches, then the caddy slides out. A third click puts it back — and it
  // counts wherever the part is clicked, the frame or the drive behind it,
  // because by then the whole thing is one part in your hand.
  PICKS.push({
    // A filler travels the same way: on a live machine it is not a different
    // part but the same caddy with nothing in it. Its name is its own, though —
    // the console counts drives by .bay and reads the bay number out of
    // data-unit, and an empty carrier has no business in that count.
    test: function (el) {
      const u = el.dataset.unit;
      return !!u && (u.startsWith('hdd') || u.startsWith('blank'));
    },
    name: function (el) { return el.dataset.unit; },
    pull: function (el, line) {
      const blank = el.dataset.unit.startsWith('blank');
      const n = el.dataset.unit.replace(blank ? 'blank' : 'hdd', '');
      // Звучат у каддика два движения из четырёх: откинули защёлку и
      // захлопнули её. Между ними — свободный ход по направляющим, и он
      // молчит: щелчок там был бы лишней железкой, а трение звучало ворохом
      // ткани и мешало слышать сами защёлки.
      if (!el.classList.contains('unlatched')) {
        el.classList.remove('back');
        el.classList.add('unlatched');
        sfx('chk');
        line('unlatched: ' + el.dataset.unit + ' · защёлка каддика ' + n, 'muted');
      } else if (!el.classList.contains('pulled') && !el.dataset.stowing) {
        el.classList.add('pulled');
        line(blank ? 'removed: заглушка отсека ' + n : 'removed: ' + el.dataset.unit, 'warn');
      } else if (el.classList.contains('pulled')) {
        // Ставится каддик теми же двумя движениями, только в обратном порядке:
        // сперва он заходит в корзину, а ручка остаётся откинутой — за неё и
        // держат, — и лишь отдельным движением её захлопывают. Прежде оба
        // класса снимались разом: каддик въезжал, ручка на полпути складывалась
        // сама, и второго движения не было вовсе.
        // Признак обратного хода. Без него «откинута защёлка, каддик снаружи»
        // и «каддик уже в корзине, защёлка ещё откинута» — это одно и то же
        // сочетание классов, и четвёртый щелчок вместо того, чтобы захлопнуть
        // ручку, вынимал диск заново.
        el.classList.remove('pulled');
        // Класс, а не только признак в датасете: по нему css отличает
        // «откинули защёлку и потянули» от «каддик уже вернулся в корзину».
        // Сочетание классов у этих двух состояний одно и то же, а кривые
        // должны быть разные: наружу — короткий рывок за ручкой, внутрь —
        // весь ход по направляющим.
        el.classList.add('back');
        el.dataset.stowing = '1';
        line('inserted: ' + el.dataset.unit + ' · каддик в корзине', 'ok');
      } else {
        el.classList.remove('unlatched', 'back');
        delete el.dataset.stowing;
        sfx('chk');
        line('latched: ' + el.dataset.unit + ' · защёлка закрыта', 'ok');
      }
    },
  });

  // ── Сцена: открытие профиля на github ──────────────────────────────────
  // GitHub открывается корзиной, и это не метафора ради метафоры: граф
  // вкладов — история, которая где-то лежит, а лежит она на дисках. Поэтому
  // граф здесь не картинка поверх платы, а то, что остаётся после чтения:
  // диски зажигают лампы активности, и в вентиляционном поле за корзиной
  // неделя за неделей проступают клетки.
  //
  // Ни головки, ни поиска, ни раскрутки в сцене нет и быть не может: в
  // отсеках стоят INTEL OPTANE P5800X, то есть твердотельные накопители.
  // Адресация у них блочная, и очередной блок берётся не у соседней дорожки,
  // а у следующего накопителя — отсюда чередование по массиву, а не ход
  // поперёк пластины.
  const BAY_NS = 'http://www.w3.org/2000/svg';

  // Форма графа. Оба числа календарные, а не выбранные на глаз: в неделе семь
  // дней, а год на графе вкладов укладывается в пятьдесят три недельных
  // столбца — ровно столько их и на самом github. Больше выдуманных чисел в
  // сцене нет: сколько отсеков, сколько занято и что в них стоит — приходит
  // из паспорта.
  const DAYS = 7;
  const WEEKS = 53;

  // Насколько закрашена клетка: пять степеней, как на самом графе. Раскладка
  // обязана быть одной и той же от показа к показу — граф, мигающий наугад,
  // читается помехой, а не историей. Отсюда функция от места, а не random:
  // та же уловка, что у held() в памяти.
  function level(week, day) {
    // Мешалка целочисленная, а не линейная сумма. Сумма вида week*a + day*b
    // даёт правильную долю ярких дней, но раскладывает их ровными
    // диагоналями — такой решётки на живом графе не бывает.
    let h = (week * 73856093) ^ (day * 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = ((h ^ (h >>> 16)) >>> 0) % 100;
    // Выходные тише буднего дня. Без этого выходит ровный шум: узнают граф
    // как раз по недельному ритму, а не по самим квадратам.
    const q = (day === 0 || day === DAYS - 1) ? h - 30 : h;
    // Ступени разведены неровно, как на живом графе: пустых больше всего,
    // ярких — единицы. Точные доли года (две трети пустых) пробовали и убрали:
    // на графе такой год читается нормально, потому что он лежит узкой лентой,
    // а во весь экран те же доли дают серое поле с редкой зеленью. Здесь
    // заливка, а не отчёт, и ей нужна плотность — пустых чуть больше трети.
    return q < 36 ? 0 : q < 66 ? 1 : q < 84 ? 2 : q < 94 ? 3 : 4;
  }

  // Клетки строит скрипт в тот миг, когда их собрались показать. Триста
  // семьдесят один прямоугольник в статике — это те же десятки килобайт на
  // каждого гостя ради сцены, которую откроет один из ста, что и кремний под
  // крышкой процессора.
  // Пропорции клетки сняты с настоящего графа, а не подобраны на глаз: на
  // github.com/users/<login>/contributions клетка десять точек в поперечнике
  // при зазоре в три, то есть занимает ровно десять тринадцатых шага, а
  // скругление у неё — пятая часть стороны.
  const CELL_FILL = 10 / 13;
  const CELL_ROUND = 0.2;
  // Шаг в точках экрана. Клетка крупнее гитхабовской, но ненамного: на графе
  // она лежит в колонке шириной с ладонь, а здесь занимает весь экран, и
  // десятиточечный квадрат читался бы пылью.
  const CELL_STEP = 25;

  // Заливка рисуется на холсте, а не выкладывается элементами, и это не выбор
  // из двух равных. Элементами её уже пробовали: две с половиной тысячи клеток,
  // у каждой своя анимация прозрачности и масштаба — свойства композитные, всё
  // по учебнику, а замер показал двадцать девять кадров за три секунды при
  // медиане в восемьдесят три миллисекунды. Столько отдельных анимаций браузер
  // не тянет независимо от того, какие свойства в них двигаются: цена не в
  // отрисовке, а в самом их количестве.
  //
  // На холсте это один элемент и один цикл на кадр. Заодно решается плотность:
  // под каждой клеткой закрашивается её шаг целиком, поэтому между соседями не
  // остаётся ни просветов, ни тёмных углов на стыках.
  //
  // Слой лежит поверх страницы, а не внутри схемы: у схемы есть поля, и клетки
  // внутри неё оставляли по краям пустые рамки, а окно закрывать надо целиком.
  const FLOOD_MS = 950;      // сколько идёт фронт от корзины до дальнего угла
  const FLOOD_CELL_MS = 280; // сколько поднимается одна клетка
  const FLOOD_BG = '#0d1117';
  const FLOOD_LV = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

  let floodRun = null;

  function buildFlood(cage) {
    let cv = document.querySelector('.bay-graph');
    if (cv && cv.__cells) return cv;

    cv = cv || document.createElement('canvas');
    cv.className = 'bay-graph';

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.ceil(w * dpr);
    cv.height = Math.ceil(h * dpr);

    // Откуда расходится заливка — середина корзины на экране, а полуоси фронта
    // взяты у неё же. Фронт идёт не кругом, а эллипсом её пропорций: корзина
    // узкая и высокая, значит поле уходит вверх и вниз заметно быстрее, чем
    // вбок. Круговой фронт от корзины у левой кромки читался заливкой из угла —
    // он и шёл из угла, потому что корзина там стоит.
    const cols = Math.ceil(w / CELL_STEP) + 1;
    const rows = Math.ceil(h / CELL_STEP) + 1;
    const n = cols * rows;

    // Раскладка лежит в плоских массивах: перебирать их на каждом кадре дешевле,
    // чем обходить объекты, а кадров тут шестьдесят в секунду.
    const cell = { x: new Float32Array(n), y: new Float32Array(n),
                   t: new Float32Array(n), l: new Uint8Array(n), n: n,
                   cols: cols, rows: rows, step: CELL_STEP,
                   size: CELL_STEP * CELL_FILL, dpr: dpr,
                   order: new Uint32Array(n) };
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        cell.x[i] = c * CELL_STEP;
        cell.y[i] = r * CELL_STEP;
        cell.l[i] = level(c, r);
      }
    }
    cv.__cells = cell;
    if (!cv.isConnected) document.body.appendChild(cv);
    return cv;
  }

  // Куда и как расходиться — считается в момент старта, а не при постройке
  // поля. Это не мелочь: поле строится на наведении, когда камера ещё не
  // тронулась, и корзина стоит совсем в другом месте экрана. Раскладка,
  // посчитанная тогда, разгоняла фронт из точки, где дисков уже нет, — со
  // стороны это читалось заливкой из угла, сколько ни правь кадр.
  //
  // Фронт идёт не кругом, а эллипсом по пропорциям корзины: она узкая и
  // высокая, значит поле уходит вверх и вниз заметно быстрее, чем вбок.
  function floodAim(cv, cage) {
    const c = cv.__cells;
    const slots = cage.querySelectorAll('.bay-slot');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of slots) {
      const b = s.getBoundingClientRect();
      x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top);
      x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ax = Math.max(1, (x1 - x0) / 2), ay = Math.max(1, (y1 - y0) / 2);
    const reach = (px, py) => Math.hypot((px - cx) / ax, (py - cy) / ay);

    const w = window.innerWidth, h = window.innerHeight;
    let far = 0;
    for (const px of [0, w]) for (const py of [0, h]) far = Math.max(far, reach(px, py));

    for (let i = 0; i < c.n; i++) {
      const d = reach(c.x[i] + c.size / 2, c.y[i] + c.size / 2) / far;
      // Рваный край. Ровное кольцо фронта читается циркулем, а не заполнением.
      // Разброс берётся из места клетки, а не из random: заливка обязана
      // повторяться в точности, иначе она мигает наугад.
      const q = bayNoise(i % c.cols, (i / c.cols) | 0);
      let t = d + (q % 24 - 12) / 100;
      // Разведчики: каждая двенадцатая вспыхивает заметно раньше фронта —
      // впереди сплошного поля появляются одиночки, и промежутки между ними
      // заполняются уже потом.
      if (q % 12 === 0) t -= 0.2;
      c.t[i] = Math.max(0, t);
      c.order[i] = i;
    }
    // Порядок обхода — по времени старта. С ним кадр идёт окном: доросшее
    // остаётся на холсте нетронутым, а не начавшееся не стоит ни одной
    // операции. Без порядка кадр перебирал бы поле целиком — ровно то, что
    // держало заливку на тридцати кадрах в секунду.
    Array.prototype.sort.call(c.order, function (a, b) { return c.t[a] - c.t[b]; });
  }

  // Кадр рисует только фронт. Холст не очищается: доросшая клетка остаётся на
  // нём навсегда, и переписывать её незачем — она уже такая, какой будет.
  //
  // Прозрачности в появлении нет нарочно. С ней пришлось бы держать под каждой
  // клеткой чистый фон и перерисовывать её целиком на каждом кадре, потому что
  // полупрозрачное поверх полупрозрачного копит яркость. Клетка просто растёт
  // из маленькой — плитка, а не туман; подложка же встаёт сразу во весь шаг,
  // поэтому поле плотное с первого кадра клетки, а не с последнего.
  function floodDraw(cv, from) {
    const c = cv.__cells;
    const g = cv.getContext('2d');
    const round = c.size * CELL_ROUND;
    const back = (c.step - c.size) / 2;
    // Ниже этого места всё дорисовано: указатель идёт по порядку и назад не
    // возвращается.
    let head = 0;

    const step = (now) => {
      const passed = now - from;
      g.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);

      let i = head;
      let moved = head;
      for (; i < c.n; i++) {
        const idx = c.order[i];
        const p = (passed - c.t[idx] * FLOOD_MS) / FLOOD_CELL_MS;
        // Дальше по порядку время старта только больше — значит и они ещё не
        // начинались. Обрываем обход.
        if (p <= 0) break;

        const k = p >= 1 ? 1 : p;
        if (k >= 1 && moved === i) moved = i + 1;

        g.fillStyle = FLOOD_BG;
        g.fillRect(c.x[idx] - back, c.y[idx] - back, c.step, c.step);

        const size = c.size * (0.35 + 0.65 * k);
        const off = (c.size - size) / 2;
        g.fillStyle = FLOOD_LV[c.l[idx]];
        g.beginPath();
        g.roundRect(c.x[idx] + off, c.y[idx] + off, size, size, round * (size / c.size));
        g.fill();
      }
      head = moved;

      floodRun = head < c.n ? requestAnimationFrame(step) : null;
    };
    floodRun = requestAnimationFrame(step);
  }

  function floodStop() {
    if (floodRun) { cancelAnimationFrame(floodRun); floodRun = null; }
    const cv = document.querySelector('.bay-graph');
    if (cv && cv.getContext) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }

  // Мешалка для разброса. Та же уловка, что у level: число зависит от места, а
  // не от случая, поэтому заливка повторяется в точности.
  function bayNoise(c, r) {
    let h = (c * 374761393) ^ (r * 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) % 1000;
  }

  // Куда наводится камера. Считаем по самим отсекам, а не по габариту блока:
  // после первой постройки габарит раздувается на всё, что в него положено.
  // Кадр, посчитанный по нему, отъезжал от машины вместо того, чтобы наехать.
  const FLOOD_VIEW = 640;

  function frameFor(cage) {
    const slots = cage.querySelectorAll('.bay-slot');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of slots) {
      const b = s.getBBox();
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    }
    const w = FLOOD_VIEW, h = w / (VIEW0[2] / VIEW0[3]);
    // Корзина стоит чуть левее середины кадра. Ровно посередине заливке есть
    // куда идти в обе стороны, но слева, за кромкой текстолита, открывается
    // слишком много пустоты — машина кончается, а кадр нет. Сорок два процента
    // ширины: расходиться всё ещё есть куда, а пустого поля видно меньше.
    // Прижимать корзину к краю нельзя вовсе — пробовали с обеих сторон, и
    // фронт каждый раз читался движением из угла в угол.
    return [(x0 + x1) / 2 - w * 0.42, (y0 + y1) / 2 - h / 2, w, h];
  }

  OPENERS.push({
    test: function (el) { return el.dataset.group === 'hdd'; },
    // Слой строится на наведении: полторы тысячи узлов и первый расчёт их
    // стилей стоят заметной доли секунды, и в сцене этого кадра нет.
    prep: function (el) {
      const cage = el.closest('.blk');
      if (cage) buildFlood(cage);
    },
    play: function (el, done) {
      // Сцена про корзину целиком, а щёлкают по одному отсеку — и по выноске
      // приходит первый. За кадром и за заливкой идём к блоку, в котором лежат
      // все восемь.
      const cage = el.closest('.blk');
      const live = HW.bay.filter(function (b) { return !b.filler; });
      // Парк стандартизован: во всех занятых отсеках стоит одно и то же, и
      // модель берётся у первого, а не перечисляется по отсекам.
      const drive = live[0];
      const layer = buildFlood(cage);

      camera(frameFor(cage), 720);
      line('hdd: ' + HW.bay.length + ' отсеков, занято ' + live.length
           + ' · ' + drive.model, 'muted');

      // Заливка начинается, когда камера уже приехала. Совмещать её с наездом
      // нельзя: наезд перерисовывает схему на каждом кадре, и полторы тысячи
      // клеток, поднимающихся поверх, отнимают у него ровно те кадры, на
      // которых видно движение.
      // Признак сцены — сразу: по нему уходит шапка с именем, а уйти она должна
      // заранее. Прежде она пропадала под наезжающей платой и выныривала из-под
      // неё же — движение, которого никто не заказывал.
      cage.classList.add('scene');

      sceneWait(780, function () {
        layer.classList.add('lit');
        floodAim(layer, cage);
        floodDraw(layer, performance.now());
        line('hdd: чтение блоками · чередование по ' + live.length
             + ' накопителям · ' + (live.length * drive.tb).toFixed(1) + ' ТБ', 'ok');
      });

      sceneWait(2280, function () {
        line('hdd: год поднят с дисков · открываю github', 'ok');
      });

      sceneWait(2600, done);
    },
  });
