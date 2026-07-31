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
      if (!el.classList.contains('unlatched')) {
        el.classList.add('unlatched');
        line('unlatched: ' + el.dataset.unit + ' · защёлка каддика ' + n, 'muted');
      } else if (!el.classList.contains('pulled')) {
        el.classList.add('pulled');
        line(blank ? 'removed: заглушка отсека ' + n : 'removed: ' + el.dataset.unit, 'warn');
      } else {
        el.classList.remove('unlatched', 'pulled');
        line('inserted: ' + el.dataset.unit, 'ok');
      }
    },
  });
