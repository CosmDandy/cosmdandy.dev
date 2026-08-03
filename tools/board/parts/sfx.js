  // ── Звук ───────────────────────────────────────────────────────────────
  // Звук машины синтезируется здесь, а не лежит рядом файлами. Дело не в
  // экономии байт: щелчок тумблера, лязг защёлки и стук платы в направляющих —
  // это короткие переходные процессы, то есть шум под огибающей. Ровно это и
  // собирается из трёх узлов Web Audio, а пачка mp3 к странице, которая вся
  // умещается в один самодостаточный файл, добавила бы запросы и вопрос о
  // лицензии на каждый чих.
  //
  // Молчит по умолчанию, и это не осторожность, а единственный способ вообще
  // иметь здесь звук: визитка, которая начинает щёлкать без спроса,
  // закрывается вкладкой.
  //
  // На prefers-reduced-motion сознательно не смотрим, хотя всё остальное в
  // этом файле его слушает. Тот флаг про вестибулярный аппарат, а не про уши;
  // согласие на звук уже дано явным нажатием кнопки, и глушить после него
  // значило бы ломать то, что человек только что включил.
  const sfxBtn = document.getElementById('sfx-btn');
  let audible = false;
  try { audible = localStorage.getItem('sound') === 'on'; } catch (e) {}

  // Контекст, шина и шумовой буфер заводятся при включении, а не при загрузке:
  // до первого жеста браузер всё равно держит контекст в suspended, и заранее
  // созданный был бы просто висящим узлом.
  let ac = null;
  let bus = null;
  let noise = null;

  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      bus = ac.createGain();
      bus.gain.value = 0.5;
      bus.connect(ac.destination);
      // Полсекунды белого шума по кругу: из него сделаны все удары и щелчки,
      // и второго такого буфера не нужно никому.
      const n = Math.floor(ac.sampleRate * 0.5);
      noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac.state === 'running' ? Promise.resolve() : ac.resume();
  }

  // Удар: кусок шума, зажатый полосовым фильтром и огибающей. Частота фильтра
  // — это «из чего сделано»: сталь звенит выше, текстолит глуше. Съезд
  // частоты (to) превращает удар в шорох по направляющим.
  function burst(t, freq, dur, gain, q, to) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const flt = ac.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = q;
    flt.frequency.setValueAtTime(freq, t);
    if (to) flt.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.0015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(env);
    env.connect(bus);
    // Каждый раз с другого места буфера: иначе два щелчка подряд слышны как
    // один и тот же сэмпл, и машина звучит механической игрушкой.
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur);
  }

  // Спикер на плате и есть генератор прямоугольника — ничего сложнее там нет.
  function tone(t, freq, dur, gain) {
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.setValueAtTime(gain, t + dur - 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    osc.stop(t + dur);
  }

  // Голоса. Каждый — то, что слышно в живой стойке, а не абстрактный «звук
  // нажатия»: поэтому у снятия и посадки разный порядок частей, а не разная
  // высота одного и того же щелчка.
  const VOICE = {
    // Тумблер: пружина отпускает, следом смыкается контакт.
    click: function (t, v) {
      burst(t, 2400, 0.014, 0.30 * v, 1.1);
      burst(t + 0.026, 1500, 0.022, 0.20 * v, 1.6);
    },
    // Защёлка отжата, рычаг поднят: узел ещё на месте, но уже отпущен.
    latch: function (t, v) {
      burst(t, 3200, 0.010, 0.24 * v, 2.0);
      burst(t + 0.05, 1100, 0.030, 0.14 * v, 1.2);
    },
    // Узел выходит: сперва лязг сорвавшейся защёлки, потом шорох по
    // направляющим — он и говорит, что деталь длинная.
    pull: function (t, v) {
      burst(t, 1800, 0.018, 0.26 * v, 1.4);
      burst(t + 0.02, 900, 0.16, 0.10 * v, 0.7, 380);
    },
    // Узел садится: шорох сначала, удар в конце. Поменяй порядок — и это
    // слышно как «вынули», сколько ни правь тембр.
    seat: function (t, v) {
      burst(t, 420, 0.13, 0.09 * v, 0.7, 900);
      burst(t + 0.12, 320, 0.055, 0.34 * v, 1.0);
      burst(t + 0.12, 2600, 0.012, 0.12 * v, 2.2);
    },
    // Крышка: длинный ход стали по стали и удар в упор.
    lid: function (t, v) {
      burst(t, 900, 0.30, 0.10 * v, 0.5, 260);
      burst(t + 0.28, 260, 0.09, 0.26 * v, 0.9);
    },
    // Тот самый POST-beep: один короткий писк, когда машина пошла.
    beep: function (t, v) { tone(t, 1000, 0.13, 0.10 * v); },
  };

  // Единственная дверь наружу. Контекст, которого ещё нет или который стоит,
  // — это не ошибка, а нормальное состояние до первого жеста: молчим.
  // Планировать в остановленный контекст нельзя, его часы стоят, и всё
  // запланированное вывалилось бы разом при возобновлении.
  function sfx(name, v) {
    if (!audible || !ac || ac.state !== 'running') return;
    const voice = VOICE[name];
    if (voice) voice(ac.currentTime + 0.002, v === undefined ? 1 : v);
  }

  // Сборка звучит по тому же расписанию, по которому идёт: срок посадки узел
  // носит на себе сам (--seat), и второй копии сроков заводить не надо — это
  // ровно та ошибка, от которой предостерегает соседний комментарий про
  // assemblyEnd(). Узлы, садящиеся в один момент, дают один удар погромче, а
  // не пачку в один отсчёт: сорок шесть узлов укладываются в тридцать один
  // момент, и без слияния это слышно как треск, а не как сборка.
  function sfxAssembly() {
    if (!audible || !ac || ac.state !== 'running') return;
    const at = new Map();
    chassis.querySelectorAll('[style*="--seat"]').forEach(function (el) {
      const s = parseFloat(el.style.getPropertyValue('--seat')) || 0;
      at.set(s, (at.get(s) || 0) + 1);
    });
    const t0 = ac.currentTime + 0.02;
    at.forEach(function (n, s) { VOICE.seat(t0 + s, Math.min(1, 0.45 + n * 0.12)); });
  }

  // Ушли со вкладки — замолкаем вместе с анимациями. Расписание сборки к тому
  // моменту уже роздано планировщику, и без этого оно доигрывало бы в фоне,
  // где сама машина стоит на паузе (.dormant).
  document.addEventListener('visibilitychange', function () {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(function () {});
    else if (audible) ac.resume().catch(function () {});
  });

  // Иконка и подпись говорят, что сейчас, а не что будет по нажатию — так же
  // ведёт себя переключатель темы, и разнобой здесь читался бы как ошибка.
  function labelSound(on) {
    const text = on ? 'Звук включён, выключить' : 'Звук выключен, включить';
    sfxBtn.setAttribute('aria-pressed', String(on));
    sfxBtn.setAttribute('aria-label', text);
    sfxBtn.setAttribute('title', text);
  }

  function setSound(on) {
    audible = on;
    try { localStorage.setItem('sound', on ? 'on' : 'off'); } catch (e) {}
    labelSound(on);
    // Выключили — контекст закрываем, а не просто останавливаем. Остановленный
    // держит звуковое устройство и значок звука на вкладке молчащей страницы, а
    // главное — сохраняет всё, что уже роздано планировщику: выключить звук
    // посреди сборки и включить через минуту значило бы услышать её хвост.
    if (!on) {
      if (ac) { ac.close().catch(function () {}); ac = null; }
      return;
    }
    // Щелчок самой кнопки и есть подтверждение, что звук поехал: нажатие,
    // после которого ничего не слышно, ничем не отличается от сломанного.
    audio().then(function () { VOICE.click(ac.currentTime + 0.01, 1); })
           .catch(function () {});
  }

  sfxBtn.addEventListener('click', function () { setSound(!audible); });
  labelSound(audible);

  // Гость, у которого звук остался включённым с прошлого раза: контекст всё
  // равно нельзя завести до жеста, поэтому ждём любого первого.
  if (audible) {
    const wake = function () { audio().catch(function () {}); };
    document.addEventListener('pointerdown', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
  }
