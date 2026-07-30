  PICKS.push({
    test: function (el) { return el.dataset.psu !== undefined; },
    name: function (el) { return 'psu-' + el.dataset.psu; },
    // Вынутый блок обесточен: об этом и говорим в логе. Вставили обратно —
    // сеть снова на нём, и лампа AC загорается даже на выключенной машине.
    pull: function (el, line) {
      const out = el.classList.toggle('pulled');
      const name = 'psu-' + el.dataset.psu;
      line(out ? 'removed: ' + name + ' · обесточен, нагрузка на втором блоке'
               : 'inserted: ' + name + ' · AC ok', out ? 'warn' : 'ok');
    },
  });
