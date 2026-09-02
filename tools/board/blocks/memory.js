  PICKS.push({
    test: function (el) { return el.dataset.dimm !== undefined; },
    name: function (el) { return 'dimm ' + el.dataset.dimm; },
  });

  // ── Сцена: открытие блога ──────────────────────────────────────────────
  // Блог открывается памятью: записи лежат в ней, и достать их можно только
  // тем, чем память вообще занята, — обходом строк. Камера наводится на банк,
  // и по нему идёт цикл обновления.
  const MEM_NS = 'http://www.w3.org/2000/svg';

  // Микросхемы на модулях. В разметке их нет и не должно быть: это сцена для
  // одного банка из трёх, и платить за неё разметкой обязан тот, кто её
  // открыл, а не каждый гость.
  //
  // Сколько их — считается, а не выбирается. У модуля 2Rx8 разрядность чипа
  // восемь бит, шина с коррекцией — семьдесят два: девять корпусов на ранг,
  // и столько же видно с одной стороны планки. Соврать тут нельзя ровно так
  // же, как в консоли: обе цифры приходят из одного паспорта.
  function buildCells(bank) {
    if (bank.querySelector('.bank-cells')) return;
    const width = parseInt(/x(\d+)/i.exec((HW.dimm && HW.dimm.ranks) || '2Rx8')[1], 10);
    const chips = Math.round(72 / width);
    const dimms = [...bank.querySelectorAll('.dimm')];

    const g = document.createElementNS(MEM_NS, 'g');
    g.setAttribute('class', 'bank-cells');

    dimms.forEach(function (dimm, row) {
      const b = dimm.querySelector('.pick-body').getBBox();
      // Корпуса сидят в ряд по длине планки, отступив от краёв: у самой
      // кромки стоит не память, а ключ и контакты.
      const padX = b.width * 0.10, padY = b.height * 0.24;
      const w = (b.width - 2 * padX) / chips;
      for (let i = 0; i < chips; i++) {
        const r = document.createElementNS(MEM_NS, 'rect');
        // Обход идёт по строкам, а строки лежат поперёк банка: волна
        // проходит планку за планкой и по каждой слева направо. Задержка
        // складывается из обоих слагаемых, поэтому фронт идёт наискось —
        // так контроллер память и обходит, а не всю разом.
        const c = row * chips + i;
        r.setAttribute('class', 'cell' + (held(row, i) ? ' held' : ''));
        r.setAttribute('x', (b.x + padX + i * w + 0.6).toFixed(2));
        r.setAttribute('y', (b.y + padY).toFixed(2));
        r.setAttribute('width', Math.max(0.6, w - 1.2).toFixed(2));
        r.setAttribute('height', Math.max(0.6, b.height - 2 * padY).toFixed(2));
        r.setAttribute('style', '--c:' + c);
        g.appendChild(r);
      }
    });
    bank.appendChild(g);
  }

  // Какие страницы заняты. Раскладка обязана быть одной и той же от показа к
  // показу: мигающая наугад память читается неисправной, а не заполненной.
  function held(row, i) {
    return ((row * 7 + i * 3) % 11) < 4;
  }

  OPENERS.push({
    test: function (el) { return el.dataset.group === 'dimm'; },
    play: function (el, done) {
      const code = (el.dataset.unit || '').split('-')[1] || 'L';
      const spec = (HW.dimm.banks || []).find(function (b) { return b.code === code; })
                   || HW.dimm.banks[0];
      buildCells(el);

      camera(frameOf(el, 26), 760);
      line('dimm ' + code + ': банк ' + spec.ch + ' · ' + spec.n + '× '
           + HW.dimm.size_gb + ' ГБ ' + HW.dimm.kind, 'muted');

      sceneWait(700, function () {
        el.classList.add('refreshing');
        line('dimm ' + code + ': refresh · ' + HW.dimm.speed + ' MT/s · '
             + HW.dimm.ranks, 'ok');
      });

      sceneWait(1700, function () {
        line('dimm ' + code + ': ' + spec.n * HW.dimm.size_gb
             + ' ГБ обойдено · открываю записи', 'ok');
      });

      sceneWait(2100, done);
    },
  });
