  // A drive comes out in two moves, the way hands do it: first the handle
  // unlatches, then the caddy slides out. A third click puts it back.
  PICKS.push({
    test: function (el) { return el.dataset.unit && el.dataset.unit.startsWith('hdd'); },
    name: function (el) { return el.dataset.unit; },
    pull: function (el, line) {
      const n = el.dataset.unit.replace('hdd', '');
      if (!el.classList.contains('unlatched')) {
        el.classList.add('unlatched');
        line('unlatched: ' + el.dataset.unit + ' · защёлка каддика ' + n, 'muted');
      } else if (!el.classList.contains('pulled')) {
        el.classList.add('pulled');
        line('removed: ' + el.dataset.unit, 'warn');
      } else {
        el.classList.remove('unlatched', 'pulled');
        line('inserted: ' + el.dataset.unit, 'ok');
      }
    },
  });
