// СОБРАННЫЙ ФАЙЛ — правки затрёт следующая сборка.
// Источники: tools/board/scripts/base.js и tools/board/blocks/*.js,
// собирает tools/build.py. Поведение узла лежит рядом с его геометрией.
/* Схема сервера: питание, сервисный режим, консоль.
 *
 * Два уровня взаимодействия. Пока сервисный режим выключен, машина работает
 * как визитка: клик по узлу ведёт по адресу. Тумблер SERVICE на плате
 * превращает её в стенд — узлы вынимаются, снизу открывается консоль.
 *
 * Состояние (питание, крышка) переживает перезагрузку страницы через
 * localStorage, поэтому повторный заход не начинается с полной анимации.
 */
(function () {
  const rig = document.getElementById('rig');
  const log = document.getElementById('log');
  const chassis = document.getElementById('chassis');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Паспорт машины: что за железо тут стоит. Печатает генератор — те же
  // числа, что напечатаны на текстолите, так что консоль и плата разойтись
  // не могут. Всё остальное считается по DOM (что сейчас на месте) и по
  // NVRAM (как настроено). Литералов в командах быть не должно.
  let HW = {};
  try { HW = JSON.parse(document.getElementById('rig-spec').textContent); } catch (e) {}

  let state = { powered: true, visited: false, lid: false };
  try {
    const raw = localStorage.getItem('rig-state');
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) {}

  // Состав машины в шапке консоли — из паспорта. Пока он был написан в
  // разметке руками, там стояли тридцать две планки памяти при двадцати
  // четырёх нарисованных.
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

  // ── Сборка ─────────────────────────────────────────────────────────────
  // Класс assembly стоит в разметке, поэтому машина начинает собираться сама,
  // даже если скрипт не выполнится вовсе. Здесь мы только решаем, оставить
  // сборку или оборвать, и что делать, когда последний узел сядет.
  //
  // Сколько она длится, спрашиваем у самих узлов: у каждого свой --seat, а
  // расписание живёт в генераторе. Дублировать его здесь значит завести
  // второе место, где написано «когда», и однажды они разойдутся.
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

  /** Пересобрать машину: снять узлы и посадить заново по расписанию. */
  function reassemble() {
    if (rig.classList.contains('assembly')) return;
    // Класс приходится снять и вернуть следующим кадром — иначе браузер не
    // считает анимацию новой и ничего не проигрывает.
    rig.classList.remove('assembly');
    void chassis.offsetWidth;
    rig.classList.add('assembly');
    wait(assemblyEnd(), finishAssembly);
  }

  // ── Консоль ────────────────────────────────────────────────────────────
  function line(text, cls) {
    const d = document.createElement('div');
    d.className = cls || '';
    d.textContent = text;
    log.appendChild(d);
    while (log.children.length > 400) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }


  // ── Лента ревизий ──────────────────────────────────────────────────────
  // Плату собирает код, и каждая её правка — коммит. Значит по плате можно
  // ходить назад: версии лежат отдельными файлами и грузятся по требованию.
  // Держать все четырнадцать в странице означало бы три мегабайта ради
  // функции, которой пользуются раз.
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
  const revCache = new Map();      // sha → разметка, чтобы не качать дважды

  function paintTimeline() {
    const last = revs.length - 1;
    tlRange.style.setProperty('--tl-pos', last > 0 ? revPos / last : 0);
    tlPrev.disabled = revPos <= 0;
    tlNext.disabled = revPos >= last;
    const v = revs[revPos];
    if (!v) return;
    tlRev.textContent = 'REV ' + (revPos + 1) + ' · ' + v.sha.toUpperCase();
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
    if (revs.length) return;
    try {
      const res = await fetch('history/index.json');
      if (!res.ok) throw new Error(res.status);
      revs = await res.json();
    } catch (err) {
      return;                       // истории нет — ленты тоже, молча
    }
    if (revs.length < 2) return;
    // Текущая плата уже в странице: кладём её в кэш последней версией,
    // иначе возврат «в сегодня» перекачивал бы то, что и так на экране.
    revCache.set(revs[revs.length - 1].sha, board.innerHTML);
    revPos = revs.length - 1;
    tlRange.max = String(revs.length - 1);
    tlRange.value = String(revPos);
    timeline.hidden = false;
    paintTimeline();
  }

  tlRange.addEventListener('input', function () { showRev(Number(tlRange.value)); });
  tlPrev.addEventListener('click', function () { showRev(revPos - 1); });
  tlNext.addEventListener('click', function () { showRev(revPos + 1); });
  // Стрелками ходить удобнее, чем мышью, но только когда лента на экране
  document.addEventListener('keydown', function (e) {
    if (timeline.hidden || !rig.classList.contains('service')) return;
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showRev(revPos - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showRev(revPos + 1); }
  });

  const POST = [
    ['DDR5 populated: 32 of 32', 'ok', 260],
    ['cpu0 · LGA 4677 · 32c', 'ok', 180],
    ['cpu1 · LGA 4677 · 32c', 'ok', 140],
    ['backplane · slimsas x4 link', 'ok', 200],
    ['nvme: 10 devices online', 'ok', 260],
    ['handoff to host', 'muted', 240],
  ];

  function runPost() {
    let i = 0;
    (function step() {
      if (i >= POST.length) { line('system ready', 'ok'); return; }
      const [t, c, d] = POST[i++];
      wait(d, function () { line(t, c); step(); });
    })();
  }

  // ── Питание ────────────────────────────────────────────────────────────
  // Три состояния кнопки, как на настоящей машине: init — BMC поднимается и
  // жать бесполезно; standby — можно включать; on — работает.
  function setPower(mode) {
    rig.classList.remove('init', 'standby', 'on');
    rig.classList.add(mode);
  }

  function powerOn() {
    state.powered = true;
    // Аптайм — время работы хоста, а не вкладки: без этой отметки uptime
    // считал от загрузки страницы и переживал power off, не заметив его.
    state.bootAt = Date.now();
    save();
    setPower('on');
    // Порядок ровно такой, как видно вживую: сперва поднимается линк сетевой
    // карты, следом BMC начинает биться, и только потом стартует хост.
    wait(120, function () { rig.classList.add('net'); line('nic · link up 25G', 'ok'); });
    wait(700, function () { rig.classList.add('bmc'); line('BMC 2.14 · heartbeat', 'ok'); });
    wait(1100, runPost);
    tick();
  }

  function powerOff() {
    state.powered = false; save();
    rig.classList.remove('net', 'bmc');
    setPower('standby');
    line('powering off', 'warn');
    line('standby · bmc only', 'muted');
    tick();
  }

  document.getElementById('power').addEventListener('click', function () {
    if (rig.classList.contains('init')) {
      line('power inhibited · bmc init', 'warn');
      return;
    }
    if (state.powered) { powerOff(); } else { line('power on', 'muted'); powerOn(); }
  });
  document.getElementById('power').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
  });

  // ── Опознание в стойке ─────────────────────────────────────────────────
  const idBtn = document.getElementById('id-btn');
  function toggleIdentify() {
    const on = rig.classList.toggle('identify');
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

  // Какая лампа на панели отвечает за какой узел.
  const LP_MAP = {
    mem: '.dimm.pulled',
    cpu: '.cpu-slot.pulled',
    fan: '.fan.pulled',
    nic: '.unit[data-unit="ocp"].pulled, .unit[data-unit="eth"].pulled',
    rsr: '.riser.pulled',
    ps: '.psu.pulled',
  };

  function updateFault() {
    let any = false;
    for (const key in LP_MAP) {
      const on = !!chassis.querySelector(LP_MAP[key]);
      rig.classList.toggle('fault-' + key, on);
      any = any || on;
    }
    rig.classList.toggle('has-fault', any);
    tick();
  }

  // ── Экономия на невидимом ──────────────────────────────────────────────
  // Анимация в SVG перерисовывает сцену независимо от того, смотрит ли на неё
  // кто-нибудь: браузер честно крутит крыльчатки и в свёрнутой вкладке, и
  // когда схему увели за край экрана. Ставим на паузу — вернёшься, и лопасть
  // продолжит с того же положения, а не прыгнет.
  const chassisBox = document.querySelector('.chassis');
  let onScreen = true;

  function dormancy() {
    rig.classList.toggle('dormant', document.hidden || !onScreen);
  }

  if (chassisBox && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      dormancy();
    }, { threshold: 0 }).observe(chassisBox);
  }
  document.addEventListener('visibilitychange', dormancy);

  // ── Время работы ───────────────────────────────────────────────────────
  let t0 = Date.now();
  const uptimeEl = document.getElementById('uptime');

  function tick() {
    if (!rig.classList.contains('on')) { uptimeEl.textContent = '--:--'; return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    uptimeEl.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ── Сервисный режим ────────────────────────────────────────────────────
  const svcSwitch = document.getElementById('svc-switch');

  function toggleService() {
    const on = rig.classList.toggle('service');
    line(on ? 'service mode engaged · терминал и диагностика' : 'service mode released',
         on ? 'warn' : 'muted');
    if (on) initTimeline();     // лента нужна только разобранной машине
    if (on && !rig.classList.contains('lp-open')) toggleLp();
    if (!on && rig.classList.contains('lp-open')) toggleLp();
    if (!on) {
      // Собираем машину целиком: узел мог остаться и на промежуточной
      // ступени — с откинутой ручкой диска или снятым радиатором.
      chassis.querySelectorAll('.pulled, .unlatched').forEach(function (p) {
        p.classList.remove('pulled', 'opened', 'unlatched');
      });
      updateFault();
    }
  }
  svcSwitch.addEventListener('click', toggleService);
  svcSwitch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleService(); }
  });

  // Реестр узлов. Каждый блок сам говорит, как он называется в логе и,
  // если разбирается не одним движением, как именно. Раньше это была лестница
  // из if по типам: чтобы добавить узел, приходилось править общий файл.
  const PICKS = [];

  // Вентилятор: в логе нумеруются с единицы, как на корпусе, а в разметке —
  // с нуля.
  PICKS.push({
    test: function (el) { return el.dataset.fan !== undefined; },
    name: function (el) { return 'fan ' + (Number(el.dataset.fan) + 1); },
  });
  PICKS.push({
    test: function (el) { return el.dataset.dimm !== undefined; },
    name: function (el) { return 'dimm ' + el.dataset.dimm; },
  });
  // Диск достают в два приёма, как руками: сначала отщёлкивается ручка,
  // потом каддик выходит наружу. Третий клик ставит его обратно.
  PICKS.push({
    test: function (el) { return el.dataset.unit && el.dataset.unit.startsWith('hdd'); },
    name: function (el) { return el.dataset.unit; },
    pull: function (el, line) {
      const n = el.dataset.unit.replace('hdd', '');
      if (!el.classList.contains('unlatched')) {
        el.classList.add('unlatched');
        line('unlatched: ' + el.dataset.unit + ' · защёлка каддика ' + n, 'muted');
      } else if (!el.classList.contains('pulled')) {
        el.classList.add('pulled');
        line('removed: ' + el.dataset.unit, 'warn');
      } else {
        el.classList.remove('unlatched', 'pulled');
        line('inserted: ' + el.dataset.unit, 'ok');
      }
    },
  });
  // Процессор разбирается в два приёма, как в жизни: сначала радиатор, потом
  // сам процессор из-под него. Третий клик собирает узел обратно.
  PICKS.push({
    test: function (el) { return el.classList.contains('cpu-slot'); },
    name: function (el) { return 'cpu' + el.dataset.cpu + ' heatsink'; },
    pull: function (el, line) {
      const n = el.dataset.cpu;
      if (!el.classList.contains('pulled')) {
        el.classList.add('pulled');
        line('removed: радиатор CPU' + n, 'warn');
      } else if (!el.classList.contains('opened')) {
        el.classList.add('opened');
        line('removed: процессор CPU' + n + ' · LGA 4677 socket open', 'warn');
      } else {
        el.classList.remove('pulled', 'opened');
        line('inserted: CPU' + n + ' с радиатором', 'ok');
      }
    },
  });
  PICKS.push({
    test: function (el) { return el.dataset.riser !== undefined; },
    name: function (el) { return 'riser ' + el.dataset.riser; },
  });
  PICKS.push({
    test: function (el) { return el.dataset.psu !== undefined; },
    name: function (el) { return 'psu-' + el.dataset.psu; },
    // Вынутый блок обесточен: об этом и говорим в логе. Вставили обратно —
    // сеть снова на нём, и лампа AC загорается даже на выключенной машине.
    pull: function (el, line) {
      const out = el.classList.toggle('pulled');
      const name = 'psu-' + el.dataset.psu;
      line(out ? 'removed: ' + name + ' · обесточен, нагрузка на втором блоке'
               : 'inserted: ' + name + ' · AC ok', out ? 'warn' : 'ok');
    },
  });

  function unitName(el) {
    const kind = PICKS.find(function (k) { return k.test(el); });
    return kind ? kind.name(el) : (el.dataset.unit || 'unit');
  }

  // Пока сервисный режим выключен, машина работает как визитка: клик по узлу
  // ведёт по адресу. Включил SERVICE — те же клики разбирают машину.
  chassis.addEventListener('click', function (e) {
    if (rig.classList.contains('service')) {
      const pick = e.target.closest('.pick');
      if (!pick) return;
      e.preventDefault();
      // Узел со своим сценарием разбора — например, процессор, который
      // снимается в два приёма, — обрабатывает себя сам.
      const kind = PICKS.find(function (k) { return k.test(pick); });
      if (kind && kind.pull) {
        kind.pull(pick, line);
        updateFault();
        return;
      }
      const pulled = pick.classList.toggle('pulled');
      line((pulled ? 'removed: ' : 'inserted: ') + unitName(pick), pulled ? 'warn' : 'ok');
      updateFault();
      return;
    }
    const unit = e.target.closest('.unit[data-href]');
    if (!unit) return;
    const href = unit.dataset.href;
    if (href.startsWith('mailto:')) { window.location.href = href; return; }
    window.open(href, '_blank', 'noopener');
  });

  // ── Терминал: ядро оболочки ────────────────────────────────────────────
  // Раньше здесь была лестница из case по именам команд. Она работала, но
  // имена команд существовали только как метки switch и текст в справке —
  // поэтому ни дополнить по Tab, ни собрать help из самого списка было
  // нечем, а справка расходилась с реальностью молча.
  //
  // Теперь команда объявляет себя сама: имя, группа, краткая строка помощи,
  // кандидаты для дополнения и функция. Функция ВОЗВРАЩАЕТ строки, а не
  // печатает их, — иначе не собрать конвейер: grep должен получить то, что
  // вернула предыдущая ступень, а не читать чужой вывод из лога.

  const CMDS = new Map();

  function cmd(spec) {
    // Порядок вставки частей задаёт порядок регистрации, и перепутанные
    // маркеры молча перетирали бы команды. Пусть лучше падает громко.
    if (CMDS.has(spec.name)) throw new Error('команда уже объявлена: ' + spec.name);
    CMDS.set(spec.name, spec);
    (spec.alias || []).forEach(function (a) {
      CMDS.set(a, Object.assign({}, spec, { alias_of: spec.name }));
    });
  }

  // Настройки прошивки объявляет экран (parts/screen.js), а он выполняется
  // ниже по файлу. До первого нажатия клавиши его уже нет смысла ждать, но
  // если экран не собран вовсе — команды должны работать, просто без
  // настроек. Отсюда try: обращение к необъявленной переменной бросает.
  function nvBag() {
    try { return nv; } catch (e) { return {}; }
  }

  let cwd = '/home/cosmdandy';

  // ── Разбор строки ──────────────────────────────────────────────────────
  // Было: split по пробелам и всё в нижний регистр — то есть ровно два
  // слова, и путь /Proc превращался в /proc. Теперь регистр сохраняется:
  // пути и шаблоны grep к нему чувствительны. К нижнему приводится только
  // имя команды при поиске в реестре.

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

  // ── История ────────────────────────────────────────────────────────────
  const history = [];
  let pos = 0;
  let draft = '';

  // `!!` — предыдущая строка, `!7` — седьмая, `!se` — последняя на «se».
  // Развёрнутое печатается эхом и кладётся в историю уже развёрнутым: так
  // ведёт себя bash, и так понятно, что именно выполнилось.
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

  // ── Выполнение ─────────────────────────────────────────────────────────

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

  // Похожая команда для подсказки при опечатке: считаем общий префикс, этого
  // хватает — список короткий, а расстояние Левенштейна тут излишество.
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
    (out || []).forEach(function (row) { line(row.t, row.c || ''); });
    return out || [];
  }

  // ── Справка собирается из реестра ──────────────────────────────────────
  // Пока список команд лежал отдельным массивом, он расходился с самим
  // switch: команда была, а строки про неё не было, и наоборот.
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

  // ── Дополнение ─────────────────────────────────────────────────────────
  // Кандидаты берём у самой команды: она одна знает, что стоит на месте
  // своего аргумента — пути, ключи или имена ссылок.
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

  // Что дорисовать серым: сначала кандидат дополнения, если он один или у
  // всех общий префикс; если кандидатов нет — последняя команда из истории
  // с таким началом, как в fish.
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

  // ── Поле ввода ─────────────────────────────────────────────────────────
  const promptInput = document.getElementById('prompt');
  const ghostTyped = document.querySelector('.ghost-typed');
  const ghostRest = document.querySelector('.ghost-rest');
  const ps1Cwd = document.getElementById('ps1-cwd');

  function refreshPs1() {
    if (ps1Cwd) ps1Cwd.textContent = cwd === '/home/cosmdandy' ? '~' : cwd;
  }
  refreshPs1();

  // Подсказку рисуем зеркалом под полем: в <input> двух цветов не бывает.
  // Набранное в зеркале прозрачное — оно нужно только чтобы занять ширину,
  // а видно продолжение приглушённым тоном.
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
    // Ctrl+W не вешаем: в браузере он закрывает вкладку и не отменяется.
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
      e.preventDefault();               // иначе фокус уедет на ссылку под полем
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
    e.preventDefault();                       // иначе курсор прыгает в начало строки
    if (e.key === 'ArrowUp') {
      if (pos === history.length) draft = promptInput.value;
      pos = Math.max(0, pos - 1);
    } else {
      pos = Math.min(history.length, pos + 1);
    }
    promptInput.value = pos === history.length ? draft : history[pos];
    paintGhost();
    // курсор в конец: иначе он остаётся там, где был, и правка идёт с середины
    const end = promptInput.value.length;
    window.requestAnimationFrame(function () { promptInput.setSelectionRange(end, end); });
  });

  // Ручка для проверок. Через поле ввода терминал не потестировать: сборка
  // chromium в контейнере роняет рендерер на любом <input>, и инструменты
  // удаляют поля до отрисовки страницы.
  window.__rig = {
    exec: function (s) { return exec(s); },
    complete: complete,
    ghost: ghostFor,
    cwd: function () { return cwd; },
    names: names,
  };

  // ── Переключатель видов ────────────────────────────────────────────────
  // Визитка и схема — два способа показать одно и то же. Выбор запоминается,
  // чтобы вернувшийся гость попал туда же, где был.
  const viewBtn = document.getElementById('view-switch');
  function setView(v) {
    document.body.classList.toggle('view-rig', v === 'rig');
    document.body.classList.toggle('view-card', v !== 'rig');
    viewBtn.setAttribute('aria-pressed', String(v === 'rig'));
    try { localStorage.setItem('view', v); } catch (e) {}
  }
  let view = 'card';
  try { view = localStorage.getItem('view') === 'rig' ? 'rig' : 'card'; } catch (e) {}
  setView(view);
  viewBtn.addEventListener('click', function () {
    setView(document.body.classList.contains('view-rig') ? 'card' : 'rig');
  });



  // ── Партномера узлов ───────────────────────────────────────────────────
  // Клик по хэшу копирует его и открывает коммит: на живой плате по
  // партномеру так же ищут деталь, только в бумажном каталоге.
  chassis.addEventListener('click', function (e) {
    const stamp = e.target.closest('a.stamp');
    if (!stamp) return;
    e.preventDefault();
    e.stopPropagation();
    const sha = stamp.dataset.sha;
    if (navigator.clipboard) navigator.clipboard.writeText(sha).catch(function () {});
    line('p/n ' + sha + ' скопирован · открываю коммит', 'ok');
    window.open(stamp.getAttribute('href'), '_blank', 'noopener');
  }, true);   // на перехвате: иначе клик уйдёт в разбор машины

  // ── Связка узла и подписи ──────────────────────────────────────────────
  // Подсветка идёт в обе стороны: узел ↔ его выноска. Класс вместо :hover,
  // потому что элементы лежат в разных ветках дерева.
  function lit(group, on) {
    chassis.querySelectorAll('[data-group="' + group + '"]').forEach(function (n) {
      n.classList.toggle('lit', on);
    });
    chassis.querySelectorAll('[data-for="' + group + '"]').forEach(function (n) {
      n.classList.toggle('lit', on);
    });
  }
  chassis.querySelectorAll('[data-group], [data-for]').forEach(function (n) {
    const g = n.dataset.group || n.dataset.for;
    n.addEventListener('mouseenter', function () { lit(g, true); });
    n.addEventListener('mouseleave', function () { lit(g, false); });
  });

  // ── Железо: что машина о себе рассказывает ─────────────────────────────
  // Единственное место, где считаются показатели датчиков. Раньше их считали
  // дважды — приборы в боковой колонке по одной формуле, команда sensors по
  // другой, — и температуры в них расходились.

  function metric(key) {
    const on = rig.classList.contains('on');
    const fansOut = chassis.querySelectorAll('.fan.pulled').length;
    const dimmsOut = chassis.querySelectorAll('.dimm.pulled').length;
    const drivesOut = chassis.querySelectorAll('.bay.pulled').length;
    if (!on) {
      // на дежурке живёт только BMC: сеть управления и её потребление
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
        const v = 318 + fansOut * 26 - dimmsOut * 3 + Math.random() * 30;
        return { v: v, text: Math.round(v) + ' W', warn: false };
      }
    }
    return { v: 0, text: '—', warn: false };
  }

  // ── Что машина о себе рассказывает ─────────────────────────────────────
  // Ни одного числа в командах: состав приходит из паспорта, наличие — из
  // DOM, настройки — из NVRAM. Раньше здесь стояли литералы, и консоль
  // обещала тридцать две планки при двадцати четырёх нарисованных.

  function counts(sel) {
    return chassis.querySelectorAll(sel).length;
  }

  function pulledNums(sel, attr) {
    const out = new Set();
    chassis.querySelectorAll(sel).forEach(function (el) { out.add(Number(el.dataset[attr])); });
    return out;
  }

  // Планки: сколько стоит и сколько вынуто — по банкам, как они нарисованы.
  function dimmState() {
    const total = HW.dimm ? HW.dimm.slots : counts('.dimm');
    const out = counts('.dimm.pulled');
    return { total: total, out: out, in: total - out,
             gb: (total - out) * (HW.dimm ? HW.dimm.size_gb : 0) };
  }

  // Логических процессоров столько, сколько их видит система: ядра на сокет
  // из паспорта, урезанные настройкой Active Cores, удвоенные при SMT, и
  // всё это только по тем сокетам, что сейчас на месте.
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

  // ── Журнал событий ─────────────────────────────────────────────────────
  // Раньше sel печатал пять неизменных строк, две из которых были неправдой.
  // Теперь это настоящий журнал: сюда пишет всё, что с машиной случилось.
  const SEL_LOG = [];

  function selAdd(text, cls) {
    SEL_LOG.push({ id: 0x12 + SEL_LOG.length, t: text, c: cls || 'ok' });
    if (SEL_LOG.length > 64) SEL_LOG.shift();
  }

  cmd({
    name: 'sel', group: 'СОСТОЯНИЕ', brief: 'журнал системных событий', usage: 'sel',
    run: function () {
      if (!SEL_LOG.length) return [{ t: 'журнал пуст', c: 'muted' }];
      return [{ t: 'ID      EVENT', c: 'muted' }].concat(SEL_LOG.map(function (e) {
        return { t: '0x' + e.id.toString(16).padStart(4, '0') + '  ' + e.t, c: e.c };
      }));
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
             + cpu.cores + 'c/' + cpu.threads + 't' },
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
      const rows = [
        { t: 'CPU0 Temp      ' + Math.round(metric('temp').v) + ' °C', c: out ? 'warn' : 'ok' },
        { t: 'CPU1 Temp      ' + Math.round(metric('temp').v - 2) + ' °C', c: out ? 'warn' : 'ok' },
        { t: 'Inlet Temp     ' + (21 + Math.round(Math.random() * 2)) + ' °C', c: 'ok' },
        { t: 'Fan Speed      ' + (HW.fan.rpm_nom + out * 1800) + ' RPM', c: out ? 'warn' : 'ok' },
        { t: 'PSU Input      ' + Math.round(metric('power').v) + ' W',
          c: counts('.psu.pulled') ? 'warn' : 'ok' },
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
    run: function () {
      // Пустых мест в стенке нет: восемь модулей, все живые. Прежний вывод
      // сообщал о пустом отсеке FAN6, которого никогда не существовало.
      const pulled = pulledNums('.fan.pulled', 'fan');
      const rows = [];
      for (let n = 0; n < HW.fan.n; n++) {
        if (pulled.has(n)) { rows.push({ t: 'FAN' + (n + 1) + '  —      removed', c: 'warn' }); continue; }
        const rpm = HW.fan.rpm_nom + pulled.size * 1800 + Math.round(Math.random() * 400);
        rows.push({ t: 'FAN' + (n + 1) + '  ' + rpm + '  RPM  ok', c: 'ok' });
      }
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
    run: function () {
      // Перечисляем то, что нарисовано: микросхемы из паспорта, диски из
      // корзины, райзеры с их картами. Пустой райзер так и помечен.
      const rows = [];
      HW.chips.forEach(function (chip, i) {
        rows.push({ t: (i + 1).toString(16).padStart(2, '0') + ':00.0  ' + chip.ref.padEnd(5)
                       + chip.mark, c: 'muted' });
      });
      HW.bay.filter(function (b) { return !b.filler; }).forEach(function (b) {
        rows.push({ t: '17:0' + b.bay + '.0  NVMe  ' + b.model + ' ' + b.tb + ' TB' });
      });
      HW.riser.forEach(function (r) {
        rows.push({ t: 'b' + r.slot + ':00.0  PCI bridge · Riser ' + r.slot + ' · ' + r.link
                       + (r.empty ? ' · пуст' : ' · ' + r.card), c: r.empty ? 'muted' : '' });
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
        { t: 'BIOS Version   : ' + HW.fw.bios + '  (' + HW.fw.bios_date + ')' },
        { t: 'BMC Firmware   : ' + HW.fw.bmc + '  (' + HW.fw.bmc_chip + ')' },
        { t: 'CPU            : ' + HW.cpu.n + '× ' + HW.cpu.model + ' · ' + HW.cpu.socket
             + ' · ' + HW.cpu.cores + 'c/' + HW.cpu.threads + 't' },
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

  // ── Управление ─────────────────────────────────────────────────────────

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

  // Ссылки: отдельной команды со списком больше нет — open без аргумента
  // печатает адреса, с аргументом открывает. Тот же список лежит в
  // /home/cosmdandy/links.txt и потому пайпится.
  const LINKS = {
    blog: 'https://blog.cosmdandy.dev',
    cv: 'https://cv.cosmdandy.dev',
    github: 'https://github.com/cosmdandy',
    linkedin: 'https://linkedin.com/in/cosmdandy',
    telegram: 'https://t.me/cosmdandy',
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

  // TODO-part: fs

  // TODO-part: screen

  // ── Запуск ─────────────────────────────────────────────────────────────
  const first = !state.visited;
  state.visited = true; save();

  // Крышка. Гостю не надо догадываться, что её надо снять: при первом заходе
  // она уходит сама. Обратно ставит кнопка на плате, рядом с тумблером
  // сервисного режима.
  const lidRemove = document.getElementById('lid-remove');
  const lidOn = document.getElementById('lid-on');

  function setLid(off) {
    rig.classList.toggle('lid-off', off);
    state.lid = off; save();
  }
  function bindLid(el, off, msg) {
    if (!el) return;
    el.addEventListener('click', function () { setLid(off); line(msg, 'muted'); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLid(off); line(msg, 'muted'); }
    });
  }
  const assembleBtn = document.getElementById('assemble-btn');
  if (assembleBtn) {
    assembleBtn.addEventListener('click', function () {
      line('re-seating all units …', 'muted');
      reassemble();
      wait(assemblyEnd(), function () { line('all units seated', 'ok'); });
    });
  }

  bindLid(lidRemove, true, 'cover removed');
  bindLid(lidOn, false, 'cover in place');

  setLid(!!state.lid);
  wait(260, function () { rig.classList.add('ready'); });
  // первый заход: показываем закрытую машину и снимаем крышку сами
  if (first && !reduced && !state.lid) wait(1500, function () { setLid(true); });
  else if (!first) setLid(true);

  if (first && !reduced) {
    line('chassis empty · fans and psu first', 'muted');
    wait(3.0 * 1000, function () { line('cpu seated · dimms by channel', 'muted'); });
    wait(5.1 * 1000, function () { line('risers in · drives last', 'muted'); });
    wait(assemblyEnd(), function () {
      finishAssembly();
      line('all units seated · power on', 'ok');
      powerOn();
    });
  } else {
    finishAssembly();
  }

  if (first && !reduced) {
    // Полный вход, как в стойке: подали дежурку, BMC инициализируется и
    // кнопка мигает часто — жать бесполезно. Закончил — мигает редко, и
    // дальше машину включает уже человек.
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
