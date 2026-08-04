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
    closeOverlay();
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

  function fanRpm(src) {
    const want = fanPolicyEffective(src);
    const found = fanPolicyList().filter(function (p) { return p.id === want; })[0];
    return found ? found.rpm : (HW.fan ? HW.fan.rpm_nom : 0);
  }

  function fanSpin(src) {
    const nom = HW.fan ? HW.fan.rpm_nom : 0;
    const rpm = fanRpm(src);
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
    rig.classList.toggle('nv-eff', fanRpm() < (HW.fan ? HW.fan.rpm_nom : 0));
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
    push('Fan Speed Policy: ' + fanPolicyEffective() + ' · ' + fanRpm() + ' rpm', 'muted', 120);
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
      roRow('Target Speed', function () { return fanRpm(nvDraft) + ' rpm'; }),
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
    put('Fan Speed Policy', fanPolicyEffective() + ' · ' + fanRpm() + ' rpm');
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
