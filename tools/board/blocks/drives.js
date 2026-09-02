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
    // Ступени разведены неровно: пустых дней на графе больше всего, ярких —
    // единицы. Ровное деление на пять давало сплошную зелень, в которой не
    // видно ни ритма, ни пауз, — а читается граф как раз по ним.
    return q < 46 ? 0 : q < 70 ? 1 : q < 85 ? 2 : q < 95 ? 3 : 4;
  }

  // Клетки строит скрипт в тот миг, когда их собрались показать. Триста
  // семьдесят один прямоугольник в статике — это те же десятки килобайт на
  // каждого гостя ради сцены, которую откроет один из ста, что и кремний под
  // крышкой процессора.
  function buildGraph(cage) {
    const had = cage.querySelector('.bay-graph');
    if (had) return had;

    // Занятые отсеки — из паспорта, а не по рисунку: заглушке нечего отдавать,
    // и в чередование она не входит.
    const live = HW.bay.filter(function (b) { return !b.filler; });
    const slots = [].map.call(cage.querySelectorAll('.bay-slot'),
                              function (s) { return s.getBBox(); });

    // Поле графа — зеркало корзины. Передняя глубина машины поделена ровно
    // пополам: половину занимает корзина из двух отсеков в глубину, половину —
    // вентиляционное поле за ней, через которое к дискам идёт воздух (geom:
    // FRONT_W = 2 × BAY_DEPTH). Граф встаёт во вторую половину, встык за
    // дальней кромкой корзины: рядом с дисками, а не поверх них — иначе лампы,
    // ради которых сцена и затевалась, оказались бы под ним.
    const pitch = slots[1].x - slots[0].x;
    const gx = slots[0].x + 2 * pitch;
    const gw = slots[1].x + slots[1].width - slots[0].x;

    // По длине корзины граф ровно там, где есть что читать: от первого занятого
    // отсека до последнего. Нижняя пара — заглушки, и тянуть граф по ним значило
    // бы показывать данные, которых там нет.
    const top = slots[live[0].bay];
    const bot = slots[live[live.length - 1].bay];
    const gy = top.y, gh = bot.y + bot.height - top.y;

    const g = document.createElementNS(BAY_NS, 'g');
    g.setAttribute('class', 'bay-graph');

    function rect(cls, x, y, w, h) {
      const r = document.createElementNS(BAY_NS, 'rect');
      r.setAttribute('class', cls);
      r.setAttribute('x', x.toFixed(2));
      r.setAttribute('y', y.toFixed(2));
      r.setAttribute('width', Math.max(0.6, w).toFixed(2));
      r.setAttribute('height', Math.max(0.6, h).toFixed(2));
      r.setAttribute('rx', '0.9');
      return r;
    }

    // Подложка под клетками: без неё граф ложится прямо на перфорацию, и
    // пустые дни не отличить от дырок в листе.
    g.appendChild(rect('graph-bed', gx - 3, gy - 3, gw + 6, gh + 6));

    const cw = gw / DAYS, ch = gh / WEEKS;
    for (let w = 0; w < WEEKS; w++) {
      // Чей это блок. Массив читается вперемешку, очередной блок берётся у
      // следующего накопителя — то самое чередование; заглушки в очереди нет.
      const week = document.createElementNS(BAY_NS, 'g');
      week.setAttribute('class', 'week');
      week.setAttribute('data-bay', String(live[w % live.length].bay));
      // Задержка стоит на неделе, а не на клетке: фронт идёт вдоль корзины,
      // неделя за неделей, и все семь дней поднимаются разом — блок читается
      // целиком, а не по байту.
      week.setAttribute('style', '--w:' + w);
      for (let d = 0; d < DAYS; d++) {
        const day = rect('day', gx + d * cw + 0.7, gy + w * ch + 0.7,
                         cw - 1.4, ch - 1.4);
        day.setAttribute('data-l', String(level(w, d)));
        week.appendChild(day);
      }
      g.appendChild(week);
    }
    cage.appendChild(g);
    return g;
  }

  OPENERS.push({
    test: function (el) { return el.dataset.group === 'hdd'; },
    play: function (el, done) {
      // Сцена про корзину целиком, а щёлкают по одному отсеку — и по выноске
      // приходит первый. За кадром и за графом идём к блоку, в котором лежат
      // все восемь.
      const cage = el.closest('.blk');
      const graph = buildGraph(cage);
      const live = HW.bay.filter(function (b) { return !b.filler; });
      // Парк стандартизован: во всех занятых отсеках стоит одно и то же, и
      // модель берётся у первого, а не перечисляется по отсекам.
      const drive = live[0];

      // Кадр считает frameOf, а окно сдвигаем. Корзина стоит у самой кромки
      // текстолита, и окно, построенное по её середине, наполовину уходит за
      // край платы — половина кадра была бы пустым фоном. Высоту и пропорции
      // берём готовые, а левый край прижимаем к корзине: за ней остаётся
      // машина.
      const box = frameOf(graph, 14);
      box[0] = cage.getBBox().x - 14;
      camera(box, 780);
      line('hdd: ' + HW.bay.length + ' отсеков, занято ' + live.length
           + ' · ' + drive.model, 'muted');

      sceneWait(460, function () {
        cage.classList.add('scene');
        line('hdd: чтение блоками · чередование по ' + live.length
             + ' накопителям · ' + (live.length * drive.tb).toFixed(1) + ' ТБ', 'ok');
      });

      sceneWait(2180, function () {
        // Число после существительного, а не перед: склонять его тут нечем,
        // а «371 блоков» — это ошибка, которую видно в консоли каждому.
        line('hdd: блоков поднято ' + WEEKS * DAYS + ' · год по неделям'
             + ' · открываю github', 'ok');
      });

      sceneWait(2560, done);
    },
  });
