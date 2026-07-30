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

  // ── Адрес под курсором ─────────────────────────────────────────────────
  // Куда ведёт узел, видно до клика: подсказка идёт за курсором и разбирает
  // адрес на части — схема глуше, хост в цвет схемы, путь обычным тоном.
  const linkHint = document.getElementById('link-hint');

  function showLinkHint(href, x, y) {
    if (!linkHint) return;
    const m = /^(https?:\/\/|mailto:)([^/]*)(.*)$/.exec(href) || [];
    linkHint.innerHTML = m.length
      ? '<span class="lh-scheme">' + m[1] + '</span>'
        + '<span class="lh-host">' + m[2] + '</span>' + m[3]
      : href;
    linkHint.classList.add('on');
    // Держим подсказку в окне: у правого края она уходила бы за экран.
    const w = linkHint.offsetWidth, h = linkHint.offsetHeight;
    const left = Math.min(x + 18, window.innerWidth - w - 12);
    const top = Math.min(Math.max(y - h - 14, 10), window.innerHeight - h - 10);
    linkHint.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)';
  }

  function hideLinkHint() {
    if (linkHint) linkHint.classList.remove('on');
  }

  if (linkHint) {
    rig.addEventListener('mousemove', function (e) {
      // В сервисном режиме узлы разбирают, а не открывают: подсказка там
      // обещала бы переход, которого не будет.
      const target = rig.classList.contains('service')
        ? null : e.target.closest('a.callout, .unit[data-href]');
      const href = target && (target.getAttribute('href') || target.dataset.href);
      if (href) showLinkHint(href, e.clientX, e.clientY); else hideLinkHint();
    });
    rig.addEventListener('mouseleave', hideLinkHint);
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

  // Самотест печатает экран: строки идут и на него, и в консоль — как на
  // машине с подключённым монитором и открытым SOL. Сами строки собираются
  // из паспорта, состояния схемы и настроек прошивки, поэтому вынутая планка
  // видна и здесь. Всё это живёт в parts/screen.js.
  function runPost() {
    screenPost();
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
    // Пока поверх машины стоит полноэкранный слой, схему тоже считать
    // незачем: её не видно, а перерисовывать полупрозрачный слой поверх
    // анимирующегося SVG — самое дорогое, что тут можно сделать.
    rig.classList.toggle('dormant', document.hidden || !onScreen || screenOpen());
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
    // Панель диагностики сама не выезжает: в сервисном режиме она нужна не
    // всегда, а места занимает много. Закрыть её при выходе — другое дело:
    // снаружи сервисного режима ей висеть незачем.
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

  // ── Файловая система: то, что видно, зайдя на хост по консоли ──────────
  // Тот же принцип, что у паспорта машины: паспорт — что за железо стоит,
  // DOM — что из него сейчас на месте, NVRAM — как оно настроено. Дерево
  // ниже не хранит чисел само — оно на каждый листовой файл читает все три
  // источника заново. Не «/proc/cpuinfo посчитан один раз при сборке», а
  // «/proc/cpuinfo — функция, которая при каждом cat смотрит на HW, DOM
  // и nv.». Вынь планку и попроси dimm — meminfo увидит вынутую сразу,
  // без отдельного шага синхронизации.
  //
  // Каталог — обычный объект { имя: узел }: fsBuildRoot строит дерево
  // заново на каждый вызов команды, поэтому состав каталога (какие nvme
  // остались в /dev, какие psu в /sys) тоже свежий. Листовой файл — это
  // функция: она уже не пересчитывается при построении дерева, а вызывается
  // самими командами (cat/head/tail/…) в момент, когда её содержимое
  // действительно нужно.
  //
  // Имена всех помощников здесь намеренно с префиксом fs — этот файл вставляется
  // в общий IIFE вместе с остальными частями (screen.*, term.js), которые
  // правятся параллельно и своего пространства имён не имеют. Общих коротких
  // имён вроде resolve/splitArgs эта часть не заводит, чтобы не столкнуться
  // с тем, что определят соседи.

  let fsCurCwd = '/home/cosmdandy';   // снимок cwd — нужен complete(), у которого нет ctx
  let fsCurNv = {};
  const fsBoot = Date.now();          // «включился» хост — с этого момента считаем uptime

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

  // ── Состояние по DOM: что физически на месте ────────────────────────────
  function fsFansOut() { return chassis.querySelectorAll('.fan.pulled').length; }
  function fsDimmsOut() { return chassis.querySelectorAll('.dimm.pulled').length; }
  function fsBayPulled(i) { return !!chassis.querySelector('.bay.pulled[data-unit="hdd' + i + '"]'); }
  function fsCpuPulled(n) { return !!chassis.querySelector('.cpu-slot.pulled[data-cpu="' + n + '"]'); }
  function fsRiserPulled(k) { return !!chassis.querySelector('.riser.pulled[data-riser="' + k + '"]'); }
  function fsPsuPulled(k) { return !!chassis.querySelector('.psu.pulled[data-psu="' + k + '"]'); }
  function fsEfiPresent(ctx) { return (ctx.nv || {}).mode !== 'Legacy'; }

  // Сколько логических CPU сейчас видно ОС — общее место для cpuinfo,
  // cmdline (nr_cpus) и nodeN/cpulist, чтобы три файла не разошлись в числах.
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

  function fsMac(ctx, idx) {
    const mac = (ctx.HW.fw || {}).mac || '00:00:00:00:00:00';
    const parts = mac.split(':');
    const last = (parseInt(parts[5], 16) + idx) & 0xff;
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
        if (fsCpuPulled(s)) continue;               // радиатор снят — сокет не отвечает
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

  function fsProcMeminfo(ctx) {
    return function () {
      const dimm = ctx.HW.dimm || {};
      const present = Math.max(0, (dimm.slots || 0) - fsDimmsOut());
      const totalKB = present * (dimm.size_gb || 0) * 1024 * 1024;
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
      let s = 'BOOT_IMAGE=/vmlinuz-6.9.12-cd93 root=UUID=93cd0000-0000-0000-0000-000000000001 '
            + 'ro quiet console=ttyS0,115200n8';
      if (nv.cores && nv.cores !== 'All') s += ' nr_cpus=' + fsTotalLogical(ctx);
      if (nv.numa === 'Disabled') s += ' numa=off';
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
    // Три датчика по паспорту машины: пакет CPU, накопители, вдув корпуса.
    // Растут от числа вынутых вентиляторов — тем же правилом, что и раньше
    // считался столбец температуры в приборах (42 + пропавшие*6 °C).
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

  function fsNetEntries(ctx) {
    // SFP+ живёт на карте в верхнем райзере (data-riser="1") — вынули его,
    // порты пропадают из /sys/class/net вместе с картой.
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
      if (fsPsuPulled(k)) return;                 // вынутый блок обесточен и исчезает
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
      if (fsBayPulled(b.bay)) return;              // вынутый каддик — нет и /dev/nvmeN
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
          { t: 'bmc.mac      = ' + (fw.mac || '') },
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
      // POST печатает сам, без запроса: значит его вывод — это хвост лога
      // после последней набранной команды («$ …»), а не вся история сразу.
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
      // Заглушка на пустой лог: те же числа, что и у sensors/dimm/nvme —
      // паспорт и DOM, а не выдуманные литералы.
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
          { t: 'telegram   https://t.me/cosmdandy' },
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

  // ── Дерево целиком ───────────────────────────────────────────────────
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

  // ── Пути: абсолютные, относительные, ., .., ~ ───────────────────────────
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

  // ── Аргументы: -x, -x значение, -xЗНАЧЕНИЕ, комбинированные -la ────────
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

  // Каждая команда снимает свежий снимок cwd/nv для complete(), у которого
  // по контракту нет ctx, — и только потом строит дерево и работает.
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

  // ── Команды ──────────────────────────────────────────────────────────
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
      // Точка и две точки — такие же записи каталога, как остальные, и с -a
      // их показывают. Без них ls -a выглядел как ls, только длиннее.
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

  // head и tail — один и тот же фильтр, отличается только конец, который
  // берём: как фильтр конвейера они режут ctx.stdin, как файловые команды —
  // строки, прочитанные из дерева.
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
      // Шаблон сначала пробуем как регулярное выражение: на живой машине grep
      // именно такой, и `grep "^CPU[01]"` там работает. Если выражение не
      // компилируется, ищем подстроку — это лучше, чем упасть с ошибкой на
      // скобке, которую человек имел в виду буквально.
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
      // Путь печатаем в том же виде, в каком его задали: `find . -name x`
      // отвечает ./foo/x, а не /home/cosmdandy/foo/x. Так ведёт себя find, и
      // так результат можно скопировать в следующую команду.
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

  // ── Полноэкранный слой: POST → BIOS Setup → top ─────────────────────────
  // <dialog> выбран не ради вида, а ради двух вещей разом: showModal() кладёт
  // разметку в top layer (поверх схемы и всего остального без возни с
  // z-index) и одним движением делает окружающее дерево inert — а на схеме
  // Enter/Space нажимают кнопки, а стрелки листают ленту ревизий, и слой не
  // должен до них дотягиваться. Inert — первый рубеж; вторым стоит перехват
  // keydown на document в фазе capture ниже: если что-то всё же попробует
  // добраться до фона, поймаем раньше, чем событие до него дойдёт.
  //
  // Три режима — одна и та же разметка, div'ы прячутся друг за друга через
  // hidden. Отдельных диалогов не заводим: тогда пришлось бы решать, какой
  // из них сейчас «настоящий» top layer, а showModal() у второго диалога,
  // пока открыт первый, попросту бросает исключение.
  const crt = document.getElementById('crt');
  const postPane = document.getElementById('crt-post');
  const postLog = document.getElementById('crt-post-log');
  const setupPane = document.getElementById('crt-setup');
  const setupTabsEl = document.getElementById('crt-setup-tabs');
  const setupRowsEl = document.getElementById('crt-setup-rows');
  const setupHelpEl = document.getElementById('crt-setup-help');
  const setupNoteEl = document.getElementById('crt-setup-note');
  const topPane = document.getElementById('crt-top');
  const topHeadEl = document.getElementById('crt-top-head');
  const topGridEl = document.getElementById('crt-top-grid');

  // dormancy() в base.js ставит схему на паузу, когда вкладку свернули или
  // увели за край экрана — тот же повод останавливать её и здесь: пока слой
  // открыт, зрителю схему всё равно не видно из-под ::backdrop, а крутить
  // лопасти в фоне — чистый расход батареи. dormancy() уже написана в
  // base.js, менять её тело неоткуда — это тот самый флаг, который должен
  // войти в её условие (см. отчёт).
  let crtOpen = false;

  // База спрашивает через функцию, а не читает переменную: base.js
  // выполняется выше по файлу, и до объявления let обращение бросает.
  function screenOpen() { return crtOpen; }

  function openCrt(mode) {
    crt.dataset.mode = mode;
    postPane.hidden = mode !== 'post';
    setupPane.hidden = mode !== 'setup';
    topPane.hidden = mode !== 'top';
    if (!crt.open) crt.showModal();
    crtOpen = true;
    dormancy();
  }
  function closeCrt() {
    if (crt.open) crt.close();
  }

  // Родной Esc диалога сам закрывает его через cancel → close, но у нас в
  // каждом режиме свой смысл Esc (пропустить POST, выйти из setup без
  // сохранения, закрыть top) — решает его наш обработчик ниже, а не браузер.
  crt.addEventListener('cancel', function (e) { e.preventDefault(); });
  // По экрану самотеста кликают, чтобы он ушёл, — и это разумно. Не даём
  // закрыть только машину, которой не с чего грузиться: там экран и должен
  // стоять, пока не зайдёшь в setup и не поменяешь порядок загрузки.
  crt.addEventListener('click', function () {
    if (crt.dataset.mode === 'post' && postCtl && postCtl.done) { postCtl = null; closeCrt(); }
  });
  crt.addEventListener('close', function () {
    crtOpen = false;
    dormancy();
    closeTop();
  });

  // Один обработчик на все три режима: диспетчер смотрит на dataset.mode,
  // а не плодит по слушателю на каждый openXxx() — тогда при переключении
  // post → setup внутри одного открытого диалога не пришлось бы гадать,
  // сколько старых обработчиков уже навешано.
  document.addEventListener('keydown', function (e) {
    if (!crt.open) return;
    const mode = crt.dataset.mode;
    if (mode === 'post') handlePostKey(e);
    else if (mode === 'setup') handleSetupKey(e);
    else if (mode === 'top') handleTopKey(e);
  }, true);

  // F2 живёт и вне самотеста. На живой машине её ловят в первые секунды
  // загрузки, но страница открыта часами, а POST идёт от силы пять секунд —
  // ждать его, чтобы попасть в setup, было бы издевательством. Поэтому:
  // экран закрыт — F2 открывает setup, экран открыт — клавишу разбирает
  // диспетчер режима выше.
  document.addEventListener('keydown', function (e) {
    if (crt.open) return;
    // F2 — как на живой машине. Enter — для тех, у кого верхний ряд отдан
    // системе, но только когда фокус ни на чём: в поле консоли он отправляет
    // команду, на кнопке схемы — нажимает её, и отбирать его там нельзя.
    const idle = document.activeElement === document.body || document.activeElement === null;
    if (e.key !== 'F2' && !(e.key === 'Enter' && idle)) return;
    e.preventDefault();
    openSetup();
  }, true);

  // ── NVRAM ────────────────────────────────────────────────────────────────
  // Отдельное хранилище от rig-state: у них разный жизненный цикл. rig-state
  // пишется при каждом клике питанием, а прошивку сохраняют только по F10 —
  // и F9 обязан снести её содержимое, не задевая питание машины вовсе.
  //
  // Поля и их значения — плоские и в тех же строках ('Enabled'/'Disabled'/
  // 'UEFI'/'Legacy'/'All'), которыми их уже читают hw.js (cpuState, команда
  // dimm) и fs.js (/proc/cpuinfo, /sys/firmware/efi): там nv.cores, nv.ht,
  // nv.numa, nv.memfreq, nv.mode проверяются как строки без промежуточного
  // разбора, и заводить тут свой формат — значит разойтись с уже написанным
  // кодом соседей.
  const NV_DEFAULT = {
    ht: 'Enabled', cores: 'All', numa: 'Enabled', memfreq: 'Auto',
    power: 'Maximum Performance', cstates: 'Enabled',
    mode: 'UEFI', secureBoot: 'Enabled', quietBoot: 'Enabled',
    bootOrder: ['nvme', 'pxe', 'bmc'],
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

  function saveNv() {
    try { localStorage.setItem('rig-nv', JSON.stringify(nv)); } catch (e) {}
  }

  // Два эффекта прошивки на схему — и только два, специально прописанные
  // как разрешённые: период вращения обязан остаться кратен секунде, иначе
  // двадцать положений крыльчатки уедут с общего такта в 0.05 с.
  function applyNvEffects() {
    rig.classList.toggle('nv-eff', nv.power === 'Efficiency');
    // has-fault уже занят чужой логикой (лампы отсутствующих узлов) — здесь
    // свой признак, чтобы не перебить её условие.
    rig.classList.toggle('sb-off', nv.mode === 'UEFI' && nv.secureBoot === 'Disabled');
  }
  applyNvEffects();   // применяем то, что уже лежало в rig-nv, ещё до первого открытия setup

  // Скорость линка на пассивке — из паспорта портов, а не буквой в тексте:
  // сменится плата на другую сетевую карту, надписи boot order обязаны
  // съехать вместе с ней, а не разойтись с тем, что показывает rear_io.
  function pxeSpeed() {
    const m = /([\d.]+)\s*G/.exec(HW.ports.sfp || '');
    return m ? m[1] + 'G' : '10G';
  }
  const BOOT_POST_LABEL = { nvme: 'nvme0', pxe: 'pxe' + pxeSpeed().toLowerCase(), bmc: 'bmc' };
  const BOOT_SETUP_LABEL = { nvme: 'NVMe 0', pxe: 'PXE ' + pxeSpeed(), bmc: 'BMC Virtual Media' };

  // ── POST ───────────────────────────────────────────────────────────────
  // Строки собираются один раз из трёх слоёв правды — паспорта, DOM и nv —
  // и печатаются одной и той же функцией что на экран, что в консоль:
  // приборы и sensors уже расходились именно потому, что их считали дважды
  // по разным формулам, и это то же самое место, где могло повториться.
  function buildPostLines() {
    const fansOut = counts('.fan.pulled');
    const drivesOut = counts('.bay.pulled');
    const cpuOut = counts('.cpu-slot.opened');
    const dimm = dimmState();

    const rows = [];
    const push = function (t, c, d) { rows.push({ t: t, c: c || '', d: d }); };

    push(HW.board.model + ' · ' + HW.fw.bios_vendor + ' ' + HW.fw.bios + ' (' + HW.fw.bios_date + ')', '', 160);
    push('Board REV ' + HW.board.rev + ' · ' + HW.board.sha, '', 120);
    push('Press ENTER or F2 to enter Setup', 'muted', 140);

    for (let n = 0; n < HW.cpu.n; n++) {
      const out = chassis.querySelector('.cpu-slot[data-cpu="' + n + '"].opened');
      if (out) push('CPU' + n + '  --- not detected ---', 'err', 160);
      else push('CPU' + n + '  ' + HW.cpu.model + '  ' + HW.cpu.cores + 'c/' + HW.cpu.threads + 't  '
                 + HW.cpu.base.toFixed(2) + ' GHz', 'ok', 160);
    }

    const speed = nv.memfreq === 'Auto' ? HW.dimm.speed : nv.memfreq;
    push('Memory Training ....... ' + dimm.in + ' of ' + dimm.total + ' · ' + (dimm.gb / 1024).toFixed(2)
         + ' TiB @ ' + speed, dimm.out ? 'warn' : 'ok', 260);

    const cpuPresent = HW.cpu.n - cpuOut;
    push(nv.numa === 'Disabled' ? 'NUMA: disabled' : 'NUMA: ' + cpuPresent + ' nodes', '', 120);

    const nvmeTotal = HW.bay.filter(function (b) { return !b.filler; }).length;
    push('NVMe: ' + (nvmeTotal - drivesOut) + ' devices', drivesOut ? 'warn' : '', 180);

    if (fansOut > 0) push('Fan redundancy lost', 'warn', 160);
    if (nv.mode === 'UEFI' && nv.secureBoot === 'Disabled') push('Secure Boot: Disabled', 'warn', 140);

    push('Boot order: ' + nv.bootOrder.map(function (k) { return BOOT_POST_LABEL[k]; }).join(' → '),
         'muted', 180);

    let bootFailed = false;
    if (nv.mode === 'Legacy' && nv.bootOrder[0] === 'nvme') {
      // Легаси не видит GPT — ровно тот случай, когда живая машина отваливается
      // в «no boot device» и остаётся стоять на экране, а не тихо чинит себя.
      push('No boot device found', 'err', 260);
      bootFailed = true;
    } else {
      const first = nv.bootOrder[0];
      const label = first === 'nvme' ? '/dev/nvme0n1'
                  : first === 'pxe' ? 'network (PXE)' : 'BMC Virtual Media';
      push('Booting ' + label + ' ...', 'muted', 240);
    }

    return { lines: rows, bootFailed: bootFailed };
  }

  function crtPostLine(t, c) {
    line(t, c);                 // в консоль — всегда, независимо от того, открыт ли экран
    if (!crt.open) return;
    const d = document.createElement('div');
    if (c) d.className = c;
    d.textContent = t;
    postLog.appendChild(d);
  }

  // Пока идёт POST, F2/Esc ловит общий диспетчер document-keydown выше;
  // сюда он передаёт управление, только если проверил, что мы правда в
  // режиме post. postCtl живёт, пока строки играют — а если машина
  // застряла на «no boot device», ещё и после: F2 обязан сработать и там.
  let postCtl = null;

  function handlePostKey(e) {
    if (!postCtl) return;
    // Enter наравне с F2: на маке верхний ряд по умолчанию отдан яркости и
    // громкости, и F2 туда просто не доходит — не заставлять же гостя
    // держать Fn, чтобы попасть в setup. Пока открыт модальный экран, Enter
    // ничем другим не занят: поле консоли под слоем фокуса не получает.
    if (e.key === 'F2' || e.key === 'Enter') {
      e.preventDefault();
      if (postCtl.done) enterSetupFromPost();
      else postCtl.f2Pending = true;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Первый Esc пропускает паузы между строками, второй — закрывает
      // экран. Иначе самотест выглядел зависшим: строки кончились, а уйти
      // с экрана нечем, кроме как ждать.
      if (!postCtl.done) postCtl.skip = true;
      else { postCtl = null; closeCrt(); }
    }
  }

  function enterSetupFromPost() {
    postCtl = null;
    openSetup();
  }

  /**
   * screenPost() — самотест машины. Вызывается из runPost() в base.js вместо
   * старого прямого вывода в лог: строит строки по HW/DOM/nv, печатает их
   * дважды (экран + консоль) одной функцией, слушает F2 (отложенный переход
   * в setup после конца ленты) и Esc (доиграть остаток без пауз). При
   * reduced экран не открывается вовсе — задержки схлопнуты в ноль тем же
   * wait(), которым играет и обычный проход, так что строки просто уходят
   * в консоль одна за другой без паузы между ними.
   */
  function screenPost() {
    const built = buildPostLines();
    const showScreen = !reduced;
    postCtl = { f2Pending: false, skip: false, done: false };
    if (showScreen) { postLog.textContent = ''; openCrt('post'); }

    let i = 0;
    (function step() {
      if (i >= built.lines.length) {
        postCtl.done = true;
        if (postCtl.f2Pending) { enterSetupFromPost(); return; }
        if (built.bootFailed) {
          if (!showScreen) postCtl = null;   // экрана нет — ловить F2 всё равно некому
          return;                             // виснем на экране, как живая машина без диска
        }
        line('system ready', 'ok');
        // Подсказку печатаем в консоль, а не только на экран: экран уйдёт
        // через мгновение, а вопрос «как попасть в BIOS» останется.
        line('F2 — BIOS Setup · bios — то же командой', 'muted');
        postCtl = null;
        if (showScreen) wait(700, closeCrt);
        return;
      }
      const row = built.lines[i++];
      wait(postCtl.skip ? 0 : row.d, function () {
        crtPostLine(row.t, row.c);
        step();
      });
    })();
  }

  // ── BIOS Setup ───────────────────────────────────────────────────────────
  // AMI Aptio — синее поле, жёлтая строка, помощь справа. Разделы описаны
  // схемой данных (setupRows), а не вёрсткой: Boot и IMM меняют состав строк
  // на лету (Secure Boot прячется под Legacy, IP-поля — под Static), и если
  // бы это была разметка, пришлось бы прятать/показывать куски руками в
  // трёх местах вместо одного.
  const SETUP_TABS = ['Main', 'Advanced', 'Boot', 'IMM'];
  const CORE_OPTIONS = ['All', HW.cpu.cores, Math.floor(HW.cpu.cores / 2),
                         Math.floor(HW.cpu.cores / 4), Math.floor(HW.cpu.cores / 8)];
  const MEM_FREQ_OPTIONS = ['Auto', '6400', '6000', '5600', '4800'];

  let setupTab = 0;
  let setupRow = -1;
  let nvDraft = null;      // черновик: правки видны сразу, но в nv попадают только по F10
  let editField = null;    // { row, buf } — редактирование IP/маски/шлюза посимвольно

  function cycleEnum(list, cur, dir) {
    const i = list.indexOf(cur);
    const n = list.length;
    const next = (i < 0 ? 0 : i) + (dir > 0 ? 1 : -1);
    return list[((next % n) + n) % n];
  }
  function toggleOnOff(cur) { return cur === 'Enabled' ? 'Disabled' : 'Enabled'; }

  function mainRows() {
    const rows = [];
    rows.push({ label: 'BIOS Version', ro: true,
      get: function () { return HW.fw.bios + '  (' + HW.fw.bios_date + ')'; } });
    rows.push({ label: 'Board', ro: true,
      get: function () { return HW.board.model + '  REV ' + HW.board.rev + '  S/N ' + HW.board.sha; } });
    for (let n = 0; n < HW.cpu.n; n++) {
      if (chassis.querySelector('.cpu-slot[data-cpu="' + n + '"].opened')) continue;   // вынутый исчезает
      rows.push({ label: 'CPU' + n, ro: true,
        get: function () { return HW.cpu.model + '  ' + HW.cpu.cores + 'c/' + HW.cpu.threads + 't'; } });
    }
    const dimm = dimmState();
    rows.push({ label: 'Total Memory', ro: true,
      get: function () { return dimm.in + ' × ' + HW.dimm.kind + '  ' + (dimm.gb / 1024).toFixed(2) + ' TiB'; } });
    HW.bay.filter(function (b) { return !b.filler; }).forEach(function (b) {
      const out = !!chassis.querySelector('.bay.pulled[data-unit="hdd' + b.bay + '"]');
      rows.push({ label: 'NVMe ' + b.bay, ro: true,
        get: function () { return out ? '--- отсутствует ---' : b.model + '  ' + b.tb + ' TB'; } });
    });
    return rows;
  }

  function advRows() {
    return [
      { id: 'smt', label: 'SMT', kind: 'bool', reboot: true,
        get: function () { return nvDraft.ht; },
        set: function () { nvDraft.ht = toggleOnOff(nvDraft.ht); },
        help: 'Симметричная многопоточность: по два потока на ядро. Это же поле читает /proc/cpuinfo.' },
      { id: 'cores', label: 'Active Cores per Socket', kind: 'enum', reboot: true, options: CORE_OPTIONS,
        get: function () { return String(nvDraft.cores); },
        set: function (dir) { nvDraft.cores = cycleEnum(CORE_OPTIONS, nvDraft.cores, dir); },
        help: 'Сколько ядер на сокет включено. Меньше — ниже TDP и температура в простое.' },
      { id: 'numa', label: 'NUMA', kind: 'bool', reboot: true,
        get: function () { return nvDraft.numa; },
        set: function () { nvDraft.numa = toggleOnOff(nvDraft.numa); },
        help: 'Топология памяти: узел на сокет или единая плоская карта.' },
      { id: 'memfreq', label: 'Memory Frequency', kind: 'enum', reboot: true, options: MEM_FREQ_OPTIONS,
        get: function () { return nvDraft.memfreq; },
        set: function (dir) { nvDraft.memfreq = cycleEnum(MEM_FREQ_OPTIONS, nvDraft.memfreq, dir); },
        help: 'Auto берёт паспортную скорость модулей: ' + HW.dimm.speed + ' MT/s.' },
      { id: 'power', label: 'Power Profile', kind: 'enum', reboot: true,
        options: ['Maximum Performance', 'Efficiency'],
        get: function () { return nvDraft.power; },
        set: function (dir) { nvDraft.power = cycleEnum(['Maximum Performance', 'Efficiency'], nvDraft.power, dir); },
        help: 'Efficiency вдвое растягивает период вращения крыльчаток на схеме.' },
      { id: 'cstates', label: 'C-States', kind: 'bool', reboot: true,
        get: function () { return nvDraft.cstates; },
        set: function () { nvDraft.cstates = toggleOnOff(nvDraft.cstates); },
        help: 'Глубокие состояния простоя ядра. Выключают ради предсказуемой задержки.' },
    ];
  }

  function bootRows() {
    const rows = [];
    rows.push({ id: 'mode', label: 'Boot Mode', kind: 'enum', reboot: true, options: ['UEFI', 'Legacy'],
      get: function () { return nvDraft.mode; },
      set: function (dir) { nvDraft.mode = cycleEnum(['UEFI', 'Legacy'], nvDraft.mode, dir); },
      help: 'Legacy прячет Secure Boot и переводит /sys/firmware/efi в офлайн.' });

    if (nvDraft.mode === 'UEFI') {
      rows.push({ id: 'secure', label: 'Secure Boot', kind: 'bool', reboot: true,
        get: function () { return nvDraft.secureBoot; },
        set: function () { nvDraft.secureBoot = toggleOnOff(nvDraft.secureBoot); },
        help: 'Выключенный Secure Boot зажигает системную лампу неисправности на схеме.' });
    }

    rows.push({ id: 'quiet', label: 'Quiet Boot', kind: 'bool', reboot: true,
      get: function () { return nvDraft.quietBoot; },
      set: function () { nvDraft.quietBoot = toggleOnOff(nvDraft.quietBoot); },
      help: 'Прячет POST-строки за логотипом производителя.' });

    nvDraft.bootOrder.forEach(function (key, idx) {
      rows.push({ id: 'order' + idx, label: 'Boot Option #' + (idx + 1), kind: 'order', idx: idx, reboot: true,
        get: function () { return BOOT_SETUP_LABEL[nvDraft.bootOrder[idx]]; },
        help: 'Enter/+ — вниз по списку, - — вверх. Первый пункт грузится первым.' });
    });

    return rows;
  }

  function immRows() {
    const rows = [];
    rows.push({ id: 'proto', label: 'IPv4 Configuration', kind: 'enum', options: ['DHCP', 'Static'],
      get: function () { return nvDraft.ipMode; },
      set: function () { nvDraft.ipMode = nvDraft.ipMode === 'DHCP' ? 'Static' : 'DHCP'; },
      help: 'DHCP — адрес из сети управления. Static открывает три поля ниже.' });

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

    rows.push({ label: 'MAC Address', ro: true, get: function () { return HW.fw.mac; } });
    return rows;
  }

  function currentRows() {
    const tab = SETUP_TABS[setupTab];
    if (tab === 'Main') return mainRows();
    if (tab === 'Advanced') return advRows();
    if (tab === 'Boot') return bootRows();
    return immRows();
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
    else if (r.kind === 'enum') r.set(dir);
    else if (r.kind === 'order') moveBootOrder(r.idx, dir);
    else if (r.kind === 'text' && dir === 1) beginEdit(r);
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
      editField = null;              // отменяет только эту правку, не весь setup
      renderSetupTab();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      ef.buf = ef.buf.slice(0, -1);
      renderSetupTab();
    } else if (e.key.length === 1 && /[0-9.]/.test(e.key)) {
      e.preventDefault();
      ef.buf += e.key;               // накопление символов в span — без единого <input>
      renderSetupTab();
    }
  }

  function handleSetupKey(e) {
    if (editField) { handleEditKey(e); return; }
    const rows = currentRows();
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setupTab = (setupTab - 1 + SETUP_TABS.length) % SETUP_TABS.length;
        setupRow = -1;
        break;
      case 'ArrowRight':
        e.preventDefault();
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
        if (rows[setupRow]) line('help: ' + rows[setupRow].label + ' — ' + (rows[setupRow].help || ''), 'muted');
        return;                       // подсказка уходит в консоль, экран не перерисовываем
      case 'F9':
        e.preventDefault();
        nvDraft = cloneNv(NV_DEFAULT);   // сносит только черновик — питания F9 не касается
        setupRow = -1;
        line('bios: optimized defaults loaded', 'warn');
        break;
      case 'F10':
        e.preventDefault();
        commitSetup();
        return;                        // commitSetup сам закрывает диалог
      case 'Escape':
        e.preventDefault();
        discardSetup();
        return;                        // discardSetup сам закрывает диалог
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

    const rows = currentRows();
    if (setupRow < 0 || setupRow >= rows.length || rows[setupRow].ro) {
      setupRow = firstNavigable(rows);
    }

    setupRowsEl.innerHTML = '';
    rows.forEach(function (r, i) {
      const rowEl = document.createElement('div');
      rowEl.className = 'crt-row'
        + (r.ro ? ' ro' : '')
        + (i === setupRow ? ' sel' : '')
        + (editField && editField.row === r ? ' editing' : '');
      const label = document.createElement('span');
      label.className = 'crt-row-label';
      label.textContent = r.label + (r.reboot ? ' *' : '');
      const value = document.createElement('span');
      value.className = 'crt-row-value';
      value.textContent = (editField && editField.row === r) ? editField.buf + '_' : r.get();
      rowEl.appendChild(label);
      rowEl.appendChild(value);
      setupRowsEl.appendChild(rowEl);
    });

    const sel = rows[setupRow];
    setupHelpEl.textContent = sel ? (sel.help || '')
      : 'Main: только чтение — состав машины по паспорту и текущей сборке.';
    setupNoteEl.hidden = !rows.some(function (r) { return r.reboot; });
  }

  function openSetup() {
    nvDraft = cloneNv(nv);
    editField = null;
    setupTab = 0;
    setupRow = -1;
    openCrt('setup');
    renderSetupTab();
  }

  function closeSetup() {
    nvDraft = null;
    editField = null;
    closeCrt();
  }

  function commitSetup() {
    nv = nvDraft;
    saveNv();
    applyNvEffects();
    line('bios: settings saved · вступит в силу после перезагрузки', 'ok');
    closeSetup();
  }

  function discardSetup() {
    line('bios: exit without saving', 'muted');
    closeSetup();
  }

  // Текущие (сохранённые) настройки построчно — то, что должно пайпиться:
  // `bios dump | grep Boot`. Черновик сюда не попадает намеренно: пока F10
  // не нажат, снаружи прошивка не поменялась.
  function nvDumpLines() {
    const rows = [];
    rows.push({ t: 'Boot Mode              : ' + nv.mode });
    if (nv.mode === 'UEFI') {
      rows.push({ t: 'Secure Boot            : ' + nv.secureBoot, c: nv.secureBoot === 'Disabled' ? 'warn' : '' });
    }
    rows.push({ t: 'Quiet Boot             : ' + nv.quietBoot });
    rows.push({ t: 'SMT                    : ' + nv.ht });
    rows.push({ t: 'Active Cores/Socket    : ' + nv.cores });
    rows.push({ t: 'NUMA                   : ' + nv.numa });
    rows.push({ t: 'Memory Frequency       : ' + nv.memfreq });
    rows.push({ t: 'Power Profile          : ' + nv.power });
    rows.push({ t: 'C-States               : ' + nv.cstates });
    rows.push({ t: 'Boot Order             : ' + nv.bootOrder.map(function (k) { return BOOT_SETUP_LABEL[k]; }).join(' → ') });
    rows.push({ t: 'IMM IPv4               : ' + (nv.ipMode === 'DHCP' ? 'DHCP'
      : 'Static ' + nv.ip + ' / ' + nv.mask + ' gw ' + nv.gw) });
    return rows;
  }

  // ── top ──────────────────────────────────────────────────────────────────
  // Пять метрик — те же, что раньше жили в приборах сбоку, metric(key)
  // теперь считается один раз в parts/hw.js, оттуда же — cpuState/dimmState/
  // upSeconds для шапки, чтобы не заводить второй способ посчитать то же
  // самое. История держится в canvas, а не в сотнях <div>-баров: одна
  // перерисовка в секунду вместо перекладки полутысячи узлов DOM за тот же тик.
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
    ctx.strokeStyle = '#2aa198';   // тот же solarized-cyan, что и --cyan на .rig
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
    const memUsedGiB = Math.round(dimm.gb * (0.12 + cpuLoad * 0.35));
    return [
      'top - ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
        + '   up ' + upH + 'h ' + upM + 'm   load average: ' + load + ', ' + load + ', ' + load,
      'Tasks: ' + cpu.threads + ' total, ' + running + ' running, ' + Math.max(0, cpu.threads - running) + ' sleeping',
      'Mem: ' + memUsedGiB + ' / ' + dimm.gb + ' GiB   ' + cpu.sockets + '/' + HW.cpu.n + ' sockets   '
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
    topTimer = window.setInterval(renderTop, 1000);   // ровно раз в секунду, не rAF
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

  // ── Команды терминала ─────────────────────────────────────────────────
  cmd({
    name: 'bios', group: 'ПРОШИВКА', brief: 'открыть BIOS Setup', usage: 'bios [dump]',
    sink: true,
    run: function (ctx) {
      if (ctx.args[0] === 'dump') return nvDumpLines();
      openSetup();
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
