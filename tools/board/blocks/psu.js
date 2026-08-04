  PICKS.push({
    test: function (el) { return el.dataset.psu !== undefined; },
    name: function (el) { return 'psu-' + el.dataset.psu; },
    // A pulled supply is dead: that is what the log says. Put it back and
    // mains is on it again, and the AC lamp lights up even on a machine that
    // is switched off.
    pull: function (el, line) {
      const out = el.classList.toggle('pulled');
      // Блок ходит в одно движение, за оранжевую скобу: она и щёлкает — на
      // выходе отпуская, на входе запирая.
      sfxMove(el, out ? 'out' : 'in');
      const name = 'psu-' + el.dataset.psu;
      // Первый вынутый блок — потеря резерва, второй — потеря питания. Про
      // саму потерю пишет updateMains(), здесь только судьба нагрузки: обещать
      // «нагрузка на втором блоке», когда второго блока уже нет, нельзя.
      const last = !document.querySelector('.psu:not(.pulled)');
      line(out ? 'removed: ' + name + (last ? ' · нагрузку принять некому'
                                            : ' · обесточен, нагрузка на втором блоке')
               : 'inserted: ' + name + ' · AC ok', out ? 'warn' : 'ok');
    },
  });
