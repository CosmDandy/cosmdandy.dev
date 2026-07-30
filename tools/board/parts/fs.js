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
