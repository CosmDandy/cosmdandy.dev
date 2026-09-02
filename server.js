// СОБРАННЫЙ ФАЙЛ — правки затрёт следующая сборка.
// Источники: tools/board/scripts/base.js и tools/board/blocks/*.js,
// собирает tools/build.py. Поведение узла лежит рядом с его геометрией.
/* Server schematic: power, service mode, console.
 *
 * Two levels of interaction. While service mode is off, the machine works as
 * a business card: clicking a unit follows its address. The SERVICE switch on
 * the board turns it into a test bench — units come out, and the console
 * opens underneath.
 *
 * State (power, cover) survives a page reload through localStorage, so a
 * repeat visit does not start from the full animation.
 */
(function () {
  const rig = document.getElementById('rig');
  const log = document.getElementById('log');
  const chassis = document.getElementById('chassis');
  // Поле, по которому машину возят в режиме лупы: прокрутка своя, и
  // приближение считает координаты от него.
  const rigBody = document.getElementById('rig-body');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The machine's passport: what hardware is standing here. The generator
  // prints it — the same numbers that are printed on the silkscreen, so the
  // console and the board cannot drift apart. Everything else is derived from
  // the DOM (what is in place right now) and from NVRAM (how it is
  // configured). There must be no literals in the commands.
  let HW = {};
  try { HW = JSON.parse(document.getElementById('rig-spec').textContent); } catch (e) {}

  let state = { powered: true, visited: false, lid: false };
  try {
    const raw = localStorage.getItem('rig-state');
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) {}

  // The machine's configuration in the console header comes from the
  // passport. While it was written into the markup by hand, it claimed
  // thirty-two memory sticks against the twenty-four actually drawn.
  const specLine = document.querySelector('.con-spec');
  if (specLine && HW.board) {
    specLine.textContent = [
      HW.board.model, HW.board.form,
      HW.cpu.n + '× ' + HW.cpu.short,
      HW.dimm.slots + '× ' + HW.dimm.kind,
      HW.bay.filter(function (b) { return !b.filler; }).length + '× NVMe',
      HW.ports.sfp,
    ].join(' · ');
  }

  const save = () => { try { localStorage.setItem('rig-state', JSON.stringify(state)); } catch (e) {} };
  const wait = (ms, fn) => window.setTimeout(fn, reduced ? 0 : ms);

  // ── Звук ───────────────────────────────────────────────────────────────
  // Звук машины синтезируется здесь, а не лежит рядом файлами. Дело не в
  // экономии байт: щелчок защёлки, трение по направляющим и гул вентилятора —
  // это шум под огибающей и пара синусов, то есть три-четыре узла Web Audio.
  // Пачка mp3 к странице, которая вся умещается в один самодостаточный файл,
  // добавила бы запросы и вопрос о лицензии на каждый чих.
  //
  // Голоса собраны не по принципу «на слух приятно», а по тому, что в машине
  // действительно звучит. Вентилятор даёт лопаточную частоту — лопасти,
  // помноженные на обороты в секунду, — её гармоники и широкополосный шум
  // потока. Оба числа приходят из паспорта, поэтому схема гудит на своей ноте:
  // семь лопастей на 12 100 об/мин — это около 1.4 кГц. Нечётное число
  // лопастей в rotor.py выбрано затем, чтобы тон не выпирал, — поэтому
  // тональная часть здесь заметно тише шумовой.
  //
  // Звучит машина двумя разными способами, и распоряжаются ими не одинаково.
  //
  // Щелчки, удары и писк самотеста звучат всегда: это ответ на то, что человек
  // только что сделал руками, и до первого его действия их всё равно не будет
  // — браузер не даёт завести звук без жеста. Гул же идёт сам по себе, пока
  // курсор на машине, и надоесть способен только он; кнопка распоряжается им
  // одним и молчит по умолчанию.
  //
  // Прежде кнопка держала весь звук, и довод был такой: визитка, которая
  // начинает щёлкать без спроса, закрывается вкладкой. Довод верен для фона и
  // неверен для события — щелчок в ответ на собственный щелчок мышью никого не
  // застаёт врасплох, а вот узел, вынутый в тишине, читается сломанным.
  //
  // На prefers-reduced-motion сознательно не смотрим, хотя всё остальное в
  // этом файле его слушает. Тот флаг про вестибулярный аппарат, а не про уши;
  // согласие на звук уже дано явным нажатием кнопки, и глушить после него
  // значило бы ломать то, что человек только что включил.
  const sfxBtn = document.getElementById('sfx-btn');
  let audible = false;
  try { audible = localStorage.getItem('sound') === 'on'; } catch (e) {}

  // Контекст, шина и шумовой буфер заводятся при включении, а не при загрузке:
  // до первого жеста браузер всё равно держит контекст в suspended, и заранее
  // созданный был бы просто висящим узлом.
  let ac = null;
  let bus = null;
  let noise = null;

  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      bus = ac.createGain();
      bus.gain.value = 0.5;
      bus.connect(ac.destination);
      // Полсекунды белого шума по кругу: из него сделаны все удары, щелчки,
      // трение и воздушная часть гула. Второго такого буфера не нужно никому.
      const n = Math.floor(ac.sampleRate * 0.5);
      noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac.state === 'running' ? Promise.resolve() : ac.resume();
  }

  // Две разные проверки, и разница между ними — это и есть роль кнопки.
  //
  // Щелчки, удары и писк самотеста звучат всегда, как только у страницы есть
  // живой граф: они привязаны к тому, что человек только что сделал руками, и
  // спрашивать на них разрешения незачем — звук здесь ответ на действие, а не
  // фон. Кнопка выключает ровно то, что звучит само по себе: гул машины. Он
  // один способен надоесть, потому что он один не кончается.
  const live = () => ac && ac.state === 'running';
  const humLive = () => live() && audible;

  // Гул проходит через отдельную ручку, и на время удара она приседает. Так это
  // и слышно в стойке: щелчок не перекрикивает шум, а пробивает его — шум на
  // мгновение уходит и возвращается. Ручка нужна своя, отдельно от той, что
  // поднимает и опускает сам гул: та переписывается при каждом заходе курсора
  // на машину вместе со всем, что на ней было запланировано.
  //
  // Ручка живёт ровно столько же, сколько контекст: выключение звука его
  // закрывает, и узел от закрытого контекста в новый не подключить. Забыть
  // обнулить её здесь значило бы, что после выключения и включения звука гул
  // не возвращается вовсе — проверено на себе.
  let humDuck = null;
  function duckNode() {
    if (!humDuck) {
      humDuck = ac.createGain();
      humDuck.gain.value = 1;
      humDuck.connect(bus);
    }
    return humDuck;
  }

  function duck(t) {
    if (!humDuck) return;
    const p = humDuck.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(0.62, t + 0.012);
    p.linearRampToValueAtTime(1, t + 0.09);
  }

  // Кусок шума, зажатый полосовым фильтром и огибающей. Частота фильтра — это
  // «из чего сделано»: сталь звенит выше, пластик глуше. Съезд частоты (to)
  // превращает удар в шорох.
  function burst(t, freq, dur, gain, q, to) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const flt = ac.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = q;
    flt.frequency.setValueAtTime(freq, t);
    if (to) flt.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.0012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(env);
    env.connect(bus);
    // Каждый раз с другого места буфера: иначе два щелчка подряд слышны как
    // один и тот же сэмпл, и машина звучит механической игрушкой.
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur);
  }

  // Затухающая мода — то, чем железка звенит после удара. Синус с мгновенным
  // фронтом и коротким спадом: высота говорит о размере детали, спад — из чего
  // она сделана.
  function mode(t, freq, dur, gain) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    const e = ac.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(gain, t + 0.0006);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e);
    e.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.005);
  }

  // Фронт удара: миллисекунда шума, срезанного снизу. Именно срезанного, а не
  // зажатого полосой — у настоящего щелчка энергия размазана по всему верху,
  // полоса же оставляет от неё узкий призвук.
  //
  // Длительность — довод, а не константа. Миллисекунды хватает, чтобы ухо
  // засчитало событие, но не чтобы услышало, из чего оно сделано; защёлке
  // нужно вдвое больше, удару в упор — ровно столько, сколько было.
  function front(t, gain, hp, dur) {
    const d = dur || 0.0010;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const flt = ac.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = hp;
    flt.Q.value = 0.7;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.0003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(flt);
    flt.connect(env);
    env.connect(bus);
    src.start(t, Math.random() * 0.4);
    src.stop(t + d + 0.005);
  }

  // Щелчок защёлки — то самое «чик». Три события подряд в семнадцати
  // миллисекундах: текстолит скребёт по пластику контакта, собачка срывается с
  // зуба, собачка бьёт в дно паза.
  //
  // Собран он был иначе, куском шума в полосе Q=6 на 3400 Гц, — и не звучал
  // вовсе. Померено офлайновым рендером: при заявленном усилении 0.46 на выходе
  // выходило −29.5 дБ по пику и −63.3 по энергии, то есть на двадцать три
  // децибела ниже гула вентиляторов. Узкая полоса выбрасывает почти всё, что в
  // шум положили, и остаётся призвук того же тембра, что и сам гул: щелчка не
  // слышно — слышен шум на его месте.
  function chk(t, v, freq) {
    // Разброс высоты на щелчок. Две одинаковые железки не звенят одинаково, а
    // без разброса пять щелчков подряд слышны как один сэмпл, проигранный пять
    // раз, — та же беда, ради которой шум берётся с разного места буфера.
    const j = 1 + (Math.random() - 0.5) * 0.08;
    const hi = (freq || 4200) * j;
    // Задир: край платы идёт в пластик разъёма. Восемь миллисекунд сухого шума
    // с подъёмом полосы — единственная часть щелчка, у которой есть длина, и
    // ровно она отличает посадку в разъём от щелчка выключателя. Выключателю
    // тереться нечем: у него контакт мгновенный, и звук из одних фронтов
    // именно им и слышится.
    burst(t, 2100, 0.008, 0.30 * v, 1.1, 3400);
    // Дальше два удара подряд: собачка срывается с зуба, пружина её бросает, и
    // через семь миллисекунд она бьёт в дно паза. Ухо не считает их за два
    // события — слышен один звук, но звук с характером, тот самый, по которому
    // понятно, что деталь вошла, а не просто доехала.
    front(t + 0.0020, 1.0 * v, 3400, 0.0030);
    mode(t + 0.0022, hi, 0.004, 0.20 * v);
    // Звон стали шумом, а не синусом. Синус на этом месте поёт, и щелчок из
    // трёх поющих синусов читается сигналом прибора; шум под тем же Q звенит
    // так же высоко, но сухо — и это и есть та жёсткость, за которой сюда
    // лезли. Синусы оставлены слабыми: без них у звука пропадает высота, и
    // становится непонятно, какого размера деталь щёлкнула.
    burst(t + 0.0024, hi * 1.35, 0.006, 0.34 * v, 2.6);
    front(t + 0.0090, 0.62 * v, 4800, 0.0018);
    mode(t + 0.0092, hi * 1.31, 0.003, 0.12 * v);
    burst(t + 0.0094, hi * 0.86, 0.007, 0.22 * v, 3.0);
    // Отзвук — короткий и высокий. Прежний был на 780 Гц и держался двадцать
    // миллисекунд: ровно та глухая доводка, из-за которой защёлка звучала
    // «тук». У пластины толщиной в миллиметр отзвук в этой полосе и не живёт.
    mode(t + 0.0030, 1720 * j, 0.009, 0.05 * v);
    duck(t);
  }

  // Узел дошёл до разъёма. Масса, остановившаяся о упор: две низкие моды —
  // корпус и шасси под ним — и короткий фронт.
  // Собран так же, как щелчок, и по той же причине: полоса шума на 235 Гц
  // отдавала −31.6 дБ по пику при заявленных 0.30.
  function thud(t, v) {
    // Втрое короче и втрое тише прежнего. Масса, дошедшая до упора, слышна —
    // но приходит она за десять миллисекунд до защёлки, и низ на 132 Гц,
    // тянувшийся десятую долю секунды, накрывал щелчок собой: событие было, а
    // «чк» из-под него не выходило. Здесь удар только подпирает щелчок снизу.
    mode(t, 132, 0.038, 0.13 * v);
    mode(t, 198, 0.026, 0.07 * v);
    front(t, 0.12 * v, 1800);
    duck(t);
  }

  // Спикер на плате и есть генератор прямоугольника — ничего сложнее там нет.
  function tone(t, freq, dur, gain) {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.setValueAtTime(gain, t + dur - 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + dur);
  }

  const VOICE = {
    // Тумблер: пружина отпускает, следом смыкается контакт.
    click: function (t, v) {
      chk(t, 0.8 * v, 2500);
      // Возврат пружины — второй, глуше и тише: контакт уже сомкнулся.
      front(t + 0.028, 0.22 * v, 1200);
      mode(t + 0.0284, 1450, 0.012, 0.10 * v);
    },
    chk: function (t, v) { chk(t, v); },
    // Крышка: длинный ход стали по стали и удар в упор.
    lid: function (t, v) {
      burst(t, 900, 0.30, 0.10 * v, 0.5, 260);
      mode(t + 0.28, 176, 0.11, 0.26 * v);
      front(t + 0.28, 0.16 * v, 1200);
      duck(t + 0.28);
    },
    // Момент посадки при сборке: t — это когда узел ДОШЁЛ. Удар и защёлка,
    // больше ничего. Хода до этого не слышно вовсе — по направляющим деталь
    // едет молча, и это не упрощение: то, что здесь звучало трением, звучало
    // ворохом ткани и мешало единственному, ради чего звук тут есть.
    seat: function (t, v) {
      thud(t, 0.55 * v);
      chk(t + 0.010, 0.95 * v, 4000);
    },
    // Тот самый POST-beep: один короткий писк, когда машина пошла. Тихая
    // загрузка его глушит — за тем её в BIOS и включают.
    beep: function (t, v) {
      if (rig.classList.contains('nv-quiet')) return;
      tone(t, 1000, 0.13, 0.10 * v);
    },
  };

  // Единственная дверь наружу для разовых голосов. Контекст, которого ещё нет
  // или который стоит, — это не ошибка, а нормальное состояние до первого
  // жеста: молчим. Планировать в остановленный контекст нельзя, его часы
  // стоят, и всё запланированное вывалилось бы разом при возобновлении.
  function sfx(name, v) {
    if (!live()) return;
    const voice = VOICE[name];
    if (voice) voice(ac.currentTime + 0.002, v === undefined ? 1 : v);
  }

  // Разбор списка через запятую, у которого в скобках свои запятые:
  // `transform, filter` разложить легко, а `steps(1), linear(0 0%, 0.05 8%)` —
  // уже нет, и наивный split режет кривую пополам.
  function commas(text) {
    const out = [];
    let depth = 0;
    let from = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && !depth) { out.push(text.slice(from, i).trim()); from = i + 1; }
    }
    out.push(text.slice(from).trim());
    return out;
  }

  // В какой доле своего времени кривая доводит узел до места.
  //
  // Это не то же самое, что её длительность, и разница здесь не в мелочах. У
  // разъёма вентилятора кривая --press-snap выходит на единицу к тридцать
  // восьмому проценту, а идёт все шестьдесят два сотых секунды: остаток — это
  // осадка на месте, когда узел уже стоит. Звук, поставленный на конец
  // перехода, отставал от картинки на треть секунды, и слышно это было именно
  // так — «вставил, а щёлкнуло потом». У блока питания то же самое на двести
  // миллисекунд, у райзера почти ноль: его кривая доходит до единицы ровно в
  // конце — потому он один и звучал верно.
  //
  // Момент посадки — первая точка, в которой кривая добирается до цели.
  // Перелёт после неё есть у всех этих кривых, и он не ошибка, а отдача: узел
  // дошёл, стукнул и осел. Стучит он в первой точке, а не в последней.
  function arrival(ease) {
    const m = /^linear\((.*)\)$/.exec(ease || '');
    if (!m) return 1;   // cubic-bezier и прочие подходят к единице только в конце
    const stops = commas(m[1]);
    for (let i = 0; i < stops.length; i++) {
      const part = stops[i].split(/\s+/);
      const v = parseFloat(part[0]);
      const at = part.length > 1 ? parseFloat(part[1]) / 100 : (i ? 1 : 0);
      if (isFinite(v) && isFinite(at) && v >= 1) return at;
    }
    return 1;
  }

  // Кривая, по которой едет именно это свойство. Браузер отдаёт оба списка
  // выровненными по длине, но выровненными по-своему: свойств может быть
  // больше, чем кривых, и тогда кривые повторяются по кругу.
  function easeOf(el, prop) {
    const cs = getComputedStyle(el);
    const props = commas(cs.transitionProperty);
    const eases = commas(cs.transitionTimingFunction);
    if (!eases.length) return '';
    let i = props.indexOf(prop);
    if (i < 0) i = props.indexOf('all');
    if (i < 0) i = 0;
    return eases[i % eases.length];
  }

  // Когда узел дойдёт до места — спрашиваем у самого узла. Классы к этому
  // моменту уже переставлены, но переходы браузер заводит только к следующему
  // кадру, поэтому раньше измерять нечего.
  //
  // Ходом узла считаем самое длинное из того, что на нём заведено, и берём момент
  // посадки именно у него: у вентилятора вместе с модулем перекрашиваются
  // лопасти, и по одной длительности победила бы перекраска.
  //
  // Бесконечные анимации пропускаем: внутри вентилятора крутится ротор, и его
  // длительность — Infinity.
  function travel(el) {
    let dur = 0;
    let seat = 0;
    el.getAnimations({ subtree: true }).forEach(function (a) {
      const t = a.effect && a.effect.getComputedTiming();
      if (!t) return;
      const delay = (t.delay || 0) / 1000;
      const run = (t.activeDuration || 0) / 1000;
      const d = delay + run;
      if (!isFinite(d) || d <= 0 || d >= 4 || d <= dur) return;
      dur = d;
      const target = a.effect.target;
      seat = delay + run * (target ? arrival(easeOf(target, a.transitionProperty)) : 1);
    });
    return seat;
  }

  // Узел поехал. Наружу защёлка отпускает первой, и слышно её сразу; внутрь —
  // в конце хода, у самого разъёма. Между этими двумя точками не звучит
  // ничего: по направляющим деталь едет молча.
  function sfxMove(el, dir) {
    if (!live()) return;
    window.requestAnimationFrame(function () {
      if (!live()) return;
      const t = ac.currentTime + 0.004;
      if (dir === 'out') {
        chk(t, 0.95, 4400);
      } else {
        // Удар и защёлка на десять миллисекунд врозь — столько и есть между
        // «дошло» и «встало» у живого узла. Громкости разведены нарочно: за
        // событие здесь отвечает щелчок, удар под ним только держит массу.
        const seat = travel(el) || 0.9;
        thud(t + seat, 0.5);
        chk(t + seat + 0.010, 1, 4000);
      }
    });
  }

  // ── Гул машины ─────────────────────────────────────────────────────────
  // Поднимается, когда указатель заходит на машину, и стихает, когда уходит.
  // Гудит при этом ровно то, чему есть чем: голос собран из стены вентиляторов,
  // и живёт он ровно столько, сколько вертится хотя бы одна её крыльчатка. Нет
  // ни одной — выключили машину, вынули все модули, обесточили оба ввода — и
  // тишина; это и есть разница между «страницей со звуком» и машиной.
  let fan = null;
  let overRig = false;

  // Громкость гула одним числом на весь голос: баланс между рокотом, потоком и
  // тоном выставлен внутри графа, а это ручка «насколько машина далеко». Гул —
  // фон, а не событие: он звучит всё время, пока курсор на машине, и ошибка в
  // громкости здесь утомляет сильнее, чем где-либо ещё.
  const HUM_LEVEL = 0.65;
  // Четыре времени, и все четыре — разные события.
  //
  // Курсор зашёл на машину и ушёл с неё: гул проявляется и тает, машина при
  // этом никуда не девалась — изменилось только то, смотрят на неё или нет.
  //
  // Стена тронулась: раскручивается, и это уже механика — крыльчатке нужны
  // секунды, чтобы выйти на обороты.
  //
  // Стена встала: обрыв. Выбега здесь нет, и не потому, что его лень
  // изображать: встать она может тремя способами, и ни один из них не
  // докручивается. Модуль вынули — он уехал из корпуса вместе с рукой; машину
  // выключили — сорокамиллиметровая крыльчатка на двенадцати тысячах несёт
  // столько инерции, что выпадает из слышимости за доли секунды; питание
  // потеряли — крутиться стало не от чего. Полторы десятых секунды здесь не
  // затухание, а защита от щелчка: ручка, брошенная в ноль разом, щёлкает
  // сама.
  const HUM_IN = 0.55;
  const HUM_OUT = 0.32;
  const SPIN_UP = 2.0;
  const HUM_CUT = 0.15;

  // Сколько сейчас оборотов — спрашиваем у самой крыльчатки, а не у паспорта.
  // Период вращения задан на схеме и меняется от двух вещей: профиля питания в
  // BIOS (Efficiency растягивает его вчетверо) и вынутого вентилятора (тогда
  // остальные разгоняются). Обе перемены обязаны быть слышны — ради них весь
  // этот тон и заводился.
  // Номинальный период берётся из SPIN_NOM в screen.js: он читает его из
  // стилей, где период и задан. Литерал здесь дублировал бы --spin из base.css
  // и разошёлся бы с ним при первой же правке.
  function fanRpm() {
    const spec = HW.fan || {};
    const nom = spec.rpm_nom || 0;
    const blade = chassis.querySelector('.fan-blades:not(.aux)');
    if (!blade) return nom;
    const d = parseFloat(getComputedStyle(blade).animationDuration);
    if (!isFinite(d) || d <= 0) return nom;
    return nom * (SPIN_NOM / d);
  }

  function bladePass() {
    const spec = HW.fan || {};
    return (spec.blades || 0) * fanRpm() / 60;
  }

  function fanNodes() {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(duckNode());

    // Шум раскладывается надвое. Прежде это была одна полоса Q=0.5 на 640 Гц —
    // сплошная середина, от которой ухо устаёт за полминуты. Настоящая машина в
    // стойке звучит рокотом корпуса внизу и потоком выше, и верх у неё завален:
    // высокие частоты гасит всё, через что они идут, — решётка, стенка, воздух.
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 190;
    low.Q.value = 0.7;
    const lowGain = ac.createGain();
    // Рокоту нужно больше, чем кажется по числу: фильтр на 190 Гц пропускает
    // от белого шума очень узкую полосу, и то, что на глаз выглядит громким,
    // на слух почти не слышно.
    lowGain.gain.value = 0.135;
    src.connect(low);
    low.connect(lowGain);
    lowGain.connect(g);

    const air = ac.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 520;
    air.Q.value = 0.4;
    const tilt = ac.createBiquadFilter();
    tilt.type = 'lowpass';
    tilt.frequency.value = 1500;
    tilt.Q.value = 0.5;
    const airGain = ac.createGain();
    airGain.gain.value = 0.075;
    src.connect(air);
    air.connect(tilt);
    tilt.connect(airGain);
    airGain.connect(g);
    src.start();

    // Лопаточная частота и вторая гармоника — но не одной парой, а четырьмя
    // слегка расстроенными. Восемь крыльчаток никогда не крутятся синхронно, и
    // биения между ними — это и есть разница между живой стеной вентиляторов и
    // синтезатором. Выше второй гармоники не берём: третья уходит за четыре
    // килогерца и читается писком.
    const bpf = bladePass();
    const tones = [];
    if (bpf > 0 && bpf < 8000) {
      [-0.014, -0.005, 0.006, 0.015].forEach(function (detune, i) {
        [[1, 0.012], [2, 0.005]].forEach(function (h) {
          const o = ac.createOscillator();
          o.type = 'sine';
          o.frequency.value = bpf * h[0] * (1 + detune);
          const og = ac.createGain();
          og.gain.value = h[1];
          o.connect(og);
          og.connect(g);
          o.start(ac.currentTime + i * 0.01);
          tones.push({ osc: o, mul: h[0] * (1 + detune) });
        });
      });
    }

    // Писк дросселей. Слышен у машины, которой не дают спать: при запрещённых
    // C-States ядра не уходят в простой, ток через дроссели не падает, и они
    // поют. На профиле Efficiency его нет — там машина как раз спит.
    const coil = [];
    [[9500, 0.0016], [11300, 0.0009]].forEach(function (h) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = h[0];
      const og = ac.createGain();
      og.gain.value = 0;
      o.connect(og);
      og.connect(g);
      o.start();
      coil.push({ osc: o, gain: og, peak: h[1] });
    });

    return { gain: g, src: src, tones: tones, coil: coil };
  }

  // Обороты изменились — тон едет за ними, и едет плавно: вентилятор не
  // переключает скорость скачком, ему нужна пара секунд.
  // Та же осторожность, что и с громкостью: обороты, которые не менялись, не
  // повод заново вести тон к той же ноте — подъём при раскрутке от этого
  // обрывался на первом же классе, приехавшем следом.
  let humBpf = 0;

  function humTune(started) {
    if (!fan) return;
    const bpf = bladePass();
    if (!(bpf > 0 && bpf < 8000)) return;
    if (bpf === humBpf && !started) return;
    humBpf = bpf;
    const t = ac.currentTime;
    fan.tones.forEach(function (v) {
      const p = v.osc.frequency;
      const target = Math.max(1, bpf * v.mul);
      p.cancelScheduledValues(t);
      // Машина только пошла — стена начинает с четверти оборотов, и тон ползёт
      // вверх вместе с ними. Без этого раскрутка слышна одним нарастанием
      // громкости, то есть не раскруткой, а прибавленным звуком: у настоящей
      // стены сначала меняется высота, а громкость идёт за ней.
      p.setValueAtTime(started ? Math.max(1, target * 0.22) : Math.max(1, p.value), t);
      p.exponentialRampToValueAtTime(target, t + (started ? SPIN_UP : 1.6));
    });
    const whine = rig.classList.contains('nv-cst-off') && !rig.classList.contains('nv-eff');
    fan.coil.forEach(function (v) {
      const p = v.gain.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(whine ? v.peak : 0, t + 1.2);
    });
  }


  // Насколько громко машине гудеть. Считаем не по паспорту, а по самой схеме:
  // сколько крыльчаток стены сейчас крутится. Одним этим счётом закрываются
  // все поводы замолчать разом — вынули вентилятор, вынули все, обесточили
  // машину, выключили её кнопкой, накрыли экраном самотеста. Ни один из них не
  // пришлось перечислять, и придумать новый, о котором звук не узнает, теперь
  // тоже нельзя: пауза у крыльчатки и тишина в динамике — одно и то же
  // событие.
  //
  // Крыльчатка блока питания в счёт не идёт. Голос собран из лопаточной
  // частоты стены и её же потока; блок питания крутит свою вдвое медленнее, на
  // дежурке, и своего голоса у неё тут нет.
  //
  // Корень, а не доля: шум складывается мощностями, и вдвое меньше источников
  // — это на три децибела тише, а не вдвое.
  function loudness() {
    let all = 0;
    let spun = 0;
    chassis.querySelectorAll('.fan-blades:not(.aux)').forEach(function (b) {
      all++;
      if (getComputedStyle(b).animationPlayState === 'running') spun++;
    });
    return all ? Math.sqrt(spun / all) : 0;
  }

  // Куда ручка уже едет. Нужно, чтобы не переписывать расписание ради той же
  // самой цели: классы на схеме меняются пачками — один самотест переставляет
  // их с десяток подряд, — и каждый пересчёт тянул ручку к тому же уровню за
  // своё короткое время. Двухсекундная раскрутка, начавшись, укорачивалась
  // следующим же классом до полусекунды: замерено, до неё доживало семьсот
  // миллисекунд из двух тысяч.
  let humTarget = null;

  function humLevel(level, ramp) {
    if (!humLive()) return;
    if (!fan) fan = fanNodes();
    if (level === humTarget && !ramp) return;
    humTarget = level;
    const t = ac.currentTime;
    const p = fan.gain.gain;
    const was = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(was, t);
    p.linearRampToValueAtTime(level, t + (ramp || (level > was ? HUM_IN : HUM_OUT)));
  }

  // Состояние решается в одном месте: гудит, только если указатель на машине И
  // машине есть чем гудеть. Иначе выключение при наведённой мыши оставляло бы
  // гул висеть, а включение при ней же — молчать до следующего движения.
  //
  // Раскруткой считается не нажатие кнопки питания, а то, что стена тронулась.
  // Это не одно и то же: пока идёт самотест, экран накрывает машину и
  // крыльчатки стоят на паузе — по кнопке машина уже включена, а вертеться
  // начинает секундой позже, когда экран уходит. Считать от кнопки значило бы
  // раскрутить звук в тишине под экраном и выдать готовый гул ровно в тот
  // момент, когда стена только трогается.
  //
  // Разведено это тем, что счёт крыльчаток про машину, а курсор — про зрителя:
  // подойти к работающей машине не значит её запустить.
  let spinning = 0;
  // До какого времени стена ещё набирает обороты. Раскрутка — свойство машины,
  // а не зрителя, и по её расписанию идёт вход в гул, кто бы когда ни подошёл:
  // попал на середину разгона — слышно середину разгона.
  //
  // Врозь это разъезжается на самотесте, и разъезжалось: экран накрывает
  // машину, курсор формально уходит с неё, стена под экраном трогается — и
  // двухсекундная раскрутка доставалась нулевой громкости. Зрителю, которому
  // экран вернул машину через четверть секунды, оставался обычный вход за
  // полсекунды. Замерено по расписанию самой ручки: 0.65 за 2000 мс в пустоту,
  // следом 0.65 за 550 мс в уши.
  let spinUpUntil = 0;

  function humCheck() {
    const now = loudness();
    const started = now > 0 && spinning === 0;
    const stopped = now === 0 && spinning > 0;
    spinning = now;
    const at = ac ? ac.currentTime : 0;
    if (started) spinUpUntil = at + SPIN_UP;
    // Стена встала посреди разгона — разгона больше нет. Иначе остаток от него
    // растягивал бы обрыв на секунды: гул продолжал бы тянуться там, где
    // крутиться уже нечему.
    if (stopped) spinUpUntil = 0;
    const left = spinUpUntil - at;
    humLevel(overRig ? HUM_LEVEL * now : 0,
             stopped ? HUM_CUT : (left > HUM_IN ? left : 0));
    humTune(started);
  }

  // Пересчёт стоит денег: он спрашивает у браузера состояние каждой крыльчатки,
  // а это принудительный пересчёт стилей. Классы на схеме меняются пачками —
  // один заход в сервисный режим переставляет их с десяток, — поэтому за кадр
  // считаем один раз.
  let humPending = false;

  function humSoon() {
    if (humPending) return;
    humPending = true;
    window.requestAnimationFrame(function () { humPending = false; humCheck(); });
  }

  function dropFan() {
    if (!fan) return;
    try {
      fan.src.stop();
      fan.tones.forEach(function (v) { v.osc.stop(); });
      fan.coil.forEach(function (v) { v.osc.stop(); });
    } catch (e) { /* контекст уже закрыт */ }
    fan = null;
    humTarget = null;
    humBpf = 0;
  }

  chassis.addEventListener('mouseenter', function () { overRig = true; humCheck(); });
  chassis.addEventListener('mouseleave', function () { overRig = false; humCheck(); });

  // Настройки BIOS и вынутые узлы меняют обороты через классы на схеме, а не
  // зовут звук напрямую: прошивка про звук не знает и знать не должна. Поэтому
  // слушаем сами классы — так же, как их слушают стили.
  //
  // Слушает это humCheck, а не один humTune. Раньше по классам ехала только
  // высота тона, а громкость решалась при входе курсора на машину и больше не
  // пересматривалась — поэтому вынутые до последнего вентиляторы и оба
  // вынутых блока питания оставляли гул висеть: обороты честно уезжали в ноль,
  // а гудеть при этом было уже нечему и некому.
  new MutationObserver(humSoon).observe(rig, { attributes: true, attributeFilter: ['class'] });
  // Щелчок по узлу классы на самой схеме не трогает — вынутым помечается сам
  // узел. Поэтому пересчёт ещё и здесь, через кадр: к тому моменту класс
  // .pulled уже стоит и крыльчатка уже встала.
  chassis.addEventListener('click', function () { window.setTimeout(humSoon, 60); });

  // Сборка звучит по тем же анимациям, по которым идёт, — и звучит в момент
  // посадки, а не в момент старта. Прежде здесь брался --seat, то есть
  // задержка начала хода, и звук уходил вперёд ровно на длительность движения:
  // у каддика она 1.2 с, и диск успевал сесть в полной тишине.
  //
  // Сроки не переписываются сюда числами: у каждой анимации спрашиваются её
  // собственные задержка и длительность. Узлы, садящиеся в один момент,
  // сливаются в один удар погромче — иначе это слышно как треск, а не сборка.
  function sfxAssembly() {
    if (!live()) return;
    window.requestAnimationFrame(function () {
      if (!live()) return;
      const at = new Map();
      chassis.getAnimations({ subtree: true }).forEach(function (a) {
        if (String(a.animationName || '').indexOf('seat') !== 0) return;
        const t = a.effect && a.effect.getComputedTiming();
        if (!t) return;
        const land = ((t.delay || 0) + (t.activeDuration || 0)) / 1000;
        if (!isFinite(land)) return;
        const key = Math.round(land * 20) / 20;
        at.set(key, (at.get(key) || 0) + 1);
      });
      const t0 = ac.currentTime + 0.02;
      at.forEach(function (n, land) {
        VOICE.seat(t0 + land, Math.min(1, 0.5 + n * 0.1));
      });
    });
  }

  // Ушли со вкладки — замолкаем вместе с анимациями. Расписание сборки к тому
  // моменту уже роздано планировщику, и без этого оно доигрывало бы в фоне,
  // где сама машина стоит на паузе (.dormant).
  document.addEventListener('visibilitychange', function () {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(function () {});
    else ac.resume().catch(function () {});
  });

  // Иконка и подпись говорят, что сейчас, а не что будет по нажатию — так же
  // ведёт себя переключатель темы, и разнобой здесь читался бы как ошибка.
  // Названо ровно то, чем кнопка распоряжается: гул. Щелчки узлов ей не
  // подчиняются, и подпись «звук выключен» над щёлкающей машиной читалась бы
  // поломкой.
  function labelSound(on) {
    const text = on ? 'Гул машины включён, выключить' : 'Гул машины выключен, включить';
    sfxBtn.setAttribute('aria-pressed', String(on));
    sfxBtn.setAttribute('aria-label', text);
    sfxBtn.setAttribute('title', text);
  }

  function setSound(on) {
    audible = on;
    try { localStorage.setItem('sound', on ? 'on' : 'off'); } catch (e) {}
    labelSound(on);
    // Контекст больше не закрывается вместе с гулом. Закрывать его было верно,
    // пока кнопка распоряжалась всем звуком: молчащая страница не должна
    // держать звуковое устройство и значок на вкладке. Теперь она не молчит —
    // щелчки узлов остаются, — и закрытый контекст означал бы, что первый же
    // щелчок после выключения гула поднимает граф заново.
    //
    // Крыльчатку при этом убираем: она единственная звучит непрерывно, и
    // оставленный на нуле генератор — это работа впустую до конца сессии.
    if (!on) {
      humLevel(0, HUM_OUT);
      // Полсекунды — это спад громкости. Успели передумать за них — крыльчатку
      // не трогаем, иначе её снесло бы уже после того, как она заведена заново.
      window.setTimeout(function () { if (!audible) dropFan(); }, 500);
      return;
    }
    // Щелчок самой кнопки и есть подтверждение, что звук поехал: нажатие,
    // после которого ничего не слышно, ничем не отличается от сломанного.
    audio().then(function () {
      VOICE.click(ac.currentTime + 0.01, 1);
      humCheck();
    }).catch(function () {});
  }

  sfxBtn.addEventListener('click', function () { setSound(!audible); });
  labelSound(audible);

  // Граф заводим на первом же жесте, чей бы он ни был. До жеста браузер всё
  // равно держит контекст остановленным, а после — узел, вынутый в ту же
  // секунду, обязан щёлкнуть: звук события, опоздавший на одно действие, хуже
  // его отсутствия.
  //
  // pointerdown, а не click: щелчок по узлу приходит после него, и к обработчику
  // узла граф уже поднят. Контекст, созданный внутри жеста, стартует сразу
  // работающим — ждать разрешения не приходится.
  const wake = function () { audio().then(humCheck).catch(function () {}); };
  document.addEventListener('pointerdown', wake, { once: true });
  document.addEventListener('keydown', wake, { once: true });

  // ── Assembly ───────────────────────────────────────────────────────────
  // The assembly class sits in the markup, so the machine starts assembling
  // itself even if the script never runs at all. Here we only decide whether
  // to let the assembly play out or cut it short, and what to do once the
  // last unit is seated.
  //
  // How long it lasts we ask the units themselves: each has its own --seat,
  // and the schedule lives in the generator. Duplicating it here would mean a
  // second place that says «when», and one day the two would drift apart.
  function assemblyEnd() {
    let last = 0;
    chassis.querySelectorAll('[style*="--seat"]').forEach(function (el) {
      last = Math.max(last, parseFloat(el.style.getPropertyValue('--seat')) || 0);
    });
    return (last + 0.9) * 1000;
  }

  function finishAssembly() {
    rig.classList.remove('assembly');
  }

  // Конец сборки узнаём у самих анимаций, а не по часам. Таймер идёт по
  // стенным часам и ничего не знает о том, играет анимация или стоит: во
  // вкладке, ушедшей в фон, за уехавшей с экрана схемой и под открытым экраном
  // машины анимации стоят на паузе (.dormant), а таймер всё это время тикает.
  // Он снимал класс сборки раньше срока — и узлы, до которых очередь не дошла,
  // просто появлялись на своих местах, разом и без хода. Именно так это и
  // выглядело: половина машины собралась, а диски, блоки питания и райзеры
  // проступили одновременно.
  function seatAnimations() {
    return chassis.getAnimations({ subtree: true }).filter(function (a) {
      return String(a.animationName || '').indexOf('seat') === 0;
    });
  }

  function whenSeated(done) {
    // Без Web Animations остаётся прежний способ — по расписанию, которое
    // узлы носят на себе сами (--seat), плюс ход последнего.
    if (!chassis.getAnimations) { wait(assemblyEnd(), done); return; }
    const anims = seatAnimations();
    // Ни одной анимации — сборке нечего ждать: так бывает при reduced motion,
    // где ходов нет вовсе.
    if (!anims.length) { done(); return; }
    let cancelled = false;
    Promise.all(anims.map(function (a) {
      return a.finished.catch(function () { cancelled = true; });
    })).then(function () {
      // Схему увели с глаз и вернули: display:none отменяет анимации, и браузер
      // заводит их заново. Ждём новых, а не считаем сборку состоявшейся.
      if (cancelled && rig.classList.contains('assembly')) {
        window.requestAnimationFrame(function () { whenSeated(done); });
        return;
      }
      done();
    });
  }

  // Сборку начинаем не по загрузке страницы, а когда схему впервые видно.
  // Визитка открывается карточкой, и всё это время .rig стоит display:none —
  // анимаций в нём не заводится вовсе. Расписание же отсчитывалось от загрузки,
  // и гость, нажавший кнопку сервера через полминуты, получал собранную машину:
  // смотреть было уже нечего. Теперь машина ждёт его разобранной.
  // Признак «схему видно» спрашиваем у самой схемы, а не у того, кто мог её
  // показать. Вид переключает кнопка, но не только она: класс на body ставит и
  // восстановление сохранённого вида, и тест. Кто именно показал — неважно, а
  // важно, что .rig вышел из display:none, и это ловит тот же
  // IntersectionObserver, что уже следит за схемой ради экономии на невидимом.
  let pendingAssembly = null;

  function onRigShown() {
    if (!pendingAssembly || !document.body.classList.contains('view-rig')) return;
    const run = pendingAssembly;
    pendingAssembly = null;
    run();
  }

  function armAssembly(run) {
    pendingAssembly = run;
    onRigShown();               // а вдруг схему уже видно
  }

  /** Reassemble the machine: pull the units and seat them again on schedule. */
  function reassemble() {
    if (rig.classList.contains('assembly')) return;
    // Собирают машину обесточенной: на живой ни планку не воткнёшь, ни
    // процессор — и разбирать работающую машину мы тоже не даём. Поэтому
    // сборка сама снимает питание, а по её концу машина стартует с нуля,
    // с самотестом на экране, как и положено после сборки.
    if (state.powered) powerOff();
    // Заодно возвращаются и те узлы, что остались вынутыми: сборка — это
    // машина целиком, а не повтор анимации над полупустым шасси.
    chassis.querySelectorAll('.pulled, .unlatched').forEach(function (p) {
      p.classList.remove('pulled', 'opened', 'unlatched');
    });
    updateFault();
    // The class has to be removed and put back on the next frame — otherwise
    // the browser does not count the animation as new and plays nothing.
    rig.classList.remove('assembly');
    void chassis.offsetWidth;
    rig.classList.add('assembly');
    // Только здесь, а не в первой сборке при загрузке: та идёт до любого
    // жеста, и звука браузер для неё всё равно не даст.
    sfxAssembly();
    whenSeated(function () {
      finishAssembly();
      line('all units seated · power on', 'ok');
      powerOn();
    });
  }

  // ── The address under the cursor ───────────────────────────────────────
  // Where a unit leads is visible before the click: the hint follows the
  // cursor and takes the address apart — the scheme dimmer, the host in the
  // schematic's colour, the path in the ordinary tone.
  const linkHint = document.getElementById('link-hint');

  // Хвост адреса обрезаем. Ссылки с хэшем бывают в полсотни знаков, и
  // подсказка из тихой строчки у курсора превращалась в баннер во всю ширину
  // окна — при том, что читают в ней только имя хоста и начало пути.
  const HINT_TAIL = 28;

  function trimTail(tail) {
    return tail.length > HINT_TAIL ? tail.slice(0, HINT_TAIL - 1) + '…' : tail;
  }

  // Место у курсора одно, а сказать в нём можно разное: под ссылкой — адрес,
  // в лупе — чем приближают. Поэтому размещение отделено от содержания.
  function placeHint(html, x, y) {
    if (!linkHint) return;
    linkHint.innerHTML = html;
    linkHint.classList.add('on');
    // Keep the hint inside the window: near the right edge it would run off
    // the screen.
    const w = linkHint.offsetWidth, h = linkHint.offsetHeight;
    const left = Math.min(x + 18, window.innerWidth - w - 12);
    const top = Math.min(Math.max(y - h - 14, 10), window.innerHeight - h - 10);
    linkHint.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)';
  }

  function showLinkHint(href, x, y) {
    const m = /^(https?:\/\/|mailto:)([^/]*)(.*)$/.exec(href) || [];
    placeHint(m.length
      ? '<span class="lh-scheme">' + m[1] + '</span>'
        + '<span class="lh-host">' + m[2] + '</span>' + trimTail(m[3])
      : trimTail(href), x, y);
  }

  function hideLinkHint() {
    if (linkHint) linkHint.classList.remove('on');
  }

  // ── Подсказка над границей занятости ─────────────────────────────────
  // Границы показывают, где занято, но не говорят, чем именно и кем. Адрес
  // подписан на самом квадрате, однако в мелкие он не влезает, а хозяин не
  // подписан нигде — его знает только регистр. Поэтому под курсором тот же
  // ярлык, что и у ссылок: адрес, вид и блок, который место застолбил.
  //
  // Работает, только пока границы включены: в обычном состоянии слой не
  // ловит мышь вовсе и не мешает нажимать на саму машину.
  const boundsLayer = document.querySelector('.lyr-bounds');
  if (boundsLayer && linkHint) {
    boundsLayer.addEventListener('mousemove', function (e) {
      if (!rig.classList.contains('bounds')) { hideLinkHint(); return; }
      const box = e.target.closest('rect[data-id]');
      if (!box) { hideLinkHint(); return; }
      const group = box.closest('.bnd');
      placeHint('<span class="lh-scheme">' + box.dataset.id + '</span>'
        + '<span class="lh-host">' + (group ? group.dataset.title : '') + '</span>'
        + ' · ' + (box.dataset.by || '?'), e.clientX, e.clientY);
    });
    boundsLayer.addEventListener('mouseleave', hideLinkHint);
  }

  // Наслоение подписано двумя адресами сразу — вопрос к нему всегда «кто с
  // кем», а не «что это». Хозяева тоже оба: чаще всего наслоение выходит
  // между разными блоками, и без имён непонятно, кому из них уступать.
  const overlapLayer = document.querySelector('.lyr-overlap');
  if (overlapLayer && linkHint) {
    overlapLayer.addEventListener('mousemove', function (e) {
      if (!rig.classList.contains('overlap')) { hideLinkHint(); return; }
      const box = e.target.closest('rect[data-pair]');
      if (!box) { hideLinkHint(); return; }
      placeHint('<span class="lh-scheme">' + box.dataset.pair + '</span>'
        + '<span class="lh-host">наслоение</span>'
        + ' · ' + (box.dataset.by || '?'), e.clientX, e.clientY);
    });
    overlapLayer.addEventListener('mouseleave', hideLinkHint);
  }

  // ── Наслоения рисунка ──────────────────────────────────────────────────
  // Слой выше показывает нарушения регистра — то есть расхождения с тем, что
  // блоки о себе ОБЪЯВИЛИ. Но объявляют не все: сервисная зона рисует надписи
  // «PLATFORM», «BIOS BOOT FROM», «microSD» и свои разъёмы, а в регистр
  // кладёт две записи на всю зону. Глаз при этом видит, что подпись накрыта
  // корпусом, а регистр молчит, потому что его никто не спрашивал.
  //
  // Здесь наслоение ищется по факту нарисованного: берутся все подписи схемы
  // и все непрозрачные фигуры, и проверяется, не легла ли фигура поверх
  // подписи. Порядок в документе и есть порядок рисования — накрывает только
  // то, что идёт ПОСЛЕ. Подложка под текстом рисуется до него и потому не
  // считается помехой.
  //
  // Мерить приходится в браузере, а не при сборке: у половины узлов своя
  // система координат (<use transform>), и разобрать её разметкой значит
  // повторить работу, которую getBBox уже делает точно.
  const clashLayer = document.querySelector('.lyr-clash');

  function boxOf(el, root) {
    // getBBox даёт габарит в своих координатах; в корневые его переводит
    // матрица от элемента к корню.
    const m = root.getScreenCTM().inverse().multiply(el.getScreenCTM());
    const b = el.getBBox();
    const xs = [], ys = [];
    for (const [px, py] of [[b.x, b.y], [b.x + b.width, b.y],
                            [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
      xs.push(m.a * px + m.c * py + m.e);
      ys.push(m.b * px + m.d * py + m.f);
    }
    return { x: Math.min(...xs), y: Math.min(...ys),
             w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  function opaque(el) {
    // Блик — не помеха: он проезжает по детали раз в несколько секунд и
    // существует ровно для того, чтобы её заметили. Заливка у него градиентная,
    // и по цвету от глухой не отличается.
    if (el.classList.contains('svc-shine') || el.classList.contains('silk-shine')
        || el.classList.contains('shine')) return false;
    // Полупрозрачное стекло подписи не прячет: сквозь заливку в четверть силы
    // буквы читаются. Помеха — то, что кроет плотно.
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    // Фигура с маской или обтравкой сплошной не бывает: задняя панель — это
    // один прямоугольник во всю стену, а дырок в нём столько, что сквозь него
    // видно и разъёмы, и подписи райзеров. По габариту она накрывала полстены.
    if (el.getAttribute('mask') || el.getAttribute('clip-path')) return false;
    const fill = el.getAttribute('fill') || st.fill;
    if (!fill || fill === 'none') return false;
    const op = parseFloat(el.getAttribute('fill-opacity') || st.fillOpacity || '1');
    if (op < 0.5) return false;
    // rgba с малой альфой — та же полупрозрачность, только записанная в цвете.
    const rgba = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(fill);
    return !(rgba && parseFloat(rgba[1]) < 0.5);
  }

  function findClashes() {
    const svg = rig.querySelector('svg');
    if (!svg) return [];
    const все = [].slice.call(svg.querySelectorAll('text, rect, circle, ellipse'));
    // Что в счёт не идёт.
    //
    // Слои разметки — они нарисованы поверх всего нарочно.
    //
    // Накладки интерфейса — бирки-ссылки и выдвижная панель диагностики. Они
    // лежат отдельными слоями поверх машины, и это их работа: бирка обязана
    // накрывать плату, иначе её не прочесть. Наслоение — это спор двух вещей
    // за одно место на самой плате, а бирка с платой не спорит, она над ней.
    //
    // Посадочные места — их и должно быть не видно. Подпись «FAN3» на дне
    // корзины или разъём на дне отсека диска показываются ровно тогда, когда
    // узел вынут; накрытыми они выглядят только у собранной машины, а
    // спрашивать с них за это нельзя — они для того и нарисованы.
    //
    // Заготовки — defs, маски, обтравка, узоры. Они не рисуются вовсе, но в
    // разметке лежат такими же прямоугольниками, и белый прямоугольник маски
    // задней панели «накрывал» половину подписей на ней.
    const годен = (el) => !el.closest('.lyr-bounds, .lyr-overlap, .lyr-grid, '
                                      + '.lyr-clash, .lyr-tags, .lyr-probe, '
                                      + '.fan-seat, .bay-slot, .cpu-seat, .dimm-seat, '
                                      + 'defs, mask, clipPath, pattern, symbol, marker');
    const тексты = [], фигуры = [];
    все.forEach(function (el, i) {
      if (!годен(el)) return;
      // Чья это деталь. Внутри одного узла порядок нарисован сознательно:
      // подпись на кристалле лежит под крышкой процессора, наклейка диска — под
      // рамкой каддика. Это не спор за место, а устройство детали, и считать
      // такое наслоением значит хоронить настоящие находки под сотней верных.
      const узел = el.closest('.pick, .unit');
      // Ездит ли элемент. Тело накопителя вчетверо шире своей лицевой рамки и
      // целиком лежит под соседями: в собранной машине его не видно вовсе, а
      // при разборке каддик выезжает и уносит его с собой. Сравнивать такое с
      // чужими деталями бессмысленно — их взаимное положение зависит от того,
      // что сейчас вынуто.
      const едет = !!el.closest('.pick-body');
      if (el.tagName === 'text') {
        if (!el.textContent.trim()) return;
        тексты.push({ el: el, at: i, box: boxOf(el, svg), узел: узел, едет: едет });
      } else if (opaque(el)) {
        фигуры.push({ el: el, at: i, box: boxOf(el, svg), узел: узел, едет: едет });
      }
    });
    const найдено = [];
    тексты.forEach(function (t) {
      const площадь = Math.max(1, t.box.w * t.box.h);
      фигуры.forEach(function (f) {
        if (f.at < t.at) return;                  // нарисовано раньше — лежит снизу
        if (f.узел && f.узел === t.узел) return;  // одна деталь — так и задумано
        if ((t.едет || f.едет) && f.узел !== t.узел) return;   // разъедутся при разборке
        const w = Math.min(t.box.x + t.box.w, f.box.x + f.box.w) - Math.max(t.box.x, f.box.x);
        const h = Math.min(t.box.y + t.box.h, f.box.y + f.box.h) - Math.max(t.box.y, f.box.y);
        if (w <= 0 || h <= 0 || w * h < площадь * 0.2) return;
        найдено.push({ x: Math.max(t.box.x, f.box.x), y: Math.max(t.box.y, f.box.y),
                       w: w, h: h, text: t.el.textContent.trim(),
                       frac: w * h / площадь,
                       what: f.el.tagName + '.' + (f.el.getAttribute('class') || '-')
                             + ' из ' + ((f.el.closest('[data-blk]') || {}).dataset || {}).blk
                             + ' / текст из ' + ((t.el.closest('[data-blk]') || {}).dataset || {}).blk });
      });
    });
    return найдено;
  }

  function drawClashes() {
    if (!clashLayer) return;
    // Считается один раз: обход схемы стоит заметно, а рисунок между
    // включениями галочки не меняется.
    if (clashLayer.dataset.done) return +clashLayer.dataset.count;
    const found = findClashes();
    clashLayer.innerHTML = found.map(function (c) {
      return '<rect data-clash="' + c.text.replace(/[<>&"]/g, '') + '" data-what="'
        + c.what.replace(/[<>&"]/g, '') + '" data-frac="' + c.frac.toFixed(2)
        + '" x="' + c.x.toFixed(0) + '" y="' + c.y.toFixed(0)
        + '" width="' + Math.max(2, c.w).toFixed(0) + '" height="' + Math.max(2, c.h).toFixed(0) + '"/>';
    }).join('');
    clashLayer.dataset.done = '1';
    clashLayer.dataset.count = found.length;
    return found.length;
  }

  // Панель слоёв живёт на странице, а не в схеме, и считать наслоения сама не
  // может: обход требует и корня схемы, и правил видимости.
  window.rigClashes = drawClashes;

  if (clashLayer && linkHint) {
    clashLayer.addEventListener('mousemove', function (e) {
      if (!rig.classList.contains('clash')) { hideLinkHint(); return; }
      const box = e.target.closest('rect[data-clash]');
      if (!box) { hideLinkHint(); return; }
      placeHint('<span class="lh-scheme">' + box.dataset.clash + '</span>'
        + '<span class="lh-host">накрыто</span>'
        + ' · ' + (box.dataset.what || '?'), e.clientX, e.clientY);
    });
    clashLayer.addEventListener('mouseleave', hideLinkHint);
  }

  // ── Живы ли сейчас ссылки схемы ────────────────────────────────────────
  // Одно место на все вопросы «можно ли по этому нажать»: и подсказка у
  // курсора, и подсветка плашек, и сам переход обязаны отвечать одинаково.
  // Раньше каждый решал сам, и ответы расходились — плашка подсвечивалась и
  // обещала адрес там, где нажатие уже ничего не делало.
  //
  // Ссылки живы у собранной машины со снятой крышкой, когда подписи на месте:
  // под крышкой читать нечего, в сервисном режиме узлы разбирают, а пока идёт
  // сборка (assembly), возврат (stowing) или самотест (tags-off) — плашек
  // ещё нет на экране, и обещать по ним переход не из чего.
  function linksLive() {
    const c = rig.classList;
    return c.contains('lid-off')
      && !c.contains('service')
      && !c.contains('assembly')
      && !c.contains('stowing')
      && !c.contains('tags-off');
  }

  if (linkHint) {
    // Карточка — такой же набор ссылок, и адрес там нужен ровно затем же.
    // Раньше подсказка жила только на схеме, и на узком экране, где схемы нет,
    // её не было вовсе.
    document.addEventListener('mousemove', function (e) {
      if (e.target.closest('.rig')) return;
      const a = e.target.closest('a[href]');
      const href = a && a.getAttribute('href');
      if (href && !href.startsWith('#')) showLinkHint(href, e.clientX, e.clientY);
      else hideLinkHint();
    });
    rig.addEventListener('mousemove', function (e) {
      // Над границами занятости говорит их собственный обработчик — он стоит
      // ниже по дереву и уже показал адрес квадрата. Событие всплывает сюда,
      // и без этой проверки схема тут же гасила подсказку, решив, что под
      // курсором не ссылка.
      if (rig.classList.contains('bounds') && e.target.closest('.lyr-bounds')) return;
      // В лупе у курсора стоит не адрес, а способ приблизить. Про shift
      // догадаться нельзя, а сказать о нём больше негде: консоли в этом режиме
      // нет, и подпись на экране была бы баннером. Зато место у курсора гость
      // к этому времени уже знает — там он читал адреса ссылок.
      if (rig.classList.contains('zoom')) {
        // Наведение на узел — работа с узлом, приближение тут ни при чём.
        if (e.target.closest('.pick, .unit, a')) hideLinkHint();
        else placeHint(zoomHint(), e.clientX, e.clientY);
        return;
      }
      // Подсказка обещает переход, поэтому показывать её можно ровно тогда,
      // когда переход состоится. Раньше условие было только про сервисный
      // режим, и адрес всплывал у курсора там, где нажатие уже ничего не
      // делало: под закрытой крышкой и пока плашки ещё не проступили.
      const target = linksLive() ? e.target.closest('a.callout, .unit[data-href]') : null;
      const href = target && (target.getAttribute('href') || target.dataset.href);
      if (href) showLinkHint(href, e.clientX, e.clientY); else hideLinkHint();
    });
    rig.addEventListener('mouseleave', hideLinkHint);
  }

  // ── Почта ──────────────────────────────────────────────────────────────
  // Клик по адресу делает две вещи сразу: открывает почтовую программу и
  // кладёт адрес в буфер. Порядок именно такой — mailto может и не открыться,
  // если почтовой программы нет, и тогда скопированный адрес остаётся
  // единственным, что от нажатия осталось.
  //
  // Подпись бирки на секунду становится словом «скопировано» и зеленеет: без
  // этого копирование происходит молча, и гость нажимает второй раз.
  function flashCopied(el) {
    const sub = el.querySelector('.co-sub');
    if (!sub) return;
    if (sub.dataset.was === undefined) sub.dataset.was = sub.textContent;
    sub.textContent = 'скопировано';
    el.classList.add('copied');
    wait(1600, function () {
      sub.textContent = sub.dataset.was;
      el.classList.remove('copied');
    });
  }

  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="mailto:"]');
    if (!a) return;
    const addr = a.getAttribute('href').slice(7);
    if (navigator.clipboard) navigator.clipboard.writeText(addr).catch(function () {});
    flashCopied(a);
    line('mail: ' + addr + ' скопирован', 'ok');
  });

  // ── Console ────────────────────────────────────────────────────────────
  function line(text, cls) {
    const d = document.createElement('div');
    d.className = cls || '';
    d.textContent = text;
    log.appendChild(d);
    while (log.children.length > 400) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }


  // ── Revision strip ─────────────────────────────────────────────────────
  // The board is assembled by code, and every edit to it is a commit. So the
  // board can be walked backwards: the versions live in separate files and
  // are loaded on demand. Keeping all fourteen in the page would mean three
  // megabytes for a feature used once.
  //
  // And it is used during development: the strip is how you compare what the
  // board looked like earlier. A visitor to the business card has no need for
  // it, so the revisions are not copied into the build, and the page does not
  // even reach for them — the request would return 404 and leave a red line
  // in the console for no reason at all.
  const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]'].indexOf(location.hostname) >= 0;
  // На живом сайте лента ревизий не поднимается сама: шестьдесят восемь схем
  // по мегабайту — это не то, что гость должен качать, зайдя посмотреть
  // визитку. Её включают командой в консоли, и включённой она остаётся до
  // перезагрузки страницы. Локально включать нечего: там она была и есть.
  let revsAsked = false;
  const timeline = document.getElementById('timeline');
  const board = document.getElementById('board');
  const tlRange = document.getElementById('tl-range');
  const tlPrev = document.getElementById('tl-prev');
  const tlNext = document.getElementById('tl-next');
  const tlRev = document.getElementById('tl-rev');
  const tlSubject = document.getElementById('tl-subject');
  const tlMeta = document.getElementById('tl-meta');
  const REPO = 'https://github.com/CosmDandy/cosmdandy.dev';

  let revs = [];
  let revPos = -1;
  let revLoading = false;
  const revCache = new Map();      // sha → markup, so nothing is fetched twice

  function paintTimeline() {
    const last = revs.length - 1;
    tlRange.style.setProperty('--tl-pos', last > 0 ? revPos / last : 0);
    tlPrev.disabled = revPos <= 0;
    tlNext.disabled = revPos >= last;
    const v = revs[revPos];
    if (!v) return;
    // Место в ленте, а не ревизия. Слово REV здесь было чужим: лента считает
    // собранные схемы (их 78), а плата набита номером страницы (их 97), и две
    // разные шкалы под одним словом читались как «интерфейс отстал». Ревизию
    // называет сама плата — она набита на текстолите и звучит в самотесте.
    tlRev.textContent = (revPos + 1) + '/' + revs.length + ' · ' + v.sha.toUpperCase();
    tlSubject.textContent = v.subject;
    tlMeta.href = REPO + '/commit/' + v.sha;
  }

  async function showRev(i) {
    if (revLoading || i < 0 || i >= revs.length || i === revPos) return;
    const v = revs[i];
    revLoading = true;
    chassis.classList.add('loading');
    try {
      let markup = revCache.get(v.sha);
      if (markup === undefined) {
        const res = await fetch('history/' + v.file);
        if (!res.ok) throw new Error(res.status);
        markup = await res.text();
        revCache.set(v.sha, markup);
      }
      board.innerHTML = markup;
      board.setAttribute('viewBox', v.viewBox);
      // Архивная схема — снимок, а не машина. Сегодняшние стили писались под
      // сегодняшнюю разметку, и к чужой они местами не подходят: до шестидесятой
      // ревизии лопасти висели на <path> без своей точки вращения, а
      // transform-box у SVG по умолчанию view-box — анимация крутила их вокруг
      // нуля холста, и лопасти улетали в левый верхний угол. Снимку движение не
      // нужно вовсе, а нажимать на нём нечего: это уже не та машина.
      rig.classList.toggle('archive', i !== revs.length - 1);
      revPos = i;
      tlRange.value = String(i);
      paintTimeline();
      line('checkout ' + v.sha + ' · ' + v.subject, i === revs.length - 1 ? 'ok' : 'muted');
    } catch (err) {
      line('ревизия ' + v.sha + ' не загрузилась', 'err');
    } finally {
      chassis.classList.remove('loading');
      revLoading = false;
    }
  }

  async function initTimeline() {
    if (revs.length || !(LOCAL || revsAsked)) return;
    try {
      const res = await fetch('history/index.json');
      if (!res.ok) throw new Error(res.status);
      revs = await res.json();
    } catch (err) {
      // Молча — только когда никто не просил: на сайте без истории лента и не
      // должна о себе напоминать. А если её позвали командой, молчание было бы
      // враньём: человек ждёт ленту и не понимает, куда она делась.
      if (revsAsked) line('историю схемы не отдали — на этом сайте её нет', 'err');
      return;
    }
    if (revs.length < 2) return;
    // The current board is already in the page: we put it into the cache as
    // the latest version, otherwise coming back «to today» would re-fetch
    // what is on the screen anyway.
    revCache.set(revs[revs.length - 1].sha, board.innerHTML);
    revPos = revs.length - 1;
    tlRange.max = String(revs.length - 1);
    tlRange.value = String(revPos);
    setStrip(true);
    paintTimeline();
  }

  // Лента ездит переходом, а не появляется скачком. Всё для этого в стилях уже
  // написано: сама .timeline схлопнута в ноль, а .rig.service её разворачивает.
  // Сводил это на нет атрибут hidden — он ставит display: none, а display не
  // анимируется: первый кадр после его снятия берёт конечные значения как есть,
  // и лента возникала разом. Поэтому hidden оставлен только за «истории нет
  // вовсе», а показ и уборка идут классом, который в переход попадает.
  function setStrip(on) {
    if (!on) { rig.classList.add('revs-off'); return; }
    if (timeline.hidden) {
      // Между снятием display: none и снятием класса нужен замер раскладки:
      // иначе браузер сольёт оба изменения в один кадр, и перехода снова не
      // будет — это тот же случай, только на первом показе.
      rig.classList.add('revs-off');
      timeline.hidden = false;
      void timeline.offsetHeight;
    }
    rig.classList.remove('revs-off');
  }

  function stripUp() {
    return !timeline.hidden && !rig.classList.contains('revs-off');
  }

  tlRange.addEventListener('input', function () { showRev(Number(tlRange.value)); });
  tlPrev.addEventListener('click', function () { showRev(revPos - 1); });
  tlNext.addEventListener('click', function () { showRev(revPos + 1); });
  // Arrows are handier than the mouse, but only while the strip is on screen
  document.addEventListener('keydown', function (e) {
    if (!stripUp() || !rig.classList.contains('service')) return;
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showRev(revPos - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showRev(revPos + 1); }
  });

  // The self-test is printed by the screen: the lines go both to it and to
  // the console — as on a machine with a monitor attached and SOL open. The
  // lines themselves are built from the passport, the state of the schematic
  // and the firmware settings, so a pulled memory stick shows up here too.
  // All of that lives in parts/screen.js.
  function runPost() {
    screenPost();
  }

  // ── Power ──────────────────────────────────────────────────────────────
  // Three button states, as on a real machine: init — the BMC is coming up
  // and pressing it does nothing; standby — ready to be switched on; on —
  // running.
  function setPower(mode) {
    rig.classList.remove('init', 'standby', 'on');
    rig.classList.add(mode);
  }

  function powerOn() {
    // Обесточенную машину не включает ни кнопка, ни команда, ни конец
    // сборки: включать нечем, пока не вставлен хотя бы один блок питания.
    if (rig.classList.contains('blackout')) {
      line('power inhibited · no ac', 'warn');
      return;
    }
    // Пароль включения спрашивает прошивка, а не система, — то есть до старта,
    // а не после него. Пока его не ввели, машина не трогается с места: экран
    // поднимается пустым и ждёт, как живая.
    if (!powerOnAllowed(powerOn)) return;
    state.powered = true;
    // Uptime is how long the host has been running, not the tab: without this
    // mark uptime counted from the page load and survived a power off without
    // noticing it.
    state.bootAt = Date.now();
    save();
    setPower('on');
    // Вентиляторы пошли. Загудит машина, только если на неё сейчас смотрят, —
    // решает это humCheck, здесь мы лишь сообщаем, что питание изменилось.
    humCheck();
    // The order is exactly what you see in the flesh: first the network card
    // brings its link up, then the BMC starts beating, and only after that
    // does the host start.
    wait(90, function () { rig.classList.add('net'); line('nic · link up 25G', 'ok'); });
    wait(220, function () { rig.classList.add('bmc'); line('BMC 2.14 · heartbeat', 'ok'); });
    // Экран поднимется через секунду, и подписи ждут его с этой самой минуты:
    // иначе они успевали проступить в промежутке между концом сборки и
    // самотестом — и тут же прятались под приехавшим экраном.
    if (!reduced) rig.classList.add('tags-off');
    // Контрольный индикатор начинает считать вместе с хостом, а не вместе с
    // экраном: на живой машине коды бегут ещё до того, как появится картинка.
    runCheckpoint();
    // Экран поднимается почти сразу: между нажатием и картинкой у живой
    // машины успевают только раскрутиться вентиляторы. Секунда с лишним
    // читалась не выдержкой, а зависанием — гость успевал нажать ещё раз.
    // Писк спикера идёт вместе с картинкой самотеста, а не с нажатием кнопки:
    // на живой машине он и означает, что POST прошёл.
    wait(320, function () { sfx('beep'); runPost(); });
    tick();
  }

  function powerOff() {
    state.powered = false; save();
    // Выключенной машине экран уже не поднимется — ждать подписям нечего.
    rig.classList.remove('net', 'bmc', 'tags-off');
    stopCheckpoint();
    setPower('standby');
    // Вентиляторы встали — гул уходит, даже если указатель остался на машине.
    humCheck();
    line('powering off', 'warn');
    line('standby · bmc only', 'muted');
    tick();
  }

  document.getElementById('power').addEventListener('click', function () {
    sfx('click');
    if (rig.classList.contains('init')) {
      line('power inhibited · bmc init', 'warn');
      return;
    }
    if (state.powered) { powerOff(); } else { line('power on', 'muted'); powerOn(); }
  });
  document.getElementById('power').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
  });

  // ── Identify in the rack ───────────────────────────────────────────────
  const idBtn = document.getElementById('id-btn');
  function toggleIdentify() {
    const on = rig.classList.toggle('identify');
    sfx('click');
    line(on ? 'identify: on · blue' : 'identify: off', 'muted');
  }
  idBtn.addEventListener('click', toggleIdentify);
  idBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleIdentify(); }
  });

  // ── Light Path Diagnostics ─────────────────────────────────────────────
  const lpTab = document.getElementById('lp-tab');
  function toggleLp() {
    const on = rig.classList.toggle('lp-open');
    line(on ? 'light path: extended' : 'light path: retracted', 'muted');
  }
  lpTab.addEventListener('click', toggleLp);
  lpTab.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLp(); }
  });

  // ── Контрольный индикатор ──────────────────────────────────────────────
  // Две цифры, и на них видно, где машина находится: пока идёт самотест, коды
  // сменяются, а на последнем индикатор замирает. Это и отличает контрольный
  // индикатор от лампы: лампа говорит «сломано», он — «дошли досюда».
  //
  // Сегменты зажигает таблица, а не отдельная фигура на каждый символ: на
  // живом индикаторе горят те же семь полосок, и из них складывается всё, что
  // он умеет показать.
  const SEG_OF = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
    '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
    'A': 'abcefg', 'b': 'cdefg', 'C': 'adef', 'd': 'bcdeg', 'E': 'adefg',
    'F': 'aefg', 'H': 'bcefg', 'L': 'def', 'P': 'abefg', 'U': 'bcdef',
    '-': 'g', ' ': '',
  };

  function showCode(code) {
    const text = String(code).padStart(2, ' ').slice(-2);
    for (let d = 0; d < 2; d++) {
      const lit = SEG_OF[text[d]] || '';
      for (const seg of 'abcdefg') {
        const el = chassis.querySelector('.seg-' + d + seg);
        if (el) el.classList.toggle('on', lit.indexOf(seg) >= 0);
      }
    }
  }

  // Коды взяты по смыслу, а не с потолка: это те же вехи, что печатает
  // самотест на экране. Последний — тот, на котором машина отдаёт управление
  // загрузчику, и именно на нём индикатор стоит у работающей машины.
  //
  // Здесь остались только самые ранние — те, что успевают пробежать до
  // картинки. Дальше индикатор ведёт сама прошивка: коды приходят из screenPost
  // вместе со строками самотеста, и на плате горит ровно то, что в эту секунду
  // стоит в углу экрана. Пока лента была заготовленной, эти двое расходились —
  // а знающий человек первым делом сверяет именно их.
  const POST_CODES = ['01', '0d', '19'];
  let postTimer = null;

  function runCheckpoint() {
    if (postTimer) clearInterval(postTimer);
    let i = 0;
    showCode(POST_CODES[0]);
    postTimer = setInterval(function () {
      i += 1;
      if (i >= POST_CODES.length) { clearInterval(postTimer); postTimer = null; return; }
      showCode(POST_CODES[i]);
    }, 110);
  }

  // Регистр здесь не косметика. На семисегментном индикаторе B неотличима от 8,
  // а D от 0, и живые платы пишут их строчными — 'b' и 'd'. Верхний регистр
  // остаётся тем буквам, которые индикатор различает.
  function hexCode(code) {
    return code.toString(16).padStart(2, '0')
      .replace(/[acef]/g, function (ch) { return ch.toUpperCase(); });
  }

  /** Контрольная точка от прошивки — то же число, что показывает экран. */
  function setBoardPostCode(code) {
    // Пришли настоящие коды — заготовленная лента больше не нужна.
    if (postTimer) { clearInterval(postTimer); postTimer = null; }
    showCode(code === null || code === undefined ? '  ' : hexCode(code));
  }

  function stopCheckpoint() {
    if (postTimer) { clearInterval(postTimer); postTimer = null; }
    // Выключенная машина не показывает ничего: контрольный индикатор питается
    // от того же, от чего и хост.
    showCode('  ');
  }

  // ── Сброс ──────────────────────────────────────────────────────────────
  // Ошибка защёлкивается: узел вернули на место, а лампа неисправности горит
  // дальше — так и на живой машине, иначе о ночном отказе наутро никто бы не
  // узнал. Гасит её эта кнопка, и гасит только на собранной машине: пока
  // что-то вынуто, сбрасывать нечего.
  const lpReset = document.getElementById('lp-reset');
  function resetFaults() {
    if (chassis.querySelector('.pulled')) {
      line('reset refused · unit still removed', 'warn');
      return;
    }
    if (!rig.classList.contains('fault-latched')) {
      line('reset · nothing to clear', 'muted');
      return;
    }
    rig.classList.remove('fault-latched');
    line('reset · fault indication cleared', 'ok');
    tick();
  }
  lpReset.addEventListener('click', resetFaults);
  lpReset.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resetFaults(); }
  });

  // Контрольный индикатор показывает код готовности всегда, когда машина
  // работает. Заводит его powerOn(), а на повторном заходе питание
  // восстанавливается из сохранённого состояния, минуя её: обновил страницу —
  // и семисегментник тёмный, хотя машина работает. Значение появлялось только
  // после выключения и включения вручную. На живой машине этот индикатор
  // показывает последний код всегда, пока есть питание.
  if (state.powered) showCode(POST_CODES[POST_CODES.length - 1]);

  // Which lamp on the panel answers for which unit.
  const LP_MAP = {
    mem: '.dimm.pulled',
    cpu: '.cpu-slot.pulled',
    fan: '.fan.pulled',
    nic: '.unit[data-unit="ocp"].pulled, .unit[data-unit="eth"].pulled',
    rsr: '.riser.pulled',
    ps: '.psu.pulled',
    dasd: '.bay.pulled',
  };

  // Конфигурация, при которой машине нечем работать. Это не отказ узла, а
  // именно невозможная сборка, и на живой панели у неё своя лампа: ни одной
  // плашки памяти или ни одного процессора — стартовать не с чего.
  function badConfig() {
    const gone = sel => chassis.querySelectorAll(sel + '.pulled').length
      && chassis.querySelectorAll(sel + '.pulled').length === chassis.querySelectorAll(sel).length;
    return !!(gone('.dimm') || gone('.cpu-slot'));
  }

  function updateFault() {
    let any = false;
    // Единственная лампа, которую зажигает не вынутый узел, а строка в
    // прошивке: без окна выше четырёх гигабайт карте в райзере некуда лечь
    // своим окном памяти, и слот остаётся ненастроенным. Живая машина ставит
    // на него ровно эту лампу.
    const no4g = rig.classList.contains('nv-no4g')
                 && HW.riser.some(r => !r.empty);
    for (const key in LP_MAP) {
      const on = !!chassis.querySelector(LP_MAP[key]) || (key === 'rsr' && no4g);
      rig.classList.toggle('fault-' + key, on);
      any = any || on;
    }
    const cnfg = badConfig();
    rig.classList.toggle('fault-cnfg', cnfg);
    any = any || cnfg;
    const wasAny = rig.classList.contains('has-fault');
    rig.classList.toggle('has-fault', any);
    // Ошибка защёлкивается. Узел вернули на место — лампа неисправности горит
    // дальше, пока её не сбросят кнопкой на панели диагностики: иначе о
    // ночном отказе наутро не узнал бы никто. Так и на живой машине.
    //
    // И об этом надо сказать вслух ровно один раз — в тот момент, когда
    // причина ушла, а лампа осталась. Молча горящая лампа на собранной машине
    // читается не защёлкой, а поломкой схемы.
    if (any) rig.classList.add('fault-latched');
    else if (wasAny && rig.classList.contains('fault-latched')) {
      line('fault latched · sel — прочитать журнал и снять', 'muted');
    }
    updateMains();
    tick();
  }

  // Журнал ошибок. Защёлка снимается чтением, а не только кнопкой: живая
  // машина узнаёт, что всё исправлено, когда её об этом спрашивают. Пока
  // журнал не прочитан, лампа горит — именно затем она и защёлкивается.
  // Кнопка RESET на панели остаётся: ей гасят индикацию, не читая, и это
  // разные действия. Гость, который не знает про кнопку на плате, теперь
  // выходит из горящей лампы обычной командой.
  function faultLog() {
    const rows = [];
    for (const key in LP_MAP) {
      if (chassis.querySelector(LP_MAP[key])) rows.push({ t: 'ACTIVE   · ' + key, c: 'err' });
    }
    if (badConfig()) rows.push({ t: 'ACTIVE   · cnfg', c: 'err' });
    const latched = rig.classList.contains('fault-latched');
    if (!rows.length && !latched) return [];
    if (rows.length) {
      rows.unshift({ t: 'неисправности на месте — защёлка не снята', c: 'warn' });
      return rows;
    }
    rig.classList.remove('fault-latched');
    tick();
    return [{ t: 'чинить нечего · индикация снята чтением журнала', c: 'ok' }];
  }

  // ── Входное питание ────────────────────────────────────────────────────
  // Два блока — два независимых ввода, и машина жива, пока на месте хотя бы
  // один. Вынули второй — не осталось ничего: ни хоста, ни дежурки, на
  // которой держатся BMC и порт управления. Это не поломка узла, а потеря
  // питания, поэтому и записывается отдельно — и в журнал событий тоже:
  // на живой машине наутро ищут именно эту строку.
  let mainsDown = false;
  // Что машина делала до пропажи питания — единственное, чего не восстановить
  // задним числом: к моменту возврата state.powered уже сброшен. Запоминаем
  // на входе в темноту, спрашивает это Restore on AC Power Loss.
  let poweredBeforeLoss = false;

  function updateMains() {
    const total = chassis.querySelectorAll('.psu').length;
    const down = total > 0 && chassis.querySelectorAll('.psu.pulled').length >= total;
    if (down === mainsDown) return;
    mainsDown = down;
    rig.classList.toggle('blackout', down);
    // Консоль — это SOL к BMC, а BMC питается от той же дежурки. Обесточили
    // машину — набирать команды стало некуда и некому.
    const promptField = document.getElementById('prompt');
    if (promptField) promptField.disabled = down;
    if (down) {
      if (screenOpen()) closeCrt();
      rig.classList.remove('net', 'bmc', 'identify');
      poweredBeforeLoss = state.powered;
      state.powered = false; save();
      setPower('standby');
      line('all psu removed · ac lost, system down hard', 'err');
      selAdd('Power Unit · power lost — оба ввода обесточены разом', 'err');
    } else {
      line('ac restored · standby', 'warn');
      selAdd('Power Unit · ac restored — дежурное питание есть', 'ok');
      // Дальше решает не схема, а прошивка: Restore on AC Power Loss. Это та
      // самая настройка, которую можно потрогать руками — вынуть оба блока и
      // вставить обратно, — и по машине сразу видно, что в ней стоит.
      acRestorePolicy(poweredBeforeLoss);
    }
  }

  // ── Saving on the invisible ────────────────────────────────────────────
  // An SVG animation repaints the scene whether or not anyone is looking at
  // it: the browser dutifully spins the fan blades in a minimised tab and
  // when the schematic has been scrolled off the screen. We put it on pause —
  // come back, and a blade carries on from the same position instead of
  // jumping.
  const chassisBox = document.querySelector('.chassis');
  let onScreen = true;

  function dormancy() {
    // While a full-screen layer stands over the machine there is no point in
    // computing the schematic either: it is not visible, and repainting a
    // semi-transparent layer over an animating SVG is the most expensive
    // thing that can be done here.
    rig.classList.toggle('dormant', document.hidden || !onScreen || screenOpen());
  }

  if (chassisBox && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      dormancy();
      // Схема появилась на экране — если сборка ждала зрителя, вот он.
      if (onScreen) onRigShown();
    }, { threshold: 0 }).observe(chassisBox);
  }
  document.addEventListener('visibilitychange', dormancy);

  // ── Uptime ─────────────────────────────────────────────────────────────
  let t0 = Date.now();
  const uptimeEl = document.getElementById('uptime');

  function tick() {
    if (!rig.classList.contains('on')) { uptimeEl.textContent = '--:--'; return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    uptimeEl.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ── Service mode ───────────────────────────────────────────────────────

  // Органы управления нарисованы на самой плате, а лента ревизий переписывает
  // её разметку целиком (showRev: board.innerHTML = markup). Обработчик,
  // повешенный прямо на кнопку, уезжает вместе со старым узлом — и после
  // первого же движения ползунка «Сервис» и «надеть крышку» переставали
  // нажиматься совсем. Слушаем на самой плате: она подмену переживает,
  // потому что меняются только её дети.
  // Слушаем на .rig, а не на #board. Кнопка «снять крышку» нарисована на самой
  // крышке, а крышка — отдельный svg рядом с платой, не внутри неё: клик по
  // кнопке до платы не всплывал, и снять крышку мышью было нельзя вовсе.
  // Вернуть — можно: кнопка возврата лежит на плате. Общий предок у обеих
  // один — .rig, на нём и слушаем.
  function onBoard(id, run) {
    rig.addEventListener('click', function (e) {
      if (e.target.closest('#' + id)) run();
    });
    rig.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!e.target.closest('#' + id)) return;
      e.preventDefault();
      run();
    });
  }

  function toggleService() {
    const on = rig.classList.toggle('service');
    sfx('click');
    line(on ? 'service mode engaged · терминал и диагностика' : 'service mode released',
         on ? 'warn' : 'muted');
    if (on) initTimeline();     // the strip is only for a stripped-down machine
    // The diagnostics panel does not slide out by itself: in service mode it
    // is not always wanted, and it takes up a lot of room. Closing it on the
    // way out is another matter: outside service mode there is no reason for
    // it to hang there.
    if (!on && rig.classList.contains('lp-open')) toggleLp();
    // Лупа живёт только внутри сервисного режима: разбирает узлы он, а она
    // лишь показывает их вблизи. Раньше связь была односторонней — кнопка лупы
    // включала режим, а выключатель на плате гасил режим и оставлял машину
    // приближённой, без терминала и без разбора.
    //
    // Рекурсии здесь нет: setZoom снимает класс zoom прежде, чем сам дёрнет
    // toggleService, и его собственная проверка к этому моменту уже не
    // срабатывает.
    if (!on && rig.classList.contains('zoom')) setZoom(false);
    if (!on) {
      // Assemble the machine completely: a unit could have been left at an
      // intermediate step too — with a drive latch flipped open or a heatsink
      // taken off.
      //
      // Возврат идёт одним общим движением: класс на время переключает узлы с
      // щелчка на кривую композиции, иначе семь узлов, сорвавшихся с места
      // разом, читаются рывком.
      rig.classList.add('stowing');
      wait(1600, function () { rig.classList.remove('stowing'); });
      chassis.querySelectorAll('.pulled, .unlatched').forEach(function (p) {
        p.classList.remove('pulled', 'opened', 'unlatched');
      });
      updateFault();
    }
  }
  onBoard('svc-switch', toggleService);

  // Выйти из сервисного режима нужно уметь всегда, а выключатель нарисован на
  // плате — то есть ровно там, где схемы может и не оказаться. Два запасных
  // выхода.
  //
  // Первый — Esc: работает, пока экран машины закрыт и пока не набирают
  // команду (там Esc свой, он гасит подсказку).
  //
  // На перехвате, и это важно: диспетчер экрана слушает того же Esc и тоже на
  // перехвате, но регистрируется ниже по файлу — значит, мы первые. Иначе
  // Esc, закрывающий BIOS Setup, к нашему обработчику доходил бы уже с
  // закрытым экраном и заодно выбрасывал из сервисного режима.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!rig.classList.contains('service') && !rig.classList.contains('zoom')) return;
    if (screenOpen()) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    if (rig.classList.contains('zoom')) setZoom(false); else toggleService();
  }, true);

  // Второй — узкое окно. При 820 точках схема прячется целиком и уносит с
  // собой и выключатель, и консоль, а класс service остаётся: выйти нечем.
  // Это не только про телефон — зум браузера ужимает css-окно ровно так же,
  // и на 175 % машина исчезала, а сервисный режим оставался включённым
  // навсегда. Поэтому, пока схемы нет, нет и режима.
  const narrow = window.matchMedia('(max-width: 820px)');
  function keepServiceReachable() {
    if (narrow.matches && rig.classList.contains('service')) toggleService();
  }
  narrow.addEventListener('change', keepServiceReachable);

  // The registry of units. Every block says for itself what it is called in
  // the log and, if it does not come apart in one motion, exactly how. This
  // used to be a ladder of ifs over types: to add a unit you had to edit the
  // shared file.
  const PICKS = [];

  // ── Открытие раздела ───────────────────────────────────────────────────
  // Щелчок по узлу уводит на его раздел, и раньше уводил сразу. Теперь у
  // перехода есть пролог: машина сперва показывает, чем этот раздел является
  // в её собственных понятиях — процессор считает, память вспоминает. Сцену
  // объявляет сам блок, здесь только общий ход: кадр, занавес и уход.
  //
  // Регистр устроен как PICKS и по той же причине: сцена принадлежит узлу, а
  // не общему файлу, и живёт в его собственном скрипте.
  const OPENERS = [];

  // Камера — это viewBox самой схемы, а не transform поверх неё, и это не
  // вкус. Наезд через transform ломает разом две вещи: обрезка кристалла
  // задана в пользовательских координатах и уезжает вместе с группой (ровно
  // та цветная полоса поверх вентиляторов, из-за которой правило вынесли на
  // сам .die), а наклон сцены складывается с масштабом и уводит кадр вбок.
  // У окна нет ни того, ни другого: меняется рамка, а не содержимое, и всё
  // внутри — обрезки, градиенты, наклон — остаётся при своём.
  const VIEW0 = board.getAttribute('viewBox').trim().split(/\s+/).map(Number);
  const VIEW_AR = VIEW0[2] / VIEW0[3];
  let camAnim = null;

  function putView(v) {
    board.setAttribute('viewBox', v.map(function (n) { return n.toFixed(1); }).join(' '));
  }

  // Кадр по узлу: его габарит, раздутый до пропорций схемы. Пропорции держать
  // обязательно — высоту картинки браузер считает из viewBox при height:auto,
  // и кадр другой формы менял бы высоту страницы прямо посреди наезда.
  function frameOf(el, pad) {
    const b = el.getBBox();
    let w = b.width + 2 * pad, h = b.height + 2 * pad;
    if (w / h < VIEW_AR) w = h * VIEW_AR; else h = w / VIEW_AR;
    return [b.x + b.width / 2 - w / 2, b.y + b.height / 2 - h / 2, w, h];
  }

  // Камера двигает окно, а не содержимое, и это ради чёткости. Перенос
  // композитный и потому дешёвый, но он растягивает уже отрисованное: полсекунды
  // наезда идут мылом, а смотрят именно на них. Окно перерисовывает схему
  // вектором на каждом кадре, и на месте, и в движении.
  //
  // Платить за это перерисовкой шести тысяч фигур не приходится: то, чего в
  // кадре не будет, снимается заранее — см. narrowView ниже.
  function camera(to, ms, done) {
    if (camAnim) { cancelAnimationFrame(camAnim); camAnim = null; }
    if (reduced || !ms) { putView(to); if (done) done(); return; }
    const from = board.getAttribute('viewBox').trim().split(/\s+/).map(Number);
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / ms);
      // Та же кривая, что у лупы: масштаб набирается сразу и мягко доводится.
      // Линейный ход читается рывком ровно в конце, когда движение обрывается.
      const k = 1 - Math.pow(1 - p, 3);
      putView(from.map(function (v, i) { return v + (to[i] - v) * k; }));
      camAnim = p < 1 ? requestAnimationFrame(tick) : null;
      if (p >= 1 && done) done();
    })(t0);
  }

  // Сужение внимания. Всё, что не заденет кадр наезда, гаснет и снимается с
  // отрисовки: на подходе к процессору мимо кадра остаётся сорок с лишним
  // процентов схемы — вентиляторы, корзина дисков, блоки питания, задняя
  // панель. Браузер обходит их при каждой перерисовке, а перерисовок тут
  // шестьдесят в секунду.
  //
  // Зовётся заранее, до первого движения камеры: у сцены на это есть та самая
  // пауза, за которую снимается радиатор. Гашение занимает четверть секунды и
  // читается сужением внимания к узлу, а не пропажей половины платы.
  //
  // Прячем целыми блоками и только те, что не задевают кадр вовсе: наполовину
  // срезанный блок — это дыра на картинке, а не экономия. Рассыпуха и краска
  // лежат по всей плате и остаются всегда: они и есть то, что видно вокруг узла.
  function narrowView(to) {
    const wide = !to || to[2] >= VIEW0[2] * 0.98;
    board.querySelectorAll('[data-blk]').forEach(function (g) {
      if (wide) { g.classList.remove('far', 'gone'); return; }
      let b;
      try { b = g.getBBox(); } catch (e) { return; }
      const miss = b.x > to[0] + to[2] || b.x + b.width < to[0]
                || b.y > to[1] + to[3] || b.y + b.height < to[1];
      g.classList.toggle('far', miss);
    });
    if (wide) return;
    // Снимаем с отрисовки только после того, как они догасли: display:none
    // посреди перехода — это скачок, а не исчезновение.
    sceneWait(280, function () {
      board.querySelectorAll('[data-blk].far').forEach(function (g) {
        g.classList.add('gone');
      });
    });
  }


  // Fan: in the log they are numbered from one, as on the chassis, but in the
  // markup from zero.
  PICKS.push({
    test: function (el) { return el.dataset.fan !== undefined; },
    name: function (el) { return 'fan ' + (Number(el.dataset.fan) + 1); },
  });
  PICKS.push({
    test: function (el) { return el.dataset.dimm !== undefined; },
    name: function (el) { return 'dimm ' + el.dataset.dimm; },
  });

  // ── Сцена: открытие блога ──────────────────────────────────────────────
  // Блог открывается памятью: записи лежат в ней, и достать их можно только
  // тем, чем память вообще занята, — обходом строк. Камера наводится на банк,
  // и по нему идёт цикл обновления.
  const MEM_NS = 'http://www.w3.org/2000/svg';

  // Микросхемы на модулях. В разметке их нет и не должно быть: это сцена для
  // одного банка из трёх, и платить за неё разметкой обязан тот, кто её
  // открыл, а не каждый гость.
  //
  // Сколько их — считается, а не выбирается. У модуля 2Rx8 разрядность чипа
  // восемь бит, шина с коррекцией — семьдесят два: девять корпусов на ранг,
  // и столько же видно с одной стороны планки. Соврать тут нельзя ровно так
  // же, как в консоли: обе цифры приходят из одного паспорта.
  function buildCells(bank) {
    if (bank.querySelector('.bank-cells')) return;
    const width = parseInt(/x(\d+)/i.exec((HW.dimm && HW.dimm.ranks) || '2Rx8')[1], 10);
    const chips = Math.round(72 / width);
    const dimms = [...bank.querySelectorAll('.dimm')];

    const g = document.createElementNS(MEM_NS, 'g');
    g.setAttribute('class', 'bank-cells');

    dimms.forEach(function (dimm, row) {
      const b = dimm.querySelector('.pick-body').getBBox();
      // Корпуса сидят в ряд по длине планки, отступив от краёв: у самой
      // кромки стоит не память, а ключ и контакты.
      const padX = b.width * 0.10, padY = b.height * 0.24;
      const w = (b.width - 2 * padX) / chips;
      for (let i = 0; i < chips; i++) {
        const r = document.createElementNS(MEM_NS, 'rect');
        // Обход идёт по строкам, а строки лежат поперёк банка: волна
        // проходит планку за планкой и по каждой слева направо. Задержка
        // складывается из обоих слагаемых, поэтому фронт идёт наискось —
        // так контроллер память и обходит, а не всю разом.
        const c = row * chips + i;
        r.setAttribute('class', 'cell' + (held(row, i) ? ' held' : ''));
        r.setAttribute('x', (b.x + padX + i * w + 0.6).toFixed(2));
        r.setAttribute('y', (b.y + padY).toFixed(2));
        r.setAttribute('width', Math.max(0.6, w - 1.2).toFixed(2));
        r.setAttribute('height', Math.max(0.6, b.height - 2 * padY).toFixed(2));
        r.setAttribute('style', '--c:' + c);
        g.appendChild(r);
      }
    });
    bank.appendChild(g);
  }

  // Какие страницы заняты. Раскладка обязана быть одной и той же от показа к
  // показу: мигающая наугад память читается неисправной, а не заполненной.
  function held(row, i) {
    return ((row * 7 + i * 3) % 11) < 4;
  }

  OPENERS.push({
    test: function (el) { return el.dataset.group === 'dimm'; },
    // Корпуса раскладываются на наведении — по той же причине, что и кремний
    // процессора: внутри сцены на эту работу нет свободного кадра.
    prep: function (el) { buildCells(el); },
    play: function (el, done) {
      const code = (el.dataset.unit || '').split('-')[1] || 'L';
      const spec = (HW.dimm.banks || []).find(function (b) { return b.code === code; })
                   || HW.dimm.banks[0];
      buildCells(el);
      // Лишнее гаснет до наезда, а не во время него: см. narrowView.
      narrowView(frameOf(el, 26));

      camera(frameOf(el, 26), 760);
      line('dimm ' + code + ': банк ' + spec.ch + ' · ' + spec.n + '× '
           + HW.dimm.size_gb + ' ГБ ' + HW.dimm.kind, 'muted');

      sceneWait(700, function () {
        el.classList.add('refreshing');
        line('dimm ' + code + ': refresh · ' + HW.dimm.speed + ' MT/s · '
             + HW.dimm.ranks, 'ok');
      });

      sceneWait(1700, function () {
        line('dimm ' + code + ': ' + spec.n * HW.dimm.size_gb
             + ' ГБ обойдено · открываю записи', 'ok');
      });

      sceneWait(2100, done);
    },
  });
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
  // The processor comes apart in two moves, as in real life: first the
  // heatsink, then the processor from under it. A third click puts the
  // assembly back together.
  PICKS.push({
    test: function (el) { return el.classList.contains('cpu-slot'); },
    name: function (el) { return 'cpu' + el.dataset.cpu + ' heatsink'; },
    pull: function (el, line) {
      const n = el.dataset.cpu;
      if (!el.classList.contains('pulled')) {
        el.classList.add('pulled');
        sfxMove(el, 'out');
        line('removed: радиатор CPU' + n, 'warn');
      } else if (!el.classList.contains('opened')) {
        el.classList.add('opened');
        // Рамку сокета держит рычаг, и это единственное движение здесь, у
        // которого есть щелчок: радиатор снимают винтами, процессор просто
        // вынимают из рамки, а рычаг срывается с зацепа.
        sfx('chk');
        line('removed: процессор CPU' + n + ' · LGA 4677 socket open', 'warn');
      } else {
        el.classList.remove('pulled', 'opened');
        sfxMove(el, 'in');
        line('inserted: CPU' + n + ' с радиатором', 'ok');
      }
    },
  });

  // ── Сцена: открытие резюме ─────────────────────────────────────────────
  // Резюме открывается процессором, и открывается им не случайно: это то
  // место машины, где что-то происходит само. Сцена показывает ровно это —
  // снимает радиатор, наводит камеру на крышку и раскладывает под ней
  // кремний, по которому проходит нагрузка.
  const NS = 'http://www.w3.org/2000/svg';

  // Кристаллы под крышкой. В разметке их нет и быть не должно: сто девяносто
  // два прямоугольника — это двадцать семь килобайт, которые качает каждый
  // гость ради сцены, которую откроет один из ста. Скрипт строит раскладку
  // один раз, в тот миг, когда её собрались показать.
  //
  // Раскладка честная: Turin собран из кристаллов-чиплетов, разложенных
  // вокруг общего кристалла ввода-вывода, и оба числа — сколько кристаллов и
  // сколько на них ядер — приходят из паспорта. Врать тут нечем: столько же
  // ядер печатает консоль и столько же выбито на самой крышке.
  function buildCores(slot, lid) {
    if (slot.querySelector('.cores')) return;
    const ccd = (HW.cpu && HW.cpu.ccd) || 12;
    const per = Math.round(((HW.cpu && HW.cpu.cores) || 192) / ccd);
    const b = lid.getBBox();
    const pad = 3.4;
    const x0 = b.x + pad, y0 = b.y + pad;
    const w = b.width - 2 * pad, h = b.height - 2 * pad;

    // Кристаллы стоят двумя рядами, между ними — кристалл ввода-вывода во всю
    // ширину. Так этот процессор и устроен: считает не одна пластина, а
    // дюжина, и связывает их середина.
    const perRow = Math.ceil(ccd / 2);
    const iodH = h * 0.20;
    const rowH = (h - iodH) / 2 - 1.2;
    const colW = w / perRow - 1.2;
    // Сетка ядер внутри кристалла — настолько квадратная, насколько выходит.
    const cols = Math.ceil(Math.sqrt(per));
    const rows = Math.ceil(per / cols);

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'cores');

    function rect(cls, x, y, rw, rh, style) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', cls);
      r.setAttribute('x', x.toFixed(2));
      r.setAttribute('y', y.toFixed(2));
      r.setAttribute('width', Math.max(0.4, rw).toFixed(2));
      r.setAttribute('height', Math.max(0.4, rh).toFixed(2));
      if (style) r.setAttribute('style', style);
      g.appendChild(r);
      return r;
    }

    rect('iod-box', x0, y0 + rowH + 1.2, w, iodH - 0.4);

    for (let k = 0; k < ccd; k++) {
      const row = k < perRow ? 0 : 1;
      const col = k % perRow;
      const cx = x0 + col * (colW + 1.2);
      const cy = y0 + (row ? rowH + iodH + 2 : 0);
      rect('ccd-box', cx, cy, colW, rowH);
      for (let i = 0; i < per; i++) {
        const ix = i % cols, iy = (i / cols) | 0;
        const cw = (colW - 2.2) / cols, ch = (rowH - 2.2) / rows;
        const ex = cx + 1.1 + ix * cw, ey = cy + 1.1 + iy * ch;
        // Задержка берётся из места ядра по горизонтали, а не из его номера:
        // фронт нагрузки идёт по кремнию слева направо ровной волной, а по
        // номеру он шёл бы кристаллами — сперва весь верхний ряд, потом весь
        // нижний, и читалось бы это двумя вспышками вместо одной волны.
        const c = Math.round((ex - x0) / w * 140);
        rect('core', ex, ey, cw - 0.5, ch - 0.5, '--c:' + c);
      }
    }

    const die = slot.querySelector('.die');
    if (die) die.after(g); else slot.appendChild(g);
  }

  OPENERS.push({
    test: function (el) { return el.dataset.group === 'cpu'; },
    // Кремний строится на наведении, а не по щелчку: две сотни фигур и первый
    // расчёт их стилей стоят пятой доли секунды, и в сцене этого кадра нет.
    prep: function (el) {
      const slot = el.querySelector('.cpu-slot');
      if (slot) buildCores(slot, slot.querySelector('.ihs'));
    },
    play: function (el, done) {
      const slot = el.querySelector('.cpu-slot');
      const lid = slot.querySelector('.ihs');
      const n = slot.dataset.cpu;
      buildCores(slot, lid);
      // Лишнее гаснет сразу, пока снимается радиатор: к началу наезда схема уже
      // облегчена, и кадры движения достаются дешевле.
      narrowView(frameOf(lid, 22));

      // Радиатор снимается тем же движением, что и в сервисном режиме: он
      // стоит на винтах, и снять его иначе нельзя.
      slot.classList.add('pulled');
      sfxMove(slot, 'out');
      line('cpu' + n + ': радиатор снят', 'warn');

      // Камера трогается не сразу, и это не пауза ради паузы. Радиатор уходит
      // вправо на две с лишним сотни единиц — дальше, чем весь кадр наезда, —
      // и камера, пущенная вдогонку, обгоняет его: снятие происходит уже за
      // границей кадра, и со стороны читается, что радиатор не снялся вовсе.
      // Полсекунды — это его собственный ход по --glide, ровно столько и ждём.
      sceneWait(520, function () {
        camera(frameOf(lid, 22), 700);
        line('cpu' + n + ': ' + HW.cpu.model + ' · ' + HW.cpu.socket, 'muted');
      });

      // Кремний открывается, едва камера пришла. Прежде он ждал до 1100 мс, а
      // проступал ещё полсекунды — и к своей полной яркости приходил за сотню
      // миллисекунд до ухода. Смотреть было не на что: всю сцену занимал блик
      // по крышке, ради которого её никто не открывал.
      sceneWait(700, function () {
        slot.classList.add('probing');
        line('cpu' + n + ': ' + HW.cpu.ccd + ' кристаллов · '
             + HW.cpu.cores + ' ядер · ' + HW.cpu.threads + ' потоков', 'ok');
      });

      sceneWait(2200, function () {
        line('cpu' + n + ': нагрузка по всем ядрам · открываю резюме', 'ok');
      });

      // Волна кончается около 2100 мс, и после неё кремний стоит открытым ещё
      // почти секунду: это и есть тот кадр, ради которого сцена затевалась.
      sceneWait(2950, done);
    },
  });
  PICKS.push({
    test: function (el) { return el.dataset.riser !== undefined; },
    name: function (el) { return 'riser ' + el.dataset.riser; },
  });
  PICKS.push({
    test: function (el) { return el.dataset.psu !== undefined; },
    name: function (el) { return 'psu-' + el.dataset.psu; },
    // A pulled supply is dead: that is what the log says. Put it back and
    // mains is on it again, and the AC lamp lights up even on a machine that
    // is switched off.
    pull: function (el, line) {
      const out = el.classList.toggle('pulled');
      // Блок ходит в одно движение, за оранжевую скобу: она и щёлкает — на
      // выходе отпуская, на входе запирая.
      sfxMove(el, out ? 'out' : 'in');
      const name = 'psu-' + el.dataset.psu;
      // Первый вынутый блок — потеря резерва, второй — потеря питания. Про
      // саму потерю пишет updateMains(), здесь только судьба нагрузки: обещать
      // «нагрузка на втором блоке», когда второго блока уже нет, нельзя.
      const last = !document.querySelector('.psu:not(.pulled)');
      line(out ? 'removed: ' + name + (last ? ' · нагрузку принять некому'
                                            : ' · обесточен, нагрузка на втором блоке')
               : 'inserted: ' + name + ' · AC ok', out ? 'warn' : 'ok');
    },
  });

  function unitName(el) {
    const kind = PICKS.find(function (k) { return k.test(el); });
    return kind ? kind.name(el) : (el.dataset.unit || 'unit');
  }

  // While service mode is off, the machine works as a business card: clicking
  // a unit follows its address. Turn SERVICE on — the same clicks take the
  // machine apart.
  chassis.addEventListener('click', function (e) {
    if (rig.classList.contains('service')) {
      const pick = e.target.closest('.pick');
      if (!pick) return;
      e.preventDefault();
      // A unit with its own removal script — the processor, say, which comes
      // off in two steps — handles itself.
      const kind = PICKS.find(function (k) { return k.test(pick); });
      if (kind && kind.pull) {
        // Такой узел и звучит сам: только он знает, что это было — откинутая
        // защёлка, ход по направляющим или возврат в корзину. Снаружи все три
        // движения выглядят одинаково, а слышатся совершенно по-разному.
        kind.pull(pick, line);
        updateFault();
        return;
      }
      // Узел, который ходит в одно движение: планка памяти, вентилятор,
      // райзер. Наружу — щелчок защёлки и ход, внутрь — ход и щелчок в конце.
      const pulled = pick.classList.toggle('pulled');
      sfxMove(pick, pulled ? 'out' : 'in');
      line((pulled ? 'removed: ' : 'inserted: ') + unitName(pick), pulled ? 'warn' : 'ok');
      updateFault();
      return;
    }
    const unit = e.target.closest('.unit[data-href]');
    if (!unit) return;
    // Узлы открывают ссылки только у машины со снятой крышкой и только вне
    // лупы. Под крышкой на живой машине не нажимают ничего — её для того и
    // снимают; лупа же разглядывание, а не работа со ссылками. В обоих
    // состояниях подсказка с адресом уже не показывается, а сам переход
    // оставался: узел под закрытой крышкой молча уводил на другой сайт.
    if (!linksLive() || rig.classList.contains('zoom')) return;
    openUnit(unit, unit.dataset.href);
  });

  // ── Пролог перед уходом ────────────────────────────────────────────────
  // Уход всегда в этой же вкладке, и это условие пролога, а не вкус: после
  // анимации window.open в новую вкладку уже не пустит — жест к тому времени
  // остыл, и блокировщик всплывающих окон съест переход молча. Заодно это
  // единственный способ довезти имя до соседней страницы: переезд между
  // документами живёт внутри одной вкладки.
  //
  // Зовём именно window.open, а не location: страница подменяет его собой и
  // адрес резюме перехватывает — там имя уезжает своим переездом. Всё
  // остальное подменённая функция передаёт браузеру с той же целью.
  function leave(href) {
    if (href.startsWith('mailto:')) { window.location.href = href; return; }
    window.open(href, '_self');
  }

  // Пока идёт пролог, машина занята: щелчок по ней и escape означают «не
  // тяни», а не «покажи ещё раз». Ждать сцену до конца обязан только тот, кто
  // сам её не прерывал.
  let opening = null;

  function openUnit(unit, href) {
    if (opening) { skipOpening(); return; }
    const scene = OPENERS.find(function (s) { return s.test(unit); });
    // Сцены нет — уходим сразу. На prefers-reduced-motion её нет ни у одного
    // узла: это не украшение, от которого можно оставить половину.
    if (!scene || reduced) { leave(href); return; }
    opening = { href: href, timers: [] };
    rig.classList.add('opening');
    scene.play(unit, function () { closeOpening(); });
  }

  // Занавес общий для всех сцен: чем бы ни кончился пролог, страница гаснет
  // одинаково, и следующий документ принимает переход с той же темноты.
  function closeOpening() {
    if (!opening) return;
    const href = opening.href;
    rig.classList.add('leaving');
    opening.timers.push(wait(340, function () { leave(href); }));
  }

  // Прерывание: камера возвращается на место, а уход происходит немедленно.
  // Возврат нужен на случай, когда уходить некуда — почта открывается
  // почтовиком, и страница остаётся стоять там, где её бросили.
  function skipOpening() {
    if (!opening) return;
    const href = opening.href;
    opening.timers.forEach(clearTimeout);
    opening = null;
    rig.classList.remove('opening', 'leaving');
    rig.querySelectorAll('.scene').forEach(function (el) { el.classList.remove('scene'); });
    camera(VIEW0, 0);
    narrowView(null);
    leave(href);
  }

  // Ждать внутри сцены надо через это: свои таймеры она не собирает, а
  // прерывание обязано снять их все разом.
  function sceneWait(ms, fn) {
    if (!opening) return;
    opening.timers.push(wait(ms, function () { if (opening) fn(); }));
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && opening) skipOpening();
  });

  // Тяжёлое сцена готовит заранее, пока гость только ведёт курсор к узлу.
  // Внутри самой сцены на это нет свободного кадра: построить две сотни фигур
  // и рассчитать их стили — это пятая доля секунды, и приходится она ровно на
  // начало движения камеры, то есть на самое заметное место. Тем же приёмом
  // страница подтягивает резюме на наведении — здесь просто своя ноша.
  const prepped = new WeakSet();
  rig.addEventListener('mouseover', function (e) {
    const unit = e.target.closest('.unit[data-href]');
    if (!unit || prepped.has(unit) || !linksLive()) return;
    const scene = OPENERS.find(function (s) { return s.test(unit); });
    if (!scene || !scene.prep) return;
    prepped.add(unit);
    scene.prep(unit);
  });

  // Подпись-выноска ведёт туда же, куда её узел, и обязана открываться так же.
  // Слушаем на .rig, а не на самих бирках: лента ревизий переписывает плату
  // целиком, и обработчики на подписях ушли бы вместе с ней.
  rig.addEventListener('click', function (e) {
    const co = e.target.closest('a.callout[data-for]');
    if (!co || !linksLive() || rig.classList.contains('zoom')) return;
    const unit = rig.querySelector('.unit[data-group="' + co.dataset.for + '"]');
    if (!unit || !OPENERS.some(function (s) { return s.test(unit); })) return;
    e.preventDefault();
    openUnit(unit, co.getAttribute('href'));
  });

  // Возврат «назад» отдаёт страницу из кеша ровно в том виде, в каком её
  // оставили, — то есть в затемнении и с камерой, наехавшей на узел.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    opening = null;
    rig.classList.remove('opening', 'leaving');
    rig.querySelectorAll('.scene').forEach(function (el) { el.classList.remove('scene'); });
    camera(VIEW0, 0);
    narrowView(null);
  });

  // The callouts are real <a> elements; service mode hides them in css. This
  // is the second line, and it covers a different way of pressing: css takes
  // the label out from under the pointer and out of the tab order, while here
  // the activation itself is cancelled — from the keyboard or from anywhere
  // else. Listening on .rig rather than on the labels, because the revision
  // timeline rewrites the whole board and per-label listeners would go with it.
  rig.addEventListener('click', function (e) {
    if (rig.classList.contains('service') && e.target.closest('a.callout')) e.preventDefault();
  }, true);

  // ── Terminal: the shell core ───────────────────────────────────────────
  // There used to be a staircase of cases on command names here. It worked,
  // but the command names existed only as switch labels and as text in the
  // help — so there was nothing to complete by Tab with and nothing to
  // assemble help out of, and the help drifted from reality silently.
  //
  // Now a command declares itself: name, group, a short help line,
  // candidates for completion and a function. The function RETURNS lines
  // instead of printing them — otherwise there is no pipeline: grep has to
  // get what the previous stage returned, not read someone else's output
  // out of the log.

  const CMDS = new Map();

  function cmd(spec) {
    // The order the parts are spliced in sets the order of registration,
    // and mixed-up markers would silently overwrite commands. Better it
    // falls over loudly.
    if (CMDS.has(spec.name)) throw new Error('команда уже объявлена: ' + spec.name);
    CMDS.set(spec.name, spec);
    (spec.alias || []).forEach(function (a) {
      CMDS.set(a, Object.assign({}, spec, { alias_of: spec.name }));
    });
  }

  // The firmware settings are declared by the screen (parts/screen.js), and
  // that runs further down the file. By the first keypress there is no point
  // waiting for it any more, but if the screen was not spliced in at all the
  // commands still have to work, just without settings. Hence the try:
  // touching an undeclared variable throws.
  function nvBag() {
    try { return nv; } catch (e) { return {}; }
  }

  let cwd = '/home/cosmdandy';

  // ── Parsing the line ───────────────────────────────────────────────────
  // It used to be: split on spaces and everything down to lower case — that
  // is, exactly two words, and the path /Proc turned into /proc. Now case is
  // kept: paths and grep patterns are sensitive to it. Only the command name
  // is lowercased, when it is looked up in the registry.

  function lex(raw) {
    const stages = [];
    let argv = [];
    let token = '';
    let quote = '';
    let has = false;

    function push() {
      if (has) { argv.push(token); token = ''; has = false; }
    }

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quote) {
        if (ch === quote) quote = ''; else { token += ch; has = true; }
      } else if (ch === '"' || ch === "'") {
        quote = ch; has = true;
      } else if (ch === ' ' || ch === '\t') {
        push();
      } else if (ch === '|') {
        push();
        stages.push(argv);
        argv = [];
      } else {
        token += ch; has = true;
      }
    }
    push();
    stages.push(argv);
    return stages.filter(function (s) { return s.length; });
  }

  // ── History ────────────────────────────────────────────────────────────
  const history = [];
  let pos = 0;
  let draft = '';

  // `!!` — the previous line, `!7` — the seventh, `!se` — the last one on
  // "se". What it expands to is echoed and goes into the history already
  // expanded: that is how bash behaves, and that way it is clear what
  // exactly ran.
  function expand(raw) {
    const s = raw.trim();
    if (s[0] !== '!' || !s.length) return raw;
    const rest = s.slice(1);
    if (rest === '!') return history[history.length - 1] || '';
    if (/^\d+$/.test(rest)) return history[Number(rest) - 1] || '';
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].indexOf(rest) === 0) return history[i];
    }
    return '';
  }

  // ── Execution ──────────────────────────────────────────────────────────

  function found(name) {
    return CMDS.get(String(name).toLowerCase());
  }

  function runStage(argv, stdin) {
    const spec = found(argv[0]);
    if (!spec) {
      const near = suggest(argv[0]);
      return [{ t: 'неизвестная команда: ' + argv[0] + (near ? ' · может быть ' + near + '?' : ''), c: 'err' }];
    }
    if (spec.sink && stdin) {
      return [{ t: spec.name + ': экранная команда не читается по конвейеру', c: 'err' }];
    }
    if (spec.needs === 'power' && !state.powered) {
      return [{ t: spec.name + ': машина выключена · power on', c: 'warn' }];
    }
    const out = spec.run({
      argv: argv,
      args: argv.slice(1),
      stdin: stdin || null,
      cwd: cwd,
      setCwd: function (p) { cwd = p; refreshPs1(); },
      nv: nvBag(),
      HW: HW,
      rig: rig,
      chassis: chassis,
      line: line,
    });
    return out || [];
  }

  // A similar command to suggest on a typo: we count the common prefix, that
  // is enough — the list is short, and Levenshtein distance is overkill here.
  function suggest(word) {
    const w = String(word).toLowerCase();
    let best = '';
    let score = 0;
    CMDS.forEach(function (spec, name) {
      let i = 0;
      while (i < w.length && i < name.length && w[i] === name[i]) i++;
      if (i > score) { score = i; best = name; }
    });
    return score >= 2 ? best : '';
  }

  function exec(raw) {
    const expanded = expand(raw);
    if (expanded !== raw.trim() && expanded) line('$ ' + expanded, 'muted');
    else line('$ ' + raw.trim(), 'muted');
    const text = expanded || raw;
    if (!text.trim()) return [];

    if (/[<>]|&&/.test(text)) {
      line('перенаправление не поддерживается: файловая система только на чтение', 'err');
      return [];
    }

    const stages = lex(text);
    let out = null;
    for (let i = 0; i < stages.length; i++) out = runStage(stages[i], out);
    // Экран бережёт последняя стадия, а не источник. `/proc/cpuinfo` — это без
    // малого восемь тысяч строк, и напечатать их целиком значит стереть всё,
    // что было в терминале до. Резать его в самом файле нельзя: конвейер
    // обязан видеть весь файл, иначе `grep | wc` соврёт. Поэтому обрезается
    // именно вывод, и ровно тогда, когда он идёт на экран.
    const ЭКРАН = 60;
    let печать = out || [];
    if (печать.length > ЭКРАН) {
      const скрыто = печать.length - ЭКРАН;
      печать = печать.slice(0, ЭКРАН).concat([
        { t: '', c: '' },
        { t: '… ещё ' + скрыто + ' строк · целиком — по конвейеру, '
             + 'например ' + text.split('|')[0].trim() + ' | wc', c: 'muted' },
      ]);
    }
    печать.forEach(function (row) { line(row.t, row.c || ''); });
    return out || [];
  }

  // ── Help is assembled from the registry ────────────────────────────────
  // As long as the command list lay in a separate array, it drifted from the
  // switch itself: a command was there and the line about it was not, and
  // the other way round.
  cmd({
    name: 'help',
    group: 'ОБОЛОЧКА',
    brief: 'этот список; help <команда> — подробно',
    usage: 'help [команда]',
    complete: function (argv, i) { return i === 1 ? names() : []; },
    run: function (ctx) {
      const one = ctx.args[0] && found(ctx.args[0]);
      if (one) {
        return [{ t: one.usage || one.name, c: 'ok' },
                { t: '  ' + one.brief, c: 'muted' }]
          .concat(one.help ? one.help.map(function (h) { return { t: '  ' + h, c: 'muted' }; }) : []);
      }
      const groups = new Map();
      CMDS.forEach(function (spec, name) {
        if (spec.alias_of) return;
        const g = spec.group || 'ПРОЧЕЕ';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push({ name: name, brief: spec.brief });
      });
      const out = [];
      groups.forEach(function (list, g) {
        out.push({ t: g, c: 'ok' });
        list.forEach(function (c) {
          out.push({ t: '  ' + c.name + ' '.repeat(Math.max(1, 18 - c.name.length)) + '— ' + c.brief, c: 'muted' });
        });
      });
      out.push({ t: 'Tab дополняет · ↑↓ история · !! повтор · Ctrl+C сброс', c: 'muted' });
      return out;
    },
  });

  // Лента ревизий. На живом сайте она не поднимается сама: это восемьдесят
  // схем, и качать их, зайдя посмотреть визитку, незачем. Кто хочет увидеть,
  // как машина росла, — просит об этом сам, и тогда качается по одной схеме за
  // ход ползунка. Локально лента была и есть, там просить нечего.
  //
  // Имя не history: так зовётся история команд оболочки, и вторая команда с
  // тем же именем в реестр не встаёт — он её отвергает, а страница падает на
  // этом ещё до того, как соберётся консоль.
  cmd({
    name: 'revisions',
    group: 'МАШИНА',
    brief: 'лента ревизий схемы',
    usage: 'revisions on|off',
    complete: function (argv, i) { return i === 1 ? ['on', 'off'] : []; },
    help: ['Схема собирается генератором, и каждая её сборка сохранена.',
           'on поднимает ленту под машиной: ползунком по ней видно, как плата',
           'менялась от первой ревизии до сегодняшней. off убирает ленту и',
           'возвращает машину на текущую сборку.',
           'Схемы качаются по одной и только пока лента поднята.'],
    run: function (ctx) {
      const arg = String(ctx.args[0] || '').toLowerCase();
      if (arg === 'off') {
        if (!stripUp()) return [{ t: 'лента и так убрана', c: 'muted' }];
        // Сначала вернуть машину на сегодняшнюю сборку, и только потом убирать
        // ленту. Наоборот нельзя: на экране осталась бы схема полугодовой
        // давности, а ползунка, которым её меняли, уже не будет.
        showRev(revs.length - 1);
        setStrip(false);
        return [{ t: 'лента убрана · схема вернулась на текущую сборку', c: 'muted' }];
      }
      if (arg === 'on') {
        if (stripUp()) return [{ t: 'лента уже поднята', c: 'muted' }];
        // Второй заход качать нечего: список ревизий уже в памяти, а схемы — в
        // кэше по мере того, как их листали.
        if (revs.length) { setStrip(true); return [{ t: 'лента поднята', c: 'ok' }]; }
        revsAsked = true;
        initTimeline();
        // initTimeline асинхронна: сообщать об успехе сейчас нельзя. Об отказе
        // она скажет сама, отдельной строкой, когда станет ясно.
        return [{ t: 'загружаю историю схемы…', c: 'muted' }];
      }
      return [{ t: 'revisions on|off', c: 'warn' },
              { t: 'сейчас: ' + (stripUp() ? 'поднята' : 'убрана'), c: 'muted' }];
    },
  });

  cmd({
    name: 'clear', group: 'ОБОЛОЧКА', brief: 'очистить лог', usage: 'clear',
    run: function () { log.innerHTML = ''; return []; },
  });

  cmd({
    name: 'history', group: 'ОБОЛОЧКА', brief: 'что уже набирали', usage: 'history',
    run: function () {
      return history.map(function (h, i) { return { t: String(i + 1).padStart(4) + '  ' + h, c: 'muted' }; });
    },
  });

  function names() {
    const out = [];
    CMDS.forEach(function (spec, name) { if (!spec.alias_of) out.push(name); });
    return out.sort();
  }

  // ── Completion ─────────────────────────────────────────────────────────
  // We take the candidates from the command itself: it alone knows what
  // stands in place of its argument — paths, flags or link names.
  function complete(text) {
    const stages = lex(text);
    const argv = stages.length ? stages[stages.length - 1] : [];
    const tail = text.endsWith(' ') ? '' : (argv[argv.length - 1] || '');
    const i = text.endsWith(' ') ? argv.length : argv.length - 1;
    let list = [];
    if (i <= 0) {
      list = names();
    } else {
      const spec = found(argv[0]);
      if (spec && spec.complete) list = spec.complete(argv, i) || [];
    }
    return list.filter(function (c) { return c.indexOf(tail) === 0 && c !== tail; });
  }

  // What to draw on in grey: first the completion candidate, if there is
  // only one or they all share a prefix; if there are no candidates — the
  // last command from the history that starts this way, as in fish.
  function ghostFor(text) {
    if (!text) return '';
    const cand = complete(text);
    if (cand.length) {
      const tailStart = text.length - (text.split(/\s+/).pop() || '').length;
      let common = cand[0];
      for (let k = 1; k < cand.length; k++) {
        let j = 0;
        while (j < common.length && j < cand[k].length && common[j] === cand[k][j]) j++;
        common = common.slice(0, j);
      }
      const typed = text.slice(tailStart);
      if (common.length > typed.length) return common.slice(typed.length);
      return '';
    }
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].indexOf(text) === 0) return history[i].slice(text.length);
    }
    return '';
  }

  // ── The input field ────────────────────────────────────────────────────
  const promptInput = document.getElementById('prompt');

  // Курсор всегда возвращается в строку. Гость щёлкает по узлу, по
  // переключателю, по кнопке панели — и после каждого такого действия фокус
  // оставался на нажатом, а набрать команду было некуда, пока не ткнёшь в
  // строку отдельно. Возвращаем его сами.
  //
  // Только когда консоли есть куда возвращать: вне сервисного режима строки
  // нет вовсе, в лупе она спрятана, а под поднятым экраном машины ввод и так
  // запрещён. И не отнимаем фокус у того, кому он нужен самому, — у ссылок и
  // у полей ввода.
  rig.addEventListener('click', function (e) {
    if (!rig.classList.contains('service') || rig.classList.contains('zoom')) return;
    if (screenOpen()) return;
    if (e.target.closest('input, textarea, a[href], [contenteditable]')) return;
    promptInput.focus({ preventScroll: true });
  });
  const ghostTyped = document.querySelector('.ghost-typed');
  const ghostRest = document.querySelector('.ghost-rest');
  const ps1Cwd = document.getElementById('ps1-cwd');

  function refreshPs1() {
    if (ps1Cwd) ps1Cwd.textContent = cwd === '/home/cosmdandy' ? '~' : cwd;
  }
  refreshPs1();

  // The hint is drawn by a mirror under the field: an <input> never has two
  // colours. What was typed is transparent in the mirror — it is there only
  // to take up the width, and what shows is the continuation in a muted
  // tone.
  function paintGhost() {
    if (!ghostRest) return;
    const text = promptInput.value;
    const atEnd = promptInput.selectionStart === text.length;
    const rest = atEnd ? ghostFor(text) : '';
    ghostTyped.textContent = text;
    ghostRest.textContent = rest;
    ghostTyped.parentNode.style.transform = 'translateX(' + -promptInput.scrollLeft + 'px)';
  }

  function takeGhost() {
    if (!ghostRest || !ghostRest.textContent) return false;
    promptInput.value += ghostRest.textContent;
    paintGhost();
    return true;
  }

  document.getElementById('prompt-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const raw = promptInput.value.trim();
    if (raw && history[history.length - 1] !== raw) history.push(raw);
    pos = history.length;
    draft = '';
    if (raw) exec(raw);
    promptInput.value = '';
    paintGhost();
  });

  promptInput.addEventListener('input', paintGhost);
  promptInput.addEventListener('scroll', paintGhost);

  promptInput.addEventListener('keydown', function (e) {
    // We do not hang Ctrl+W: in a browser it closes the tab and cannot be
    // cancelled.
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'c') {
        e.preventDefault();
        line('^C', 'muted');
        promptInput.value = ''; paintGhost();
        return;
      }
      if (k === 'l') { e.preventDefault(); log.innerHTML = ''; return; }
      if (k === 'u') { e.preventDefault(); promptInput.value = ''; paintGhost(); return; }
      if (k === 'a') { e.preventDefault(); promptInput.setSelectionRange(0, 0); paintGhost(); return; }
      if (k === 'e') {
        e.preventDefault();
        const end = promptInput.value.length;
        promptInput.setSelectionRange(end, end); paintGhost();
        return;
      }
      if (k === 'k') {
        e.preventDefault();
        promptInput.value = promptInput.value.slice(0, promptInput.selectionStart);
        paintGhost();
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();               // otherwise focus leaves for the link below
      if (takeGhost()) return;
      const cand = complete(promptInput.value);
      if (cand.length > 1) {
        line(cand.join('  '), 'muted');
      }
      return;
    }

    if (e.key === 'Escape') {
      if (ghostRest && ghostRest.textContent) { e.preventDefault(); ghostRest.textContent = ''; }
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'End') {
      if (promptInput.selectionStart === promptInput.value.length && takeGhost()) e.preventDefault();
      return;
    }

    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!history.length) return;
    e.preventDefault();                       // otherwise the caret jumps to line start
    if (e.key === 'ArrowUp') {
      if (pos === history.length) draft = promptInput.value;
      pos = Math.max(0, pos - 1);
    } else {
      pos = Math.min(history.length, pos + 1);
    }
    promptInput.value = pos === history.length ? draft : history[pos];
    paintGhost();
    // caret to the end: otherwise it stays put and editing runs from the middle
    const end = promptInput.value.length;
    window.requestAnimationFrame(function () { promptInput.setSelectionRange(end, end); });
  });

  // A handle for tests. The terminal cannot be tested through the input
  // field: the chromium build in the container drops the renderer on any
  // <input>, and the tooling strips the fields before the page is drawn.
  window.__rig = {
    exec: function (s) { return exec(s); },
    complete: complete,
    ghost: ghostFor,
    cwd: function () { return cwd; },
    names: names,
  };

  // ── Какой из двух видов показывать ─────────────────────────────────────
  // Кнопки переключения больше нет, и это не упрощение. Схема и карточка — не
  // два варианта на вкус, а одно и то же для разных экранов: на телефоне
  // машину не рассмотреть, там и открывать нечего, а на компьютере машина и
  // есть визитка, и прятать её за кнопкой значит показывать гостю список
  // ссылок вместо того, ради чего всё делалось.
  //
  // Порог тот же, на котором схема и так спрятана целиком в css (@media
  // 820px): держать два разных порога — верный способ получить пустую
  // страницу между ними.
  const wide = window.matchMedia('(min-width: 821px)');

  function setView(v) {
    document.body.classList.toggle('view-rig', v === 'rig');
    document.body.classList.toggle('view-card', v !== 'rig');
    // Схему показали — вот теперь и собираем, если сборка ждала своего часа.
    if (v === 'rig') onRigShown();
  }

  function pickView() {
    setView(wide.matches ? 'rig' : 'card');
  }

  pickView();
  // Окно можно растянуть и сузить, и вид обязан пойти за ним: иначе на
  // повёрнутом планшете остаётся то, что для этой ширины не годится.
  wide.addEventListener('change', pickView);



  // ── Лупа ───────────────────────────────────────────────────────────────
  // Тот же сервисный режим, но без консоли: узлы разобраны и подписаны, а
  // место приборов отдано машине. Смотреть — не то же, что работать.
  //
  // Отдельного «режима зума» со своей логикой разбора здесь нет нарочно:
  // разбирает узлы сервисный режим, и делать это второй раз означало бы
  // держать две копии одного поведения.
  const zoomBtn = document.getElementById('zoom-btn');
  const ZOOM_STEPS = [1, 1.6, 2.4];
  let zoomStep = 0;

  function applyZoom() {
    rig.style.setProperty('--zoom', ZOOM_STEPS[zoomStep]);
    rig.classList.toggle('zoom-max', zoomStep === ZOOM_STEPS.length - 1);
  }

  // ── Перелёт ────────────────────────────────────────────────────────────
  // Раскладка в лупе другая целиком: машина уходит из грида в поле во весь
  // экран, шапка — в левый верхний угол, и разницу между этими местами
  // переходом не взять, position и display не интерполируются. Поэтому
  // положение меряется до и после, разница выдаётся трансформацией, а
  // снимается она уже переходом: узел не перепрыгивает на новое место, а
  // доезжает до него.
  //
  // Летят вместе — сцена, имя и должность. Порознь это три отдельных переезда
  // в одном кадре, и глаз читает их не как смену режима, а как сбой раскладки.
  //
  // Саму раскладку при этом меняем без перехода. Колонка приборов в этот
  // момент погашена, и её отъезд всё равно никто не увидит, а мерить конечное
  // положение надо по готовой раскладке — иначе перелёт целится туда, откуда
  // колонка ещё только уезжает, и машина в конце дёргается вбок.
  const FLY = 550;
  const FLY_SEL = '.stage, .rig-id h2, .rig-id .bio';

  function flyParts(mutate) {
    if (reduced) { mutate(); return; }
    const parts = [];
    rig.querySelectorAll(FLY_SEL).forEach(function (el) {
      parts.push({ el: el, a: el.getBoundingClientRect() });
    });
    // Переходы глушим у всех, кто летит, и у поля под ними — до смены
    // раскладки, а не после. У сцены в лупе свой переход по width, и она
    // трогается с места сразу; замер, взятый в эту секунду, показывает ширину,
    // с которой переход только начался, разница выходит нулевой, и сцена
    // никуда не летит — просто прыгает. Имя летело, потому что своего перехода
    // по размеру у него нет, и на нём поломка не видна.
    parts.forEach(function (p) { p.el.style.transition = 'none'; });
    rigBody.style.transition = 'none';
    mutate();
    // Замер конечных мест обязан идти по готовой раскладке — чтение rect её
    // и заставляет пересчитаться, пока переходы выключены.
    parts.forEach(function (p) { p.b = p.el.getBoundingClientRect(); });
    rigBody.style.transition = '';
    parts.forEach(function (p) {
      if (!p.a.width || !p.b.width) return;
      p.el.style.transformOrigin = '0 0';
      p.el.style.transform =
        'translate(' + (p.a.left - p.b.left) + 'px,' + (p.a.top - p.b.top) + 'px)'
        + ' scale(' + (p.a.width / p.b.width) + ')';
      p.el.getBoundingClientRect();  // забрать начальное положение до перехода
      p.el.style.transition = 'transform ' + (FLY / 1000) + 's cubic-bezier(0.22, 1, 0.36, 1)';
      p.el.style.transform = '';
    });
  }

  function landParts() {
    rig.querySelectorAll(FLY_SEL).forEach(function (el) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.transformOrigin = '';
    });
  }

  // Пока идёт перелёт, второе нажатие кнопки только собьёт замеры.
  let flying = false;

  function setZoom(on) {
    if (flying || on === rig.classList.contains('zoom')) return;
    flying = true;
    zoomBtn.setAttribute('aria-pressed', String(on));
    line(on ? 'inspect: on · shift + клик — приблизить · esc — выход'
            : 'inspect: off', 'muted');
    // Сначала уходят приборы, и только потом трогается машина. Одновременно
    // это читается рябью: колонка ещё едет, схема уже летит поверх неё.
    rig.classList.add('zoom-shift');
    wait(190, function () {
      rig.classList.add('zooming');
      flyParts(function () {
        rig.classList.toggle('zoom', on);
        document.body.classList.toggle('zoom', on);
        if (on) {
          zoomStep = 0;
          applyZoom();
        } else {
          rig.style.removeProperty('--zoom');
          rig.classList.remove('zoom-max', 'shifted');
        }
        // Сервисный режим включаем его же переключателем, а не классом: у него
        // на себе висит и раскладка, и запись в журнал, и разбор узлов.
        if (rig.classList.contains('service') !== on) toggleService();
      });
      wait(FLY + 20, function () {
        landParts();
        rig.classList.remove('zooming', 'zoom-shift');
        flying = false;
      });
    });
  }

  zoomBtn.addEventListener('click', function () {
    setZoom(!rig.classList.contains('zoom'));
  });

  // ── shift ──────────────────────────────────────────────────────────────
  // Приближает не всякий щелчок, а щелчок с shift. Простой щелчок в этом
  // режиме занят: им машину возят, и приближение на него садилось поверх —
  // рука дрогнула, отпустила, и схема прыгнула на ступень вместо того, чтобы
  // остаться там, куда её привезли.
  //
  // Клавишу видно на трёх приборах сразу: курсор становится лупой, рамка
  // вокруг слова shift в подсказке загорается, и щелчок начинает работать.
  function zoomHint() {
    const last = zoomStep === ZOOM_STEPS.length - 1;
    return '<span class="lh-key">shift</span> + клик — '
      + (last ? 'к общему виду' : 'приблизить')
      + ' <span class="lh-scheme">· ×' + ZOOM_STEPS[zoomStep] + '</span>';
  }

  function armZoom(on) {
    rig.classList.toggle('shifted', on && rig.classList.contains('zoom'));
    if (linkHint) linkHint.classList.toggle('armed', on);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Shift') armZoom(true);
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Shift') armZoom(false);
  });
  // Отпустить клавишу можно и в другом окне — тогда keyup сюда не придёт, и
  // курсор остался бы лупой над полем, которое уже не приближает.
  window.addEventListener('blur', function () { armZoom(false); });

  // Щелчок по полю приближает ещё на ступень, а с последней возвращает к
  // первой. Точка под курсором при этом остаётся на месте: без этого
  // приближение уводит взгляд с того, на что смотрели.
  // ── Приближение ────────────────────────────────────────────────────────
  // Ведём его сами, кадр за кадром, а не переходом по ширине. Переход менял
  // размер, а прокрутку доводили после него — всё это время схема ехала вокруг
  // прежней точки, и в конце прыгала на новую. Отсюда и «дёргается», и «зумит
  // в левый верхний угол»: до конца перехода точка под курсором никого не
  // держала. Чтобы она стояла на месте, ширину и прокрутку надо менять в одном
  // кадре — а значит вести обе руками.
  const ZOOM_MS = 340;
  let zoomAnim = null;

  // Границы возят по самой схеме, а не по прокручиваемой области. Область
  // шире машины: перспектива и подписи рисуются за габарит сцены, и браузер
  // считает это содержимым — замерено, при машине в 2337 точек область выходила
  // 3892, то есть полторы тысячи точек пустоты справа. По ней-то и уезжало
  // «вправо бесконечно».
  function scrollMax() {
    const st = rigBody.querySelector('.stage');
    if (!st) return [0, 0];
    return [Math.max(0, st.offsetLeft + st.offsetWidth - rigBody.clientWidth),
            Math.max(0, st.offsetTop + st.offsetHeight - rigBody.clientHeight)];
  }

  function panTo(x, y) {
    const [mx, my] = scrollMax();
    rigBody.scrollLeft = Math.max(0, Math.min(mx, x));
    rigBody.scrollTop = Math.max(0, Math.min(my, y));
  }

  // Границы держим на любом движении поля, а не только на перетаскивании.
  // Рука ходит через panTo и упирается в край схемы, а колесо, тачпад и стрелки
  // идут мимо него — прямо в собственную прокрутку поля. Она шире: снятая
  // крышка лежит сбоку и для браузера остаётся содержимым. Замерено на окне
  // 1440×950 и третьей ступени: схема кончается на 1809, прокрутка пускала до
  // 3969 — две тысячи точек, на которых нет ничего, кроме фона. Оттуда и
  // «сдвинул влево, справа пусто».
  rigBody.addEventListener('scroll', function () {
    if (!rig.classList.contains('zoom')) return;
    const [mx, my] = scrollMax();
    if (rigBody.scrollLeft > mx) rigBody.scrollLeft = mx;
    if (rigBody.scrollTop > my) rigBody.scrollTop = my;
  }, { passive: true });

  function zoomTo(step, cx, cy) {
    const from = ZOOM_STEPS[zoomStep], to = ZOOM_STEPS[step];
    zoomStep = step;
    rig.classList.toggle('zoom-max', step === ZOOM_STEPS.length - 1);
    const r = rigBody.getBoundingClientRect();
    // Точка под курсором в координатах самой схемы: она и обязана остаться
    // неподвижной, как бы ни менялся масштаб.
    const ax = cx - r.left, ay = cy - r.top;
    const px = (rigBody.scrollLeft + ax) / from, py = (rigBody.scrollTop + ay) / from;
    if (zoomAnim) cancelAnimationFrame(zoomAnim);
    const t0 = performance.now();
    (function tick(now) {
      const p = reduced ? 1 : Math.min(1, (now - t0) / ZOOM_MS);
      // Кубическое торможение: масштаб набирается сразу и мягко доводится.
      // Линейный ход читался рывком ровно в конце, когда движение обрывалось.
      const k = from + (to - from) * (1 - Math.pow(1 - p, 3));
      rig.style.setProperty('--zoom', k);
      panTo(px * k - ax, py * k - ay);
      zoomAnim = p < 1 ? requestAnimationFrame(tick) : null;
    })(t0);
  }

  rigBody.addEventListener('click', function (e) {
    if (!rig.classList.contains('zoom') || !e.shiftKey) return;
    // Щелчок по самой машине — это работа с узлом, а не приближение.
    if (e.target.closest('.pick, .unit, a')) return;
    zoomTo((zoomStep + 1) % ZOOM_STEPS.length, e.clientX, e.clientY);
  });

  // Возят машину курсором, как фотографию. Порог в три пикселя отделяет
  // перетаскивание от щелчка: без него всякая попытка приблизить уезжала бы
  // вбок на дрожание руки.
  let drag = null;
  rigBody.addEventListener('pointerdown', function (e) {
    if (!rig.classList.contains('zoom') || e.button) return;
    drag = { x: e.clientX, y: e.clientY,
             left: rigBody.scrollLeft, top: rigBody.scrollTop, moved: false };
  });
  rigBody.addEventListener('pointermove', function (e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    drag.moved = true;
    rig.classList.add('dragging');
    // Возят машину в границах поля: без ограничения прокрутка уходила вправо
    // сколько ни тяни, и схема пропадала за кромкой.
    panTo(drag.left - dx, drag.top - dy);
  });
  function endDrag() {
    if (drag && drag.moved) {
      // Щелчок, родившийся из перетаскивания, приближать не должен.
      const eat = function (ev) { ev.stopPropagation(); };
      rigBody.addEventListener('click', eat, { capture: true, once: true });
    }
    drag = null;
    rig.classList.remove('dragging');
  }
  rigBody.addEventListener('pointerup', endDrag);
  rigBody.addEventListener('pointercancel', endDrag);
  rigBody.addEventListener('pointerleave', endDrag);

  // ── Part numbers of the units ──────────────────────────────────────────
  // Clicking the hash copies it and opens the commit: on a real board a part
  // number is looked up the same way, only in a paper catalogue.
  chassis.addEventListener('click', function (e) {
    const stamp = e.target.closest('a.stamp');
    if (!stamp) return;
    e.preventDefault();
    e.stopPropagation();
    const sha = stamp.dataset.sha;
    if (navigator.clipboard) navigator.clipboard.writeText(sha).catch(function () {});
    line('p/n ' + sha + ' скопирован · открываю коммит', 'ok');
    window.open(stamp.getAttribute('href'), '_blank', 'noopener');
  }, true);   // on capture: otherwise the click goes into taking the machine apart

  // ── Tying a unit to its label ──────────────────────────────────────────
  // The highlight goes both ways: unit ↔ its callout. A class instead of
  // :hover, because the elements sit in different branches of the tree.
  // Кольцо наведения переезжает к узлу и берёт габарит у него самого: своей
  // геометрии у него нет и быть не должно — блоки двигают детали, и второй
  // экземпляр координат промахивался бы на первой же правке. Корзина дисков
  // при этом обводится одним кольцом на восемь отсеков: узлов там восемь, а
  // ссылка одна, и рамка обводит то, куда она ведёт.
  const spotRings = chassis.querySelector('.spot-rings');
  const RING_PAD = 7;
  // Порог слияния соседних рамок. Между отсеками корзины тридцать единиц,
  // между банками памяти сто восемьдесят, между сокетами сто шестьдесят: шаг
  // в шестьдесят отделяет «стоит вплотную» от «стоит в другом конце платы».
  const RING_GAP = 60;

  function ringBoxes(group) {
    const out = [];
    chassis.querySelectorAll('#board [data-group="' + group + '"]').forEach(function (n) {
      const b = n.getBBox();
      out.push([b.x, b.y, b.x + b.width, b.y + b.height]);
    });
    // Рамки, стоящие вплотную, сливаются в одну: восемь отсеков корзины — это
    // одна корзина, и ссылка у них одна. Восемь колец на ней читались бы
    // решёткой, а не обводкой того, куда ведёт бирка. Банки памяти и сокеты
    // стоят порознь и своими кольцами и остаются.
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < out.length && !merged; i++) {
        for (let j = i + 1; j < out.length && !merged; j++) {
          const a = out[i], b = out[j];
          if (a[0] < b[2] + RING_GAP && b[0] < a[2] + RING_GAP &&
              a[1] < b[3] + RING_GAP && b[1] < a[3] + RING_GAP) {
            out[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]),
                      Math.max(a[2], b[2]), Math.max(a[3], b[3])];
            out.splice(j, 1);
            merged = true;
          }
        }
      }
    }
    return out;
  }

  function ringTo(group) {
    if (!spotRings) return;
    // Цвет берём у бирки этого же узла: там он уже объявлен переменной, и
    // таблица «узел — цвет сервиса» остаётся в одном месте, в ink.py.
    const tag = chassis.querySelector('[data-for="' + group + '"]');
    spotRings.style.setProperty('--accent',
      tag ? tag.style.getPropertyValue('--accent') : '');
    spotRings.textContent = '';
    ringBoxes(group).forEach(function (b) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('class', 'spot-ring');
      r.setAttribute('x', b[0] - RING_PAD);
      r.setAttribute('y', b[1] - RING_PAD);
      r.setAttribute('width', b[2] - b[0] + RING_PAD * 2);
      r.setAttribute('height', b[3] - b[1] + RING_PAD * 2);
      r.setAttribute('rx', 9);
      spotRings.appendChild(r);
    });
  }

  function lit(group, on) {
    // Под крышкой не зажигаем ничего: подсветка осталась бы под листом, и
    // получалось бы взаимодействие вслепую — курсор узел находит, а показать
    // это некуда. Гасить наоборот можно всегда: крышку могли вернуть, пока
    // узел был подсвечен.
    if (on && !rig.classList.contains('lid-off')) return;
    chassis.querySelectorAll('[data-group="' + group + '"]').forEach(function (n) {
      n.classList.toggle('lit', on);
    });
    chassis.querySelectorAll('[data-for="' + group + '"]').forEach(function (n) {
      n.classList.toggle('lit', on);
    });
    if (on) ringTo(group);
    rig.classList.toggle('spot', on);
  }
  chassis.querySelectorAll('[data-group], [data-for]').forEach(function (n) {
    const g = n.dataset.group || n.dataset.for;
    n.addEventListener('mouseenter', function () { lit(g, true); });
    n.addEventListener('mouseleave', function () { lit(g, false); });
  });

  // ── Hardware: what the machine tells about itself ──────────────────────
  // The only place where the sensor readings are computed. They used to be
  // computed twice — the gauges in the side column by one formula, the
  // sensors command by another — and the temperatures in them disagreed.

  function metric(key) {
    const on = rig.classList.contains('on');
    const fansOut = chassis.querySelectorAll('.fan.pulled').length;
    const dimmsOut = chassis.querySelectorAll('.dimm.pulled').length;
    const drivesOut = chassis.querySelectorAll('.bay.pulled').length;
    if (!on) {
      // on standby only the BMC is alive: the management network and its draw
      if (key === 'power') return { v: 12 + Math.random() * 2, text: '12 W', warn: false, off: true };
      if (key === 'net') return { v: 0.02, text: '0.02 Gb/s', warn: false, off: true };
      return { v: 0, text: '—', warn: false, off: true };
    }
    switch (key) {
      case 'cpu': {
        const v = 34 + Math.sin(Date.now() / 9000) * 12 + Math.random() * 9;
        return { v: v, text: v.toFixed(0) + ' %', warn: v > 80 };
      }
      case 'temp': {
        const v = 42 + fansOut * 6 + Math.random() * 4;
        return { v: v, text: v.toFixed(0) + ' °C', warn: v > 60 };
      }
      case 'net': {
        const v = 6 + Math.sin(Date.now() / 5200) * 4 + Math.random() * 3;
        return { v: v, text: v.toFixed(1) + ' Gb/s', warn: false };
      }
      case 'iops': {
        const base = 240 - drivesOut * 38;
        const v = Math.max(0, base + Math.sin(Date.now() / 3100) * 60 + Math.random() * 40);
        return { v: v, text: Math.round(v) + 'k', warn: drivesOut > 0 };
      }
      case 'power': {
        // Считается от того, сколько машина сейчас может взять, а не от одного
        // выдуманного числа: предел мощности пакета из прошивки — это потолок
        // для процессоров, и заниженный виден здесь тем же вечером. Остальное —
        // всё, что не процессоры: платы, накопители, вентиляторы.
        const nvv = nvBag();
        const cap = Number(nvv.powerLimit) || (HW.cpu ? HW.cpu.tdp : 0);
        const load = 0.18 + Math.random() * 0.06;
        const v = 96 + cpuState(nvv).sockets * cap * load + fansOut * 26 - dimmsOut * 3;
        return { v: v, text: Math.round(v) + ' W', warn: false };
      }
    }
    return { v: 0, text: '—', warn: false };
  }

  // ── What the machine tells about itself ────────────────────────────────
  // Not a single number in the commands: the make-up comes from the spec,
  // what is in place from the DOM, the settings from NVRAM. There used to be
  // literals here, and the console promised thirty-two DIMMs while twenty
  // four were drawn.

  function counts(sel) {
    return chassis.querySelectorAll(sel).length;
  }

  // Обороты спрашиваются у прошивки: политика охлаждения стоит в меню
  // контроллера управления, и заводить здесь вторую таблицу оборотов нельзя —
  // разъедутся рисунок, звук и эта самая команда. Осторожность та же, что у
  // nvBag в term.js: сборка без экрана обязана работать и без него.
  function fanRpmNow(nv) {
    try { return fanTargetRpm(nv); } catch (e) { return HW.fan ? HW.fan.rpm_nom : 0; }
  }
  function fanPolicyNow(nv) {
    try { return fanPolicyEffective(nv); } catch (e) { return 'Balanced'; }
  }

  function pulledNums(sel, attr) {
    const out = new Set();
    chassis.querySelectorAll(sel).forEach(function (el) { out.add(Number(el.dataset[attr])); });
    return out;
  }

  // DIMMs: how many are in and how many are pulled — by bank, as drawn.
  function dimmState() {
    const total = HW.dimm ? HW.dimm.slots : counts('.dimm');
    const out = counts('.dimm.pulled');
    return { total: total, out: out, in: total - out,
             gb: (total - out) * (HW.dimm ? HW.dimm.size_gb : 0) };
  }

  // There are as many logical processors as the system sees: cores per
  // socket from the spec, cut down by the Active Cores setting, doubled
  // under SMT, and all of that only over the sockets that are in place now.
  function cpuState(nv) {
    const spec = HW.cpu || {};
    const sockets = Math.max(0, (spec.n || 0) - counts('.cpu-slot.pulled'));
    const perSocket = nv && nv.cores && nv.cores !== 'All' ? Number(nv.cores) : (spec.cores || 0);
    const smt = !nv || nv.ht !== 'Disabled';
    return { sockets: sockets, cores: perSocket * sockets,
             threads: perSocket * sockets * (smt ? 2 : 1), smt: smt, spec: spec };
  }

  function upSeconds() {
    return Math.floor((Date.now() - (state.bootAt || t0)) / 1000);
  }

  // ── Event log ──────────────────────────────────────────────────────────
  // sel used to print five unchanging lines, two of which were untrue. Now
  // this is a real log: everything that happens to the machine writes here.
  const SEL_LOG = [];

  function selAdd(text, cls) {
    SEL_LOG.push({ id: 0x12 + SEL_LOG.length, t: text, c: cls || 'ok' });
    if (SEL_LOG.length > 64) SEL_LOG.shift();
  }

  cmd({
    name: 'sel', group: 'СОСТОЯНИЕ', brief: 'журнал событий; чтение снимает защёлку',
    usage: 'sel',
    help: ['Лампа неисправности защёлкивается: узел вернули на место, а она',
           'горит, потому что об отказе никто ещё не узнал. Чтение журнала и',
           'есть это «узнал» — если чинить больше нечего, индикация снимается',
           'сама. Кнопка RESET на панели диагностики гасит её, не читая.'],
    run: function () {
      const cleared = faultLog();
      const head = SEL_LOG.length
        ? [{ t: 'ID      EVENT', c: 'muted' }].concat(SEL_LOG.map(function (e) {
            return { t: '0x' + e.id.toString(16).padStart(4, '0') + '  ' + e.t, c: e.c };
          }))
        : [{ t: 'журнал пуст', c: 'muted' }];
      return head.concat(cleared);
    },
  });

  cmd({
    name: 'status', group: 'СОСТОЯНИЕ', brief: 'питание, крышка, здоровье', usage: 'status',
    run: function (ctx) {
      const cpu = cpuState(ctx.nv);
      const dimm = dimmState();
      const gone = [];
      if (counts('.fan.pulled')) gone.push(counts('.fan.pulled') + ' вент.');
      if (dimm.out) gone.push(dimm.out + ' планок');
      if (counts('.bay.pulled')) gone.push(counts('.bay.pulled') + ' дисков');
      if (counts('.psu.pulled')) gone.push(counts('.psu.pulled') + ' БП');
      if (counts('.riser.pulled')) gone.push(counts('.riser.pulled') + ' райзеров');
      if (counts('.cpu-slot.pulled')) gone.push(counts('.cpu-slot.pulled') + ' ЦП');
      return [
        { t: 'power   : ' + (state.powered ? 'on' : 'standby'), c: state.powered ? 'ok' : 'muted' },
        { t: 'cover   : ' + (rig.classList.contains('lid-off') ? 'removed' : 'in place') },
        { t: 'service : ' + (rig.classList.contains('service') ? 'on' : 'off') },
        { t: 'cpu     : ' + cpu.sockets + '× ' + (cpu.spec.short || '—') + ' · '
             + cpu.cores + 'c/' + cpu.threads + 't всего' },
        { t: 'memory  : ' + dimm.in + ' of ' + dimm.total + ' · ' + (dimm.gb / 1024).toFixed(2) + ' TiB' },
        { t: 'health  : ' + (gone.length ? 'degraded · вынуто: ' + gone.join(', ') : 'ok'),
          c: gone.length ? 'warn' : 'ok' },
      ];
    },
  });

  cmd({
    name: 'sensors', group: 'СОСТОЯНИЕ', brief: 'температуры, обороты, ватты',
    usage: 'sensors [шаблон]', needs: 'power',
    run: function (ctx) {
      const out = counts('.fan.pulled');
      const dimm = dimmState();
      // Датчик живёт в самом процессоре, и у вынутого спрашивать нечего. Пока
      // строка печаталась безусловно, sensors бодро показывал температуру
      // сокета, с которого на схеме снят радиатор, — а /proc/cpuinfo этот же
      // сокет честно пропускал. Две команды об одной машине расходились на
      // глазах.
      const снят = function (n) {
        const s = rig.querySelector('.cpu-slot[data-cpu="' + n + '"]');
        return !!(s && s.classList.contains('pulled'));
      };
      const темп = function (n, dv) {
        return снят(n)
          ? { t: 'CPU' + n + ' Temp      — · радиатор снят', c: 'muted' }
          : { t: 'CPU' + n + ' Temp      ' + Math.round(metric('temp').v - dv) + ' °C',
              c: out ? 'warn' : 'ok' };
      };
      const rows = [
        темп(0, 0),
        темп(1, 2),
        { t: 'Inlet Temp     ' + (21 + Math.round(Math.random() * 2)) + ' °C', c: 'ok' },
        { t: 'Fan Speed      ' + (fanRpmNow(ctx.nv) + out * 1800) + ' RPM', c: out ? 'warn' : 'ok' },
        { t: 'Fan Policy     ' + fanPolicyNow(ctx.nv), c: 'muted' },
        { t: 'PSU Input      ' + Math.round(metric('power').v) + ' W',
          c: counts('.psu.pulled') ? 'warn' : 'ok' },
        { t: 'Pkg Power Cap  ' + (ctx.nv && ctx.nv.powerLimit
             ? ctx.nv.powerLimit + ' W' : HW.cpu.tdp + ' W (auto)'),
          c: ctx.nv && ctx.nv.powerLimit ? 'warn' : 'ok' },
        { t: 'PSU Redundancy ' + (HW.psu.n - counts('.psu.pulled')) + ' of ' + HW.psu.n,
          c: counts('.psu.pulled') ? 'warn' : 'ok' },
        { t: 'DIMM Populated ' + dimm.in + ' of ' + dimm.total, c: dimm.out ? 'warn' : 'ok' },
      ];
      const pat = ctx.args[0];
      return pat ? rows.filter(function (r) { return r.t.toLowerCase().indexOf(pat.toLowerCase()) >= 0; }) : rows;
    },
  });

  cmd({
    name: 'fans', group: 'ЖЕЛЕЗО', brief: 'обороты по модулям', usage: 'fans',
    run: function (ctx) {
      // There are no empty spots in the wall: eight modules, all alive. The
      // old output reported an empty FAN6 bay that never existed.
      const pulled = pulledNums('.fan.pulled', 'fan');
      const base = fanRpmNow(ctx.nv);
      const rows = [];
      for (let n = 0; n < HW.fan.n; n++) {
        if (pulled.has(n)) { rows.push({ t: 'FAN' + (n + 1) + '  —      removed', c: 'warn' }); continue; }
        const rpm = base + pulled.size * 1800 + Math.round(Math.random() * 400);
        rows.push({ t: 'FAN' + (n + 1) + '  ' + rpm + '  RPM  ok', c: 'ok' });
      }
      // Сводной строки здесь нет намеренно: строка на модуль — это контракт,
      // на который опирается `fans | wc -l`, и политика в него не влезает, не
      // сломав счёт. Её место в sensors, рядом с оборотами.
      return rows;
    },
  });

  cmd({
    name: 'dimm', group: 'ЖЕЛЕЗО', brief: 'планки по банкам', usage: 'dimm',
    run: function (ctx) {
      const out = pulledCodes();
      const rows = [];
      HW.dimm.banks.forEach(function (b) {
        let gone = 0;
        for (let i = 0; i < b.n; i++) if (out.has(b.code + i)) gone++;
        const owner = b.cpu === 'split' ? 'CPU0/1' : 'CPU' + b.cpu;
        rows.push({
          t: owner.padEnd(7) + b.ch.padEnd(12) + (b.n - gone) + '/' + b.n + '   '
             + HW.dimm.speed + ' MT/s  ' + HW.dimm.kind + ' ' + HW.dimm.size_gb + 'GB',
          c: gone ? 'warn' : 'ok',
        });
      });
      const d = dimmState();
      const freq = ctx.nv && ctx.nv.memfreq && ctx.nv.memfreq !== 'Auto' ? ctx.nv.memfreq : HW.dimm.speed;
      rows.push({ t: 'Total  ' + d.in + ' of ' + d.total + ' · ' + (d.gb / 1024).toFixed(2)
                     + ' TiB @ ' + freq, c: d.out ? 'warn' : 'ok' });
      return rows;
    },
  });

  function pulledCodes() {
    const out = new Set();
    chassis.querySelectorAll('.dimm.pulled').forEach(function (el) { out.add(el.dataset.dimm); });
    return out;
  }

  cmd({
    name: 'nvme', group: 'ЖЕЛЕЗО', brief: 'накопители в корзине', usage: 'nvme list',
    complete: function (argv, i) { return i === 1 ? ['list'] : []; },
    run: function (ctx) {
      if (ctx.args[0] && ctx.args[0] !== 'list') return [{ t: 'nvme list', c: 'warn' }];
      const gone = pulledNums('.bay.pulled', 'unit');
      const pulledIds = new Set();
      chassis.querySelectorAll('.bay.pulled').forEach(function (el) {
        pulledIds.add(Number(String(el.dataset.unit).replace('hdd', '')));
      });
      return HW.bay.filter(function (b) { return !b.filler; }).map(function (b) {
        if (pulledIds.has(b.bay) || gone.has(b.bay)) {
          return { t: '/dev/nvme' + b.bay + '  —  removed', c: 'warn' };
        }
        return { t: '/dev/nvme' + b.bay + '  ' + b.model.padEnd(21) + b.tb + ' TB  '
                    + b.life + '% life', c: b.kind === 'Optane' ? 'ok' : 'muted' };
      });
    },
  });

  cmd({
    name: 'lscpu', group: 'ЖЕЛЕЗО', brief: 'процессоры и топология', usage: 'lscpu',
    run: function (ctx) {
      const c = cpuState(ctx.nv);
      const numa = ctx.nv && ctx.nv.numa === 'Disabled' ? 1 : c.sockets;
      return [
        { t: 'Architecture        : x86_64' },
        { t: 'CPU(s)              : ' + c.threads },
        { t: 'Thread(s) per core  : ' + (c.smt ? 2 : 1) },
        { t: 'Core(s) per socket  : ' + (c.sockets ? c.cores / c.sockets : 0) },
        { t: 'Socket(s)           : ' + c.sockets, c: c.sockets < (c.spec.n || 0) ? 'warn' : '' },
        { t: 'Model name          : ' + c.spec.model },
        { t: 'CPU max MHz         : ' + Math.round((c.spec.boost || 0) * 1000) },
        { t: 'L3 cache            : ' + c.spec.l3 + ' MiB' },
        { t: 'NUMA node(s)        : ' + Math.max(1, numa) },
      ];
    },
  });

  cmd({
    name: 'lspci', group: 'ЖЕЛЕЗО', brief: 'устройства на шине', usage: 'lspci',
    run: function (ctx) {
      const nv = ctx.nv || {};
      // Скорость линка и разрядность окна — не украшение строки, а то, из-за
      // чего в неё вообще смотрят: карта, которой не досталось окна выше
      // четырёх гигабайт, тут и видна.
      const speed = nv.pcieSpeed && nv.pcieSpeed !== 'Auto' ? nv.pcieSpeed : 'Gen5';
      // We list what is drawn: chips from the spec, drives from the cage,
      // risers with their cards. An empty riser is marked as exactly that.
      const rows = [];
      // Только то, что действительно висит на PCIe. TPM разговаривает по SPI,
      // логика питания по eSPI, гигабитный PHY по MDIO — в выводе lspci их не
      // бывает, и печатать их там значит выдумывать шину.
      const НЕ_PCI = ['SLB9673', 'LCMXO3', 'BCM54210', 'AST2600'];
      HW.chips.filter(function (chip) {
        return НЕ_PCI.indexOf(chip.mark) < 0;
      }).forEach(function (chip, i) {
        rows.push({ t: (i + 1).toString(16).padStart(2, '0') + ':00.0  ' + chip.ref.padEnd(5)
                       + chip.mark, c: 'muted' });
      });
      HW.bay.filter(function (b) { return !b.filler; }).forEach(function (b) {
        rows.push({ t: '17:0' + b.bay + '.0  NVMe  ' + b.model + ' ' + b.tb + ' TB' });
      });
      HW.riser.forEach(function (r) {
        const link = r.link.replace(/Gen\d/, speed);
        rows.push({ t: 'b' + r.slot + ':00.0  PCI bridge · Riser ' + r.slot + ' · ' + link
                       + (r.empty ? ' · пуст' : ' · ' + r.card), c: r.empty ? 'muted' : '' });
        if (r.empty) return;
        if (nv.above4g === 'Disabled') {
          rows.push({ t: '            Region 0: <unassigned> · 64-bit BAR needs Above 4G', c: 'err' });
        } else if (nv.sriov === 'Enabled') {
          rows.push({ t: '            Capabilities: [160] SR-IOV, 64 VFs', c: 'muted' });
        }
      });
      return rows;
    },
  });

  cmd({
    name: 'fru', group: 'ЖЕЛЕЗО', brief: 'паспорт машины', usage: 'fru',
    run: function () {
      const d = dimmState();
      const disks = HW.bay.filter(function (b) { return !b.filler; });
      return [
        { t: 'Manufacturer   : ' + HW.board.vendor },
        { t: 'Product Name   : ' + HW.board.model + ' · ' + HW.board.form },
        { t: 'Board Revision : ' + HW.board.rev },
        { t: 'Serial Number  : ' + HW.board.sha },
        // Ровно то, что напечатано на наклейке FRU у кромки платы. Живой fru
        // с неё и списывают: партномер сменного узла, уровень изменений,
        // страна сборки. Пока их не было, консоль и наклейка отвечали на один
        // вопрос по-разному — а инженер сверяет именно эти две строки.
        { t: 'FRU P/N        : ' + HW.board.sha },
        { t: 'EC Level       : ' + HW.board.rev + 'A' },
        { t: 'Manufacturer   : MADE IN CHINA' },
        { t: 'UUID           : ' + (HW.fw.uuid || '—') },
        { t: 'BIOS Version   : ' + HW.fw.bios + '  (' + HW.fw.bios_date + ')' },
        { t: 'BMC Firmware   : ' + HW.fw.bmc + '  (' + HW.fw.bmc_chip + ')' },
        // На процессор, и это сказано прямо. Строка status печатает то же
        // число, умноженное на сокеты, и, пока обе молчали о том, что считают,
        // машина выглядела спорящей сама с собой: 192c здесь и 384c там.
        { t: 'CPU            : ' + HW.cpu.n + '× ' + HW.cpu.model + ' · ' + HW.cpu.socket
             + ' · ' + HW.cpu.cores + 'c/' + HW.cpu.threads + 't на сокет' },
        { t: 'Memory         : ' + d.total + '× ' + HW.dimm.kind + ' ' + HW.dimm.size_gb
             + 'GB ' + HW.dimm.speed + ' MT/s · ' + (d.total * HW.dimm.size_gb / 1024).toFixed(2) + ' TiB' },
        { t: 'Storage        : ' + disks.length + '× NVMe (' + disks.filter(function (b) {
            return b.kind === 'Optane'; }).length + '× Optane)' },
        { t: 'Network        : ' + HW.ports.sfp + ' · ' + HW.ports.eth + ' · ' + HW.ports.mgmt },
        { t: 'Power          : ' + HW.psu.n + '× ' + HW.psu.watt + ' W ' + HW.psu.model },
        { t: 'Cooling        : ' + HW.fan.n + '× ' + HW.fan.model },
      ];
    },
  });

  cmd({
    name: 'uptime', group: 'СОСТОЯНИЕ', brief: 'сколько работает хост', usage: 'uptime',
    run: function () {
      if (!state.powered) return [{ t: 'standby · хост выключен', c: 'muted' }];
      const s = upSeconds();
      return [{ t: 'up ' + Math.floor(s / 60) + ' min ' + (s % 60) + ' sec · 1 user', c: 'ok' }];
    },
  });

  cmd({
    name: 'whoami', group: 'ОБОЛОЧКА', brief: 'кто в консоли', usage: 'whoami',
    run: function () { return [{ t: 'root', c: 'ok' }]; },
  });

  // ── Control ────────────────────────────────────────────────────────────

  function svcOn(on) {
    if (rig.classList.contains('service') !== on) toggleService();
  }

  cmd({
    name: 'power', group: 'УПРАВЛЕНИЕ', brief: 'питание машины', usage: 'power on|off|cycle',
    complete: function (argv, i) { return i === 1 ? ['on', 'off', 'cycle'] : []; },
    run: function (ctx) {
      const arg = String(ctx.args[0] || '').toLowerCase();
      if (arg === 'off') {
        if (!state.powered) return [{ t: 'уже выключен', c: 'muted' }];
        powerOff();
        return [];
      }
      if (arg === 'on') {
        if (rig.classList.contains('init')) return [{ t: 'power inhibited · bmc init', c: 'warn' }];
        if (state.powered) return [{ t: 'уже работает', c: 'muted' }];
        powerOn();
        return [];
      }
      if (arg === 'cycle') {
        if (!state.powered) { powerOn(); return []; }
        powerOff();
        wait(1000, function () { powerOn(); });
        return [];
      }
      return [{ t: 'power on|off|cycle', c: 'warn' }];
    },
  });

  cmd({
    name: 'reboot', group: 'УПРАВЛЕНИЕ', brief: 'перезагрузить хост', usage: 'reboot',
    needs: 'power',
    run: function () {
      powerOff();
      wait(1200, function () { powerOn(); });
      return [{ t: 'graceful shutdown …', c: 'muted' }];
    },
  });

  cmd({
    name: 'service', group: 'УПРАВЛЕНИЕ', brief: 'сервисный режим', usage: 'service on|off',
    complete: function (argv, i) { return i === 1 ? ['on', 'off'] : []; },
    run: function (ctx) {
      const arg = String(ctx.args[0] || '').toLowerCase();
      if (arg !== 'on' && arg !== 'off') return [{ t: 'service on|off', c: 'warn' }];
      svcOn(arg === 'on');
      return [];
    },
  });

  cmd({
    name: 'id', group: 'УПРАВЛЕНИЕ', brief: 'опознание в стойке', usage: 'id on|off',
    complete: function (argv, i) { return i === 1 ? ['on', 'off'] : []; },
    run: function (ctx) {
      const arg = String(ctx.args[0] || '').toLowerCase();
      if (arg !== 'on' && arg !== 'off') return [{ t: 'id on|off', c: 'warn' }];
      if (rig.classList.contains('identify') !== (arg === 'on')) toggleIdentify();
      return [];
    },
  });

  cmd({
    name: 'lightpath', group: 'УПРАВЛЕНИЕ', brief: 'панель диагностики', usage: 'lightpath',
    run: function () { toggleLp(); return []; },
  });

  // Links: there is no separate command with a list any more — open without
  // an argument prints the addresses, with an argument it opens one. The
  // same list lies in /home/cosmdandy/links.txt and so it pipes.
  const LINKS = {
    blog: 'https://blog.cosmdandy.dev',
    cv: 'https://cv.cosmdandy.dev',
    github: 'https://github.com/cosmdandy',
    linkedin: 'https://linkedin.com/in/cosmdandy',
    telegram: 'https://cosmdandy.dev/tg/',
    email: 'mailto:i@cosmdandy.dev',
  };

  cmd({
    name: 'open', group: 'ОБОЛОЧКА', brief: 'адреса разделов; open <имя> — открыть',
    usage: 'open [blog|cv|github|linkedin|telegram|email]',
    complete: function (argv, i) { return i === 1 ? Object.keys(LINKS) : []; },
    run: function (ctx) {
      const key = String(ctx.args[0] || '').toLowerCase();
      if (!key) {
        return Object.keys(LINKS).map(function (k) {
          return { t: k.padEnd(9) + LINKS[k], c: 'muted' };
        });
      }
      if (!LINKS[key]) return [{ t: 'нет такого раздела · open', c: 'warn' }];
      window.open(LINKS[key], '_blank', 'noopener');
      return [{ t: LINKS[key], c: 'ok' }];
    },
  });

  // ── File system: what you see once on the host over the console ────────
  // The same principle as the machine's spec: the spec is what hardware is
  // fitted, the DOM is what of it is in place right now, NVRAM is how it is
  // configured. The tree below keeps no numbers of its own — for every leaf
  // file it reads all three sources afresh. Not "/proc/cpuinfo was counted
  // once when the tree was built", but "/proc/cpuinfo is a function that on
  // every cat looks at HW, DOM and nv". Pull a DIMM and ask for dimm —
  // meminfo sees the pulled one at once, with no separate sync step.
  //
  // A directory is a plain object { name: node }: fsBuildRoot builds the
  // tree anew on every command call, so the contents of a directory (which
  // nvme are left in /dev, which psu in /sys) are fresh too. A leaf file is
  // a function: it is no longer recomputed while the tree is built, it is
  // called by the commands themselves (cat/head/tail/…) at the moment its
  // contents are really needed.
  //
  // The names of all the helpers here are deliberately prefixed with fs — this
  // file is spliced into the common IIFE together with the other parts
  // (screen.*, term.js), which are edited in parallel and have no namespace of
  // their own. This part starts no short shared names like resolve/splitArgs,
  // so as not to collide with whatever the neighbours define.

  let fsCurCwd = '/home/cosmdandy';   // cwd snapshot — needed by complete(), which has no ctx
  let fsCurNv = {};
  const fsBoot = Date.now();          // the host "came up" — uptime is counted from here

  function fsFile(reader, opts) {
    opts = opts || {};
    return { type: 'file', mode: opts.mode || '-rw-r--r--',
             owner: opts.owner || 'root', group: opts.group || 'root', read: reader };
  }
  function fsDir(kids, opts) {
    opts = opts || {};
    return { type: 'dir', mode: opts.mode || 'drwxr-xr-x',
             owner: opts.owner || 'root', group: opts.group || 'root', kids: kids };
  }

  // ── State from the DOM: what is physically in place ─────────────────────
  function fsFansOut() { return chassis.querySelectorAll('.fan.pulled').length; }
  function fsDimmsOut() { return chassis.querySelectorAll('.dimm.pulled').length; }
  function fsBayPulled(i) { return !!chassis.querySelector('.bay.pulled[data-unit="hdd' + i + '"]'); }
  function fsCpuPulled(n) { return !!chassis.querySelector('.cpu-slot.pulled[data-cpu="' + n + '"]'); }
  function fsRiserPulled(k) { return !!chassis.querySelector('.riser.pulled[data-riser="' + k + '"]'); }
  function fsPsuPulled(k) { return !!chassis.querySelector('.psu.pulled[data-psu="' + k + '"]'); }
  function fsEfiPresent(ctx) { return (ctx.nv || {}).mode !== 'Legacy'; }

  // How many logical CPUs the OS sees right now — a common place for cpuinfo,
  // cmdline (nr_cpus) and nodeN/cpulist, so the three files do not diverge in
  // their numbers.
  function fsLogicalPerSocket(ctx) {
    const nv = ctx.nv || {};
    const cpu = ctx.HW.cpu || {};
    const coresPerSocket = (nv.cores && nv.cores !== 'All') ? Number(nv.cores) : (cpu.cores || 0);
    return coresPerSocket * (nv.ht === 'Enabled' ? 2 : 1);
  }
  function fsSocketsUp(ctx) {
    const total = (ctx.HW.cpu || {}).n || 0;
    let up = 0;
    for (let s = 0; s < total; s++) if (!fsCpuPulled(s)) up++;
    return up;
  }
  function fsTotalLogical(ctx) { return fsLogicalPerSocket(ctx) * fsSocketsUp(ctx); }

  // Адрес интерфейса. Нулевое смещение отдано контроллеру управления, дальше
  // идут порты машины: eth0 получает +4. Пока сдвига не было, eth0 и BMC
  // показывали один и тот же MAC — на живой машине это разные блоки, им и
  // выделяют разные диапазоны при производстве.
  const MAC_ПОРТЫ = 4;

  function fsMac(ctx, idx, свой) {
    const mac = (ctx.HW.fw || {}).mac || '00:00:00:00:00:00';
    const parts = mac.split(':');
    const last = (parseInt(parts[5], 16) + idx + (свой ? 0 : MAC_ПОРТЫ)) & 0xff;
    parts[5] = last.toString(16).padStart(2, '0');
    return parts.join(':');
  }

  // ── /proc ────────────────────────────────────────────────────────────
  function fsProcCpuinfo(ctx) {
    return function () {
      const cpu = ctx.HW.cpu || {};
      const socketsTotal = cpu.n || 0;
      const perSocket = fsLogicalPerSocket(ctx);
      const coresPerSocket = (ctx.nv && ctx.nv.cores && ctx.nv.cores !== 'All')
        ? Number(ctx.nv.cores) : (cpu.cores || 0);
      const lines = [];
      let idx = 0;
      for (let s = 0; s < socketsTotal; s++) {
        if (fsCpuPulled(s)) continue;               // heatsink off — the socket is silent
        for (let t = 0; t < perSocket; t++) {
          lines.push({ t: 'processor\t: ' + idx });
          lines.push({ t: 'vendor_id\t: AuthenticAMD' });
          lines.push({ t: 'model name\t: ' + (cpu.model || '') });
          lines.push({ t: 'cpu MHz\t\t: ' + ((cpu.base || 0) * 1000).toFixed(3) });
          lines.push({ t: 'cache size\t: ' + ((cpu.l3 || 0) * 1024) + ' KB' });
          lines.push({ t: 'physical id\t: ' + s });
          lines.push({ t: 'siblings\t: ' + perSocket });
          lines.push({ t: 'core id\t\t: ' + (t % Math.max(1, coresPerSocket)) });
          lines.push({ t: 'cpu cores\t: ' + coresPerSocket });
          lines.push({ t: '' });
          idx++;
        }
      }
      if (!idx) lines.push({ t: 'нет ни одного активного сокета · оба радиатора сняты', c: 'warn' });
      return lines;
    };
  }

  // Сколько памяти прошивка оставила системе. Считает это memPlan в screen.js,
  // и второй такой же арифметики здесь заводить нельзя — она бы разошлась с
  // экраном на первой же правке. Осторожность та же, что у nvBag: сборка без
  // экрана обязана работать.
  function fsMemUsableGb(ctx, installedGb) {
    try { return memPlan(ctx.nv).gb; } catch (e) { return installedGb; }
  }

  function fsProcMeminfo(ctx) {
    return function () {
      const dimm = ctx.HW.dimm || {};
      const present = Math.max(0, (dimm.slots || 0) - fsDimmsOut());
      // Система видит не то, что вставлено, а то, что ей оставила прошивка:
      // зеркало и резервный ранг забирают половину, и MemTotal падает вдвое —
      // ровно там же, где падает Usable Memory на экране Main.
      const gb = fsMemUsableGb(ctx, present * (dimm.size_gb || 0));
      const totalKB = gb * 1024 * 1024;
      const freeKB = Math.round(totalKB * 0.13);
      const buffKB = Math.round(totalKB * 0.02);
      const cacheKB = Math.round(totalKB * 0.22);
      function row(name, kb) { return { t: (name + ':').padEnd(16) + String(kb).padStart(12) + ' kB' }; }
      return [
        row('MemTotal', totalKB),
        row('MemFree', freeKB),
        row('MemAvailable', freeKB + cacheKB),
        row('Buffers', buffKB),
        row('Cached', cacheKB),
      ];
    };
  }

  function fsProcUptime() {
    return function () {
      const sec = state.powered ? (Date.now() - fsBoot) / 1000 : 0;
      return [{ t: sec.toFixed(2) + ' ' + (sec * 0.62).toFixed(2) }];
    };
  }

  function fsProcLoadavg(ctx) {
    return function () {
      if (!state.powered) return [{ t: '0.00 0.00 0.00 0/1 1' }];
      const n = Math.max(1, fsTotalLogical(ctx));
      const base = 0.15 + fsFansOut() * 0.08;
      const running = 1 + (fsFansOut() > 0 ? 1 : 0);
      return [{ t: base.toFixed(2) + ' ' + (base * 0.9).toFixed(2) + ' ' + (base * 0.75).toFixed(2)
                   + ' ' + running + '/' + (n * 2) + ' ' + (1000 + n) }];
    };
  }

  function fsProcVersion(ctx) {
    return function () {
      const board = ctx.HW.board || {};
      const fw = ctx.HW.fw || {};
      return [{ t: 'Linux version 6.9.12-cd93 (build@cd93) (gcc (GCC) 13.2.0) #'
                   + (board.rev || 1) + ' SMP PREEMPT_DYNAMIC ' + (fw.bios_date || '') }];
    };
  }

  function fsProcCmdline(ctx) {
    return function () {
      const nv = ctx.nv || {};
      // Скорость консоли в строке ядра — та же, что стоит в перенаправлении
      // консоли: их выставляют вместе, и разъехавшись, они дают ровно ту немую
      // консоль, из-за которой к стойке идут с тележкой и монитором.
      const baud = nv.sol === 'Enabled' && nv.solBaud ? nv.solBaud : '115200';
      let s = 'BOOT_IMAGE=/vmlinuz-6.9.12-cd93 root=UUID=93cd0000-0000-0000-0000-000000000001 '
            + 'ro quiet console=ttyS0,' + baud + 'n8';
      if (nv.cores && nv.cores !== 'All') s += ' nr_cpus=' + fsTotalLogical(ctx);
      if (nv.numa === 'Disabled') s += ' numa=off';
      if (nv.iommu === 'Disabled') s += ' amd_iommu=off';
      return [{ t: s }];
    };
  }

  function fsProcDevices() {
    return function () {
      return [
        { t: 'Character devices:' },
        { t: '  1 mem' }, { t: '  4 /dev/vc/0' }, { t: '  4 tty' }, { t: '  4 ttyS' },
        { t: ' 10 misc' }, { t: '189 usb_device' },
        { t: '' },
        { t: 'Block devices:' },
        { t: '  8 sd' }, { t: '259 blkext' }, { t: '259 nvme' },
      ];
    };
  }

  // ── /sys ─────────────────────────────────────────────────────────────
  function fsHwmonEntries() {
    // Three sensors from the machine's spec: the CPU package, the drives,
    // the chassis intake. They rise with the number of pulled fans — by the
    // same rule the temperature column in the gauges used to be computed by
    // (42 + missing*6 °C).
    const fo = fsFansOut();
    const defs = [
      { dir: 'hwmon0', name: 'k10temp', base: 42000, per: 6000 },
      { dir: 'hwmon1', name: 'nvme', base: 34000, per: 2000 },
      { dir: 'hwmon2', name: 'cd93_bmc', base: 27000, per: 1500 },
    ];
    const kids = {};
    defs.forEach(function (d) {
      kids[d.dir] = fsDir({
        name: fsFile(function () { return [{ t: d.name }]; }),
        temp1_input: fsFile(function () {
          const v = state.powered ? d.base + fo * d.per : Math.round(d.base * 0.4);
          return [{ t: String(v) }];
        }),
      });
    });
    return kids;
  }

  // По группе на процессор, как их и заводит AMD-Vi: сокет вынули — группа
  // пропала вместе с ним. Выключенная в прошивке трансляция не оставляет ни
  // одной, и каталог оказывается пустым.
  function fsIommuEntries(ctx) {
    const kids = {};
    if ((ctx.nv || {}).iommu === 'Disabled') return kids;
    const cpu = ctx.HW.cpu || {};
    const present = Math.max(0, (cpu.n || 0) - chassis.querySelectorAll('.cpu-slot.pulled').length);
    for (let i = 0; i < present; i++) {
      kids['ivhd' + i] = fsDir({
        type: fsFile(function () { return [{ t: 'AMD-Vi' }]; }),
      });
    }
    return kids;
  }

  function fsNetEntries(ctx) {
    // SFP+ lives on the card in the top riser (data-riser="1") — pull that
    // out and the ports disappear from /sys/class/net along with the card.
    const kids = {};
    ['eth0', 'eth1'].forEach(function (name, idx) {
      kids[name] = fsDir({
        address: fsFile(function () { return [{ t: fsMac(ctx, idx) }]; }),
        operstate: fsFile(function () { return [{ t: state.powered ? 'up' : 'down' }]; }),
      });
    });
    if (!fsRiserPulled('1')) {
      ['sfp0', 'sfp1'].forEach(function (name, idx) {
        kids[name] = fsDir({
          address: fsFile(function () { return [{ t: fsMac(ctx, idx + 2) }]; }),
          operstate: fsFile(function () { return [{ t: state.powered ? 'up' : 'down' }]; }),
        });
      });
    }
    return kids;
  }

  function fsPowerSupplyEntries() {
    const kids = {};
    ['1', '2'].forEach(function (k) {
      if (fsPsuPulled(k)) return;                 // a pulled supply is dead and gone
      kids['PSU' + k] = fsDir({
        online: fsFile(function () { return [{ t: state.powered ? '1' : '0' }]; }),
        type: fsFile(function () { return [{ t: 'Mains' }]; }),
      });
    });
    return kids;
  }

  function fsNodeEntries(ctx) {
    const numaOn = (ctx.nv || {}).numa !== 'Disabled';
    const total = Math.max(1, fsTotalLogical(ctx));
    const half = numaOn ? Math.floor(total / 2) : total;
    const kids = { node0: fsDir({ cpulist: fsFile(function () { return [{ t: '0-' + (half - 1) }]; }) }) };
    if (numaOn) {
      kids.node1 = fsDir({ cpulist: fsFile(function () { return [{ t: half + '-' + (total - 1) }]; }) });
    }
    return kids;
  }

  // ── /dev ─────────────────────────────────────────────────────────────
  function fsDevEntries(ctx) {
    const kids = {
      'null': fsFile(function () { return []; }, { mode: 'crw-rw-rw-' }),
      'zero': fsFile(function () { return []; }, { mode: 'crw-rw-rw-' }),
      'console': fsFile(function () { return []; }, { mode: 'crw--w----' }),
    };
    (ctx.HW.bay || []).filter(function (b) { return !b.filler; }).forEach(function (b, idx) {
      if (fsBayPulled(b.bay)) return;              // caddy pulled — no /dev/nvmeN either
      kids['nvme' + idx + 'n1'] = fsFile(function () {
        return [{ t: (b.model || '') + ' · ' + b.tb + ' TB · life ' + b.life + '%' }];
      }, { mode: 'brw-rw----' });
    });
    return kids;
  }

  // ── /etc ─────────────────────────────────────────────────────────────
  function fsEtcEntries(ctx) {
    const board = ctx.HW.board || {};
    const fw = ctx.HW.fw || {};
    const fan = ctx.HW.fan || {};
    const nv = ctx.nv || {};
    return {
      hostname: fsFile(function () { return [{ t: 'cd93' }]; }),
      'os-release': fsFile(function () {
        return [
          { t: 'NAME="CD93 Linux"' },
          { t: 'ID=cd93' },
          { t: 'VERSION_ID="' + (board.rev || 0) + '"' },
          { t: 'PRETTY_NAME="CD93 Linux (rev ' + (board.rev || 0) + ', ' + (board.sha || '').slice(0, 7) + ')"' },
          { t: 'HOME_URL="https://cosmdandy.dev"' },
        ];
      }),
      passwd: fsFile(function () {
        return [
          { t: 'root:x:0:0:root:/root:/bin/bash' },
          { t: 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin' },
          { t: 'bin:x:2:2:bin:/bin:/usr/sbin/nologin' },
          { t: 'cosmdandy:x:1000:1000:Timofey Kondrashin:/home/cosmdandy:/bin/bash' },
        ];
      }),
      fstab: fsFile(function () {
        const lines = [
          { t: 'UUID=93cd0000-0000-0000-0000-000000000001  /      ext4  defaults  0 1' },
          { t: 'UUID=93cd0000-0000-0000-0000-000000000002  swap   swap  defaults  0 0' },
          { t: 'UUID=93cd0000-0000-0000-0000-000000000003  /home  ext4  defaults  0 2' },
        ];
        if (nv.mode !== 'Legacy') lines.splice(1, 0, { t: 'UUID=93CD-EF10  /boot/efi  vfat  umask=0077  0 1' });
        return lines;
      }),
      hosts: fsFile(function () {
        return [
          { t: '127.0.0.1   localhost' },
          { t: '::1         localhost' },
          { t: (fw.ip || '0.0.0.0') + '  cd93 cd93.local' },
        ];
      }),
      motd: fsFile(function () {
        return [
          { t: 'Welcome to ' + (board.model || 'CD93') + ' (' + (board.form || '1U') + ')' },
          { t: 'CosmDandy homelab · this box is a prop, the numbers are real' },
        ];
      }),
      'imm.conf': fsFile(function () {
        return [
          { t: 'bmc.firmware = ' + (fw.bmc || '') },
          { t: 'bmc.chip     = ' + (fw.bmc_chip || '') },
          { t: 'bmc.mac      = ' + (fw.mac || '') },   // свой адрес, порты машины идут после
          { t: 'bmc.ip       = ' + (fw.ip || '') },
        ];
      }),
      'fan.conf': fsFile(function () {
        return [
          { t: 'fan.count       = ' + (fan.n || 0) },
          { t: 'fan.model       = ' + (fan.model || '') },
          { t: 'fan.rpm_nominal = ' + (fan.rpm_nom || 0) },
          { t: 'fan.rpm_max     = ' + (fan.rpm_max || 0) },
        ];
      }),
      network: fsDir({
        interfaces: fsFile(function () {
          const lines = [
            { t: 'auto eth0' }, { t: 'iface eth0 inet static' },
            { t: '    address ' + (fw.ip || '0.0.0.0') }, { t: '    netmask 255.255.255.0' },
            { t: '' }, { t: 'auto eth1' }, { t: 'iface eth1 inet manual' },
          ];
          if (!fsRiserPulled('1')) {
            lines.push({ t: '' }, { t: 'auto sfp0' }, { t: 'iface sfp0 inet manual' },
                        { t: '' }, { t: 'auto sfp1' }, { t: 'iface sfp1 inet manual' });
          }
          return lines;
        }),
      }),
    };
  }

  // ── /var/log ─────────────────────────────────────────────────────────
  function fsVarMessages() {
    return function () {
      const kids = log ? Array.from(log.children) : [];
      if (!kids.length) return [{ t: 'messages: пусто · лог обнулили командой clear', c: 'muted' }];
      return kids.map(function (el, i) {
        const cls = el.className || '';
        const sev = cls === 'err' ? 'err' : cls === 'warn' ? 'warning' : 'info';
        const stamp = 'Jul 31 00:' + String(i % 60).padStart(2, '0') + ':00';
        return { t: stamp + ' cd93 board[1]: <' + sev + '> ' + el.textContent, c: cls };
      });
    };
  }

  function fsVarDmesg(ctx) {
    return function () {
      const kids = log ? Array.from(log.children) : [];
      // POST prints on its own, unasked: so its output is the tail of the
      // log after the last typed command ("$ …"), not the whole history at
      // once.
      let cut = 0;
      for (let i = kids.length - 1; i >= 0; i--) {
        if ((kids[i].textContent || '').indexOf('$ ') === 0) { cut = i + 1; break; }
      }
      const tail = kids.slice(cut);
      if (tail.length) {
        return tail.map(function (el, i) {
          return { t: '[' + (i * 0.31).toFixed(6).padStart(11, ' ') + '] ' + el.textContent, c: el.className || '' };
        });
      }
      // A stand-in for an empty log: the same numbers sensors/dimm/nvme use
      // — the spec and the DOM, not made-up literals.
      const cpu = ctx.HW.cpu || {};
      const dimm = ctx.HW.dimm || {};
      const bays = (ctx.HW.bay || []).filter(function (b) { return !b.filler; });
      const dimmIn = (dimm.slots || 0) - fsDimmsOut();
      const bayIn = bays.filter(function (b) { return !fsBayPulled(b.bay); }).length;
      return [
        { t: '[    0.000000] Linux version 6.9.12-cd93', c: 'muted' },
        { t: '[    0.412000] smp: ' + (cpu.n || 0) + ' × ' + (cpu.short || '') + ' detected', c: 'ok' },
        { t: '[    1.203000] DDR5 populated: ' + dimmIn + ' of ' + (dimm.slots || 0), c: dimmIn < (dimm.slots || 0) ? 'warn' : 'ok' },
        { t: '[    2.870000] nvme: ' + bayIn + ' of ' + bays.length + ' devices online', c: bayIn < bays.length ? 'warn' : 'ok' },
        { t: '[    3.001000] handoff to host', c: 'muted' },
      ];
    };
  }

  // ── /home/cosmdandy ──────────────────────────────────────────────────
  function fsHomeEntries() {
    const opts = { owner: 'cosmdandy', group: 'cosmdandy' };
    return {
      README: fsFile(function () {
        return [
          { t: 'cosmdandy @ CD93-FS1' }, { t: '' },
          { t: 'DevOps engineer. This box is a browser prop for the homepage —' },
          { t: 'the paperwork on it (fru, dmidecode-style output) is real.' }, { t: '' },
          { t: 'See links.txt for where to actually find me.' },
        ];
      }, opts),
      'links.txt': fsFile(function () {
        return [
          { t: 'github     https://github.com/cosmdandy' },
          { t: 'blog       https://blog.cosmdandy.dev' },
          { t: 'cv         https://cv.cosmdandy.dev' },
          { t: 'linkedin   https://linkedin.com/in/cosmdandy' },
          { t: 'telegram   https://cosmdandy.dev/tg/' },
          { t: 'x          https://x.com/cosmdandy' },
          { t: 'email      i@cosmdandy.dev' },
        ];
      }, opts),
      '.profile': fsFile(function () {
        return [
          { t: '# ~/.profile' },
          { t: 'export EDITOR=vim' },
          { t: 'export PS1="\\u@cd93:\\w\\$ "' },
        ];
      }, opts),
    };
  }

  // ── The whole tree ───────────────────────────────────────────────────
  function fsBuildRoot(ctx) {
    return fsDir({
      proc: fsDir({
        cpuinfo: fsFile(fsProcCpuinfo(ctx)),
        meminfo: fsFile(fsProcMeminfo(ctx)),
        uptime: fsFile(fsProcUptime()),
        loadavg: fsFile(fsProcLoadavg(ctx)),
        version: fsFile(fsProcVersion(ctx)),
        cmdline: fsFile(fsProcCmdline(ctx)),
        devices: fsFile(fsProcDevices()),
      }, { mode: 'dr-xr-xr-x' }),
      sys: fsDir({
        class: fsDir({
          hwmon: fsDir(fsHwmonEntries()),
          // Каталога iommu нет вовсе, если трансляция адресов выключена в
          // прошивке: ядро не создаёт его пустым, а просто не создаёт. Так это
          // и проверяют — ls, а не grep по логу.
          iommu: fsDir(fsIommuEntries(ctx)),
          net: fsDir(fsNetEntries(ctx)),
          power_supply: fsDir(fsPowerSupplyEntries()),
        }),
        devices: fsDir({ system: fsDir({ node: fsDir(fsNodeEntries(ctx)) }) }),
        firmware: fsEfiPresent(ctx)
          ? fsDir({ efi: fsDir({ fw_platform_size: fsFile(function () { return [{ t: '64' }]; }) }) })
          : fsDir({}),
      }),
      dev: fsDir(fsDevEntries(ctx)),
      etc: fsDir(fsEtcEntries(ctx)),
      var: fsDir({ log: fsDir({ messages: fsFile(fsVarMessages()), dmesg: fsFile(fsVarDmesg(ctx)) }) }),
      home: fsDir({ cosmdandy: fsDir(fsHomeEntries(), { owner: 'cosmdandy', group: 'cosmdandy' }) }),
    });
  }

  // ── Paths: absolute, relative, ., .., ~ ─────────────────────────────────
  function fsResolve(p, cwd) {
    if (!p) p = '.';
    if (p === '~') p = '/home/cosmdandy';
    else if (p.indexOf('~/') === 0) p = '/home/cosmdandy/' + p.slice(2);
    const base = p.charAt(0) === '/' ? p : cwd + '/' + p;
    const out = [];
    base.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') { out.pop(); return; }
      out.push(seg);
    });
    return '/' + out.join('/');
  }

  function fsLookup(root, path) {
    if (path === '/') return root;
    const segs = path.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < segs.length; i++) {
      if (!node || node.type !== 'dir' || !node.kids[segs[i]]) return null;
      node = node.kids[segs[i]];
    }
    return node;
  }

  function fsLastSeg(path) {
    const segs = path.split('/').filter(Boolean);
    return segs.length ? segs[segs.length - 1] : '/';
  }

  // ── Arguments: -x, -x value, -xVALUE, combined -la ─────────────────────
  function fsSplitArgs(args, valueFlags) {
    valueFlags = valueFlags || {};
    const flags = {};
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.charAt(0) !== '-' || a === '-') { rest.push(a); continue; }
      const bare = a.replace(/^-+/, '');
      if (valueFlags[bare]) { flags[bare] = args[++i]; continue; }
      const glued = /^([a-zA-Z])(\d+)$/.exec(bare);
      if (glued && valueFlags[glued[1]]) { flags[glued[1]] = glued[2]; continue; }
      for (let c = 0; c < bare.length; c++) flags[bare.charAt(c)] = true;
    }
    return { flags: flags, rest: rest };
  }

  function fsGlobToRe(glob) {
    const body = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + body + '$');
  }

  function fsByteSize(lines) {
    return lines.reduce(function (n, l) { return n + (l.t ? l.t.length : 0) + 1; }, 0);
  }

  function fsLsLine(name, node) {
    const isDir = node.type === 'dir';
    const size = isDir ? 4096 : fsByteSize(node.read());
    return { t: node.mode + ' 1 ' + node.owner + ' ' + node.group + ' '
                + String(size).padStart(8) + ' Jul 30 00:00 ' + name + (isDir ? '/' : ''),
             c: isDir ? 'ok' : '' };
  }

  // Every command takes a fresh snapshot of cwd/nv for complete(), which by
  // contract has no ctx — and only then builds the tree and does its work.
  function fsWithState(fn) {
    return function (ctx) {
      fsCurCwd = ctx.cwd;
      fsCurNv = ctx.nv || {};
      return fn(ctx);
    };
  }

  function fsPathComplete(argv, i) {
    const partial = argv[i] || '';
    const slash = partial.lastIndexOf('/');
    const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : '';
    const namePart = slash >= 0 ? partial.slice(slash + 1) : partial;
    const root = fsBuildRoot({ nv: fsCurNv, HW: HW });
    const path = fsResolve(dirPart || '.', fsCurCwd);
    const node = fsLookup(root, path);
    if (!node || node.type !== 'dir') return [];
    return Object.keys(node.kids).filter(function (n) { return n.indexOf(namePart) === 0; })
      .map(function (n) { return dirPart + n + (node.kids[n].type === 'dir' ? '/' : ''); });
  }

  // ── Commands ─────────────────────────────────────────────────────────
  cmd({
    name: 'ls', group: 'ФАЙЛЫ', brief: 'содержимое каталога', usage: 'ls [-l] [-a] [путь]',
    needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      const root = fsBuildRoot(ctx);
      const parsed = fsSplitArgs(ctx.args, {});
      const target = parsed.rest[0] || ctx.cwd;
      const path = fsResolve(target, ctx.cwd);
      const node = fsLookup(root, path);
      if (!node) return [{ t: 'ls: ' + target + ': No such file or directory', c: 'err' }];
      if (node.type === 'file') return [parsed.flags.l ? fsLsLine(fsLastSeg(path), node) : { t: fsLastSeg(path) }];
      let names = Object.keys(node.kids).sort();
      // A dot and two dots are directory entries like all the others, and
      // with -a they are shown. Without them ls -a looked like ls, only
      // longer.
      const dots = {};
      if (parsed.flags.a) {
        const up = path === '/' ? path : path.replace(/\/[^/]+$/, '') || '/';
        dots['.'] = node;
        dots['..'] = fsLookup(root, up) || node;
        names = ['.', '..'].concat(names);
      } else {
        names = names.filter(function (n) { return n.charAt(0) !== '.'; });
      }
      if (!names.length) return [];
      const pick = function (n) { return dots[n] || node.kids[n]; };
      if (parsed.flags.l) {
        return [{ t: 'total ' + names.length, c: 'muted' }]
          .concat(names.map(function (n) { return fsLsLine(n, pick(n)); }));
      }
      return [{ t: names.join('  ') }];
    }),
  });

  cmd({
    name: 'cd', group: 'ФАЙЛЫ', brief: 'сменить каталог', usage: 'cd [путь]',
    needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      const root = fsBuildRoot(ctx);
      const target = ctx.args[0] || '~';
      const path = fsResolve(target, ctx.cwd);
      const node = fsLookup(root, path);
      if (!node) return [{ t: 'cd: ' + target + ': No such file or directory', c: 'err' }];
      if (node.type !== 'dir') return [{ t: 'cd: ' + target + ': Not a directory', c: 'err' }];
      ctx.setCwd(path);
      fsCurCwd = path;
      return [];
    }),
  });

  cmd({
    name: 'pwd', group: 'ФАЙЛЫ', brief: 'текущий каталог', usage: 'pwd', needs: 'power',
    run: fsWithState(function (ctx) { return [{ t: ctx.cwd }]; }),
  });

  cmd({
    name: 'cat', group: 'ФАЙЛЫ', brief: 'вывести файл', usage: 'cat <файл...>', needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      if (!ctx.args.length) return ctx.stdin || [];
      const root = fsBuildRoot(ctx);
      let out = [];
      ctx.args.forEach(function (a) {
        const node = fsLookup(root, fsResolve(a, ctx.cwd));
        if (!node) { out.push({ t: 'cat: ' + a + ': No such file or directory', c: 'err' }); return; }
        if (node.type === 'dir') { out.push({ t: 'cat: ' + a + ': Is a directory', c: 'err' }); return; }
        out = out.concat(node.read());
      });
      return out;
    }),
  });

  // head and tail are one and the same filter, only the end they take
  // differs: as pipeline filters they cut ctx.stdin, as file commands the
  // lines read out of the tree.
  function fsHeadTail(fromEnd) {
    return fsWithState(function (ctx) {
      const label = fromEnd ? 'tail' : 'head';
      const parsed = fsSplitArgs(ctx.args, { n: true });
      const n = parsed.flags.n ? Number(parsed.flags.n) : 10;
      let lines;
      if (ctx.stdin) {
        lines = ctx.stdin;
      } else {
        if (!parsed.rest.length) return [{ t: label + ': нет ни файла, ни ввода по конвейеру', c: 'err' }];
        const root = fsBuildRoot(ctx);
        const node = fsLookup(root, fsResolve(parsed.rest[0], ctx.cwd));
        if (!node) return [{ t: label + ': ' + parsed.rest[0] + ': No such file or directory', c: 'err' }];
        if (node.type === 'dir') return [{ t: label + ': ' + parsed.rest[0] + ': Is a directory', c: 'err' }];
        lines = node.read();
      }
      return fromEnd ? lines.slice(-n) : lines.slice(0, n);
    });
  }
  cmd({
    name: 'head', group: 'ФАЙЛЫ', brief: 'первые строки', usage: 'head [-n N] <файл>', needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); }, run: fsHeadTail(false),
  });
  cmd({
    name: 'tail', group: 'ФАЙЛЫ', brief: 'последние строки', usage: 'tail [-n N] <файл>', needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); }, run: fsHeadTail(true),
  });

  cmd({
    name: 'grep', group: 'ФАЙЛЫ', brief: 'фильтр по подстроке', usage: 'grep [-i] [-v] [-c] <шаблон> [файл]',
    needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      const parsed = fsSplitArgs(ctx.args, {});
      const pattern = parsed.rest[0];
      if (!pattern) return [{ t: 'grep: нужен шаблон', c: 'err' }];
      let lines;
      if (ctx.stdin) {
        lines = ctx.stdin;
      } else {
        if (!parsed.rest[1]) return [{ t: 'grep: нужен файл, если нет ввода по конвейеру', c: 'err' }];
        const root = fsBuildRoot(ctx);
        const node = fsLookup(root, fsResolve(parsed.rest[1], ctx.cwd));
        if (!node) return [{ t: 'grep: ' + parsed.rest[1] + ': No such file or directory', c: 'err' }];
        if (node.type === 'dir') return [{ t: 'grep: ' + parsed.rest[1] + ': Is a directory', c: 'err' }];
        lines = node.read();
      }
      // The pattern is first tried as a regular expression: on a live machine
      // grep is exactly that, and `grep "^CPU[01]"` works there. If the
      // expression does not compile, we look for a substring — that is better
      // than falling over with an error on a bracket meant literally.
      let re = null;
      try { re = new RegExp(pattern, parsed.flags.i ? 'i' : ''); } catch (e) { re = null; }
      const needle = parsed.flags.i ? pattern.toLowerCase() : pattern;
      function hit(l) {
        if (re) return re.test(l.t);
        const s = parsed.flags.i ? l.t.toLowerCase() : l.t;
        return s.indexOf(needle) !== -1;
      }
      const matched = lines.filter(function (l) { return parsed.flags.v ? !hit(l) : hit(l); });
      return parsed.flags.c ? [{ t: String(matched.length) }] : matched;
    }),
  });

  cmd({
    name: 'wc', group: 'ФАЙЛЫ', brief: 'подсчёт строк', usage: 'wc -l [файл]', needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      const parsed = fsSplitArgs(ctx.args, {});
      if (ctx.stdin) return [{ t: String(ctx.stdin.length).padStart(7) }];
      if (!parsed.rest.length) return [{ t: 'wc: нужен файл, если нет ввода по конвейеру', c: 'err' }];
      const root = fsBuildRoot(ctx);
      const node = fsLookup(root, fsResolve(parsed.rest[0], ctx.cwd));
      if (!node) return [{ t: 'wc: ' + parsed.rest[0] + ': No such file or directory', c: 'err' }];
      if (node.type === 'dir') return [{ t: 'wc: ' + parsed.rest[0] + ': Is a directory', c: 'err' }];
      return [{ t: String(node.read().length).padStart(7) + ' ' + parsed.rest[0] }];
    }),
  });

  cmd({
    name: 'find', group: 'ФАЙЛЫ', brief: 'поиск по дереву', usage: 'find [путь] -name <шаблон>', needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      const parsed = fsSplitArgs(ctx.args, { name: true });
      if (!parsed.flags.name) return [{ t: 'find: нужен -name <шаблон>', c: 'err' }];
      const start = parsed.rest[0] || ctx.cwd;
      const root = fsBuildRoot(ctx);
      const startPath = fsResolve(start, ctx.cwd);
      const node = fsLookup(root, startPath);
      if (!node) return [{ t: 'find: ' + start + ': No such file or directory', c: 'err' }];
      const re = fsGlobToRe(parsed.flags.name);
      const out = [];
      // The path is printed in the same shape it was given in: `find . -name
      // x` answers ./foo/x, not /home/cosmdandy/foo/x. That is how find
      // behaves, and that way the result can be copied into the next command.
      const relative = start.charAt(0) !== '/' && start !== '~';
      const show = function (p) {
        if (!relative) return p;
        const tail = p.slice(startPath.length);
        return start.replace(/\/$/, '') + (tail || '');
      };
      (function walk(n, p) {
        if (re.test(fsLastSeg(p))) out.push({ t: show(p) });
        if (n.type === 'dir') {
          Object.keys(n.kids).sort().forEach(function (name) {
            walk(n.kids[name], p === '/' ? '/' + name : p + '/' + name);
          });
        }
      })(node, startPath);
      return out;
    }),
  });

  cmd({
    name: 'echo', group: 'ФАЙЛЫ', brief: 'напечатать строку', usage: 'echo <текст>', needs: 'power',
    run: fsWithState(function (ctx) { return [{ t: ctx.args.join(' ') }]; }),
  });

  cmd({
    name: 'file', group: 'ФАЙЛЫ', brief: 'тип содержимого', usage: 'file <путь...>', needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      if (!ctx.args.length) return [{ t: 'file: нужен путь', c: 'err' }];
      const root = fsBuildRoot(ctx);
      return ctx.args.map(function (a) {
        const path = fsResolve(a, ctx.cwd);
        const node = fsLookup(root, path);
        if (!node) return { t: a + ': cannot open (No such file or directory)', c: 'err' };
        if (node.type === 'dir') return { t: a + ': directory' };
        if (path.indexOf('/dev/') === 0) return { t: a + ': block special' };
        const lines = node.read();
        return lines.length ? { t: a + ': ASCII text' } : { t: a + ': empty' };
      });
    }),
  });

  cmd({
    name: 'tree', group: 'ФАЙЛЫ', brief: 'дерево каталога', usage: 'tree [путь]', needs: 'power',
    complete: function (argv, i) { return fsPathComplete(argv, i); },
    run: fsWithState(function (ctx) {
      const root = fsBuildRoot(ctx);
      const start = ctx.args[0] || ctx.cwd;
      const path = fsResolve(start, ctx.cwd);
      const node = fsLookup(root, path);
      if (!node) return [{ t: 'tree: ' + start + ': No such file or directory', c: 'err' }];
      const out = [{ t: path }];
      let dirs = 0, files = 0;
      (function walk(n, prefix) {
        if (n.type !== 'dir') return;
        const names = Object.keys(n.kids).sort();
        names.forEach(function (name, i) {
          const last = i === names.length - 1;
          const child = n.kids[name];
          out.push({ t: prefix + (last ? '└── ' : '├── ') + name + (child.type === 'dir' ? '/' : '') });
          if (child.type === 'dir') { dirs++; walk(child, prefix + (last ? '    ' : '│   ')); }
          else files++;
        });
      })(node, '');
      out.push({ t: '' }, { t: dirs + ' directories, ' + files + ' files', c: 'muted' });
      return out;
    }),
  });

  // ── Screen of the machine: POST → BIOS Setup → top ──────────────────────
  // The screen is the service cover turned into a display: a panel the size of
  // the board that slides in from above. It used to be a <dialog> opened with
  // showModal(), which bought two things at once — the top layer and an inert
  // background — but it also covered the whole page, and a monitor plugged
  // into this server covers the server, not the room.
  //
  // Both of those we now do by hand. Stacking is plain z-index inside the
  // stage. Inert goes on the parts of the page the screen must not reach: on
  // the schematic Enter and Space press buttons and the arrows page through
  // revisions, so a keystroke meant for BIOS Setup must not land there. Inert
  // is the first line of defence; the second is the capture-phase keydown on
  // document below, which catches anything that still tries to get through.
  //
  // Three modes share one piece of markup, the panes hide behind each other
  // with the hidden attribute. Поверх любого из них поднимается накладка —
  // рамка подтверждения, меню загрузки, окно помощи, запрос пароля. Накладка
  // одна на всех, и разбирается по overlay.kind: заведи мы флаг на каждую, к
  // четвёртой уже нельзя было бы сказать, сколько их открыто разом.
  const crt = document.getElementById('crt');
  // Everything that must stop answering mouse and keyboard while the screen is
  // up. The screen sits next to .chassis rather than inside it precisely so
  // that inert on the schematic does not swallow the screen along with it.
  const SHADOWED = '.chassis, .rig-side, .timeline, .rig-id, main,' +
                   ' .theme-switch, .assemble-btn, .zoom-btn, .sfx-btn';
  const postPane = document.getElementById('crt-post');
  const postLog = document.getElementById('crt-post-log');
  const postLogo = document.getElementById('crt-post-logo');
  const postCodeEl = document.getElementById('crt-post-code');
  const setupPane = document.getElementById('crt-setup');
  const setupTabsEl = document.getElementById('crt-setup-tabs');
  const setupPathEl = document.getElementById('crt-setup-path');
  const setupRowsEl = document.getElementById('crt-setup-rows');
  const setupHelpEl = document.getElementById('crt-setup-help');
  const setupNoteEl = document.getElementById('crt-setup-note');
  const setupKeysEl = document.getElementById('crt-setup-keys');
  const topPane = document.getElementById('crt-top');
  const topHeadEl = document.getElementById('crt-top-head');
  const topGridEl = document.getElementById('crt-top-grid');
  const overlayEl = document.getElementById('crt-overlay');
  const overlayTitleEl = document.getElementById('crt-overlay-title');
  const overlayBodyEl = document.getElementById('crt-overlay-body');
  const overlayKeysEl = document.getElementById('crt-overlay-keys');

  // dormancy() in base.js puts the schematic on pause when the tab has been
  // minimised or taken off the edge of the screen — the same reason to stop it
  // here: while the layer is open the viewer cannot see the schematic from
  // under the ::backdrop anyway, and spinning the blades in the background is
  // pure battery drain. dormancy() is already written in base.js and there is
  // nowhere to change its body from — this is that very flag, the one that has
  // to go into its condition (see the report).
  let crtOpen = false;

  // Кому вернуть фокус, когда экран уедет. Нужно не ради удобства с
  // клавиатуры, а потому что иначе фокус остаётся на самом экране, и
  // aria-hidden на нём Chrome не ставит: «Blocked aria-hidden on an element
  // because its descendant retained focus». То есть закрытый экран так и
  // оставался бы видимым для читалки.
  let crtReturn = null;

  // The base asks through a function instead of reading the variable: base.js
  // runs higher up the file, and a reference before the let declaration throws.
  function screenOpen() { return crtOpen; }

  function shadow(on) {
    document.querySelectorAll(SHADOWED).forEach(function (el) {
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }

  function openCrt(mode) {
    // Запоминаем ДО shadow(true): та вешает inert на всё вокруг, и после неё
    // activeElement уже не тот, кто экран вызвал.
    if (!crtOpen) crtReturn = document.activeElement;
    crt.dataset.mode = mode;
    postPane.hidden = mode !== 'post';
    setupPane.hidden = mode !== 'setup';
    topPane.hidden = mode !== 'top';
    crt.classList.add('on');
    crt.setAttribute('aria-hidden', 'false');
    // Пока экран поднят, подписей узлов нет: монитор занимает ровно то место,
    // где они лежат, и всплывать под ним им незачем.
    rig.classList.add('tags-off');
    shadow(true);
    // Focus has to be moved by hand — showModal() used to do it. Without this
    // the first keystroke would go to whatever was focused before.
    crt.focus({ preventScroll: true });
    crtOpen = true;
    dormancy();
  }

  function closeCrt() {
    if (!crtOpen) return;
    closeOverlay();
    crt.classList.remove('on');
    // Фокус уводим прежде, чем прятать экран от читалки. Пока он оставался на
    // самом экране (openCrt переводит его туда руками), Chrome отказывался
    // ставить aria-hidden и писал в Issues: «Blocked aria-hidden on an element
    // because its descendant retained focus» — то есть уехавший с картинки
    // экран для читалки так и оставался открытым диалогом.
    crt.blur();
    crt.setAttribute('aria-hidden', 'true');
    // Экран уехал — вот теперь подписи проступают, одна за другой.
    rig.classList.remove('tags-off');
    shadow(false);
    crtOpen = false;
    dormancy();
    closeTop();
  }

  // The screen takes focus, so it needs to be focusable — but only as a
  // target, never as a tab stop of its own.
  crt.tabIndex = -1;

  // Clicking the self-test screen to dismiss it is the natural thing to do.
  // The only machine we refuse to let go is the one with nothing to boot
  // from: there the screen belongs on until you enter setup and change the
  // boot order.
  crt.addEventListener('click', function () {
    if (overlay) return;             // накладка ловит клавиши сама, экран под ней не трогаем
    if (crt.dataset.mode === 'post' && postCtl && postCtl.done && !postCtl.hung) {
      postCtl = null;
      closeCrt();
    }
  });

  // One handler for all three modes: the dispatcher looks at dataset.mode
  // instead of breeding a listener per openXxx() — that way, on a switch from
  // post to setup inside one already open dialog, there is no guessing how
  // many old handlers have been hung on it by now. Накладка идёт первой: пока
  // она поднята, клавиши принадлежат ей одной.
  document.addEventListener('keydown', function (e) {
    if (!crtOpen) return;
    if (overlay) { handleOverlayKey(e); return; }
    const mode = crt.dataset.mode;
    if (mode === 'post') handlePostKey(e);
    else if (mode === 'setup') handleSetupKey(e);
    else if (mode === 'top') handleTopKey(e);
  }, true);

  // F2 lives outside the self-test as well. On a real machine it is caught in
  // the first seconds of the boot, but the page stays open for hours while
  // POST runs five seconds at most — waiting for it to get into setup would be
  // a mockery. Hence: screen closed — F2 opens setup, screen open — the key is
  // taken apart by the mode dispatcher above.
  //
  // F1 здесь же, и это не прихоть. IMM и панель световой диагностики машина
  // унаследовала от IBM System x, а туда в Setup входят по F1; синее поле с
  // жёлтой строкой — это AMI Aptio, и там F1 внутри Setup открывает окно
  // помощи. Обе школы уживаются: снаружи F1 и F2 открывают Setup одинаково,
  // внутри F1 показывает помощь. F11 — выбор устройства загрузки, как на
  // живой машине, и F12 рядом, потому что половина вендоров вешает его туда.
  document.addEventListener('keydown', function (e) {
    if (crtOpen) return;
    // Клавишу, которой экран только что закрыли, второй раз не разбираем.
    // Оба обработчика висят на document в фазе перехвата и получают ОДНО и то
    // же нажатие: Enter на «Yes» в подтверждении закрывает Setup — и тут же
    // приходит сюда, где экран уже закрыт, а фокус после blur() лежит на
    // body, то есть «ни на чём». Setup открывался обратно в том же кадре.
    // Раньше это не всплывало только потому, что фокус оставался на скрытом
    // экране и условие idle не выполнялось.
    if (e.defaultPrevented) return;
    // Enter — for those whose top row is given over to the system, but only
    // when the focus is on nothing: in the console field it sends the command,
    // on a button of the schematic it presses that button, and it must not be
    // taken away there.
    const idle = document.activeElement === document.body || document.activeElement === null;
    if (e.key === 'F11' || e.key === 'F12') {
      e.preventDefault();
      openBootMenuStandalone();
      return;
    }
    if (e.key !== 'F2' && e.key !== 'F1' && !(e.key === 'Enter' && idle)) return;
    e.preventDefault();
    requestSetup();
  }, true);

  // ── NVRAM ────────────────────────────────────────────────────────────────
  // A store separate from rig-state: they have different life cycles. rig-state
  // is written on every click of the power button, while the firmware is saved
  // only on F10 — and F9 has to wipe its contents without touching the power of
  // the machine at all.
  //
  // The fields and their values are flat and in the same strings ('Enabled'/
  // 'Disabled'/'UEFI'/'Legacy'/'All') by which hw.js (cpuState, the dimm
  // command) and fs.js (/proc/cpuinfo, /sys/firmware/efi) already read them:
  // there nv.cores, nv.ht, nv.numa, nv.memfreq, nv.mode are checked as strings
  // with no parsing in between, and starting a format of our own here would
  // mean diverging from the neighbours' already written code.
  const NV_DEFAULT = {
    ht: 'Enabled', cores: 'All', numa: 'Enabled', memfreq: 'Auto',
    power: 'Maximum Performance', cstates: 'Enabled',
    determinism: 'Performance', powerLimit: 0,
    memMode: 'Independent', patrol: 'Enabled',
    above4g: 'Enabled', sriov: 'Enabled', iommu: 'Enabled', pcieSpeed: 'Auto',
    // Quiet Boot по умолчанию выключен, и это не произвол: машина показывает
    // полный журнал самотеста и пищит спикером на старте — то есть ведёт себя
    // ровно как машина с выключенной тихой загрузкой. Включите его в BIOS, и
    // старт пройдёт молча.
    mode: 'UEFI', secureBoot: 'Enabled', quietBoot: 'Disabled',
    bootOrder: ['nvme', 'pxe', 'bmc'],
    netStack: 'Enabled', pxe: 'Enabled',
    sbKeys: 'User Mode', tpm: 'Enabled',
    // Пустая строка — пароль не задан. Лежит он тут открытым, и это честнее,
    // чем изображать хэш: настоящая прошивка держит его в отдельной области
    // NVRAM, а стирается он перемычкой на плате, которой у нас нет.
    adminPw: '', powerOnPw: '',
    acRestore: 'Last State', wol: 'Enabled',
    watchdog: 'Disabled', watchdogMin: 5,
    sol: 'Disabled', solBaud: '115200',
    fanPolicy: (HW.fan && HW.fan.policy_default) || 'Balanced',
    immNic: 'Dedicated', vmedia: 'Detached',
    ipMode: 'DHCP', ip: HW.fw.ip, mask: '255.255.255.0', gw: '192.168.10.1',
  };

  function cloneNv(src) { return JSON.parse(JSON.stringify(src)); }

  function loadNv() {
    const v = cloneNv(NV_DEFAULT);
    try {
      const raw = localStorage.getItem('rig-nv');
      if (raw) {
        Object.assign(v, JSON.parse(raw));
        if (!Array.isArray(v.bootOrder) || v.bootOrder.length !== 3) v.bootOrder = NV_DEFAULT.bootOrder.slice();
      }
    } catch (e) {}
    return v;
  }

  let nv = loadNv();

  // Однократная загрузка живёт вне NVRAM намеренно: в том и весь смысл выбора
  // из всплывающего меню, что он не переживает перезагрузку и не трогает
  // сохранённый порядок. Настоящая прошивка держит это в переменной BootNext и
  // стирает её сама, как только загрузилась.
  let bootNext = null;

  function saveNv() {
    try { localStorage.setItem('rig-nv', JSON.stringify(nv)); } catch (e) {}
  }

  // ── Обороты крыльчаток ───────────────────────────────────────────────────
  // Политика оборотов стоит в меню контроллера управления, а не в Advanced, и
  // это не придирка: охлаждением на живой машине распоряжается BMC, прошивка к
  // нему только обращается. Обороты каждого режима лежат в паспорте.
  //
  // Период оборота на рисунке не выдумывается заново: номинальный стоит в
  // стилях (--spin), остальные получаются из него отношением оборотов. Один
  // источник на троих — рисунок, звук и команда fans. Звук про политику при
  // этом не спрашивает вовсе: он читает период у самой крыльчатки.
  const SPIN_NOM = (function () {
    const raw = getComputedStyle(rig).getPropertyValue('--spin').trim();
    const v = parseFloat(raw);
    if (!isFinite(v) || v <= 0) return 0.5;
    return raw.indexOf('ms') > 0 ? v / 1000 : v;
  })();

  function fanPolicyList() {
    return (HW.fan && HW.fan.policy) || [{ id: 'Balanced', rpm: HW.fan ? HW.fan.rpm_nom : 0 }];
  }
  function fanPolicyIds() {
    return fanPolicyList().map(function (p) { return p.id; });
  }

  // Профиль питания Efficiency прижимает охлаждение к самому тихому режиму —
  // ровно так ведёт себя машина, у которой в Operating Modes выбрана экономия:
  // обороты падают вслед за частотой, а не живут отдельной жизнью.
  function fanPolicyEffective(src) {
    const s = src || nv;
    return s.power === 'Efficiency' ? fanPolicyIds()[0] : s.fanPolicy;
  }

  // Целевые обороты по политике — не путать с fanRpm в sfx.js: та снимает
  // обороты с самой крыльчатки и знает про разгон при вынутом вентиляторе.
  function fanTargetRpm(src) {
    const want = fanPolicyEffective(src);
    const found = fanPolicyList().filter(function (p) { return p.id === want; })[0];
    return found ? found.rpm : (HW.fan ? HW.fan.rpm_nom : 0);
  }

  function fanSpin(src) {
    const nom = HW.fan ? HW.fan.rpm_nom : 0;
    const rpm = fanTargetRpm(src);
    if (!nom || !rpm) return SPIN_NOM;
    return SPIN_NOM * nom / rpm;
  }

  // ── Память: сколько её видит система ─────────────────────────────────────
  // Зеркалирование требует симметрично набитых каналов. Вынули планку — пара
  // распалась, и прошивка откатывается на Independent, честно назвав причину.
  // Это не выдумка ради связи с рисунком: живая машина ведёт себя так же и
  // пишет в журнал ровно это.
  function memPlan(src) {
    const s = src || nv;
    const d = dimmState();
    const mode = s.memMode || 'Independent';
    if (mode === 'Mirroring' && d.out > 0) {
      return { mode: 'Independent', want: 'Mirroring', gb: d.gb, fell: true,
               why: 'channel population mismatch' };
    }
    // И зеркало, и резервный ранг стоят половины, но считаем мы это от рангов,
    // а не от половины наугад: поставь одноранговые модули — и цифра поедет
    // сама, без правки здесь.
    const ranks = parseInt(String((HW.dimm && HW.dimm.ranks) || '2R'), 10) || 2;
    if (mode === 'Mirroring') return { mode: mode, gb: Math.round(d.gb / 2), fell: false };
    if (mode === 'Sparing') return { mode: mode, gb: Math.round(d.gb * (ranks - 1) / ranks), fell: false };
    return { mode: 'Independent', gb: d.gb, fell: false };
  }

  // ── Устройства загрузки ──────────────────────────────────────────────────
  // Список не выдуман: сеть исчезает вместе с выключенным сетевым стеком, а
  // накопитель — вместе с последним вынутым каддиком. Прошивка не может
  // грузиться с того, чего в машине нет, и всплывающее меню показывает то же.
  function drivesIn() {
    const total = HW.bay.filter(function (b) { return !b.filler; }).length;
    return total - counts('.bay.pulled');
  }

  function bootAvailable(key, src) {
    const s = src || nv;
    if (key === 'pxe') return s.netStack === 'Enabled' && s.pxe === 'Enabled';
    if (key === 'nvme') return drivesIn() > 0 && s.mode !== 'Legacy';
    // Виртуальный носитель существует всегда — он внутри контроллера, — но
    // грузиться с него можно, только когда к нему что-то подключено. Пустой
    // привод в списке есть, а загрузиться с него нельзя: ровно так и ведёт
    // себя живая машина, у которой образ не примонтирован.
    return s.vmedia === 'Attached';
  }

  function bootWhyNot(key, src) {
    const s = src || nv;
    if (key === 'pxe') return s.netStack === 'Disabled' ? 'UEFI network stack disabled' : 'PXE boot disabled';
    if (key === 'nvme') return s.mode === 'Legacy' ? 'GPT not readable in Legacy mode' : 'no drive in cage';
    return 'no media attached';
  }

  function bootChain(src) {
    const s = src || nv;
    return s.bootOrder.filter(function (k) { return bootAvailable(k, s); });
  }

  // The link speed on the rear panel comes from the ports spec, not from a
  // letter in the text: swap the board for one with another network card and
  // the boot order labels have to move along with it, not diverge from what
  // rear_io shows.
  function pxeSpeed() {
    const m = /([\d.]+)\s*G/.exec(HW.ports.sfp || '');
    return m ? m[1] + 'G' : '10G';
  }
  const BOOT_POST_LABEL = { nvme: 'nvme0', pxe: 'pxe' + pxeSpeed().toLowerCase(), bmc: 'bmc' };
  const BOOT_SETUP_LABEL = { nvme: 'NVMe 0', pxe: 'PXE ' + pxeSpeed(), bmc: 'BMC Virtual Media' };
  const BOOT_TARGET = { nvme: '/dev/nvme0n1', pxe: 'network (PXE)', bmc: 'BMC Virtual Media' };

  // ── Эффект прошивки на машину ────────────────────────────────────────────
  // Раньше их было два, и оба записаны как единственные разрешённые. Теперь
  // больше, но правило то же: прошивка трогает схему только через классы и
  // переменные на .rig. Она не лезет в чужие узлы руками и не знает ни про
  // звук, ни про стили — слушают её они сами.
  function applyNvEffects() {
    // Обороты — переменной, а не классом на каждый режим: режимов четыре, а
    // период считается из паспорта, и заводить под него четыре правила в
    // стилях значило бы переписывать их при каждой правке оборотов.
    rig.style.setProperty('--spin', fanSpin().toFixed(3) + 's');
    // Ниже номинала крыльчатка перестаёт сливаться в диск — лопасти видно.
    // Класс остался прежним: на него уже смотрят правила размытия.
    rig.classList.toggle('nv-eff', fanTargetRpm() < (HW.fan ? HW.fan.rpm_nom : 0));
    // has-fault is already taken by someone else's logic (the lamps of the
    // missing units) — here we have a flag of our own, so as not to override
    // that condition.
    rig.classList.toggle('sb-off', nv.mode === 'UEFI' && nv.secureBoot === 'Disabled');
    // Ещё две настройки слышны, а не видны. Quiet Boot глушит писк спикера на
    // старте — как и положено тихой загрузке. Запрещённые C-States не дают
    // ядрам уснуть, ток через дроссели не падает, и они поют. Звук про прошивку
    // не спрашивает: он слушает эти классы, как их слушают стили.
    rig.classList.toggle('nv-quiet', nv.quietBoot === 'Enabled');
    rig.classList.toggle('nv-cst-off', nv.cstates === 'Disabled');
    // Выключенное окно выше четырёх гигабайт — единственная настройка, от
    // которой на схеме загорается лампа узла: карте в райзере некуда лечь
    // своим окном, и прошивка оставляет слот ненастроенным.
    rig.classList.toggle('nv-no4g', nv.above4g === 'Disabled');
    updateFault();
  }
  applyNvEffects();   // apply what already lay in rig-nv, before setup is ever opened

  // ── Питание вернулось ────────────────────────────────────────────────────
  // Вызывается из updateMains, когда в машину вставили блок после полной
  // темноты. Что делать дальше — вопрос к прошивке, и ответ у неё записан
  // одной строкой.
  function acRestorePolicy(wasOn) {
    const mode = nv.acRestore;
    const up = mode === 'Always On' || (mode === 'Last State' && wasOn);
    if (!up) {
      line('bios: restore on ac loss = ' + mode + ' · машина осталась в дежурке', 'muted');
      return;
    }
    line('bios: restore on ac loss = ' + mode + ' · поднимаю машину', 'ok');
    selAdd('System restored after AC loss (' + mode + ')', 'ok');
    // Задержка не для красоты: живая машина ждёт, пока дежурка устоится, и
    // только потом отпускает питание на хост.
    wait(700, function () { powerOn(); });
  }

  // ── Пароль включения ─────────────────────────────────────────────────────
  // Спрашивается до старта, потому что спрашивает его прошивка, а не система.
  // Экран поднимается пустым — ровно так и выглядит машина, ждущая ввода
  // раньше самотеста.
  let powerGate = false;

  function powerOnAllowed(retry) {
    if (!nv.powerOnPw || powerGate) return true;
    blankScreen(0xab);
    askPasswordPrompt('Enter Power-On Password', function (given) {
      if (given !== nv.powerOnPw) {
        line('power-on: invalid password', 'err');
        selAdd('Power-on password attempt failed', 'warn');
        return false;
      }
      postCtl = null;
      closeCrt();
      powerGate = true;
      retry();
      powerGate = false;
      return true;
    }, '', function () { postCtl = null; closeCrt(); });
    return false;
  }

  // Пустое поле экрана под накладку: и для пароля включения, и для меню
  // загрузки, поднятого на выключенной картинке.
  function blankScreen(code) {
    openCrt('post');
    postLog.textContent = '';
    postLog.hidden = false;
    if (postLogo) postLogo.hidden = true;
    postCode(code);
    postCtl = { f2Pending: false, bootPending: false, skip: false, done: true,
                hung: false, standalone: true };
  }

  // ── POST ───────────────────────────────────────────────────────────────
  // The lines are assembled once out of the three layers of truth — the spec,
  // the DOM and nv — and printed by one and the same function both onto the
  // screen and into the console: the gauges and sensors already diverged for
  // exactly that reason, they were computed twice by different formulas, and
  // this is the same place where it could have happened again.
  //
  // У каждой строки есть контрольная точка — то самое двузначное число, которое
  // живая плата показывает индикатором у заднего края, а экран в углу. Код
  // стоит на одной строке с тем, что он означает, и разъехаться им негде:
  // расходятся ровно те пары, которые записаны в разных местах.
  const POST_CODE_NAME = {
    0x19: 'Pre-memory CPU init',
    0x2b: 'Memory init',
    0x31: 'Memory installed',
    0x32: 'CPU post-memory init',
    0x60: 'DXE core started',
    0x78: 'ACPI module init',
    0x92: 'PCI Bus enumeration',
    0x96: 'PCI Bus assign resources',
    0x99: 'Super IO init',
    0xa0: 'Storage init',
    0xa9: 'Start of Setup',
    0xab: 'Setup input wait',
    0xad: 'Ready to boot',
    0xae: 'Boot device selection',
    0xd6: 'No boot device found',
    0xd7: 'PCI resource allocation error',
  };

  let postCodeNow = null;

  function postCode(code) {
    postCodeNow = (code === undefined) ? null : code;
    const hex = postCodeNow === null ? '--' : postCodeNow.toString(16).toUpperCase().padStart(2, '0');
    if (postCodeEl) {
      postCodeEl.textContent = hex;
      postCodeEl.title = postCodeNow === null ? '' : (POST_CODE_NAME[postCodeNow] || '');
    }
    // Тот же код уходит на плату. Индикатор нарисован у заднего края, как на
    // живой машине, и знает про себя только цифры: разбор кода в имя остаётся
    // здесь, потому что имя нужно экрану, а не индикатору.
    setBoardPostCode(postCodeNow);
  }

  function buildPostLines() {
    const fansOut = counts('.fan.pulled');
    const cpuOut = counts('.cpu-slot.opened');
    const dimm = dimmState();
    const mem = memPlan();

    const rows = [];
    const push = function (t, c, d, code) { rows.push({ t: t, c: c || '', d: d, code: code }); };

    push(HW.board.model + ' · ' + HW.fw.bios_vendor + ' ' + HW.fw.bios + ' (' + HW.fw.bios_date + ')', '', 160, 0x19);
    push('Board REV ' + HW.board.rev + ' · ' + HW.board.sha, '', 120);
    push('AGESA ' + HW.fw.agesa + ' · ucode ' + HW.fw.ucode, 'muted', 120);
    push('Press ENTER or F2 to enter Setup · F11 for boot menu', 'muted', 140, 0xab);

    for (let n = 0; n < HW.cpu.n; n++) {
      const out = chassis.querySelector('.cpu-slot[data-cpu="' + n + '"].opened');
      if (out) push('CPU' + n + '  --- not detected ---', 'err', 160, 0x32);
      else push('CPU' + n + '  ' + HW.cpu.model + '  ' + HW.cpu.cores + 'c/' + HW.cpu.threads + 't  '
                 + HW.cpu.base.toFixed(2) + ' GHz', 'ok', 160, 0x32);
    }

    const speed = nv.memfreq === 'Auto' ? HW.dimm.speed : nv.memfreq;
    push('Memory Training ....... ' + dimm.in + ' of ' + dimm.total + ' · ' + (dimm.gb / 1024).toFixed(2)
         + ' TiB @ ' + speed, dimm.out ? 'warn' : 'ok', 260, 0x2b);
    if (mem.fell) {
      push('Memory ' + mem.want + ' disabled: ' + mem.why, 'warn', 180, 0x31);
    } else if (mem.mode !== 'Independent') {
      push('Memory Mode: ' + mem.mode + ' · ' + (mem.gb / 1024).toFixed(2) + ' TiB usable', '', 180, 0x31);
    }
    if (nv.patrol === 'Enabled') push('Patrol Scrub .......... enabled', 'muted', 120, 0x31);

    const cpuPresent = HW.cpu.n - cpuOut;
    push(nv.numa === 'Disabled' ? 'NUMA: disabled' : 'NUMA: ' + cpuPresent + ' nodes', '', 120, 0x78);

    // Окно выше четырёх гигабайт: карте с большой памятью на борту иначе некуда
    // лечь. Отказ не выдуман — на живой машине с выключенным Above 4G ровно так
    // и встаёт распределение ресурсов шины, а слот остаётся ненастроенным.
    const cards = HW.riser.filter(function (r) { return !r.empty; });
    if (nv.above4g === 'Disabled' && cards.length) {
      push('PCI resource allocation error: ' + (cards[0].card || 'riser card')
           + ' needs 64-bit BAR', 'err', 240, 0xd7);
      push('Above 4G Decoding is disabled — card left unconfigured', 'warn', 180, 0x96);
    } else {
      push('PCI Bus ............... ' + HW.chips.length + ' devices · '
           + (nv.pcieSpeed === 'Auto' ? 'Gen5 ×16' : nv.pcieSpeed + ' ×16'), '', 160, 0x92);
      if (nv.sriov === 'Enabled') push('SR-IOV ................ enabled', 'muted', 110, 0x96);
    }
    if (nv.iommu === 'Disabled') push('IOMMU: disabled', 'warn', 120, 0x78);

    push('NVMe: ' + drivesIn() + ' devices', counts('.bay.pulled') ? 'warn' : '', 180, 0xa0);

    if (fansOut > 0) push('Fan redundancy lost', 'warn', 160);
    push('Fan Speed Policy: ' + fanPolicyEffective() + ' · ' + fanTargetRpm() + ' rpm', 'muted', 120);
    if (nv.mode === 'UEFI' && nv.secureBoot === 'Disabled') push('Secure Boot: Disabled', 'warn', 140);
    if (nv.sol === 'Enabled') push('Console redirection ... COM1 ' + nv.solBaud + ' 8N1', 'muted', 120, 0x99);
    if (nv.watchdog === 'Enabled') push('ASR watchdog armed: ' + nv.watchdogMin + ' min', 'muted', 120);

    push('Boot order: ' + nv.bootOrder.map(function (k) { return BOOT_POST_LABEL[k]; }).join(' → '),
         'muted', 180, 0xae);

    // Однократный выбор бьёт сохранённый порядок ровно один раз. Если то, что
    // выбрали, из машины успело уехать, прошивка говорит об этом и идёт по
    // обычной цепочке, а не встаёт молча.
    const chain = bootChain();
    let first = chain.length ? chain[0] : null;
    if (bootNext) {
      if (bootAvailable(bootNext)) {
        first = bootNext;
        push('Boot override: ' + BOOT_SETUP_LABEL[bootNext] + ' (one time)', '', 160);
      } else {
        push('Boot override ' + BOOT_SETUP_LABEL[bootNext] + ' unavailable: ' + bootWhyNot(bootNext),
             'warn', 200);
      }
      bootNext = null;
    }

    let bootFailed = false;
    if (!first) {
      // Ни одного устройства: пустая корзина, выключенный сетевой стек, Legacy
      // поверх GPT. Проверка ловила когда-то только последний случай, и машина
      // бодро грузилась с накопителя, которого нет в шасси.
      nv.bootOrder.forEach(function (k) {
        push('  ' + BOOT_SETUP_LABEL[k] + ' — ' + bootWhyNot(k), 'muted', 90);
      });
      push('No boot device found', 'err', 260, 0xd6);
      bootFailed = true;
    } else {
      push('Booting ' + BOOT_TARGET[first] + ' ...', 'muted', 240, 0xad);
    }

    return { lines: rows, bootFailed: bootFailed };
  }

  function crtPostLine(t, c) {
    line(t, c);                 // into the console — always, whether the screen is open or not
    if (!crtOpen) return;
    const d = document.createElement('div');
    if (c) d.className = c;
    d.textContent = t;
    postLog.appendChild(d);
  }

  // While POST runs, F2/Esc are caught by the common document-keydown
  // dispatcher above; it hands control down here only once it has checked
  // that we really are in post mode. postCtl lives while the lines play — and
  // if the machine is stuck on "no boot device", after that too: F2 has to
  // work there as well.
  let postCtl = null;

  function handlePostKey(e) {
    if (!postCtl) return;
    // Enter on a par with F2: on a mac the top row is given over to brightness
    // and volume by default, and F2 simply never reaches us — we are not going
    // to make a guest hold Fn to get into setup. While the modal screen is
    // open Enter is busy with nothing else: the console field under the layer
    // does not get the focus.
    if (e.key === 'F2' || e.key === 'F1' || e.key === 'Enter') {
      e.preventDefault();
      if (postCtl.done) enterSetupFromPost();
      else postCtl.f2Pending = true;
    } else if (e.key === 'F11' || e.key === 'F12') {
      e.preventDefault();
      // Меню загрузки ловится в те же секунды, что и Setup: до конца ленты
      // откладываем, после — поднимаем сразу.
      if (postCtl.done) openBootMenu(true);
      else postCtl.bootPending = true;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // The first Esc skips the pauses between the lines, the second closes
      // the screen. Otherwise the self-test looked hung: the lines had run
      // out and there was nothing to leave the screen with but waiting.
      if (!postCtl.done) postCtl.skip = true;
      else if (!postCtl.hung) { postCtl = null; closeCrt(); }
    }
  }

  function enterSetupFromPost() {
    postCtl = null;
    requestSetup();
  }

  /**
   * screenPost() — the machine's self-test. Called from runPost() in base.js
   * in place of the old direct printing into the log: it builds the lines out
   * of HW/DOM/nv, prints them twice (screen + console) with one function,
   * listens for F2 (a deferred move into setup after the end of the tape) and
   * Esc (play out the rest without pauses). Under reduced the screen does not
   * open at all — the delays are collapsed to zero by the same wait() that the
   * ordinary run plays through, so the lines simply go into the console one
   * after another with no pause between them.
   *
   * Тихая загрузка прячет ленту за логотипом — как ей и положено. Строки при
   * этом никуда не деваются: они идут в консоль, потому что лента самотеста
   * это ещё и журнал, а журнал не прячут заодно с картинкой.
   */
  function screenPost() {
    const built = buildPostLines();
    const quiet = nv.quietBoot === 'Enabled';
    const showScreen = !reduced;
    postCtl = { f2Pending: false, bootPending: false, skip: false, done: false, hung: false };
    if (showScreen) {
      postLog.textContent = '';
      postLog.hidden = quiet;
      if (postLogo) postLogo.hidden = !quiet;
      openCrt('post');
      postCode(null);
    }
    disarmWatchdog();

    let i = 0;
    (function step() {
      // The run may have been abandoned mid-flight: clicking the self-test
      // away nulls postCtl while the next line is still on the timer, and a
      // second POST replaces it outright. Either way this chain has nothing
      // left to print — without the guard it read .skip off null and threw.
      if (!postCtl) return;
      if (i >= built.lines.length) {
        postCtl.done = true;
        if (postCtl.f2Pending) { enterSetupFromPost(); return; }
        if (postCtl.bootPending) { postCtl.bootPending = false; openBootMenu(true); return; }
        if (built.bootFailed) {
          postCtl.hung = true;
          if (showScreen && quiet) {          // логотип уезжает: живая машина показывает отказ
            postLog.hidden = false;
            if (postLogo) postLogo.hidden = true;
          }
          selAdd('No bootable device', 'err');
          armWatchdog();
          if (!showScreen) postCtl = null;   // no screen — nobody to catch F2 anyway
          return;                             // we hang on the screen, like a real machine with no disk
        }
        line('system ready', 'ok');
        // The hint is printed into the console, not only onto the screen: the
        // screen goes away in a moment, and the question "how do I get into
        // the BIOS" stays.
        line('F2 — BIOS Setup · F11 — меню загрузки · bios — то же командой', 'muted');
        postCtl = null;
        if (showScreen) wait(700, closeCrt);
        return;
      }
      const row = built.lines[i++];
      wait(postCtl.skip ? 0 : row.d, function () {
        if (row.code !== undefined && row.code !== null) postCode(row.code);
        crtPostLine(row.t, row.c);
        step();
      });
    })();
  }

  // ── Сторожевой таймер ────────────────────────────────────────────────────
  // ASR — то, ради чего он и стоит в серверах: система перестала отвечать,
  // значит машину надо перезапустить, не дожидаясь человека. У нас «перестала
  // отвечать» ровно одно и есть — самотест, вставший без устройства загрузки.
  // Таймер взводится там и больше нигде.
  let watchdogTimer = null;

  function disarmWatchdog() {
    if (watchdogTimer) { window.clearTimeout(watchdogTimer); watchdogTimer = null; }
  }

  function armWatchdog() {
    disarmWatchdog();
    if (nv.watchdog !== 'Enabled') return;
    const ms = Math.max(1, Number(nv.watchdogMin) || 1) * 60000;
    watchdogTimer = window.setTimeout(function () {
      watchdogTimer = null;
      selAdd('ASR watchdog expired · system reset', 'err');
      line('asr: watchdog expired — перезапуск', 'warn');
      screenPost();
    }, ms);
  }

  // ── BIOS Setup ───────────────────────────────────────────────────────────
  // AMI Aptio — a blue field, a yellow line, help on the right. The sections
  // are described by a data scheme (setupRows) rather than by markup: Boot and
  // IMM change the set of rows on the fly (Secure Boot hides under Legacy, the
  // IP fields under Static), and if this were markup we would have to
  // hide/show pieces by hand in three places instead of one.
  //
  // Вкладка при этом больше не обязана быть плоским списком. Строка вида
  // { kind: 'menu', rows: fn } — это вход внутрь, и Enter на ней уводит на
  // уровень ниже. Так устроен настоящий Advanced: он не набор тумблеров, а
  // оглавление, и без этого экран читается чем угодно, только не прошивкой.
  const SETUP_TABS = ['Main', 'Advanced', 'Boot', 'Security', 'IMM', 'Save & Exit'];
  const CORE_OPTIONS = ['All', HW.cpu.cores, Math.floor(HW.cpu.cores / 2),
                         Math.floor(HW.cpu.cores / 4), Math.floor(HW.cpu.cores / 8)];
  const MEM_FREQ_OPTIONS = ['Auto', '6400', '6000', '5600', '4800'];
  const POWER_OPTIONS = ['Maximum Performance', 'Balanced', 'Efficiency'];
  const PCIE_SPEED_OPTIONS = ['Auto', 'Gen5', 'Gen4', 'Gen3'];
  const BAUD_OPTIONS = ['115200', '57600', '38400', '19200', '9600'];
  const AC_OPTIONS = ['Last State', 'Always On', 'Always Off'];
  const WDT_OPTIONS = [1, 5, 10, 20];
  const PW_LIMIT_STEP = 25;

  let setupTab = 0;
  let setupRow = -1;
  let menuPath = [];       // стек входов внутрь вкладки; пуст — мы на её корне
  let nvDraft = null;      // draft: edits show at once, but reach nv only on F10
  let editField = null;    // { row, buf } — editing IP/mask/gateway character by character
  let overlay = null;      // накладка поверх любого режима: рамка, меню, помощь, пароль

  function cycleEnum(list, cur, dir) {
    const i = list.indexOf(cur);
    const n = list.length;
    const next = (i < 0 ? 0 : i) + (dir > 0 ? 1 : -1);
    return list[((next % n) + n) % n];
  }
  function toggleOnOff(cur) { return cur === 'Enabled' ? 'Disabled' : 'Enabled'; }

  // Сахар: три четверти строк — это «тумблер поля черновика» и «перебор списка
  // по полю черновика». Без него каждая обрастает своей парой замыканий, и за
  // ними теряется то немногое, что в строках действительно разное.
  function boolRow(id, label, field, help, extra) {
    return Object.assign({
      id: id, label: label, kind: 'bool', help: help,
      get: function () { return nvDraft[field]; },
      set: function () { nvDraft[field] = toggleOnOff(nvDraft[field]); },
    }, extra || {});
  }
  function enumRow(id, label, field, options, help, extra) {
    return Object.assign({
      id: id, label: label, kind: 'enum', options: options, help: help,
      get: function () { return String(nvDraft[field]); },
      set: function (dir) { nvDraft[field] = cycleEnum(options, nvDraft[field], dir); },
    }, extra || {});
  }
  function roRow(label, get) { return { label: label, ro: true, get: get }; }

  // ── Main ─────────────────────────────────────────────────────────────────
  function mainRows() {
    const rows = [];
    rows.push(roRow('BIOS Version', function () { return HW.fw.bios + '  (' + HW.fw.bios_date + ')'; }));
    rows.push(roRow('BIOS Vendor', function () { return HW.fw.bios_vendor; }));
    // Прошивок на машине не одна, и человек, который её чинит, смотрит сюда
    // первым делом: со странностями памяти на EPYC разбираются по версии
    // AGESA, а не по версии BIOS.
    rows.push(roRow('AGESA Version', function () { return HW.fw.agesa; }));
    rows.push(roRow('Microcode Patch', function () { return HW.fw.ucode; }));
    rows.push(roRow('PSP / SMU', function () { return HW.fw.psp + ' / ' + HW.fw.smu; }));
    rows.push(roRow('BMC Firmware', function () {
      return HW.fw.bmc + '  ' + HW.fw.bmc_chip + '  (' + HW.fw.bmc_date + ')';
    }));
    rows.push(roRow('Board', function () {
      return HW.board.model + '  REV ' + HW.board.rev + '  S/N ' + HW.board.sha;
    }));
    rows.push(roRow('System UUID', function () { return HW.fw.uuid; }));
    for (let n = 0; n < HW.cpu.n; n++) {
      if (chassis.querySelector('.cpu-slot[data-cpu="' + n + '"].opened')) continue;   // a pulled one disappears
      rows.push(roRow('CPU' + n, function () {
        return HW.cpu.model + '  ' + HW.cpu.cores + 'c/' + HW.cpu.threads + 't';
      }));
    }
    const dimm = dimmState();
    const mem = memPlan(nvDraft);
    rows.push(roRow('Total Memory', function () {
      return dimm.in + ' × ' + HW.dimm.kind + '  ' + (dimm.gb / 1024).toFixed(2) + ' TiB';
    }));
    if (mem.gb !== dimm.gb) {
      rows.push(roRow('Usable Memory', function () {
        return (mem.gb / 1024).toFixed(2) + ' TiB  (' + mem.mode + ')';
      }));
    }
    HW.bay.filter(function (b) { return !b.filler; }).forEach(function (b) {
      const out = !!chassis.querySelector('.bay.pulled[data-unit="hdd' + b.bay + '"]');
      rows.push(roRow('NVMe ' + b.bay, function () {
        return out ? '--- отсутствует ---' : b.model + '  ' + b.tb + ' TB';
      }));
    });
    return rows;
  }

  // ── Advanced: оглавление, а не список тумблеров ──────────────────────────
  function advRows() {
    return [
      { label: 'Processor Configuration', kind: 'menu', rows: advCpuRows,
        help: 'Ядра, потоки, состояния простоя, трансляция адресов и предел мощности пакета.' },
      { label: 'Memory Configuration', kind: 'menu', rows: advMemRows,
        help: 'Частота, режим отказоустойчивости, фоновая проверка.' },
      { label: 'Power & Performance', kind: 'menu', rows: advPowerRows,
        help: 'Профиль питания, детерминизм, поведение после пропажи питания.' },
      { label: 'PCIe Configuration', kind: 'menu', rows: advPcieRows,
        help: 'Окно выше четырёх гигабайт, SR-IOV, скорость линка в слотах.' },
      { label: 'Serial Port Console Redirection', kind: 'menu', rows: advSolRows,
        help: 'Вывод консоли в последовательный порт.' },
    ];
  }

  function advCpuRows() {
    return [
      boolRow('smt', 'SMT', 'ht',
        'Симметричная многопоточность: по два потока на ядро. Это же поле читает /proc/cpuinfo.',
        { reboot: true }),
      enumRow('cores', 'Active Cores per Socket', 'cores', CORE_OPTIONS,
        'Сколько ядер на сокет включено. Меньше — ниже TDP и температура в простое.',
        { reboot: true }),
      boolRow('numa', 'NUMA', 'numa',
        'Топология памяти: узел на сокет или единая плоская карта.', { reboot: true }),
      boolRow('cstates', 'C-States', 'cstates',
        'Глубокие состояния простоя ядра. Выключают ради предсказуемой '
        + 'задержки — и тогда слышно, как поют дроссели: ядра не засыпают.',
        { reboot: true }),
      boolRow('iommu', 'IOMMU (AMD-Vi)', 'iommu',
        'Трансляция адресов для устройств. Без неё нет ни проброса в гостя, ни '
        + '/sys/class/iommu, а ядро получает amd_iommu=off.', { reboot: true }),
      { id: 'plimit', label: 'Package Power Limit', kind: 'num', reboot: true,
        get: function () {
          return nvDraft.powerLimit ? nvDraft.powerLimit + ' W' : 'Auto (' + HW.cpu.tdp + ' W)';
        },
        set: function (dir) {
          let v = Number(nvDraft.powerLimit) || HW.cpu.tdp;
          v += dir > 0 ? PW_LIMIT_STEP : -PW_LIMIT_STEP;
          // Ниже четверти пакета не опускаемся: живая прошивка тоже не даёт
          // задушить процессор до состояния, в котором он не проходит самотест.
          const floor = Math.round(HW.cpu.tdp / 4 / PW_LIMIT_STEP) * PW_LIMIT_STEP;
          if (v >= HW.cpu.tdp) v = 0;                 // 0 — это Auto, паспортный TDP
          else if (v < floor) v = floor;
          nvDraft.powerLimit = v;
        },
        help: 'Потолок мощности пакета. Паспортный TDP — ' + HW.cpu.tdp
              + ' Вт; заниженный виден в top и в sensors.' },
    ];
  }

  function advMemRows() {
    const d = dimmState();
    const rows = [
      enumRow('memfreq', 'Memory Frequency', 'memfreq', MEM_FREQ_OPTIONS,
        'Auto берёт паспортную скорость модулей: ' + HW.dimm.speed + ' MT/s.', { reboot: true }),
      enumRow('memmode', 'Memory Mode', 'memMode', ['Independent', 'Mirroring', 'Sparing'],
        'Зеркалирование и резервный ранг стоят половины объёма, зато машина '
        + 'переживает отказ ранга. Зеркало требует симметрично набитых каналов: '
        + 'вынутая планка отправляет режим обратно в Independent.', { reboot: true }),
      boolRow('patrol', 'Patrol Scrub', 'patrol',
        'Фоновый обход памяти, вычитывающий и чинящий одиночные ошибки.', { reboot: true }),
    ];
    const mem = memPlan(nvDraft);
    rows.push(roRow('Installed / Usable', function () {
      return (d.gb / 1024).toFixed(2) + ' / ' + (mem.gb / 1024).toFixed(2) + ' TiB';
    }));
    if (mem.fell) rows.push(roRow('Mirroring Status', function () { return 'unavailable — ' + mem.why; }));
    return rows;
  }

  function advPowerRows() {
    return [
      enumRow('power', 'Power Profile', 'power', POWER_OPTIONS,
        'Efficiency прижимает и охлаждение: обороты падают до самого тихого '
        + 'режима, а вместе с ними и тон гула — со слухом это заметнее, чем глазом.',
        { reboot: true }),
      enumRow('determinism', 'Determinism Control', 'determinism', ['Performance', 'Power'],
        'Performance держит одинаковую частоту на всех машинах партии, Power '
        + 'выжимает из конкретного экземпляра всё, что он может.', { reboot: true }),
      enumRow('acrestore', 'Restore on AC Power Loss', 'acRestore', AC_OPTIONS,
        'Что делать, когда питание вернулось. Проверяется руками: вынуть оба '
        + 'блока и вставить обратно.'),
      boolRow('wol', 'Wake on LAN', 'wol', 'Подъём машины пакетом из сети управления.'),
      boolRow('watchdog', 'ASR Watchdog', 'watchdog',
        'Сторожевой таймер. Машина, вставшая без устройства загрузки, будет '
        + 'перезапущена сама — ровно за этим он в серверах и стоит.'),
      { id: 'wdtmin', label: 'ASR Timeout', kind: 'enum', options: WDT_OPTIONS,
        get: function () { return nvDraft.watchdogMin + ' min'; },
        set: function (dir) { nvDraft.watchdogMin = cycleEnum(WDT_OPTIONS, nvDraft.watchdogMin, dir); },
        help: 'Сколько ждать, прежде чем перезапустить.' },
    ];
  }

  function advPcieRows() {
    return [
      boolRow('above4g', 'Above 4G Decoding', 'above4g',
        'Окно памяти устройств выше четырёх гигабайт. Без него карте с большой '
        + 'памятью на борту некуда лечь — самотест ругается, и лампа слота горит.',
        { reboot: true }),
      boolRow('sriov', 'SR-IOV Support', 'sriov',
        'Виртуальные функции сетевой карты. Требует включённого окна выше 4G.',
        { reboot: true }),
      enumRow('pciespeed', 'PCIe Link Speed', 'pcieSpeed', PCIE_SPEED_OPTIONS,
        'Потолок скорости линка в слотах райзеров. Auto — что смогут договорить.',
        { reboot: true }),
      roRow('Slot 1', function () {
        const r = HW.riser[0];
        return r.link + (r.empty ? ' · empty' : ' · ' + r.card);
      }),
      roRow('Slot 2', function () {
        const r = HW.riser[1];
        return r.link + (r.empty ? ' · empty' : ' · ' + r.card);
      }),
    ];
  }

  function advSolRows() {
    const rows = [
      boolRow('sol', 'Console Redirection', 'sol',
        'Вывод консоли в последовательный порт. На машине без монитора это '
        + 'единственный способ увидеть самотест.'),
    ];
    if (nvDraft.sol === 'Enabled') {
      rows.push(enumRow('baud', 'Baud Rate', 'solBaud', BAUD_OPTIONS,
        'Скорость порта. 115200 — то, что стоит в консольных серверах по умолчанию.'));
      rows.push(roRow('Terminal Type', function () { return 'VT100+'; }));
      rows.push(roRow('Flow Control', function () { return 'None'; }));
    }
    return rows;
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  function bootRows() {
    const rows = [];
    rows.push(enumRow('mode', 'Boot Mode', 'mode', ['UEFI', 'Legacy'],
      'Legacy прячет Secure Boot, переводит /sys/firmware/efi в офлайн и не '
      + 'видит разметку GPT — а с ней и накопитель как устройство загрузки.',
      { reboot: true }));

    if (nvDraft.mode === 'UEFI') {
      rows.push(boolRow('secure', 'Secure Boot', 'secureBoot',
        'Выключенный Secure Boot зажигает системную лампу неисправности на схеме.',
        { reboot: true }));
    }

    rows.push(boolRow('quiet', 'Quiet Boot', 'quietBoot',
      'Прячет строки самотеста за логотипом производителя. В консоль они идут '
      + 'всё равно: лента самотеста это ещё и журнал.', { reboot: true }));

    rows.push({ label: 'Network Boot Configuration', kind: 'menu', rows: bootNetRows,
      help: 'Сетевой стек прошивки и загрузка по PXE.' });
    rows.push({ label: 'Boot Option Priorities', kind: 'menu', rows: bootOrderRows,
      help: 'Порядок опроса устройств. Первый пункт грузится первым.' });
    return rows;
  }

  function bootNetRows() {
    const rows = [
      boolRow('netstack', 'UEFI Network Stack', 'netStack',
        'Весь сетевой стек прошивки. Выключенный убирает PXE из списка загрузки.',
        { reboot: true }),
    ];
    if (nvDraft.netStack === 'Enabled') {
      rows.push(boolRow('pxe', 'PXE Boot to LAN', 'pxe',
        'Загрузка по сети через ' + HW.ports.sfp + '.', { reboot: true }));
      rows.push(roRow('PXE Device', function () { return BOOT_SETUP_LABEL.pxe; }));
    }
    return rows;
  }

  function bootOrderRows() {
    return nvDraft.bootOrder.map(function (key, idx) {
      return { id: 'order' + idx, label: 'Boot Option #' + (idx + 1), kind: 'order', idx: idx,
        reboot: true,
        get: function () {
          const k = nvDraft.bootOrder[idx];
          return BOOT_SETUP_LABEL[k] + (bootAvailable(k, nvDraft) ? '' : '  (unavailable)');
        },
        help: 'Enter/+ — вниз по списку, - — вверх. Устройства, которых сейчас в '
              + 'машине нет, помечены: порядок их помнит, загрузка пропускает.' };
    });
  }

  // ── Security ─────────────────────────────────────────────────────────────
  // Пароль тут не защита, а её рисунок: лежит он в NVRAM открытым текстом, и
  // снимается тем же F9, что и всё остальное. На живой машине за это отвечает
  // перемычка на плате, и в подсказке об этом сказано честно.
  function securityRows() {
    const rows = [
      { id: 'adminpw', label: 'Administrator Password', kind: 'password', field: 'adminPw',
        get: function () { return nvDraft.adminPw ? 'Installed' : 'Not Installed'; },
        help: 'Спрашивается на входе в Setup. Enter — задать или сменить, пустой '
              + 'ввод — снять. Хранится открытым: это рисунок защиты, а не защита.' },
      { id: 'poweronpw', label: 'Power-On Password', kind: 'password', field: 'powerOnPw',
        get: function () { return nvDraft.powerOnPw ? 'Installed' : 'Not Installed'; },
        help: 'Спрашивается при включении машины, до передачи управления системе.' },
    ];

    if (nvDraft.mode === 'UEFI') {
      rows.push(roRow('Secure Boot State', function () {
        return nvDraft.secureBoot === 'Enabled' ? nvDraft.sbKeys : 'Disabled';
      }));
      rows.push(enumRow('sbkeys', 'Secure Boot Mode', 'sbKeys', ['User Mode', 'Setup Mode'],
        'User Mode — ключи установлены и проверяются. Setup Mode — платформа '
        + 'открыта для записи своих ключей.', { reboot: true }));
      rows.push({ id: 'clearkeys', label: 'Clear All Secure Boot Keys', kind: 'action',
        help: 'Стирает PK, KEK и базу подписей. Платформа уходит в Setup Mode.',
        run: function () {
          askConfirm('Clear all Secure Boot keys?', function () {
            nvDraft.sbKeys = 'Setup Mode';
            nvDraft.secureBoot = 'Disabled';
            line('bios: secure boot keys cleared', 'warn');
          });
        } });
    }

    rows.push(boolRow('tpm', 'TPM Device', 'tpm',
      'Доверенный модуль. Без него Secure Boot всё ещё работает, но измерения '
      + 'загрузки писать некуда.', { reboot: true }));
    rows.push(roRow('TPM Version', function () {
      return nvDraft.tpm === 'Enabled' ? '2.0  (fTPM)' : '--- disabled ---';
    }));
    return rows;
  }

  // ── IMM ──────────────────────────────────────────────────────────────────
  function immRows() {
    return [
      { label: 'Network Configuration', kind: 'menu', rows: immNetRows,
        help: 'Адрес сети управления и порт, которым контроллер в неё смотрит.' },
      { label: 'Cooling', kind: 'menu', rows: immCoolRows,
        help: 'Политика оборотов. Охлаждением распоряжается контроллер, а не '
              + 'прошивка, — потому она и стоит здесь, а не в Advanced.' },
      { label: 'System Event Log', kind: 'menu', rows: immSelRows,
        help: 'Журнал событий машины.' },
      enumRow('vmedia', 'Remote Media', 'vmedia', ['Detached', 'Attached'],
        'Виртуальный привод контроллера. Пока к нему не подключён образ, он есть '
        + 'в списке загрузки, но грузиться с него нельзя — как и на живой машине.'),
      roRow('BMC Firmware', function () { return HW.fw.bmc + '  ' + HW.fw.bmc_chip; }),
      roRow('MAC Address', function () { return HW.fw.mac; }),
    ];
  }

  function immNetRows() {
    const rows = [];
    rows.push(enumRow('immnic', 'IMM Network Interface', 'immNic', ['Dedicated', 'Shared'],
      'Dedicated — отдельный порт управления. Shared — контроллер едет по первому '
      + 'гигабитному порту вместе с системным трафиком.'));
    rows.push(enumRow('proto', 'IPv4 Configuration', 'ipMode', ['DHCP', 'Static'],
      'DHCP — адрес из сети управления. Static открывает три поля ниже.'));

    if (nvDraft.ipMode === 'Static') {
      rows.push({ id: 'ip', label: 'IP Address', kind: 'text', field: 'ip',
        get: function () { return nvDraft.ip; },
        help: 'Enter — начать правку: цифры и точка накапливаются в строке, Enter — принять, Esc — отменить только эту правку.' });
      rows.push({ id: 'mask', label: 'Subnet Mask', kind: 'text', field: 'mask',
        get: function () { return nvDraft.mask; },
        help: 'Маска подсети сети управления BMC.' });
      rows.push({ id: 'gw', label: 'Default Gateway', kind: 'text', field: 'gw',
        get: function () { return nvDraft.gw; },
        help: 'Шлюз сети управления.' });
    }
    rows.push(roRow('MAC Address', function () { return HW.fw.mac; }));
    return rows;
  }

  function immCoolRows() {
    const ids = fanPolicyIds();
    const rows = [
      enumRow('fanpolicy', 'Fan Speed Policy', 'fanPolicy', ids,
        'Обороты крыльчаток. Тон гула идёт за ними: лопаточная частота — это '
        + 'лопасти × об/мин ÷ 60. Профиль питания Efficiency прижимает политику '
        + 'к самому тихому режиму независимо от того, что выбрано здесь.'),
      roRow('Target Speed', function () { return fanTargetRpm(nvDraft) + ' rpm'; }),
      roRow('Installed Fans', function () {
        return (HW.fan.n - counts('.fan.pulled')) + ' of ' + HW.fan.n + '  ' + HW.fan.model;
      }),
      roRow('Blades per Rotor', function () { return String(HW.fan.blades); }),
    ];
    if (nvDraft.power === 'Efficiency') {
      rows.push(roRow('Override', function () { return 'Power Profile: Efficiency → ' + ids[0]; }));
    }
    return rows;
  }

  function immSelRows() {
    const rows = [];
    if (!SEL_LOG.length) {
      rows.push(roRow('Log', function () { return 'empty'; }));
    } else {
      SEL_LOG.slice(-12).forEach(function (e) {
        rows.push(roRow('0x' + e.id.toString(16).padStart(4, '0'), function () { return e.t; }));
      });
    }
    rows.push({ id: 'selclear', label: 'Clear System Event Log', kind: 'action',
      help: 'Стирает журнал. Защёлкнутая лампа неисправности гаснет вместе с ним.',
      run: function () {
        askConfirm('Clear the System Event Log?', function () {
          SEL_LOG.length = 0;
          line('bios: system event log cleared', 'warn');
        });
      } });
    return rows;
  }

  // ── Save & Exit ──────────────────────────────────────────────────────────
  // Последняя вкладка Aptio, и она всегда одна и та же. Внизу — Boot Override:
  // второй путь к однократной загрузке, уже без всплывающего меню.
  function saveRows() {
    const rows = [
      { id: 'savexit', label: 'Save Changes and Exit', kind: 'action',
        help: 'Записать изменения в NVRAM и выйти.',
        run: function () { askConfirm('Save configuration and exit?', function () { commitSetup(); }); } },
      { id: 'discardexit', label: 'Discard Changes and Exit', kind: 'action',
        help: 'Выйти, не записывая.',
        run: function () { askConfirm('Discard changes and exit?', discardSetup); } },
      { id: 'save', label: 'Save Changes', kind: 'action',
        help: 'Записать и остаться в Setup.',
        run: function () { askConfirm('Save configuration?', function () { commitSetup(true); }); } },
      { id: 'discard', label: 'Discard Changes', kind: 'action',
        help: 'Вернуть черновик к тому, что лежит в NVRAM.',
        run: function () {
          askConfirm('Discard changes?', function () {
            nvDraft = cloneNv(nv);
            line('bios: changes discarded', 'muted');
          });
        } },
      { id: 'defaults', label: 'Restore Optimized Defaults', kind: 'action',
        help: 'Заводские значения. То же самое делает F9.',
        run: function () { askConfirm('Load optimized defaults?', loadDefaults); } },
      { label: 'Boot Override', ro: true, head: true, get: function () { return ''; } },
    ];
    nvDraft.bootOrder.forEach(function (key) {
      rows.push({ id: 'override' + key, label: '  ' + BOOT_SETUP_LABEL[key], kind: 'action',
        help: bootAvailable(key, nvDraft)
          ? 'Загрузиться отсюда один раз. Сохранённый порядок не меняется.'
          : 'Устройство недоступно: ' + bootWhyNot(key, nvDraft),
        run: function () {
          if (!bootAvailable(key, nvDraft)) {
            line('bios: ' + BOOT_SETUP_LABEL[key] + ' — ' + bootWhyNot(key, nvDraft), 'warn');
            return;
          }
          bootNext = key;
          closeSetup();
          screenPost();
        } });
    });
    return rows;
  }

  const TAB_ROOT = {
    'Main': mainRows, 'Advanced': advRows, 'Boot': bootRows,
    'Security': securityRows, 'IMM': immRows, 'Save & Exit': saveRows,
  };

  function currentRows() {
    if (menuPath.length) return menuPath[menuPath.length - 1].rows();
    return TAB_ROOT[SETUP_TABS[setupTab]]();
  }

  function firstNavigable(rows) {
    for (let i = 0; i < rows.length; i++) if (!rows[i].ro) return i;
    return -1;
  }
  function stepRow(rows, from, dir) {
    let i = from;
    for (let n = 0; n < rows.length; n++) {
      i += dir;
      if (i < 0 || i >= rows.length) return from;
      if (!rows[i].ro) return i;
    }
    return from;
  }

  function moveBootOrder(idx, dir) {
    const order = nvDraft.bootOrder;
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    const tmp = order[idx]; order[idx] = order[j]; order[j] = tmp;
  }

  function beginEdit(r) {
    editField = { row: r, buf: String(r.get()) };
  }

  function activateRow(rows, dir) {
    const r = rows[setupRow];
    if (!r || r.ro) return;
    if (r.kind === 'bool') r.set();
    else if (r.kind === 'enum' || r.kind === 'num') r.set(dir);
    else if (r.kind === 'order') moveBootOrder(r.idx, dir);
    else if (r.kind === 'text' && dir === 1) beginEdit(r);
    else if (r.kind === 'password' && dir === 1) askPassword(r);
    else if (r.kind === 'menu' && dir === 1) { menuPath.push({ label: r.label, rows: r.rows }); setupRow = -1; }
    else if (r.kind === 'action' && dir === 1) r.run();
  }

  function handleEditKey(e) {
    const ef = editField;
    if (e.key === 'Enter') {
      e.preventDefault();
      nvDraft[ef.row.field] = ef.buf;
      editField = null;
      renderSetupTab();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editField = null;              // cancels only this edit, not the whole setup
      renderSetupTab();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      ef.buf = ef.buf.slice(0, -1);
      renderSetupTab();
    } else if (e.key.length === 1 && /[0-9.]/.test(e.key)) {
      e.preventDefault();
      ef.buf += e.key;               // characters pile up in a span — without a single <input>
      renderSetupTab();
    }
  }

  function nvDirty() {
    return !!nvDraft && JSON.stringify(nvDraft) !== JSON.stringify(nv);
  }

  function loadDefaults() {
    nvDraft = cloneNv(NV_DEFAULT);   // wipes only the draft — F9 does not touch the power
    menuPath = [];
    setupRow = -1;
    line('bios: optimized defaults loaded', 'warn');
  }

  function handleSetupKey(e) {
    if (editField) { handleEditKey(e); return; }
    const rows = currentRows();
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        // Вкладки переключаются только с корня: на живой машине стрелка внутри
        // подменю не выбрасывает наружу через уровень.
        if (menuPath.length) return;
        setupTab = (setupTab - 1 + SETUP_TABS.length) % SETUP_TABS.length;
        setupRow = -1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (menuPath.length) return;
        setupTab = (setupTab + 1) % SETUP_TABS.length;
        setupRow = -1;
        break;
      case 'ArrowUp':
        e.preventDefault();
        setupRow = stepRow(rows, setupRow, -1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setupRow = stepRow(rows, setupRow, 1);
        break;
      case 'Enter': case '+': case '=':
        e.preventDefault();
        activateRow(rows, 1);
        break;
      case '-':
        e.preventDefault();
        activateRow(rows, -1);
        break;
      case 'F1':
        e.preventDefault();
        openHelp();
        return;
      case 'F9':
        e.preventDefault();
        askConfirm('Load optimized defaults?', loadDefaults);
        return;
      case 'F10':
        e.preventDefault();
        askConfirm('Save configuration and exit?', function () { commitSetup(); });
        return;
      case 'F11': case 'F12':
        e.preventDefault();
        openBootMenu(false);
        return;
      case 'Escape':
        e.preventDefault();
        if (menuPath.length) { menuPath.pop(); setupRow = -1; break; }
        // Выход с несохранёнными правками спрашивает — как и положено. Без
        // правок уходит молча: лишняя рамка на пустом месте раздражает.
        if (nvDirty()) { askConfirm('Discard changes and exit?', discardSetup); return; }
        discardSetup();
        return;                        // discardSetup closes the dialog itself
      default:
        return;
    }
    renderSetupTab();
  }

  function renderSetupTab() {
    setupTabsEl.innerHTML = '';
    SETUP_TABS.forEach(function (name, i) {
      const t = document.createElement('span');
      t.className = 'crt-tab' + (i === setupTab ? ' active' : '');
      t.textContent = name;
      setupTabsEl.appendChild(t);
    });

    // Хлебные крошки: без них, провалившись на два уровня, уже не сказать, где
    // стоишь, — а Esc из подменю ведёт себя не так, как Esc с корня.
    if (setupPathEl) {
      const trail = [SETUP_TABS[setupTab]].concat(menuPath.map(function (m) { return m.label; }));
      setupPathEl.textContent = trail.join('  ▸  ');
    }

    const rows = currentRows();
    if (setupRow < 0 || setupRow >= rows.length || rows[setupRow].ro) {
      setupRow = firstNavigable(rows);
    }

    setupRowsEl.innerHTML = '';
    rows.forEach(function (r, i) {
      const rowEl = document.createElement('div');
      rowEl.className = 'crt-row'
        + (r.ro ? ' ro' : '')
        + (r.head ? ' head' : '')
        + (r.kind === 'menu' ? ' menu' : '')
        + (r.kind === 'action' ? ' action' : '')
        + (i === setupRow ? ' sel' : '')
        + (editField && editField.row === r ? ' editing' : '');
      const label = document.createElement('span');
      label.className = 'crt-row-label';
      // Вход внутрь помечен треугольником, как в Aptio: по нему видно, что
      // Enter здесь уводит на уровень ниже, а не меняет значение.
      label.textContent = (r.kind === 'menu' ? '▶ ' : '') + r.label + (r.reboot ? ' *' : '');
      const value = document.createElement('span');
      value.className = 'crt-row-value';
      // У входа в подменю и у действия значения справа нет вовсе — как и в
      // Aptio: там это строка-команда, а не строка-настройка.
      value.textContent = (editField && editField.row === r) ? editField.buf + '_'
                        : (typeof r.get === 'function' ? r.get() : '');
      rowEl.appendChild(label);
      rowEl.appendChild(value);
      setupRowsEl.appendChild(rowEl);
    });

    // Прокрутка длинных списков: выбранная строка обязана оставаться на виду.
    // Настоящий BIOS листает страницами, у нас листает контейнер — но маркеры
    // ▲▼ появляются там же и по тому же поводу.
    const selEl = setupRowsEl.children[setupRow];
    if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' });
    updateScrollMarks();

    const sel = rows[setupRow];
    setupHelpEl.textContent = sel ? (sel.help || '')
      : 'Только чтение: состав машины по паспорту и текущей сборке.';
    setupNoteEl.hidden = !rows.some(function (r) { return r.reboot; });
    if (setupKeysEl) {
      setupKeysEl.textContent = menuPath.length
        ? 'F1 Help · ↑/↓ строка · Enter/+/− изменить · F9 Defaults · F10 Save & Exit · Esc назад'
        : 'F1 Help · ←/→ раздел · ↑/↓ строка · Enter/+/− изменить · F9 Defaults · F10 Save & Exit · F11 Boot · Esc Exit';
    }
  }

  function updateScrollMarks() {
    const box = setupRowsEl;
    box.classList.toggle('more-up', box.scrollTop > 1);
    box.classList.toggle('more-down', box.scrollTop + box.clientHeight < box.scrollHeight - 1);
  }

  // ── Вход в Setup и пароль администратора ─────────────────────────────────
  function requestSetup() {
    if (nv.adminPw) {
      // Экран поднимаем до запроса, и это не украшение: накладка живёт внутри
      // него, а клавиши ей раздаёт диспетчер, который на закрытом экране молчит.
      // Спросить пароль, не показав экрана, значило бы спросить и не услышать —
      // ввод уходил бы в пустоту, а Enter открывал бы запрос заново.
      if (!crtOpen) blankScreen(0xab);
      askPasswordPrompt('Enter Administrator Password', function (given) {
        if (given === nv.adminPw) { postCtl = null; openSetup(); return true; }
        line('bios: invalid password', 'err');
        selAdd('Setup password attempt failed', 'warn');
        return false;
      }, '', function () {
        if (postCtl && postCtl.standalone) { postCtl = null; closeCrt(); }
      });
      return;
    }
    openSetup();
  }

  function openSetup() {
    nvDraft = cloneNv(nv);
    editField = null;
    menuPath = [];
    setupTab = 0;
    setupRow = -1;
    openCrt('setup');
    postCode(0xa9);
    renderSetupTab();
  }

  function closeSetup() {
    nvDraft = null;
    editField = null;
    menuPath = [];
    closeCrt();
  }

  function commitSetup(stay) {
    const before = JSON.stringify(nv);
    nv = cloneNv(nvDraft);
    saveNv();
    applyNvEffects();
    // Каждое сохранение — событие в журнале. Так ведёт себя любой контроллер
    // управления: он видит запись в NVRAM и отмечает её, чтобы потом было с
    // чем сверяться.
    if (before !== JSON.stringify(nv)) selAdd('System boot settings changed', 'ok');
    line('bios: settings saved · вступит в силу после перезагрузки', 'ok');
    if (stay) { nvDraft = cloneNv(nv); renderSetupTab(); return; }
    closeSetup();
  }

  function discardSetup() {
    line('bios: exit without saving', 'muted');
    closeSetup();
  }

  // ── Накладки ─────────────────────────────────────────────────────────────
  // Одна разметка на четверых: рамка подтверждения, меню загрузки, окно помощи
  // и запрос пароля отличаются содержимым и разбором клавиш, но не устройством.
  function closeOverlay() {
    overlay = null;
    if (overlayEl) overlayEl.hidden = true;
  }

  function renderOverlay() {
    if (!overlay || !overlayEl) return;
    overlayEl.hidden = false;
    overlayEl.dataset.kind = overlay.kind;
    overlayTitleEl.textContent = overlay.title;
    overlayBodyEl.innerHTML = '';

    if (overlay.kind === 'help') {
      const pre = document.createElement('pre');
      pre.className = 'crt-help-text';
      pre.textContent = overlay.text;
      overlayBodyEl.appendChild(pre);
    } else if (overlay.kind === 'password') {
      const row = document.createElement('div');
      row.className = 'crt-overlay-input';
      // Звёздочки, а не точки: BIOS набирает поле знакоместами.
      row.textContent = overlay.buf.replace(/./g, '*') + '_';
      overlayBodyEl.appendChild(row);
      if (overlay.note) {
        const note = document.createElement('div');
        note.className = 'crt-overlay-note';
        note.textContent = overlay.note;
        overlayBodyEl.appendChild(note);
      }
    } else {
      overlay.items.forEach(function (it, i) {
        const el = document.createElement('div');
        el.className = 'crt-overlay-item' + (i === overlay.sel ? ' sel' : '') + (it.dim ? ' dim' : '');
        el.textContent = it.label;
        overlayBodyEl.appendChild(el);
      });
    }
    overlayKeysEl.textContent = overlay.keys;
  }

  function askConfirm(title, onYes) {
    overlay = {
      kind: 'confirm', title: title, sel: 0,
      items: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
      keys: '←/→ выбор · Enter — принять · Esc — отмена',
      done: function (v) {
        closeOverlay();
        if (v) onYes();
        if (crtOpen && crt.dataset.mode === 'setup') renderSetupTab();
      },
    };
    renderOverlay();
  }

  // Окно помощи — то самое, что в Aptio открывается по F1: рамка с легендой
  // клавиш. Раньше подсказка уходила строкой в консоль, а консоль в этот момент
  // лежит под экраном и помечена inert — то есть не появлялась нигде.
  function openHelp() {
    overlay = {
      kind: 'help', title: 'General Help',
      text: [
        '  ↑ ↓        Select Item',
        '  ← →        Select Screen',
        '  Enter      Select / Sub-Menu',
        '  + / −      Change Value',
        '  F1         General Help',
        '  F9         Optimized Defaults',
        '  F10        Save & Exit',
        '  F11        Boot Menu',
        '  Esc        Exit / Back',
      ].join('\n'),
      keys: 'Enter или Esc — закрыть',
      done: function () { closeOverlay(); renderSetupTab(); },
    };
    renderOverlay();
  }

  // Всплывающее меню загрузки. Выбор однократный: сохранённый порядок он не
  // трогает, и следующая загрузка снова идёт по нему. Ровно так работает
  // BootNext в UEFI.
  function bootMenuItems(withSetup) {
    const items = nv.bootOrder.map(function (k) {
      const ok = bootAvailable(k);
      return { label: BOOT_SETUP_LABEL[k] + (ok ? '' : '  — ' + bootWhyNot(k)), value: k, dim: !ok };
    });
    if (withSetup) items.push({ label: 'Enter Setup', value: '@setup' });
    return items;
  }

  function openBootMenu(withSetup) {
    const items = bootMenuItems(withSetup);
    let first = 0;
    for (let i = 0; i < items.length; i++) if (!items[i].dim) { first = i; break; }
    overlay = {
      kind: 'boot', title: 'Please select boot device:', sel: first, items: items,
      keys: '↑/↓ выбор · Enter — загрузиться · Esc — отмена',
      done: function (v) {
        closeOverlay();
        if (v === null) {
          if (crtOpen && crt.dataset.mode === 'setup') renderSetupTab();
          // Меню, поднятое на пустом поле, уносит это поле с собой: оставить
          // после отмены чёрный экран было бы тупиком.
          else if (postCtl && postCtl.standalone) { postCtl = null; closeCrt(); }
          return;
        }
        if (v === '@setup') { postCtl = null; requestSetup(); return; }
        bootNext = v;
        line('boot: ' + BOOT_SETUP_LABEL[v] + ' (one time)', 'muted');
        postCtl = null;
        if (crt.dataset.mode === 'setup') closeSetup();
        screenPost();
      },
    };
    renderOverlay();
  }

  // F11 при закрытом экране: меню поднимается само, поверх пустого поля — как
  // на машине, которую только что включили и успели поймать.
  function openBootMenuStandalone() {
    blankScreen(0xae);
    openBootMenu(true);
  }

  function askPasswordPrompt(title, check, note, onCancel) {
    overlay = {
      kind: 'password', title: title, buf: '', note: note || '',
      keys: 'Enter — принять · Esc — отмена',
      done: function (v) {
        if (v === null) { closeOverlay(); if (onCancel) onCancel(); return; }
        // Своя рамка запоминается до проверки: проверка может открыть
        // следующую — второй ввод пароля идёт сразу за первым, — и закрыть
        // тогда надо себя, а не её. Иначе «повторите ввод» гаснет в тот же
        // кадр, в котором появился.
        const mine = overlay;
        if (check(v)) { if (overlay === mine) closeOverlay(); }
        else { mine.buf = ''; mine.note = 'Invalid password'; renderOverlay(); }
      },
    };
    renderOverlay();
  }

  // Задать пароль: спрашиваем дважды, как это делает всякая прошивка. Пустой
  // ввод снимает пароль — и это тоже её поведение, а не наша поблажка.
  function askPassword(row) {
    askPasswordPrompt('Create New Password', function (first) {
      askPasswordPrompt('Confirm New Password', function (second) {
        if (first !== second) {
          line('bios: passwords do not match', 'err');
          return true;                       // рамку закрываем, значение не трогаем
        }
        nvDraft[row.field] = first;
        line('bios: ' + row.label.toLowerCase() + (first ? ' installed' : ' cleared'), 'warn');
        renderSetupTab();
        return true;
      }, 'Повторите ввод');
      return true;
    }, 'Пустой ввод снимает пароль');
  }

  function handleOverlayKey(e) {
    const o = overlay;
    if (o.kind === 'password') {
      if (e.key === 'Enter') { e.preventDefault(); o.done(o.buf); }
      else if (e.key === 'Escape') { e.preventDefault(); o.done(null); }
      else if (e.key === 'Backspace') { e.preventDefault(); o.buf = o.buf.slice(0, -1); renderOverlay(); }
      else if (e.key.length === 1) { e.preventDefault(); o.buf += e.key; renderOverlay(); }
      return;
    }
    if (o.kind === 'help') {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); o.done(); }
      return;
    }
    const horiz = o.kind === 'confirm';
    const prev = horiz ? 'ArrowLeft' : 'ArrowUp';
    const next = horiz ? 'ArrowRight' : 'ArrowDown';
    if (e.key === prev) { e.preventDefault(); o.sel = (o.sel - 1 + o.items.length) % o.items.length; renderOverlay(); }
    else if (e.key === next) { e.preventDefault(); o.sel = (o.sel + 1) % o.items.length; renderOverlay(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const it = o.items[o.sel];
      if (it.dim) return;               // недоступное устройство не выбирается
      o.done(it.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      o.done(o.kind === 'confirm' ? false : null);
    }
  }

  // The current (saved) settings line by line — the thing that has to pipe:
  // `bios dump | grep Boot`. The draft deliberately does not get here: until
  // F10 has been pressed, from the outside the firmware has not changed.
  function nvDumpLines() {
    const mem = memPlan();
    const rows = [];
    const put = function (k, v, c) {
      rows.push({ t: (k + '                       ').slice(0, 23) + ': ' + v, c: c || '' });
    };
    put('Boot Mode', nv.mode);
    if (nv.mode === 'UEFI') put('Secure Boot', nv.secureBoot, nv.secureBoot === 'Disabled' ? 'warn' : '');
    put('Quiet Boot', nv.quietBoot);
    put('SMT', nv.ht);
    put('Active Cores/Socket', nv.cores);
    put('NUMA', nv.numa);
    put('IOMMU', nv.iommu);
    put('Memory Frequency', nv.memfreq);
    put('Memory Mode', nv.memMode + (mem.fell ? ' (fell back: ' + mem.why + ')' : ''),
        mem.fell ? 'warn' : '');
    put('Patrol Scrub', nv.patrol);
    put('Power Profile', nv.power);
    put('Determinism', nv.determinism);
    put('Package Power Limit', nv.powerLimit ? nv.powerLimit + ' W' : 'Auto');
    put('C-States', nv.cstates);
    put('Above 4G Decoding', nv.above4g, nv.above4g === 'Disabled' ? 'warn' : '');
    put('SR-IOV', nv.sriov);
    put('PCIe Link Speed', nv.pcieSpeed);
    put('UEFI Network Stack', nv.netStack);
    put('PXE Boot to LAN', nv.pxe);
    put('Boot Order', nv.bootOrder.map(function (k) { return BOOT_SETUP_LABEL[k]; }).join(' → '));
    put('Restore on AC Loss', nv.acRestore);
    put('Wake on LAN', nv.wol);
    put('ASR Watchdog', nv.watchdog === 'Enabled' ? nv.watchdogMin + ' min' : 'Disabled');
    put('Console Redirection', nv.sol === 'Enabled' ? 'COM1 ' + nv.solBaud + ' 8N1' : 'Disabled');
    put('Fan Speed Policy', fanPolicyEffective() + ' · ' + fanTargetRpm() + ' rpm');
    put('Admin Password', nv.adminPw ? 'Installed' : 'Not Installed');
    put('Power-On Password', nv.powerOnPw ? 'Installed' : 'Not Installed');
    put('TPM Device', nv.tpm);
    put('Secure Boot Mode', nv.sbKeys);
    put('IMM Interface', nv.immNic);
    put('IMM Remote Media', nv.vmedia);
    put('IMM IPv4', nv.ipMode === 'DHCP' ? 'DHCP'
      : 'Static ' + nv.ip + ' / ' + nv.mask + ' gw ' + nv.gw);
    return rows;
  }

  // ── top ──────────────────────────────────────────────────────────────────
  // Five metrics — the same ones that used to live in the gauges on the side;
  // metric(key) is now computed once in parts/hw.js, and cpuState/dimmState/
  // upSeconds for the header come from there too, so as not to start a second
  // way of computing the same thing. The history is kept in a canvas rather
  // than in hundreds of <div> bars: one repaint a second instead of shifting
  // half a thousand DOM nodes in that same tick.
  const TOP_KEYS = ['cpu', 'temp', 'net', 'iops', 'power'];
  const TOP_LABELS = { cpu: 'CPU', temp: 'TEMP', net: 'NET', iops: 'IOPS', power: 'POWER' };
  const topHistory = { cpu: [], temp: [], net: [], iops: [], power: [] };
  let topTimer = null;

  function buildTopGrid() {
    topGridEl.innerHTML = '';
    TOP_KEYS.forEach(function (k) {
      const card = document.createElement('div');
      card.className = 'crt-top-card';
      const label = document.createElement('div');
      label.className = 'crt-top-label';
      label.textContent = TOP_LABELS[k];
      const value = document.createElement('div');
      value.className = 'crt-top-value';
      value.id = 'crt-top-v-' + k;
      value.textContent = '—';
      const canvas = document.createElement('canvas');
      canvas.className = 'crt-top-spark';
      canvas.id = 'crt-top-c-' + k;
      canvas.width = 240;
      canvas.height = 48;
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(canvas);
      topGridEl.appendChild(card);
    });
  }

  function drawSpark(canvas, hist) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (hist.length < 2) return;
    const max = Math.max.apply(null, hist) || 1;
    ctx.beginPath();
    hist.forEach(function (v, i) {
      const x = (i / (hist.length - 1)) * w;
      const y = h - Math.min(1, v / max) * (h - 2) - 1;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#2aa198';   // the same solarized cyan as --cyan on .rig
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function topHeadline() {
    const now = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    const upSec = state.powered ? upSeconds() : 0;
    const upH = Math.floor(upSec / 3600), upM = Math.floor((upSec % 3600) / 60);
    const cpu = cpuState(nv);
    const cpuLoad = metric('cpu').v / 100;
    const load = (cpuLoad * cpu.sockets * (cpu.smt ? 2 : 1)).toFixed(2);
    const running = Math.max(1, Math.round(cpuLoad * 8));
    const dimm = dimmState();
    const mem = memPlan();
    const memUsedGiB = Math.round(mem.gb * (0.12 + cpuLoad * 0.35));
    return [
      'top - ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
        + '   up ' + upH + 'h ' + upM + 'm   load average: ' + load + ', ' + load + ', ' + load,
      'Tasks: ' + cpu.threads + ' total, ' + running + ' running, ' + Math.max(0, cpu.threads - running) + ' sleeping',
      'Mem: ' + memUsedGiB + ' / ' + mem.gb + ' GiB   ' + cpu.sockets + '/' + HW.cpu.n + ' sockets   '
        + dimm.in + '/' + dimm.total + ' dimms',
    ].join('\n');
  }

  function renderTop() {
    topHeadEl.textContent = topHeadline();
    TOP_KEYS.forEach(function (k) {
      const m = metric(k);
      const hist = topHistory[k];
      hist.push(m.v);
      if (hist.length > 120) hist.shift();
      const valueEl = document.getElementById('crt-top-v-' + k);
      if (valueEl) {
        valueEl.textContent = m.text;
        valueEl.classList.toggle('warn', !!m.warn);
      }
      drawSpark(document.getElementById('crt-top-c-' + k), hist);
    });
  }

  function openTop() {
    buildTopGrid();
    openCrt('top');
    renderTop();
    if (topTimer) window.clearInterval(topTimer);
    topTimer = window.setInterval(renderTop, 1000);   // exactly once a second, not rAF
  }

  function closeTop() {
    if (topTimer) { window.clearInterval(topTimer); topTimer = null; }
  }

  function handleTopKey(e) {
    if (e.key === 'q' || e.key === 'Q' || e.key === 'Escape' || (e.ctrlKey && (e.key === 'c' || e.key === 'C'))) {
      e.preventDefault();
      closeCrt();
    }
  }

  // ── Terminal commands ─────────────────────────────────────────────────
  cmd({
    name: 'bios', group: 'ПРОШИВКА', brief: 'открыть BIOS Setup', usage: 'bios [dump]',
    sink: true,
    run: function (ctx) {
      if (ctx.args[0] === 'dump') return nvDumpLines();
      requestSetup();
      return [];
    },
  });

  cmd({
    name: 'top', group: 'СОСТОЯНИЕ', brief: 'нагрузка машины', sink: true, needs: 'power',
    run: function () { openTop(); return []; },
  });

  cmd({
    name: 'post', group: 'ПРОШИВКА', brief: 'повторить самотест', sink: true, needs: 'power',
    run: function () { screenPost(); return []; },
  });

  cmd({
    name: 'boot', group: 'ПРОШИВКА', brief: 'выбор устройства загрузки',
    usage: 'boot [nvme|pxe|bmc]', sink: true,
    help: ['Без аргумента поднимает то же всплывающее меню, что и F11.',
           'С аргументом грузится с устройства однократно, не трогая',
           'сохранённый порядок: это BootNext, а не новая настройка.'],
    run: function (ctx) {
      const key = (ctx.args[0] || '').toLowerCase();
      if (!key) { openBootMenuStandalone(); return []; }
      if (!BOOT_SETUP_LABEL[key]) return [{ t: 'boot: неизвестное устройство: ' + key, c: 'err' }];
      if (!bootAvailable(key)) {
        return [{ t: 'boot: ' + BOOT_SETUP_LABEL[key] + ' — ' + bootWhyNot(key), c: 'err' }];
      }
      bootNext = key;
      screenPost();
      return [];
    },
  });

  // ── Start-up ───────────────────────────────────────────────────────────
  const first = !state.visited;
  state.visited = true; save();

  // The cover. A visitor should not have to guess that it needs taking off:
  // on the first visit it comes off by itself. Putting it back is done by a
  // button on the board, next to the service mode switch.
  function setLid(off) {
    // Тишина, если крышка уже в этом положении: setLid зовут и при
    // восстановлении состояния из localStorage, где хода нет и звучать нечему.
    if (rig.classList.contains('lid-off') !== off) sfx('lid');
    rig.classList.toggle('lid-off', off);
    state.lid = off; save();
  }
  // Обе кнопки крышки нарисованы на плате, значит слушаем их так же, как
  // выключатель сервисного режима, — через саму плату.
  function bindLid(id, off, msg) {
    onBoard(id, function () { setLid(off); line(msg, 'muted'); });
  }
  const assembleBtn = document.getElementById('assemble-btn');
  if (assembleBtn) {
    assembleBtn.addEventListener('click', function () {
      line('power off · re-seating all units …', 'muted');
      reassemble();
    });
  }

  bindLid('lid-remove', true, 'cover removed');
  bindLid('lid-on', false, 'cover in place');

  setLid(!!state.lid);
  wait(260, function () { rig.classList.add('ready'); });

  if (first && !reduced) {
    // Первый заход целиком: закрытая машина, с неё сходит крышка, и узлы
    // садятся по расписанию. Всё это ждёт, пока схему покажут: визитка
    // открывается карточкой, и до нажатия на кнопку сервера машина стоит
    // разобранной — иначе смотреть на её сборку гость приходит к шапочному
    // разбору.
    armAssembly(function () {
      if (!state.lid) wait(1500, function () { setLid(true); });
      line('chassis empty · fans and psu first', 'muted');
      wait(3.0 * 1000, function () { line('cpu seated · dimms by channel', 'muted'); });
      wait(5.1 * 1000, function () { line('risers in · drives last', 'muted'); });
      whenSeated(function () {
        finishAssembly();
        line('all units seated · power on', 'ok');
        powerOn();
      });
    });
  } else {
    setLid(true);
    finishAssembly();
  }

  if (first && !reduced) {
    // The full entrance, as in the rack: standby power is applied, the BMC
    // initialises and the button blinks fast — pressing it does nothing. Once
    // it is done the blinking slows down, and from there a human is the one
    // who switches the machine on.
    state.powered = false; save();
    setPower('init');
    line('standby power applied', 'muted');
    line('uefi/bmc init …', 'muted');
    tick();
    wait(2600, function () {
      line('bmc ready · press power', 'ok');
      setPower('standby');
      tick();
    });
  } else if (state.powered) {
    setPower('on');
    rig.classList.add('net', 'bmc');
    line('session restored', 'muted');
    line('system ready', 'ok');
    tick();
  } else {
    setPower('standby');
    line('standby · bmc only', 'muted');
    tick();
  }

  window.setInterval(tick, 1000);
})();
