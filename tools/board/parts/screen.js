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
                   ' .theme-switch, .assemble-btn, .zoom-btn';
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
