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

  function showLinkHint(href, x, y) {
    if (!linkHint) return;
    const m = /^(https?:\/\/|mailto:)([^/]*)(.*)$/.exec(href) || [];
    linkHint.innerHTML = m.length
      ? '<span class="lh-scheme">' + m[1] + '</span>'
        + '<span class="lh-host">' + m[2] + '</span>' + m[3]
      : href;
    linkHint.classList.add('on');
    // Keep the hint inside the window: near the right edge it would run off
    // the screen.
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
      // In service mode units are taken apart, not opened: the hint there
      // would promise a navigation that is not going to happen.
      const target = rig.classList.contains('service')
        ? null : e.target.closest('a.callout, .unit[data-href]');
      const href = target && (target.getAttribute('href') || target.dataset.href);
      if (href) showLinkHint(href, e.clientX, e.clientY); else hideLinkHint();
    });
    rig.addEventListener('mouseleave', hideLinkHint);
  }

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
    if (revs.length || !LOCAL) return;
    try {
      const res = await fetch('history/index.json');
      if (!res.ok) throw new Error(res.status);
      revs = await res.json();
    } catch (err) {
      return;                       // no history — no strip either, silently
    }
    if (revs.length < 2) return;
    // The current board is already in the page: we put it into the cache as
    // the latest version, otherwise coming back «to today» would re-fetch
    // what is on the screen anyway.
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
  // Arrows are handier than the mouse, but only while the strip is on screen
  document.addEventListener('keydown', function (e) {
    if (timeline.hidden || !rig.classList.contains('service')) return;
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
    state.powered = true;
    // Uptime is how long the host has been running, not the tab: without this
    // mark uptime counted from the page load and survived a power off without
    // noticing it.
    state.bootAt = Date.now();
    save();
    setPower('on');
    // The order is exactly what you see in the flesh: first the network card
    // brings its link up, then the BMC starts beating, and only after that
    // does the host start.
    wait(120, function () { rig.classList.add('net'); line('nic · link up 25G', 'ok'); });
    wait(700, function () { rig.classList.add('bmc'); line('BMC 2.14 · heartbeat', 'ok'); });
    // Экран поднимется через секунду, и подписи ждут его с этой самой минуты:
    // иначе они успевали проступить в промежутке между концом сборки и
    // самотестом — и тут же прятались под приехавшим экраном.
    if (!reduced) rig.classList.add('tags-off');
    wait(1100, runPost);
    tick();
  }

  function powerOff() {
    state.powered = false; save();
    // Выключенной машине экран уже не поднимется — ждать подписям нечего.
    rig.classList.remove('net', 'bmc', 'tags-off');
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

  // ── Identify in the rack ───────────────────────────────────────────────
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

  // Which lamp on the panel answers for which unit.
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
    updateMains();
    tick();
  }

  // ── Входное питание ────────────────────────────────────────────────────
  // Два блока — два независимых ввода, и машина жива, пока на месте хотя бы
  // один. Вынули второй — не осталось ничего: ни хоста, ни дежурки, на
  // которой держатся BMC и порт управления. Это не поломка узла, а потеря
  // питания, поэтому и записывается отдельно — и в журнал событий тоже:
  // на живой машине наутро ищут именно эту строку.
  let mainsDown = false;

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
      state.powered = false; save();
      setPower('standby');
      line('all psu removed · ac lost, system down hard', 'err');
      selAdd('Power Unit · power lost — оба ввода обесточены разом', 'err');
    } else {
      line('ac restored · standby, press power', 'warn');
      selAdd('Power Unit · ac restored — дежурное питание есть', 'ok');
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
  const svcSwitch = document.getElementById('svc-switch');

  function toggleService() {
    const on = rig.classList.toggle('service');
    line(on ? 'service mode engaged · терминал и диагностика' : 'service mode released',
         on ? 'warn' : 'muted');
    if (on) initTimeline();     // the strip is only for a stripped-down machine
    // The diagnostics panel does not slide out by itself: in service mode it
    // is not always wanted, and it takes up a lot of room. Closing it on the
    // way out is another matter: outside service mode there is no reason for
    // it to hang there.
    if (!on && rig.classList.contains('lp-open')) toggleLp();
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
  svcSwitch.addEventListener('click', toggleService);
  svcSwitch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleService(); }
  });

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
    if (e.key !== 'Escape' || !rig.classList.contains('service')) return;
    if (screenOpen()) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    toggleService();
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
      if (!el.classList.contains('unlatched')) {
        el.classList.add('unlatched');
        line('unlatched: ' + el.dataset.unit + ' · защёлка каддика ' + n, 'muted');
      } else if (!el.classList.contains('pulled')) {
        el.classList.add('pulled');
        line(blank ? 'removed: заглушка отсека ' + n : 'removed: ' + el.dataset.unit, 'warn');
      } else {
        el.classList.remove('unlatched', 'pulled');
        line('inserted: ' + el.dataset.unit, 'ok');
      }
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
    // A pulled supply is dead: that is what the log says. Put it back and
    // mains is on it again, and the AC lamp lights up even on a machine that
    // is switched off.
    pull: function (el, line) {
      const out = el.classList.toggle('pulled');
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
    (out || []).forEach(function (row) { line(row.t, row.c || ''); });
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

  // ── View switch ────────────────────────────────────────────────────────
  // The business card and the schematic are two ways of showing the same
  // thing. The choice is remembered, so a returning visitor lands where they
  // left off.
  const viewBtn = document.getElementById('view-switch');
  function setView(v) {
    document.body.classList.toggle('view-rig', v === 'rig');
    document.body.classList.toggle('view-card', v !== 'rig');
    viewBtn.setAttribute('aria-pressed', String(v === 'rig'));
    try { localStorage.setItem('view', v); } catch (e) {}
    // Схему показали — вот теперь и собираем, если сборка ждала своего часа.
    if (v === 'rig') onRigShown();
  }
  let view = 'card';
  try { view = localStorage.getItem('view') === 'rig' ? 'rig' : 'card'; } catch (e) {}
  setView(view);
  viewBtn.addEventListener('click', function () {
    setView(document.body.classList.contains('view-rig') ? 'card' : 'rig');
  });



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
        const v = 318 + fansOut * 26 - dimmsOut * 3 + Math.random() * 30;
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
      // There are no empty spots in the wall: eight modules, all alive. The
      // old output reported an empty FAN6 bay that never existed.
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
      // We list what is drawn: chips from the spec, drives from the cage,
      // risers with their cards. An empty riser is marked as exactly that.
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
  // with the hidden attribute.
  const crt = document.getElementById('crt');
  // Everything that must stop answering mouse and keyboard while the screen is
  // up. The screen sits next to .chassis rather than inside it precisely so
  // that inert on the schematic does not swallow the screen along with it.
  const SHADOWED = '.chassis, .rig-side, .timeline, .rig-id, main,' +
                   ' .theme-switch, .assemble-btn, .view-switch';
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

  // dormancy() in base.js puts the schematic on pause when the tab has been
  // minimised or taken off the edge of the screen — the same reason to stop it
  // here: while the layer is open the viewer cannot see the schematic from
  // under the ::backdrop anyway, and spinning the blades in the background is
  // pure battery drain. dormancy() is already written in base.js and there is
  // nowhere to change its body from — this is that very flag, the one that has
  // to go into its condition (see the report).
  let crtOpen = false;

  // The base asks through a function instead of reading the variable: base.js
  // runs higher up the file, and a reference before the let declaration throws.
  function screenOpen() { return crtOpen; }

  function shadow(on) {
    document.querySelectorAll(SHADOWED).forEach(function (el) {
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }

  function openCrt(mode) {
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
    crt.classList.remove('on');
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
    if (crt.dataset.mode === 'post' && postCtl && postCtl.done) { postCtl = null; closeCrt(); }
  });

  // One handler for all three modes: the dispatcher looks at dataset.mode
  // instead of breeding a listener per openXxx() — that way, on a switch from
  // post to setup inside one already open dialog, there is no guessing how
  // many old handlers have been hung on it by now.
  document.addEventListener('keydown', function (e) {
    if (!crtOpen) return;
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
  document.addEventListener('keydown', function (e) {
    if (crtOpen) return;
    // F2 — as on a real machine. Enter — for those whose top row is given
    // over to the system, but only when the focus is on nothing: in the
    // console field it sends the command, on a button of the schematic it
    // presses that button, and it must not be taken away there.
    const idle = document.activeElement === document.body || document.activeElement === null;
    if (e.key !== 'F2' && !(e.key === 'Enter' && idle)) return;
    e.preventDefault();
    openSetup();
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

  // Two effects of the firmware on the schematic — and only two, deliberately
  // written down as the permitted ones: the rotation period has to stay a
  // multiple of a second, otherwise the twenty positions of the fan blade
  // drift off the common 0.05 s beat.
  function applyNvEffects() {
    rig.classList.toggle('nv-eff', nv.power === 'Efficiency');
    // has-fault is already taken by someone else's logic (the lamps of the
    // missing units) — here we have a flag of our own, so as not to override
    // that condition.
    rig.classList.toggle('sb-off', nv.mode === 'UEFI' && nv.secureBoot === 'Disabled');
  }
  applyNvEffects();   // apply what already lay in rig-nv, before setup is ever opened

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

  // ── POST ───────────────────────────────────────────────────────────────
  // The lines are assembled once out of the three layers of truth — the spec,
  // the DOM and nv — and printed by one and the same function both onto the
  // screen and into the console: the gauges and sensors already diverged for
  // exactly that reason, they were computed twice by different formulas, and
  // this is the same place where it could have happened again.
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
      // Legacy does not see GPT — exactly the case where a real machine drops
      // into "no boot device" and stays standing on the screen instead of
      // quietly repairing itself.
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
    if (e.key === 'F2' || e.key === 'Enter') {
      e.preventDefault();
      if (postCtl.done) enterSetupFromPost();
      else postCtl.f2Pending = true;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // The first Esc skips the pauses between the lines, the second closes
      // the screen. Otherwise the self-test looked hung: the lines had run
      // out and there was nothing to leave the screen with but waiting.
      if (!postCtl.done) postCtl.skip = true;
      else { postCtl = null; closeCrt(); }
    }
  }

  function enterSetupFromPost() {
    postCtl = null;
    openSetup();
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
   */
  function screenPost() {
    const built = buildPostLines();
    const showScreen = !reduced;
    postCtl = { f2Pending: false, skip: false, done: false };
    if (showScreen) { postLog.textContent = ''; openCrt('post'); }

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
        if (built.bootFailed) {
          if (!showScreen) postCtl = null;   // no screen — nobody to catch F2 anyway
          return;                             // we hang on the screen, like a real machine with no disk
        }
        line('system ready', 'ok');
        // The hint is printed into the console, not only onto the screen: the
        // screen goes away in a moment, and the question "how do I get into
        // the BIOS" stays.
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
  // AMI Aptio — a blue field, a yellow line, help on the right. The sections
  // are described by a data scheme (setupRows) rather than by markup: Boot and
  // IMM change the set of rows on the fly (Secure Boot hides under Legacy, the
  // IP fields under Static), and if this were markup we would have to
  // hide/show pieces by hand in three places instead of one.
  const SETUP_TABS = ['Main', 'Advanced', 'Boot', 'IMM'];
  const CORE_OPTIONS = ['All', HW.cpu.cores, Math.floor(HW.cpu.cores / 2),
                         Math.floor(HW.cpu.cores / 4), Math.floor(HW.cpu.cores / 8)];
  const MEM_FREQ_OPTIONS = ['Auto', '6400', '6000', '5600', '4800'];

  let setupTab = 0;
  let setupRow = -1;
  let nvDraft = null;      // draft: edits show at once, but reach nv only on F10
  let editField = null;    // { row, buf } — editing IP/mask/gateway character by character

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
      if (chassis.querySelector('.cpu-slot[data-cpu="' + n + '"].opened')) continue;   // a pulled one disappears
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
        return;                       // the hint goes to the console, the screen is not repainted
      case 'F9':
        e.preventDefault();
        nvDraft = cloneNv(NV_DEFAULT);   // wipes only the draft — F9 does not touch the power
        setupRow = -1;
        line('bios: optimized defaults loaded', 'warn');
        break;
      case 'F10':
        e.preventDefault();
        commitSetup();
        return;                        // commitSetup closes the dialog itself
      case 'Escape':
        e.preventDefault();
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

  // The current (saved) settings line by line — the thing that has to pipe:
  // `bios dump | grep Boot`. The draft deliberately does not get here: until
  // F10 has been pressed, from the outside the firmware has not changed.
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

  // ── Start-up ───────────────────────────────────────────────────────────
  const first = !state.visited;
  state.visited = true; save();

  // The cover. A visitor should not have to guess that it needs taking off:
  // on the first visit it comes off by itself. Putting it back is done by a
  // button on the board, next to the service mode switch.
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
      line('power off · re-seating all units …', 'muted');
      reassemble();
    });
  }

  bindLid(lidRemove, true, 'cover removed');
  bindLid(lidOn, false, 'cover in place');

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
