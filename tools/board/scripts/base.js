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

  // @part: sfx

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

  // @block: front_panel

  // @block: lightpath

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
    const href = unit.dataset.href;
    if (href.startsWith('mailto:')) { window.location.href = href; return; }
    // Свой раздел открываем здесь же: имя переезжает на соседнюю страницу
    // штатным переходом браузера, а он возможен только внутри одной вкладки.
    // В новой вкладке документ начинается с чистого листа, и переносить в нём
    // нечего — анимация молча пропадала, хотя обе страницы её объявляли.
    if (href.startsWith('/')) { window.location.href = href; return; }
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

  // @part: term

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

  // @part: hw

  // @part: fs

  // @part: screen

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
