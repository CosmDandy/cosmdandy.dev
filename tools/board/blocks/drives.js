  // A drive comes out in two moves, the way hands do it: first the handle
  // unlatches, then the caddy slides out. A third click puts it back — and it
  // counts wherever the part is clicked, the frame or the drive behind it,
  // because by then the whole thing is one part in your hand.
  PICKS.push({
    // A filler travels the same way: on a live machine it is not a different
    // part but the same caddy with nothing in it. Its name is its own, though —
    // the console counts drives by .bay and reads the bay number out of
    // data-unit, and an empty carrier has no business in that count.
    test: function (el) {
      const u = el.dataset.unit;
      return !!u && (u.startsWith('hdd') || u.startsWith('blank'));
    },
    name: function (el) { return el.dataset.unit; },
    pull: function (el, line) {
      const blank = el.dataset.unit.startsWith('blank');
      const n = el.dataset.unit.replace(blank ? 'blank' : 'hdd', '');
      // Звучат у каддика два движения из четырёх: откинули защёлку и
      // захлопнули её. Между ними — свободный ход по направляющим, и он
      // молчит: щелчок там был бы лишней железкой, а трение звучало ворохом
      // ткани и мешало слышать сами защёлки.
      if (!el.classList.contains('unlatched')) {
        el.classList.remove('back');
        el.classList.add('unlatched');
        sfx('chk');
        line('unlatched: ' + el.dataset.unit + ' · защёлка каддика ' + n, 'muted');
      } else if (!el.classList.contains('pulled') && !el.dataset.stowing) {
        el.classList.add('pulled');
        line(blank ? 'removed: заглушка отсека ' + n : 'removed: ' + el.dataset.unit, 'warn');
      } else if (el.classList.contains('pulled')) {
        // Ставится каддик теми же двумя движениями, только в обратном порядке:
        // сперва он заходит в корзину, а ручка остаётся откинутой — за неё и
        // держат, — и лишь отдельным движением её захлопывают. Прежде оба
        // класса снимались разом: каддик въезжал, ручка на полпути складывалась
        // сама, и второго движения не было вовсе.
        // Признак обратного хода. Без него «откинута защёлка, каддик снаружи»
        // и «каддик уже в корзине, защёлка ещё откинута» — это одно и то же
        // сочетание классов, и четвёртый щелчок вместо того, чтобы захлопнуть
        // ручку, вынимал диск заново.
        el.classList.remove('pulled');
        // Класс, а не только признак в датасете: по нему css отличает
        // «откинули защёлку и потянули» от «каддик уже вернулся в корзину».
        // Сочетание классов у этих двух состояний одно и то же, а кривые
        // должны быть разные: наружу — короткий рывок за ручкой, внутрь —
        // весь ход по направляющим.
        el.classList.add('back');
        el.dataset.stowing = '1';
        line('inserted: ' + el.dataset.unit + ' · каддик в корзине', 'ok');
      } else {
        el.classList.remove('unlatched', 'back');
        delete el.dataset.stowing;
        sfx('chk');
        line('latched: ' + el.dataset.unit + ' · защёлка закрыта', 'ok');
      }
    },
  });
