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

  // ── Контрольный индикатор ──────────────────────────────────────────────
  // Две цифры, и на них видно, где машина находится: пока идёт самотест, коды
  // сменяются, а на последнем индикатор замирает. Это и отличает контрольный
  // индикатор от лампы: лампа говорит «сломано», он — «дошли досюда».
  //
  // Сегменты зажигает таблица, а не отдельная фигура на каждый символ: на
  // живом индикаторе горят те же семь полосок, и из них складывается всё, что
  // он умеет показать.
  const SEG_OF = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
    '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
    'A': 'abcefg', 'b': 'cdefg', 'C': 'adef', 'd': 'bcdeg', 'E': 'adefg',
    'F': 'aefg', 'H': 'bcefg', 'L': 'def', 'P': 'abefg', 'U': 'bcdef',
    '-': 'g', ' ': '',
  };

  function showCode(code) {
    const text = String(code).padStart(2, ' ').slice(-2);
    for (let d = 0; d < 2; d++) {
      const lit = SEG_OF[text[d]] || '';
      for (const seg of 'abcdefg') {
        const el = chassis.querySelector('.seg-' + d + seg);
        if (el) el.classList.toggle('on', lit.indexOf(seg) >= 0);
      }
    }
  }

  // Коды взяты по смыслу, а не с потолка: это те же вехи, что печатает
  // самотест на экране. Последний — тот, на котором машина отдаёт управление
  // загрузчику, и именно на нём индикатор стоит у работающей машины.
  const POST_CODES = ['01', '0d', '19', '2A', '31', '4F', '55', '61',
                      '78', '92', 'b4', 'C1', 'd5', 'E7', 'AA'];
  let postTimer = null;

  function runCheckpoint() {
    if (postTimer) clearInterval(postTimer);
    let i = 0;
    showCode(POST_CODES[0]);
    postTimer = setInterval(function () {
      i += 1;
      if (i >= POST_CODES.length) { clearInterval(postTimer); postTimer = null; return; }
      showCode(POST_CODES[i]);
    }, 170);
  }

  // Регистр здесь не косметика. На семисегментном индикаторе B неотличима от 8,
  // а D от 0, и живые платы пишут их строчными — 'b' и 'd'. Верхний регистр
  // остаётся тем буквам, которые индикатор различает.
  function hexCode(code) {
    return code.toString(16).padStart(2, '0')
      .replace(/[acef]/g, function (ch) { return ch.toUpperCase(); });
  }

  /** Контрольная точка от прошивки — то же число, что показывает экран. */
  function setBoardPostCode(code) {
    // Пришли настоящие коды — заготовленная лента больше не нужна.
    if (postTimer) { clearInterval(postTimer); postTimer = null; }
    showCode(code === null || code === undefined ? '  ' : hexCode(code));
  }

  function stopCheckpoint() {
    if (postTimer) { clearInterval(postTimer); postTimer = null; }
    // Выключенная машина не показывает ничего: контрольный индикатор питается
    // от того же, от чего и хост.
    showCode('  ');
  }

  // ── Сброс ──────────────────────────────────────────────────────────────
  // Ошибка защёлкивается: узел вернули на место, а лампа неисправности горит
  // дальше — так и на живой машине, иначе о ночном отказе наутро никто бы не
  // узнал. Гасит её эта кнопка, и гасит только на собранной машине: пока
  // что-то вынуто, сбрасывать нечего.
  const lpReset = document.getElementById('lp-reset');
  function resetFaults() {
    if (chassis.querySelector('.pulled')) {
      line('reset refused · unit still removed', 'warn');
      return;
    }
    if (!rig.classList.contains('fault-latched')) {
      line('reset · nothing to clear', 'muted');
      return;
    }
    rig.classList.remove('fault-latched');
    line('reset · fault indication cleared', 'ok');
    tick();
  }
  lpReset.addEventListener('click', resetFaults);
  lpReset.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resetFaults(); }
  });

  // Контрольный индикатор показывает код готовности всегда, когда машина
  // работает. Заводит его powerOn(), а на повторном заходе питание
  // восстанавливается из сохранённого состояния, минуя её: обновил страницу —
  // и семисегментник тёмный, хотя машина работает. Значение появлялось только
  // после выключения и включения вручную. На живой машине этот индикатор
  // показывает последний код всегда, пока есть питание.
  if (state.powered) showCode(POST_CODES[POST_CODES.length - 1]);
