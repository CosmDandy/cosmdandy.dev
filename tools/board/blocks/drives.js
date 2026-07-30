  PICKS.push({
    test: function (el) { return el.dataset.unit && el.dataset.unit.startsWith('hdd'); },
    name: function (el) { return el.dataset.unit; },
  });
