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
        sfxMove(el, 'out');
        line('removed: радиатор CPU' + n, 'warn');
      } else if (!el.classList.contains('opened')) {
        el.classList.add('opened');
        // Рамку сокета держит рычаг, и это единственное движение здесь, у
        // которого есть щелчок: радиатор снимают винтами, процессор просто
        // вынимают из рамки, а рычаг срывается с зацепа.
        sfx('chk');
        line('removed: процессор CPU' + n + ' · LGA 4677 socket open', 'warn');
      } else {
        el.classList.remove('pulled', 'opened');
        sfxMove(el, 'in');
        line('inserted: CPU' + n + ' с радиатором', 'ok');
      }
    },
  });

  // ── Сцена: открытие резюме ─────────────────────────────────────────────
  // Резюме открывается процессором, и открывается им не случайно: это то
  // место машины, где что-то происходит само. Сцена показывает ровно это —
  // снимает радиатор, наводит камеру на крышку и раскладывает под ней
  // кремний, по которому проходит нагрузка.
  const NS = 'http://www.w3.org/2000/svg';

  // Кристаллы под крышкой. В разметке их нет и быть не должно: сто девяносто
  // два прямоугольника — это двадцать семь килобайт, которые качает каждый
  // гость ради сцены, которую откроет один из ста. Скрипт строит раскладку
  // один раз, в тот миг, когда её собрались показать.
  //
  // Раскладка честная: Turin собран из кристаллов-чиплетов, разложенных
  // вокруг общего кристалла ввода-вывода, и оба числа — сколько кристаллов и
  // сколько на них ядер — приходят из паспорта. Врать тут нечем: столько же
  // ядер печатает консоль и столько же выбито на самой крышке.
  function buildCores(slot, lid) {
    if (slot.querySelector('.cores')) return;
    const ccd = (HW.cpu && HW.cpu.ccd) || 12;
    const per = Math.round(((HW.cpu && HW.cpu.cores) || 192) / ccd);
    const b = lid.getBBox();
    const pad = 3.4;
    const x0 = b.x + pad, y0 = b.y + pad;
    const w = b.width - 2 * pad, h = b.height - 2 * pad;

    // Кристаллы стоят двумя рядами, между ними — кристалл ввода-вывода во всю
    // ширину. Так этот процессор и устроен: считает не одна пластина, а
    // дюжина, и связывает их середина.
    const perRow = Math.ceil(ccd / 2);
    const iodH = h * 0.20;
    const rowH = (h - iodH) / 2 - 1.2;
    const colW = w / perRow - 1.2;
    // Сетка ядер внутри кристалла — настолько квадратная, насколько выходит.
    const cols = Math.ceil(Math.sqrt(per));
    const rows = Math.ceil(per / cols);

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'cores');

    function rect(cls, x, y, rw, rh, style) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('class', cls);
      r.setAttribute('x', x.toFixed(2));
      r.setAttribute('y', y.toFixed(2));
      r.setAttribute('width', Math.max(0.4, rw).toFixed(2));
      r.setAttribute('height', Math.max(0.4, rh).toFixed(2));
      if (style) r.setAttribute('style', style);
      g.appendChild(r);
      return r;
    }

    rect('iod-box', x0, y0 + rowH + 1.2, w, iodH - 0.4);

    for (let k = 0; k < ccd; k++) {
      const row = k < perRow ? 0 : 1;
      const col = k % perRow;
      const cx = x0 + col * (colW + 1.2);
      const cy = y0 + (row ? rowH + iodH + 2 : 0);
      rect('ccd-box', cx, cy, colW, rowH);
      for (let i = 0; i < per; i++) {
        const ix = i % cols, iy = (i / cols) | 0;
        const cw = (colW - 2.2) / cols, ch = (rowH - 2.2) / rows;
        const ex = cx + 1.1 + ix * cw, ey = cy + 1.1 + iy * ch;
        // Задержка берётся из места ядра по горизонтали, а не из его номера:
        // фронт нагрузки идёт по кремнию слева направо ровной волной, а по
        // номеру он шёл бы кристаллами — сперва весь верхний ряд, потом весь
        // нижний, и читалось бы это двумя вспышками вместо одной волны.
        const c = Math.round((ex - x0) / w * 140);
        rect('core', ex, ey, cw - 0.5, ch - 0.5, '--c:' + c);
      }
    }

    const die = slot.querySelector('.die');
    if (die) die.after(g); else slot.appendChild(g);
  }

  OPENERS.push({
    test: function (el) { return el.dataset.group === 'cpu'; },
    play: function (el, done) {
      const slot = el.querySelector('.cpu-slot');
      const lid = slot.querySelector('.ihs');
      const n = slot.dataset.cpu;
      buildCores(slot, lid);

      // Радиатор снимается тем же движением, что и в сервисном режиме: он
      // стоит на винтах, и снять его иначе нельзя.
      slot.classList.add('pulled');
      sfxMove(slot, 'out');
      line('cpu' + n + ': радиатор снят', 'warn');

      sceneWait(420, function () {
        camera(frameOf(lid, 22), 760);
        line('cpu' + n + ': ' + HW.cpu.model + ' · ' + HW.cpu.socket, 'muted');
      });

      sceneWait(1100, function () {
        slot.classList.add('probing');
        line('cpu' + n + ': ' + HW.cpu.ccd + ' кристаллов · '
             + HW.cpu.cores + ' ядер · ' + HW.cpu.threads + ' потоков', 'ok');
      });

      sceneWait(1900, function () {
        line('cpu' + n + ': нагрузка по всем ядрам · открываю резюме', 'ok');
      });

      sceneWait(2300, done);
    },
  });
