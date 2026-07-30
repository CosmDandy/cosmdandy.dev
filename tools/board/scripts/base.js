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

  // @block: front_panel

  // @block: lightpath

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

  // @block: fans
  // @block: memory
  // @block: drives
  // @block: cpu
  // @block: risers
  // @block: psu

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

  // @part: term

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

  // @part: hw

  // @part: fs

  // @part: screen

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
