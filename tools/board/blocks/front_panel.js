  // ── Power ──────────────────────────────────────────────────────────────
  // Three button states, as on a real machine: init — the BMC is coming up
  // and pressing it does nothing; standby — ready to be switched on; on —
  // running.
  function setPower(mode) {
    rig.classList.remove('init', 'standby', 'on');
    rig.classList.add(mode);
  }

  function powerOn() {
    state.powered = true;
    // Uptime is how long the host has been running, not the tab: without this
    // mark uptime counted from the page load and survived a power off without
    // noticing it.
    state.bootAt = Date.now();
    save();
    setPower('on');
    // The order is exactly what you see in the flesh: first the network card
    // brings its link up, then the BMC starts beating, and only after that
    // does the host start.
    wait(120, function () { rig.classList.add('net'); line('nic · link up 25G', 'ok'); });
    wait(700, function () { rig.classList.add('bmc'); line('BMC 2.14 · heartbeat', 'ok'); });
    wait(1100, runPost);
    tick();
  }

  function powerOff() {
    state.powered = false; save();
    rig.classList.remove('net', 'bmc');
    setPower('standby');
    line('powering off', 'warn');
    line('standby · bmc only', 'muted');
    tick();
  }

  document.getElementById('power').addEventListener('click', function () {
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
    line(on ? 'identify: on · blue' : 'identify: off', 'muted');
  }
  idBtn.addEventListener('click', toggleIdentify);
  idBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleIdentify(); }
  });
