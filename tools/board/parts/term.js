  // ── Терминал: ядро оболочки ────────────────────────────────────────────
  // Раньше здесь была лестница из case по именам команд. Она работала, но
  // имена команд существовали только как метки switch и текст в справке —
  // поэтому ни дополнить по Tab, ни собрать help из самого списка было
  // нечем, а справка расходилась с реальностью молча.
  //
  // Теперь команда объявляет себя сама: имя, группа, краткая строка помощи,
  // кандидаты для дополнения и функция. Функция ВОЗВРАЩАЕТ строки, а не
  // печатает их, — иначе не собрать конвейер: grep должен получить то, что
  // вернула предыдущая ступень, а не читать чужой вывод из лога.

  const CMDS = new Map();

  function cmd(spec) {
    // Порядок вставки частей задаёт порядок регистрации, и перепутанные
    // маркеры молча перетирали бы команды. Пусть лучше падает громко.
    if (CMDS.has(spec.name)) throw new Error('команда уже объявлена: ' + spec.name);
    CMDS.set(spec.name, spec);
    (spec.alias || []).forEach(function (a) {
      CMDS.set(a, Object.assign({}, spec, { alias_of: spec.name }));
    });
  }

  // Настройки прошивки объявляет экран (parts/screen.js), а он выполняется
  // ниже по файлу. До первого нажатия клавиши его уже нет смысла ждать, но
  // если экран не собран вовсе — команды должны работать, просто без
  // настроек. Отсюда try: обращение к необъявленной переменной бросает.
  function nvBag() {
    try { return nv; } catch (e) { return {}; }
  }

  let cwd = '/home/cosmdandy';

  // ── Разбор строки ──────────────────────────────────────────────────────
  // Было: split по пробелам и всё в нижний регистр — то есть ровно два
  // слова, и путь /Proc превращался в /proc. Теперь регистр сохраняется:
  // пути и шаблоны grep к нему чувствительны. К нижнему приводится только
  // имя команды при поиске в реестре.

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

  // ── История ────────────────────────────────────────────────────────────
  const history = [];
  let pos = 0;
  let draft = '';

  // `!!` — предыдущая строка, `!7` — седьмая, `!se` — последняя на «se».
  // Развёрнутое печатается эхом и кладётся в историю уже развёрнутым: так
  // ведёт себя bash, и так понятно, что именно выполнилось.
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

  // ── Выполнение ─────────────────────────────────────────────────────────

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

  // Похожая команда для подсказки при опечатке: считаем общий префикс, этого
  // хватает — список короткий, а расстояние Левенштейна тут излишество.
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
    (out || []).forEach(function (row) { line(row.t, row.c || ''); });
    return out || [];
  }

  // ── Справка собирается из реестра ──────────────────────────────────────
  // Пока список команд лежал отдельным массивом, он расходился с самим
  // switch: команда была, а строки про неё не было, и наоборот.
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

  // ── Дополнение ─────────────────────────────────────────────────────────
  // Кандидаты берём у самой команды: она одна знает, что стоит на месте
  // своего аргумента — пути, ключи или имена ссылок.
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

  // Что дорисовать серым: сначала кандидат дополнения, если он один или у
  // всех общий префикс; если кандидатов нет — последняя команда из истории
  // с таким началом, как в fish.
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

  // ── Поле ввода ─────────────────────────────────────────────────────────
  const promptInput = document.getElementById('prompt');
  const ghostTyped = document.querySelector('.ghost-typed');
  const ghostRest = document.querySelector('.ghost-rest');
  const ps1Cwd = document.getElementById('ps1-cwd');

  function refreshPs1() {
    if (ps1Cwd) ps1Cwd.textContent = cwd === '/home/cosmdandy' ? '~' : cwd;
  }
  refreshPs1();

  // Подсказку рисуем зеркалом под полем: в <input> двух цветов не бывает.
  // Набранное в зеркале прозрачное — оно нужно только чтобы занять ширину,
  // а видно продолжение приглушённым тоном.
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
    // Ctrl+W не вешаем: в браузере он закрывает вкладку и не отменяется.
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
      e.preventDefault();               // иначе фокус уедет на ссылку под полем
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
    e.preventDefault();                       // иначе курсор прыгает в начало строки
    if (e.key === 'ArrowUp') {
      if (pos === history.length) draft = promptInput.value;
      pos = Math.max(0, pos - 1);
    } else {
      pos = Math.min(history.length, pos + 1);
    }
    promptInput.value = pos === history.length ? draft : history[pos];
    paintGhost();
    // курсор в конец: иначе он остаётся там, где был, и правка идёт с середины
    const end = promptInput.value.length;
    window.requestAnimationFrame(function () { promptInput.setSelectionRange(end, end); });
  });

  // Ручка для проверок. Через поле ввода терминал не потестировать: сборка
  // chromium в контейнере роняет рендерер на любом <input>, и инструменты
  // удаляют поля до отрисовки страницы.
  window.__rig = {
    exec: function (s) { return exec(s); },
    complete: complete,
    ghost: ghostFor,
    cwd: function () { return cwd; },
    names: names,
  };
