  // Fan: in the log they are numbered from one, as on the chassis, but in the
  // markup from zero.
  PICKS.push({
    test: function (el) { return el.dataset.fan !== undefined; },
    name: function (el) { return 'fan ' + (Number(el.dataset.fan) + 1); },
  });
