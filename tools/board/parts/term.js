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
    // Экран бережёт последняя стадия, а не источник. `/proc/cpuinfo` — это без
    // малого восемь тысяч строк, и напечатать их целиком значит стереть всё,
    // что было в терминале до. Резать его в самом файле нельзя: конвейер
    // обязан видеть весь файл, иначе `grep | wc` соврёт. Поэтому обрезается
    // именно вывод, и ровно тогда, когда он идёт на экран.
    const ЭКРАН = 60;
    let печать = out || [];
    if (печать.length > ЭКРАН) {
      const скрыто = печать.length - ЭКРАН;
      печать = печать.slice(0, ЭКРАН).concat([
        { t: '', c: '' },
        { t: '… ещё ' + скрыто + ' строк · целиком — по конвейеру, '
             + 'например ' + text.split('|')[0].trim() + ' | wc', c: 'muted' },
      ]);
    }
    печать.forEach(function (row) { line(row.t, row.c || ''); });
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

  // Лента ревизий. На живом сайте она не поднимается сама: это восемьдесят
  // схем, и качать их, зайдя посмотреть визитку, незачем. Кто хочет увидеть,
  // как машина росла, — просит об этом сам, и тогда качается по одной схеме за
  // ход ползунка. Локально лента была и есть, там просить нечего.
  //
  // Имя не history: так зовётся история команд оболочки, и вторая команда с
  // тем же именем в реестр не встаёт — он её отвергает, а страница падает на
  // этом ещё до того, как соберётся консоль.
  cmd({
    name: 'revisions',
    group: 'МАШИНА',
    brief: 'лента ревизий схемы',
    usage: 'revisions on|off',
    complete: function (argv, i) { return i === 1 ? ['on', 'off'] : []; },
    help: ['Схема собирается генератором, и каждая её сборка сохранена.',
           'on поднимает ленту под машиной: ползунком по ней видно, как плата',
           'менялась от первой ревизии до сегодняшней. off убирает ленту и',
           'возвращает машину на текущую сборку.',
           'Схемы качаются по одной и только пока лента поднята.'],
    run: function (ctx) {
      const arg = String(ctx.args[0] || '').toLowerCase();
      if (arg === 'off') {
        if (!stripUp()) return [{ t: 'лента и так убрана', c: 'muted' }];
        // Сначала вернуть машину на сегодняшнюю сборку, и только потом убирать
        // ленту. Наоборот нельзя: на экране осталась бы схема полугодовой
        // давности, а ползунка, которым её меняли, уже не будет.
        showRev(revs.length - 1);
        setStrip(false);
        return [{ t: 'лента убрана · схема вернулась на текущую сборку', c: 'muted' }];
      }
      if (arg === 'on') {
        if (stripUp()) return [{ t: 'лента уже поднята', c: 'muted' }];
        // Второй заход качать нечего: список ревизий уже в памяти, а схемы — в
        // кэше по мере того, как их листали.
        if (revs.length) { setStrip(true); return [{ t: 'лента поднята', c: 'ok' }]; }
        revsAsked = true;
        initTimeline();
        // initTimeline асинхронна: сообщать об успехе сейчас нельзя. Об отказе
        // она скажет сама, отдельной строкой, когда станет ясно.
        return [{ t: 'загружаю историю схемы…', c: 'muted' }];
      }
      return [{ t: 'revisions on|off', c: 'warn' },
              { t: 'сейчас: ' + (stripUp() ? 'поднята' : 'убрана'), c: 'muted' }];
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

  // Курсор всегда возвращается в строку. Гость щёлкает по узлу, по
  // переключателю, по кнопке панели — и после каждого такого действия фокус
  // оставался на нажатом, а набрать команду было некуда, пока не ткнёшь в
  // строку отдельно. Возвращаем его сами.
  //
  // Только когда консоли есть куда возвращать: вне сервисного режима строки
  // нет вовсе, в лупе она спрятана, а под поднятым экраном машины ввод и так
  // запрещён. И не отнимаем фокус у того, кому он нужен самому, — у ссылок и
  // у полей ввода.
  rig.addEventListener('click', function (e) {
    if (!rig.classList.contains('service') || rig.classList.contains('zoom')) return;
    if (screenOpen()) return;
    if (e.target.closest('input, textarea, a[href], [contenteditable]')) return;
    promptInput.focus({ preventScroll: true });
  });
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
