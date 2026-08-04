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
  let grain = null;

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
      // Зерно трения: та же случайность, но ступеньками по восемьдесят в
      // секунду. Скольжение по направляющим — это не ровное шипение, а частая
      // дробь мелких срывов, и ровное колебание на её месте слышно гудением.
      grain = ac.createBuffer(1, n, ac.sampleRate);
      const g = grain.getChannelData(0);
      const step = Math.max(1, Math.round(ac.sampleRate / 80));
      for (let i = 0; i < n; i += step) {
        const v = Math.random() - 0.5;
        for (let k = i; k < Math.min(n, i + step); k++) g[k] = v;
      }
    }
    return ac.state === 'running' ? Promise.resolve() : ac.resume();
  }

  const live = () => audible && ac && ac.state === 'running';

  // Гул проходит через отдельную ручку, и на время удара она приседает. Так это
  // и слышно в стойке: щелчок не перекрикивает шум, а пробивает его — шум на
  // мгновение уходит и возвращается. Ручка нужна своя, отдельно от той, что
  // поднимает и опускает сам гул: та переписывается при каждом заходе курсора
  // на машину вместе со всем, что на ней было запланировано.
  //
  // Ручка живёт ровно столько же, сколько контекст: выключение звука его
  // закрывает, и узел от закрытого контекста в новый не подключить. Забыть
  // обнулить её здесь значило бы, что после выключения и включения звука гул
  // не возвращается вовсе — проверено на себе.
  let humDuck = null;
  function duckNode() {
    if (!humDuck) {
      humDuck = ac.createGain();
      humDuck.gain.value = 1;
      humDuck.connect(bus);
    }
    return humDuck;
  }

  function duck(t) {
    if (!humDuck) return;
    const p = humDuck.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(0.62, t + 0.012);
    p.linearRampToValueAtTime(1, t + 0.09);
  }

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

  // Затухающая мода — то, чем железка звенит после удара. Синус с мгновенным
  // фронтом и коротким спадом: высота говорит о размере детали, спад — из чего
  // она сделана.
  function mode(t, freq, dur, gain) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    const e = ac.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(gain, t + 0.0006);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e);
    e.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.005);
  }

  // Фронт удара: полторы миллисекунды шума, срезанного снизу. Именно срезанного,
  // а не зажатого полосой — у настоящего щелчка энергия размазана по всему
  // верху, полоса же оставляет от неё узкий призвук.
  function tick(t, gain, hp) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const flt = ac.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = hp;
    flt.Q.value = 0.7;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.0003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.0010);
    src.connect(flt);
    flt.connect(env);
    env.connect(bus);
    src.start(t, Math.random() * 0.4);
    src.stop(t + 0.006);
  }

  // Щелчок защёлки — то самое «чк»: фронт, две моды стали и отзвук корпуса, в
  // который отдало.
  //
  // Собран он был иначе, куском шума в полосе Q=6 на 3400 Гц, — и не звучал
  // вовсе. Померено офлайновым рендером: при заявленном усилении 0.46 на выходе
  // выходило −29.5 дБ по пику и −63.3 по энергии, то есть на двадцать три
  // децибела ниже гула вентиляторов. Узкая полоса выбрасывает почти всё, что в
  // шум положили, и остаётся призвук того же тембра, что и сам гул: щелчка не
  // слышно — слышен шум на его месте.
  function chk(t, v, freq) {
    // Разброс высоты на щелчок. Две одинаковые железки не звенят одинаково, а
    // без разброса пять щелчков подряд слышны как один сэмпл, проигранный пять
    // раз, — та же беда, ради которой шум берётся с разного места буфера.
    const j = 1 + (Math.random() - 0.5) * 0.08;
    const hi = (freq || 3600) * j;
    // Чёткость щелчка — это доля фронта. Моды говорят, из чего сделана деталь,
    // но «чк» слышно именно во фронте: он громче их и короче вдвое.
    tick(t, 0.85 * v, 3000);
    mode(t + 0.0003, hi, 0.007, 0.26 * v);
    // Вторая мода не в октаву, а в 1.63 от первой: у пластины моды не
    // гармоничны, и ровная октава читается музыкальным интервалом, а не сталью.
    mode(t + 0.0005, hi * 1.63, 0.004, 0.14 * v);
    // Отзвук корпуса держим сухим: чем он длиннее, тем ближе «тук» вместо «чк».
    mode(t + 0.003, 780 * j, 0.020, 0.06 * v);
    duck(t);
  }

  // Ход по направляющим. Ни удара, ни щелчка: деталь едет по рельсам.
  //
  // Было это широкой полосой на 480–1240 Гц с треугольной дрожью в тридцать
  // герц — то есть ровным шипением в самой заметной для уха середине, поверх
  // которого ровно гудела дрожь. Отсюда и «шорканье»: тембр шипящего баллона,
  // а не металла по металлу.
  //
  // Стало два слоя. Тело — низ, срезанный сверху: массу двигают, и слышно
  // прежде всего её. Зерно — редкая яркая дробь поверх, и амплитуду ей задаёт
  // не колебание, а ступенчатый случайный буфер: срывы у трения не попадают в
  // такт, любая периодичность здесь читается механическим гудением.
  function slide(t, dur, v) {
    if (dur <= 0.02) return;
    const peak = 0.075 * v;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.05, dur * 0.16));
    env.gain.setValueAtTime(peak, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(bus);

    const body = ac.createBufferSource();
    body.buffer = noise;
    body.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    // Полоса едет вверх вместе со скоростью и падает к концу — деталь
    // разгоняется и тормозит.
    lp.frequency.setValueAtTime(340, t);
    lp.frequency.linearRampToValueAtTime(620, t + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(380, t + dur);
    lp.Q.value = 0.6;
    body.connect(lp);
    lp.connect(env);
    body.start(t, Math.random() * 0.4);
    body.stop(t + dur + 0.02);

    const rasp = ac.createBufferSource();
    rasp.buffer = noise;
    rasp.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.1;
    const raspGain = ac.createGain();
    raspGain.gain.value = 0.34;
    rasp.connect(bp);
    bp.connect(raspGain);
    raspGain.connect(env);
    rasp.start(t, Math.random() * 0.4);
    rasp.stop(t + dur + 0.02);

    const stick = ac.createBufferSource();
    stick.buffer = grain;
    stick.loop = true;
    // Скорость дроби растёт со скоростью хода: зерно того же буфера, только
    // читаемого быстрее.
    stick.playbackRate.setValueAtTime(0.8, t);
    stick.playbackRate.linearRampToValueAtTime(1.5, t + dur * 0.45);
    stick.playbackRate.linearRampToValueAtTime(0.9, t + dur);
    const stickGain = ac.createGain();
    stickGain.gain.value = peak * 0.55;
    stick.connect(stickGain);
    stickGain.connect(env.gain);
    stick.start(t, Math.random() * 0.4);
    stick.stop(t + dur + 0.02);
  }

  // Узел дошёл до разъёма. Масса, остановившаяся о упор: две низкие моды —
  // корпус и шасси под ним, — короткий фронт и чуть шума на теле удара.
  // Собран так же, как щелчок, и по той же причине: полоса шума на 235 Гц
  // отдавала −31.6 дБ по пику при заявленных 0.30.
  function thud(t, v) {
    mode(t, 132, 0.10, 0.34 * v);
    mode(t, 198, 0.055, 0.14 * v);
    tick(t, 0.20 * v, 1400);
    burst(t, 320, 0.05, 0.10 * v, 1.2);
    duck(t);
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
      chk(t, 0.8 * v, 2500);
      // Возврат пружины — второй, глуше и тише: контакт уже сомкнулся.
      tick(t + 0.028, 0.22 * v, 1200);
      mode(t + 0.0284, 1450, 0.012, 0.10 * v);
    },
    chk: function (t, v) { chk(t, v); },
    // Крышка: длинный ход стали по стали и удар в упор.
    lid: function (t, v) {
      burst(t, 900, 0.30, 0.10 * v, 0.5, 260);
      mode(t + 0.28, 176, 0.11, 0.26 * v);
      tick(t + 0.28, 0.16 * v, 1200);
      duck(t + 0.28);
    },
    // Момент посадки при сборке. t — это когда узел ДОШЁЛ, а не когда тронулся,
    // поэтому трение звучит перед ним, а удар и защёлка ровно в t.
    seat: function (t, v) {
      slide(t - 0.32, 0.32, 0.75 * v);
      thud(t, v);
      chk(t + 0.014, 0.55 * v, 3000);
    },
    // Тот самый POST-beep: один короткий писк, когда машина пошла. Тихая
    // загрузка его глушит — за тем её в BIOS и включают.
    beep: function (t, v) {
      if (rig.classList.contains('nv-quiet')) return;
      tone(t, 1000, 0.13, 0.10 * v);
    },
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

  // Сколько сейчас оборотов — спрашиваем у самой крыльчатки, а не у паспорта.
  // Период вращения задан на схеме и меняется от двух вещей: профиля питания в
  // BIOS (Efficiency растягивает его вчетверо) и вынутого вентилятора (тогда
  // остальные разгоняются). Обе перемены обязаны быть слышны — ради них весь
  // этот тон и заводился.
  const SPIN_NOM = 0.5;      // период при паспортных оборотах, секунды
  function fanRpm() {
    const spec = HW.fan || {};
    const nom = spec.rpm_nom || 0;
    const blade = chassis.querySelector('.fan-blades:not(.aux)');
    if (!blade) return nom;
    const d = parseFloat(getComputedStyle(blade).animationDuration);
    if (!isFinite(d) || d <= 0) return nom;
    return nom * (SPIN_NOM / d);
  }

  function bladePass() {
    const spec = HW.fan || {};
    return (spec.blades || 0) * fanRpm() / 60;
  }

  function fanNodes() {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(duckNode());

    // Шум раскладывается надвое. Прежде это была одна полоса Q=0.5 на 640 Гц —
    // сплошная середина, от которой ухо устаёт за полминуты. Настоящая машина в
    // стойке звучит рокотом корпуса внизу и потоком выше, и верх у неё завален:
    // высокие частоты гасит всё, через что они идут, — решётка, стенка, воздух.
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 190;
    low.Q.value = 0.7;
    const lowGain = ac.createGain();
    // Рокоту нужно больше, чем кажется по числу: фильтр на 190 Гц пропускает
    // от белого шума очень узкую полосу, и то, что на глаз выглядит громким,
    // на слух почти не слышно.
    lowGain.gain.value = 0.135;
    src.connect(low);
    low.connect(lowGain);
    lowGain.connect(g);

    const air = ac.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 520;
    air.Q.value = 0.4;
    const tilt = ac.createBiquadFilter();
    tilt.type = 'lowpass';
    tilt.frequency.value = 1500;
    tilt.Q.value = 0.5;
    const airGain = ac.createGain();
    airGain.gain.value = 0.075;
    src.connect(air);
    air.connect(tilt);
    tilt.connect(airGain);
    airGain.connect(g);
    src.start();

    // Лопаточная частота и вторая гармоника — но не одной парой, а четырьмя
    // слегка расстроенными. Восемь крыльчаток никогда не крутятся синхронно, и
    // биения между ними — это и есть разница между живой стеной вентиляторов и
    // синтезатором. Выше второй гармоники не берём: третья уходит за четыре
    // килогерца и читается писком.
    const bpf = bladePass();
    const tones = [];
    if (bpf > 0 && bpf < 8000) {
      [-0.014, -0.005, 0.006, 0.015].forEach(function (detune, i) {
        [[1, 0.012], [2, 0.005]].forEach(function (h) {
          const o = ac.createOscillator();
          o.type = 'sine';
          o.frequency.value = bpf * h[0] * (1 + detune);
          const og = ac.createGain();
          og.gain.value = h[1];
          o.connect(og);
          og.connect(g);
          o.start(ac.currentTime + i * 0.01);
          tones.push({ osc: o, mul: h[0] * (1 + detune) });
        });
      });
    }

    // Писк дросселей. Слышен у машины, которой не дают спать: при запрещённых
    // C-States ядра не уходят в простой, ток через дроссели не падает, и они
    // поют. На профиле Efficiency его нет — там машина как раз спит.
    const coil = [];
    [[9500, 0.0016], [11300, 0.0009]].forEach(function (h) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = h[0];
      const og = ac.createGain();
      og.gain.value = 0;
      o.connect(og);
      og.connect(g);
      o.start();
      coil.push({ osc: o, gain: og, peak: h[1] });
    });

    return { gain: g, src: src, tones: tones, coil: coil };
  }

  // Обороты изменились — тон едет за ними, и едет плавно: вентилятор не
  // переключает скорость скачком, ему нужна пара секунд.
  function humTune() {
    if (!fan) return;
    const bpf = bladePass();
    if (!(bpf > 0 && bpf < 8000)) return;
    const t = ac.currentTime;
    fan.tones.forEach(function (v) {
      const p = v.osc.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(Math.max(1, p.value), t);
      p.exponentialRampToValueAtTime(Math.max(1, bpf * v.mul), t + 1.6);
    });
    const whine = rig.classList.contains('nv-cst-off') && !rig.classList.contains('nv-eff');
    fan.coil.forEach(function (v) {
      const p = v.gain.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(whine ? v.peak : 0, t + 1.2);
    });
  }

  // Громкость гула одним числом на весь голос: баланс между рокотом, потоком и
  // тоном выставлен внутри графа, а это ручка «насколько машина далеко». Гул —
  // фон, а не событие: он звучит всё время, пока курсор на машине, и ошибка в
  // громкости здесь утомляет сильнее, чем где-либо ещё.
  const HUM_LEVEL = 0.65;

  function humLevel(on) {
    if (!live()) return;
    if (!fan) fan = fanNodes();
    const t = ac.currentTime;
    const p = fan.gain.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    // Вход медленнее выхода: так слышно, что машина набирает, а не включается.
    p.linearRampToValueAtTime(on ? HUM_LEVEL : 0, t + (on ? 0.55 : 0.32));
  }

  // Состояние решается в одном месте: гудит, только если указатель на машине И
  // машина под питанием. Иначе выключение при наведённой мыши оставляло бы гул
  // висеть, а включение при ней же — молчать до следующего движения.
  function humCheck() {
    humLevel(overRig && rig.classList.contains('on'));
    humTune();
  }

  function dropFan() {
    if (!fan) return;
    try {
      fan.src.stop();
      fan.tones.forEach(function (v) { v.osc.stop(); });
      fan.coil.forEach(function (v) { v.osc.stop(); });
    } catch (e) { /* контекст уже закрыт */ }
    fan = null;
  }

  chassis.addEventListener('mouseenter', function () { overRig = true; humCheck(); });
  chassis.addEventListener('mouseleave', function () { overRig = false; humCheck(); });

  // Настройки BIOS и вынутые узлы меняют обороты через классы на схеме, а не
  // зовут звук напрямую: прошивка про звук не знает и знать не должна. Поэтому
  // слушаем сами классы — так же, как их слушают стили.
  new MutationObserver(humTune).observe(rig, { attributes: true, attributeFilter: ['class'] });
  chassis.addEventListener('click', function () { window.setTimeout(humTune, 60); });

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
      // Вместе с контекстом уходят и его узлы: и шина, и ручка приглушения
      // гула. Оставить ссылки значит на следующем включении подключать новый
      // граф к узлам закрытого контекста — гул после этого не возвращается.
      if (ac) { ac.close().catch(function () {}); ac = null; }
      bus = null;
      humDuck = null;
      noise = null;
      grain = null;
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
