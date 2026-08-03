  // ── Звук ───────────────────────────────────────────────────────────────
  // Звук машины синтезируется здесь, а не лежит рядом файлами. Дело не в
  // экономии байт: щелчок защёлки, трение по направляющим и гул вентилятора —
  // это шум под огибающей и пара синусов, то есть три-четыре узла Web Audio.
  // Пачка mp3 к странице, которая вся умещается в один самодостаточный файл,
  // добавила бы запросы и вопрос о лицензии на каждый чих.
  //
  // Голоса собраны не по принципу «на слух приятно», а по тому, что в машине
  // действительно звучит. Вентилятор даёт лопаточную частоту — лопасти,
  // помноженные на обороты в секунду, — её гармоники и широкополосный шум
  // потока. Оба числа приходят из паспорта, поэтому схема гудит на своей ноте:
  // семь лопастей на 12 100 об/мин — это около 1.4 кГц. Нечётное число
  // лопастей в rotor.py выбрано затем, чтобы тон не выпирал, — поэтому
  // тональная часть здесь заметно тише шумовой.
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
      // Полсекунды белого шума по кругу: из него сделаны все удары, щелчки,
      // трение и воздушная часть гула. Второго такого буфера не нужно никому.
      const n = Math.floor(ac.sampleRate * 0.5);
      noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return ac.state === 'running' ? Promise.resolve() : ac.resume();
  }

  const live = () => audible && ac && ac.state === 'running';

  // Кусок шума, зажатый полосовым фильтром и огибающей. Частота фильтра — это
  // «из чего сделано»: сталь звенит выше, пластик глуше. Съезд частоты (to)
  // превращает удар в шорох.
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
    env.gain.exponentialRampToValueAtTime(gain, t + 0.0012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(env);
    env.connect(bus);
    // Каждый раз с другого места буфера: иначе два щелчка подряд слышны как
    // один и тот же сэмпл, и машина звучит механической игрушкой.
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur);
  }

  // Щелчок защёлки — то самое «чк». Всё событие укладывается в три
  // миллисекунды: пружина срывается, стальная скоба бьёт в упор. Ухо ловит
  // фронт, а не тело звука, поэтому спад держим коротким — растяни его, и
  // вместо «чк» получится «тук». Второй голос впятеро тише первого: это уже
  // не щелчок, а корпус, в который отдало.
  function chk(t, v, freq) {
    burst(t, freq || 3400, 0.0035, 0.46 * v, 6);
    burst(t + 0.0045, 1250, 0.024, 0.09 * v, 2.4);
  }

  // Трение по направляющим. Ни удара, ни щелчка: узел идёт по рельсам, и
  // слышен только широкий шум ровно столько, сколько длится ход. Полоса едет
  // вверх вместе со скоростью и падает к концу, а мелкая дрожь амплитуды —
  // это stick-slip: пластик по стали идёт рывками, и без неё выходит ровное
  // шипение баллона, а не «шшших».
  function slide(t, dur, v) {
    if (dur <= 0.02) return;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const flt = ac.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 0.75;
    flt.frequency.setValueAtTime(480, t);
    flt.frequency.linearRampToValueAtTime(1240, t + dur * 0.45);
    flt.frequency.linearRampToValueAtTime(640, t + dur);
    const env = ac.createGain();
    const peak = 0.115 * v;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.08, dur * 0.22));
    env.gain.setValueAtTime(peak, t + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const wob = ac.createOscillator();
    wob.type = 'triangle';
    wob.frequency.setValueAtTime(27, t);
    wob.frequency.linearRampToValueAtTime(43, t + dur);
    const wobGain = ac.createGain();
    wobGain.gain.value = peak * 0.34;
    wob.connect(wobGain);
    wobGain.connect(env.gain);
    src.connect(flt);
    flt.connect(env);
    env.connect(bus);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.02);
    wob.start(t);
    wob.stop(t + dur + 0.02);
  }

  // Узел дошёл до разъёма. Низкий короткий удар — это масса, остановившаяся о
  // упор, и звонкая примесь поверх: у разъёма есть своя железная часть.
  function thud(t, v) {
    burst(t, 235, 0.075, 0.30 * v, 1.0);
    burst(t, 1850, 0.009, 0.09 * v, 2.8);
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

  const VOICE = {
    // Тумблер: пружина отпускает, следом смыкается контакт.
    click: function (t, v) {
      chk(t, 0.8 * v, 2600);
      burst(t + 0.028, 1500, 0.020, 0.16 * v, 1.8);
    },
    chk: function (t, v) { chk(t, v); },
    // Крышка: длинный ход стали по стали и удар в упор.
    lid: function (t, v) {
      burst(t, 900, 0.30, 0.10 * v, 0.5, 260);
      burst(t + 0.28, 260, 0.09, 0.26 * v, 0.9);
    },
    // Момент посадки при сборке. t — это когда узел ДОШЁЛ, а не когда тронулся,
    // поэтому трение звучит перед ним, а удар и защёлка ровно в t.
    seat: function (t, v) {
      slide(t - 0.32, 0.32, 0.75 * v);
      thud(t, v);
      chk(t + 0.014, 0.55 * v, 3000);
    },
    // Тот самый POST-beep: один короткий писк, когда машина пошла.
    beep: function (t, v) { tone(t, 1000, 0.13, 0.10 * v); },
  };

  // Единственная дверь наружу для разовых голосов. Контекст, которого ещё нет
  // или который стоит, — это не ошибка, а нормальное состояние до первого
  // жеста: молчим. Планировать в остановленный контекст нельзя, его часы
  // стоят, и всё запланированное вывалилось бы разом при возобновлении.
  function sfx(name, v) {
    if (!live()) return;
    const voice = VOICE[name];
    if (voice) voice(ac.currentTime + 0.002, v === undefined ? 1 : v);
  }

  // Сколько на самом деле длится ход узла — спрашиваем у самого узла. Классы
  // к этому моменту уже переставлены, но переходы браузер заводит только к
  // следующему кадру, поэтому раньше измерять нечего.
  //
  // Бесконечные анимации пропускаем: внутри вентилятора крутится ротор, и его
  // длительность — Infinity.
  function travel(el) {
    let dur = 0;
    el.getAnimations({ subtree: true }).forEach(function (a) {
      const t = a.effect && a.effect.getComputedTiming();
      if (!t) return;
      const d = ((t.delay || 0) + (t.activeDuration || 0)) / 1000;
      if (isFinite(d) && d > 0 && d < 4) dur = Math.max(dur, d);
    });
    return dur;
  }

  // Узел поехал. Наружу — защёлка отпускает первой, потом ход; внутрь — ход, и
  // только в конце, у самого разъёма, защёлка закрывается. Щелчок стоит на
  // границах движения, а не в середине: в середине узел просто едет.
  function sfxMove(el, dir) {
    if (!live()) return;
    window.requestAnimationFrame(function () {
      if (!live()) return;
      const dur = travel(el) || 0.9;
      const t = ac.currentTime + 0.004;
      if (dir === 'out') {
        chk(t, 0.9, 3600);
        slide(t + 0.03, dur - 0.03, 1);
      } else {
        slide(t, dur, 1);
        thud(t + dur, 0.75);
        chk(t + dur + 0.012, 0.85, 3200);
      }
    });
  }

  // Ход без защёлки: узел просто едет. Так вынимают каддик, у которого ручку
  // откинули отдельным движением, — щелчку здесь взяться неоткуда.
  function sfxSlide(el) {
    if (!live()) return;
    window.requestAnimationFrame(function () {
      if (!live()) return;
      slide(ac.currentTime + 0.004, travel(el) || 0.9, 1);
    });
  }

  // ── Гул машины ─────────────────────────────────────────────────────────
  // Поднимается, когда указатель заходит на машину, и стихает, когда уходит.
  // На выключенной машине его нет вовсе: вентиляторы стоят, и гудеть нечему —
  // это и есть разница между «страницей со звуком» и машиной.
  let fan = null;
  let overRig = false;

  function fanNodes() {
    const spec = HW.fan || {};
    const bpf = (spec.blades || 0) * (spec.rpm_nom || 0) / 60;
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(bus);

    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const air = ac.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 640;
    air.Q.value = 0.5;
    const airGain = ac.createGain();
    airGain.gain.value = 0.085;
    src.connect(air);
    air.connect(airGain);
    airGain.connect(g);
    src.start();

    // Лопаточная частота и вторая гармоника. Выше не берём: третья у этой
    // машины уходит за четыре килогерца и читается писком, а не вентилятором.
    const tones = [];
    if (bpf > 0 && bpf < 8000) {
      [[1, 0.020], [2, 0.009]].forEach(function (h) {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = bpf * h[0];
        const og = ac.createGain();
        og.gain.value = h[1];
        o.connect(og);
        og.connect(g);
        o.start();
        tones.push(o);
      });
    }
    return { gain: g, src: src, tones: tones };
  }

  function humLevel(on) {
    if (!live()) return;
    if (!fan) fan = fanNodes();
    const t = ac.currentTime;
    const p = fan.gain.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    // Вход медленнее выхода: так слышно, что машина набирает, а не включается.
    p.linearRampToValueAtTime(on ? 1 : 0, t + (on ? 0.55 : 0.32));
  }

  // Состояние решается в одном месте: гудит, только если указатель на машине И
  // машина под питанием. Иначе выключение при наведённой мыши оставляло бы гул
  // висеть, а включение при ней же — молчать до следующего движения.
  function humCheck() { humLevel(overRig && rig.classList.contains('on')); }

  function dropFan() {
    if (!fan) return;
    try {
      fan.src.stop();
      fan.tones.forEach(function (o) { o.stop(); });
    } catch (e) { /* контекст уже закрыт */ }
    fan = null;
  }

  chassis.addEventListener('mouseenter', function () { overRig = true; humCheck(); });
  chassis.addEventListener('mouseleave', function () { overRig = false; humCheck(); });

  // Сборка звучит по тем же анимациям, по которым идёт, — и звучит в момент
  // посадки, а не в момент старта. Прежде здесь брался --seat, то есть
  // задержка начала хода, и звук уходил вперёд ровно на длительность движения:
  // у каддика она 1.2 с, и диск успевал сесть в полной тишине.
  //
  // Сроки не переписываются сюда числами: у каждой анимации спрашиваются её
  // собственные задержка и длительность. Узлы, садящиеся в один момент,
  // сливаются в один удар погромче — иначе это слышно как треск, а не сборка.
  function sfxAssembly() {
    if (!live()) return;
    window.requestAnimationFrame(function () {
      if (!live()) return;
      const at = new Map();
      chassis.getAnimations({ subtree: true }).forEach(function (a) {
        if (String(a.animationName || '').indexOf('seat') !== 0) return;
        const t = a.effect && a.effect.getComputedTiming();
        if (!t) return;
        const land = ((t.delay || 0) + (t.activeDuration || 0)) / 1000;
        if (!isFinite(land)) return;
        const key = Math.round(land * 20) / 20;
        at.set(key, (at.get(key) || 0) + 1);
      });
      const t0 = ac.currentTime + 0.02;
      at.forEach(function (n, land) {
        VOICE.seat(t0 + land, Math.min(1, 0.5 + n * 0.1));
      });
    });
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
      dropFan();
      if (ac) { ac.close().catch(function () {}); ac = null; }
      return;
    }
    // Щелчок самой кнопки и есть подтверждение, что звук поехал: нажатие,
    // после которого ничего не слышно, ничем не отличается от сломанного.
    audio().then(function () {
      VOICE.click(ac.currentTime + 0.01, 1);
      humCheck();
    }).catch(function () {});
  }

  sfxBtn.addEventListener('click', function () { setSound(!audible); });
  labelSound(audible);

  // Гость, у которого звук остался включённым с прошлого раза: контекст всё
  // равно нельзя завести до жеста, поэтому ждём любого первого.
  if (audible) {
    const wake = function () { audio().then(humCheck).catch(function () {}); };
    document.addEventListener('pointerdown', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
  }
