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

  let state = { powered: true, visited: false, lid: false };
  try {
    const raw = localStorage.getItem('rig-state');
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) {}

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

  // ── Терминал ───────────────────────────────────────────────────────────
  // Консоль не только пишет, но и слушает: те же действия, что кнопками, но
  // словами. Ссылки в прототипе не открываются — команда печатает адрес.
  const LINKS = {
    blog: 'https://blog.cosmdandy.dev',
    cv: 'https://cv.cosmdandy.dev',
    github: 'https://github.com/cosmdandy',
    linkedin: 'https://linkedin.com/in/cosmdandy',
    telegram: 'https://t.me/cosmdandy',
    email: 'mailto:i@cosmdandy.dev',
  };

  const HELP = [
    'ПИТАНИЕ И СОСТОЯНИЕ',
    '  power on|off|cycle   — питание, powercycle как в racadm',
    '  reboot               — тёплая перезагрузка хоста',
    '  assemble             — пересобрать машину с нуля, как при первом заходе',
    '  status               — сводка состояния узлов',
    '  sensors              — датчики: температуры, обороты, ватты',
    '  sel                  — журнал системных событий',
    'ЖЕЛЕЗО',
    '  fru                  — паспорт машины: модель, серийник, ревизия',
    '  dimm                 — карта заполнения памяти по каналам',
    '  nvme list            — накопители в отсеках',
    '  lspci                — устройства на шинах PCIe',
    '  fans                 — обороты и состояние вентиляторов',
    'ОБСЛУЖИВАНИЕ',
    '  cover open|close     — снять или поставить крышку',
    '  service on|off       — сервисный режим, извлечение узлов',
    '  id on|off            — опознание в стойке',
    '  lightpath            — выдвинуть панель диагностики',
    '  bios                 — ключевые настройки прошивки',
    'ПРОЧЕЕ',
    '  links · open <имя> · whoami · uptime · clear · help',
  ];

  // Данные машины: те же числа, что нарисованы на плате.
  const FRU = [
    'Manufacturer   : COSMDANDY',
    'Product Name   : CD93-FS1',
    'Board Revision : 13',
    'Serial Number  : CD93-2026-0730',
    'BIOS Version   : 2.6.1  (2026-05-14)',
    'BMC Firmware   : 2.14.3  (AST2600)',
    'CPU            : 2× Xeon Scalable · LGA 4677 · 32c/64t',
    'Memory         : 32× DDR5 RDIMM 5600 MT/s · 1.0 TiB',
    'Storage        : 6× U.2 NVMe · 1× Optane P5800X',
    'Network        : 2× 25G SFP+ (OCP 3.0) · 2× 1GbE · 1× MLAN',
  ];

  const SEL = [
    ['0x0012', 'System Boot Initiated', 'ok'],
    ['0x0013', 'Memory Training Complete · 32 of 32', 'ok'],
    ['0x0014', 'Fan Bay 6 · Empty · airflow reduced', 'warn'],
    ['0x0015', 'PSU-1 Input 220V · redundancy full', 'ok'],
    ['0x0016', 'BMC Heartbeat Established', 'ok'],
  ];

  const BIOS = [
    'Boot Mode              : UEFI',
    'Secure Boot            : Enabled',
    'SR-IOV                 : Enabled',
    'Hyper-Threading        : Enabled',
    'Memory Mode            : Independent · 8 channels/CPU',
    'Power Profile          : Performance Per Watt (OS)',
    'System Profile         : Custom · C-States off',
    'Boot Order             : 1) NVMe 0  2) PXE 25G  3) BMC Virtual Media',
  ];

  const LSPCI = [
    '00:00.0 Host bridge: Intel Sapphire Rapids DMI',
    '17:00.0 Non-Volatile memory controller: NVMe SSD 3.84TB',
    '18:00.0 Non-Volatile memory controller: Optane P5800X',
    '31:00.0 Ethernet controller: 25G SFP28 OCP 3.0 (rev 02)',
    '65:00.0 Ethernet controller: 1GbE dual-port',
    'b1:00.0 PCI bridge: Riser 1 · PCIe Gen5 x16',
    'b2:00.0 PCI bridge: Riser 2 · PCIe Gen5 x16',
    'ff:1e.0 Baseboard Management Controller: AST2600',
  ];

  function svcOn(on) {
    if (rig.classList.contains('service') !== on) toggleService();
  }

  function exec(raw) {
    const [cmd, arg] = raw.trim().toLowerCase().split(/\s+/);
    if (!cmd) return;
    line('$ ' + raw.trim(), 'muted');
    switch (cmd) {
      case 'help': HELP.forEach(function (h) { line(h); }); break;
      case 'power':
        if (arg === 'off') { if (state.powered) powerOff(); else line('уже выключен', 'muted'); }
        else if (arg === 'on') {
          if (rig.classList.contains('init')) line('power inhibited · bmc init', 'warn');
          else if (state.powered) line('уже работает', 'muted');
          else { line('power on', 'muted'); powerOn(); }
        } else if (arg === 'cycle') {
          if (!state.powered) { line('power on', 'muted'); powerOn(); }
          else { powerOff(); wait(1000, function () { line('power on', 'muted'); powerOn(); }); }
        } else line('power on|off|cycle', 'warn');
        break;
      case 'cover':
        if (arg === 'open') { setLid(true); line('cover removed', 'ok'); }
        else if (arg === 'close') { setLid(false); line('cover in place', 'ok'); }
        else line('cover open|close', 'warn');
        break;
      case 'service':
        if (arg === 'on' || arg === 'off') svcOn(arg === 'on');
        else line('service on|off', 'warn');
        break;
      case 'id':
        if (arg === 'on' || arg === 'off') {
          if (rig.classList.contains('identify') !== (arg === 'on')) toggleIdentify();
        } else line('id on|off', 'warn');
        break;
      case 'lightpath': toggleLp(); break;
      case 'reboot':
        if (!state.powered) { line('машина выключена · power on', 'warn'); break; }
        line('graceful shutdown …', 'muted');
        powerOff();
        wait(1200, function () { line('power on', 'muted'); powerOn(); });
        break;
      case 'assemble':
        // Пересборка: узлы снимаются со своих мест и садятся заново по тому
        // же расписанию. Класс приходится снять и вернуть следующим кадром —
        // иначе браузер не считает анимацию новой и ничего не проигрывает.
        rig.classList.remove('assembly');
        void chassis.offsetWidth;
        rig.classList.add('assembly');
        line('re-seating all units …', 'muted');
        wait(assemblyEnd(), function () {
          finishAssembly();
          line('all units seated', 'ok');
        });
        break;
      case 'fru': FRU.forEach(function (l) { line(l); }); break;
      case 'bios': BIOS.forEach(function (l) { line(l); }); break;
      case 'lspci': LSPCI.forEach(function (l) { line(l); }); break;
      case 'sel':
        line('ID      EVENT', 'muted');
        SEL.forEach(function (e) { line(e[0] + '  ' + e[1], e[2]); });
        break;
      case 'sensors': {
        if (!state.powered) { line('датчики доступны только на работающей машине', 'warn'); break; }
        const missing = chassis.querySelectorAll('.fan.pulled').length + 1;   // один слот пуст всегда
        line('CPU0 Temp      ' + (41 + missing * 3 + Math.round(Math.random() * 6)) + ' °C', 'ok');
        line('CPU1 Temp      ' + (39 + missing * 3 + Math.round(Math.random() * 6)) + ' °C', 'ok');
        line('Inlet Temp     ' + (21 + Math.round(Math.random() * 2)) + ' °C', 'ok');
        line('Fan Speed      ' + (12400 + missing * 1800 + Math.round(Math.random() * 600)) + ' RPM',
             missing > 1 ? 'warn' : 'ok');
        line('PSU Input      ' + (318 + Math.round(Math.random() * 44)) + ' W', 'ok');
        line('DIMM Populated ' + (32 - chassis.querySelectorAll('.dimm.pulled').length) + ' of 32', 'ok');
        break;
      }
      case 'fans': {
        const pulled = new Set(Array.from(chassis.querySelectorAll('.fan.pulled'))
          .map(function (f) { return Number(f.dataset.fan); }));
        for (let n = 0; n < 8; n++) {
          if (n === 5) { line('FAN' + (n + 1) + '  —      empty bay', 'warn'); continue; }
          if (pulled.has(n)) { line('FAN' + (n + 1) + '  —      removed', 'warn'); continue; }
          line('FAN' + (n + 1) + '  ' + (12100 + Math.round(Math.random() * 900)) + '  RPM  ok', 'ok');
        }
        break;
      }
      case 'dimm': {
        const out = chassis.querySelectorAll('.dimm.pulled').length;
        line('CPU0  A0-H0  8/8   5600 MT/s  RDIMM 32GB', 'ok');
        line('CPU0  A1-H1  8/8   5600 MT/s  RDIMM 32GB', 'ok');
        line('CPU1  A0-H0  8/8   5600 MT/s  RDIMM 32GB', 'ok');
        line('CPU1  A1-H1  8/8   5600 MT/s  RDIMM 32GB', 'ok');
        line('Total       ' + (32 - out) + ' of 32 · ' + ((32 - out) * 32 / 1024).toFixed(2) + ' TiB',
             out ? 'warn' : 'ok');
        break;
      }
      case 'nvme': {
        if (arg && arg !== 'list') { line('nvme list', 'warn'); break; }
        for (let n = 0; n < 6; n++) {
          const opt = n === 2;
          line('/dev/nvme' + n + '  ' + (opt ? 'INTEL OPTANE P5800X  1.6 TB ' : 'U.2 NVMe Gen4        3.84 TB')
               + '  ' + (opt ? '  100% ' : '   98% ') + 'life', opt ? 'ok' : 'muted');
        }
        break;
      }
      case 'uptime': {
        const s2 = Math.floor((Date.now() - t0) / 1000);
        line(state.powered ? 'up ' + Math.floor(s2 / 60) + ' min ' + (s2 % 60) + ' sec · 1 user'
                           : 'standby · хост выключен', state.powered ? 'ok' : 'muted');
        break;
      }
      case 'status': {
        const pulled = chassis.querySelectorAll('.pulled').length;
        line('power   : ' + (state.powered ? 'on' : 'standby'), state.powered ? 'ok' : 'muted');
        line('cover   : ' + (rig.classList.contains('lid-off') ? 'removed' : 'in place'));
        line('service : ' + (rig.classList.contains('service') ? 'on' : 'off'));
        line('health  : ' + (pulled ? 'degraded · вынуто узлов: ' + pulled : 'ok'),
             pulled ? 'warn' : 'ok');
        break;
      }
      case 'links':
        Object.keys(LINKS).forEach(function (k) { line(k.padEnd(9) + LINKS[k]); });
        break;
      case 'open':
        if (LINKS[arg]) line(LINKS[arg], 'ok');
        else line('нет такого раздела · попробуй links', 'warn');
        break;
      case 'clear': log.innerHTML = ''; break;
      case 'whoami': line('Timofey Kondrashin · DevOps', 'ok'); break;
      default: line('неизвестная команда: ' + cmd + ' · help', 'warn');
    }
  }

  const promptInput = document.getElementById('prompt');

  // История команд, как в любой оболочке: стрелки листают назад и вперёд.
  // pos === history.length означает «строка, которую сейчас набирают»;
  // её черновик сохраняем, чтобы он вернулся, когда долистаешь вниз.
  const history = [];
  let pos = 0;
  let draft = '';

  document.getElementById('prompt-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const raw = promptInput.value.trim();
    if (raw && history[history.length - 1] !== raw) history.push(raw);
    pos = history.length;
    draft = '';
    exec(promptInput.value);
    promptInput.value = '';
  });

  promptInput.addEventListener('keydown', function (e) {
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
    // курсор в конец: иначе он остаётся там, где был, и правка идёт с середины
    const end = promptInput.value.length;
    window.requestAnimationFrame(function () { promptInput.setSelectionRange(end, end); });
  });


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

  // ── Приборы ────────────────────────────────────────────────────────────
  // Спарклайны в духе Oxide: значение и шестьдесят последних точек. Цифры
  // считаются из состояния машины, а не выдумываются: выключенный хост,
  // вынутый вентилятор или планка сразу видны и в числе, и в графике.
  const GAUGES = Array.from(document.querySelectorAll('.gauge')).map(function (el) {
    return {
      el: el,
      key: el.dataset.metric,
      value: el.querySelector('.g-value'),
      line: el.querySelector('.g-line'),
      area: el.querySelector('.g-area'),
      hist: [],
    };
  });
  const HIST = 60;

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

  function drawGauges() {
    GAUGES.forEach(function (g) {
      const m = metric(g.key);
      g.hist.push(m.v);
      if (g.hist.length > HIST) g.hist.shift();
      g.value.textContent = m.text;
      g.el.classList.toggle('warn', !!m.warn);
      g.el.classList.toggle('off', !!m.off);

      const lo = Math.min.apply(null, g.hist);
      const hi = Math.max.apply(null, g.hist);
      const span = hi - lo || 1;
      const pts = g.hist.map(function (v, i) {
        const x = (i / (HIST - 1)) * 120;
        const y = 32 - ((v - lo) / span) * 28;
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      g.line.setAttribute('points', pts.join(' '));
      // заливку замыкаем по нижней кромке, иначе площадь висит в воздухе
      const first = pts.length ? pts[0].split(',')[0] : '0';
      const last = pts.length ? pts[pts.length - 1].split(',')[0] : '0';
      g.area.setAttribute('points', first + ',34 ' + pts.join(' ') + ' ' + last + ',34');
    });
  }

  drawGauges();
  window.setInterval(drawGauges, 1000);

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
