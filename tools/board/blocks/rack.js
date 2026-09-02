  // ── Сцены: куда уходит сеть ────────────────────────────────────────────
  // Три гнезда машины уводят на три чужих адреса, но по самой машине они
  // уходят в одно место — в шкаф над ней. Сцена показывает именно это: кадр
  // на гнезде, кабель от него и проезд камеры по кабелю до той железки, в
  // которую он воткнут.
  //
  // Ради чего проезд. Карта OCP и гигабитная пара приходят в РАЗНЫЕ
  // коммутаторы, и на схеме это две железки на двух полках. Скажи то же
  // самое строкой в консоли — и разница осталась бы надписью; камера,
  // приехавшая в разные места, говорит это без слов.
  //
  // Сцены всех трёх гнёзд живут здесь, а не в risers и rear_io, хотя узлы
  // принадлежат тем блокам. Механизм у них общий и ровно один — кабель и
  // коммутатор, — а обе его половины нарисованы здесь. Разложенный по двум
  // чужим файлам, он стал бы двумя копиями одного хода.

  // Что во что воткнуто, спрашиваем у самого рисунка, а не у таблицы в
  // скрипте: у кабеля в разметке записано, к какому коммутатору он идёт.
  // Второй таблицы здесь быть не должно — она разошлась бы с первой.
  function netScene(el, done, group) {
    const link = board.querySelector('.netlink[data-link="' + group + '"]');
    if (!link) { done(); return; }
    const rack = board.querySelector('.rack');
    const sw = board.querySelector('.sw[data-sw="' + link.dataset.sw + '"]');
    const spec = ((HW.net && HW.net.sw) || []).find(function (s) {
      return s.id === link.dataset.sw;
    }) || {};

    // Кадр на коммутаторе считаем ЗАРАНЕЕ, пока шкаф ещё скрыт. Габарит у
    // скрытого элемента есть — он погашен visibility, а не снят с раскладки,
    // — и посчитать его сейчас дешевле, чем городить порядок «сперва
    // показать, потом померить».
    const swFrame = frameOf(sw, 52);

    line(group + ': линк поднят · ' + spec.rate, 'ok');
    camera(frameOf(el, 74), 700);

    // Шкаф показываем не сразу. Пока камера стоит на гнезде, всё, что выше
    // рамки, рисуется поверх страницы — шкаф лёг бы на заголовок и висел там
    // секунду. Он проявляется вместе с началом проезда, когда камера уже
    // идёт к нему.
    sceneWait(900, function () {
      link.classList.add('scene');
      line(group + ': патч-корд до ' + spec.model + ' · '
           + spec.ports + '× ' + spec.media, 'muted');
    });

    sceneWait(1900, function () {
      rack.classList.add('scene');
      sw.classList.add('scene');
    });

    sceneWait(2100, function () { camera(swFrame, 1250); });

    sceneWait(3450, function () {
      line(group + ': ' + spec.label + ' · uplink ' + spec.uplink + ' · открываю', 'ok');
    });

    sceneWait(3850, done);
  }

  // Карта OCP — десятигигабитная, и коммутатор у неё свой.
  OPENERS.push({
    test: function (el) { return el.dataset.group === 'ocp'; },
    play: function (el, done) { netScene(el, done, 'ocp'); },
  });

  // Гигабитная пара на задней панели. Оба гнезда идут в ОБЫЧНЫЙ гигабитный
  // коммутатор, а не в десятигигабитный: это разные железки, и сцена ведёт
  // камеру к разным полкам.
  OPENERS.push({
    test: function (el) { return el.dataset.group === 'eth'; },
    play: function (el, done) { netScene(el, done, 'eth'); },
  });

  OPENERS.push({
    test: function (el) { return el.dataset.group === 'tw'; },
    play: function (el, done) { netScene(el, done, 'tw'); },
  });
