  // The processor comes apart in two moves, as in real life: first the cooling
  // loop, then the processor from under it. A third click puts the assembly
  // back together.
  //
  // The first move takes off both cold plates at once, and that is not a
  // shortcut. They sit on one series loop and the tubes do not come off them:
  // what the hands lift out is the whole module. A single plate has nothing to
  // be removed from — it is not a part on this machine. The loop travels on the
  // same vector as the plates, so the run between them keeps its shape and
  // parts company only at the rear wall, where the quick disconnects are.
  PICKS.push({
    test: function (el) { return el.classList.contains('cpu-slot'); },
    name: function (el) { return 'cpu' + el.dataset.cpu + ' cold plate'; },
    pull: function (el, line) {
      const n = el.dataset.cpu;
      const slots = document.querySelectorAll('.cpu-slot');
      const loop = document.querySelector('.dlc-loop');
      if (!el.classList.contains('pulled')) {
        slots.forEach(function (s) { s.classList.add('pulled'); });
        if (loop) { loop.classList.add('pulled'); }
        sfxMove(el, 'out');
        line('removed: контур DLC · оба водоблока разом', 'warn');
      } else if (!el.classList.contains('opened')) {
        el.classList.add('opened');
        // Рамку сокета держит рычаг, и это единственное движение здесь, у
        // которого есть щелчок: водоблок снимают винтами, процессор просто
        // вынимают из рамки, а рычаг срывается с зацепа.
        sfx('chk');
        line('removed: процессор CPU' + n + ' · SP5 socket open', 'warn');
      } else {
        // Собираем обратно тем же порядком, каким разбирали, только задом
        // наперёд: процессор в рамку, контур поверх обоих сокетов.
        slots.forEach(function (s) { s.classList.remove('pulled', 'opened'); });
        if (loop) { loop.classList.remove('pulled'); }
        sfxMove(el, 'in');
        line('inserted: CPU' + n + ' и контур DLC', 'ok');
      }
    },
  });
