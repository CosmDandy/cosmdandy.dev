  // ── Power ──────────────────────────────────────────────────────────────
  // Three button states, as on a real machine: init — the BMC is coming up
  // and pressing it does nothing; standby — ready to be switched on; on —
  // running.
  function setPower(mode) {
    rig.classList.remove('init', 'standby', 'on');
    rig.classList.add(mode);
  }

  function powerOn() {
    // Обесточенную машину не включает ни кнопка, ни команда, ни конец
    // сборки: включать нечем, пока не вставлен хотя бы один блок питания.
    if (rig.classList.contains('blackout')) {
      line('power inhibited · no ac', 'warn');
      return;
    }
    state.powered = true;
    // Uptime is how long the host has been running, not the tab: without this
    // mark uptime counted from the page load and survived a power off without
    // noticing it.
    state.bootAt = Date.now();
    save();
    setPower('on');
    // Вентиляторы пошли. Загудит машина, только если на неё сейчас смотрят, —
    // решает это humCheck, здесь мы лишь сообщаем, что питание изменилось.
    humCheck();
    // The order is exactly what you see in the flesh: first the network card
    // brings its link up, then the BMC starts beating, and only after that
    // does the host start.
    wait(90, function () { rig.classList.add('net'); line('nic · link up 25G', 'ok'); });
    wait(220, function () { rig.classList.add('bmc'); line('BMC 2.14 · heartbeat', 'ok'); });
    // Экран поднимется через секунду, и подписи ждут его с этой самой минуты:
    // иначе они успевали проступить в промежутке между концом сборки и
    // самотестом — и тут же прятались под приехавшим экраном.
    if (!reduced) rig.classList.add('tags-off');
    // Контрольный индикатор начинает считать вместе с хостом, а не вместе с
    // экраном: на живой машине коды бегут ещё до того, как появится картинка.
    runCheckpoint();
    // Экран поднимается почти сразу: между нажатием и картинкой у живой
    // машины успевают только раскрутиться вентиляторы. Секунда с лишним
    // читалась не выдержкой, а зависанием — гость успевал нажать ещё раз.
    // Писк спикера идёт вместе с картинкой самотеста, а не с нажатием кнопки:
    // на живой машине он и означает, что POST прошёл.
    wait(320, function () { sfx('beep'); runPost(); });
    tick();
  }

  function powerOff() {
    state.powered = false; save();
    // Выключенной машине экран уже не поднимется — ждать подписям нечего.
    rig.classList.remove('net', 'bmc', 'tags-off');
    stopCheckpoint();
    setPower('standby');
    // Вентиляторы встали — гул уходит, даже если указатель остался на машине.
    humCheck();
    line('powering off', 'warn');
    line('standby · bmc only', 'muted');
    tick();
  }

  document.getElementById('power').addEventListener('click', function () {
    sfx('click');
    if (rig.classList.contains('init')) {
      line('power inhibited · bmc init', 'warn');
      return;
    }
    if (state.powered) { powerOff(); } else { line('power on', 'muted'); powerOn(); }
  });
  document.getElementById('power').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
  });

  // ── Identify in the rack ───────────────────────────────────────────────
  const idBtn = document.getElementById('id-btn');
  function toggleIdentify() {
    const on = rig.classList.toggle('identify');
    sfx('click');
    line(on ? 'identify: on · blue' : 'identify: off', 'muted');
  }
  idBtn.addEventListener('click', toggleIdentify);
  idBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleIdentify(); }
  });
