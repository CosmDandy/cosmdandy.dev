  // Вентилятор: в логе нумеруются с единицы, как на корпусе, а в разметке —
  // с нуля.
  PICKS.push({
    test: function (el) { return el.dataset.fan !== undefined; },
    name: function (el) { return 'fan ' + (Number(el.dataset.fan) + 1); },
  });
