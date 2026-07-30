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
