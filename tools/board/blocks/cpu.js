  // The processor comes apart in two moves, as in real life: first the
  // heatsink, then the processor from under it. A third click puts the
  // assembly back together.
  PICKS.push({
    test: function (el) { return el.classList.contains('cpu-slot'); },
    name: function (el) { return 'cpu' + el.dataset.cpu + ' heatsink'; },
    pull: function (el, line) {
      const n = el.dataset.cpu;
      if (!el.classList.contains('pulled')) {
        el.classList.add('pulled');
        sfxMove(el, 'out');
        line('removed: радиатор CPU' + n, 'warn');
      } else if (!el.classList.contains('opened')) {
        el.classList.add('opened');
        // Рамку сокета держит рычаг, и это единственное движение здесь, у
        // которого есть щелчок: радиатор снимают винтами, процессор просто
        // вынимают из рамки, а рычаг срывается с зацепа.
        sfx('chk');
        line('removed: процессор CPU' + n + ' · LGA 4677 socket open', 'warn');
      } else {
        el.classList.remove('pulled', 'opened');
        sfxMove(el, 'in');
        line('inserted: CPU' + n + ' с радиатором', 'ok');
      }
    },
  });
