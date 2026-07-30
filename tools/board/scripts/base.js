/* Server schematic: power, service mode, console.
 *
 * Two levels of interaction. While service mode is off, the machine works as
 * a business card: clicking a unit follows its address. The SERVICE switch on
 * the board turns it into a test bench — units come out, and the console
 * opens underneath.
 *
 * State (power, cover) survives a page reload through localStorage, so a
 * repeat visit does not start from the full animation.
 */
(function () {
  const rig = document.getElementById('rig');
  const log = document.getElementById('log');
  const chassis = document.getElementById('chassis');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The machine's passport: what hardware is standing here. The generator
  // prints it — the same numbers that are printed on the silkscreen, so the
  // console and the board cannot drift apart. Everything else is derived from
  // the DOM (what is in place right now) and from NVRAM (how it is
  // configured). There must be no literals in the commands.
  let HW = {};
  try { HW = JSON.parse(document.getElementById('rig-spec').textContent); } catch (e) {}

  let state = { powered: true, visited: false, lid: false };
  try {
    const raw = localStorage.getItem('rig-state');
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) {}

  // The machine's configuration in the console header comes from the
  // passport. While it was written into the markup by hand, it claimed
  // thirty-two memory sticks against the twenty-four actually drawn.
  const specLine = document.querySelector('.con-spec');
  if (specLine && HW.board) {
    specLine.textContent = [
      HW.board.model, HW.board.form,
      HW.cpu.n + '× ' + HW.cpu.short,
      HW.dimm.slots + '× ' + HW.dimm.kind,
      HW.bay.filter(function (b) { return !b.filler; }).length + '× NVMe',
      HW.ports.sfp,
    ].join(' · ');
  }

  const save = () => { try { localStorage.setItem('rig-state', JSON.stringify(state)); } catch (e) {} };
  const wait = (ms, fn) => window.setTimeout(fn, reduced ? 0 : ms);

  // ── Assembly ───────────────────────────────────────────────────────────
  // The assembly class sits in the markup, so the machine starts assembling
  // itself even if the script never runs at all. Here we only decide whether
  // to let the assembly play out or cut it short, and what to do once the
  // last unit is seated.
  //
  // How long it lasts we ask the units themselves: each has its own --seat,
  // and the schedule lives in the generator. Duplicating it here would mean a
  // second place that says «when», and one day the two would drift apart.
  function assemblyEnd() {
    let last = 0;
    chassis.querySelectorAll('[style*="--seat"]').forEach(function (el) {
      last = Math.max(last, parseFloat(el.style.getPropertyValue('--seat')) || 0);
    });
    return (last + 0.9) * 1000;
  }

  function finishAssembly() {
    rig.classList.remove('assembly');
  }

  /** Reassemble the machine: pull the units and seat them again on schedule. */
  function reassemble() {
    if (rig.classList.contains('assembly')) return;
    // The class has to be removed and put back on the next frame — otherwise
    // the browser does not count the animation as new and plays nothing.
    rig.classList.remove('assembly');
    void chassis.offsetWidth;
    rig.classList.add('assembly');
    wait(assemblyEnd(), finishAssembly);
  }

  // ── The address under the cursor ───────────────────────────────────────
  // Where a unit leads is visible before the click: the hint follows the
  // cursor and takes the address apart — the scheme dimmer, the host in the
  // schematic's colour, the path in the ordinary tone.
  const linkHint = document.getElementById('link-hint');

  function showLinkHint(href, x, y) {
    if (!linkHint) return;
    const m = /^(https?:\/\/|mailto:)([^/]*)(.*)$/.exec(href) || [];
    linkHint.innerHTML = m.length
      ? '<span class="lh-scheme">' + m[1] + '</span>'
        + '<span class="lh-host">' + m[2] + '</span>' + m[3]
      : href;
    linkHint.classList.add('on');
    // Keep the hint inside the window: near the right edge it would run off
    // the screen.
    const w = linkHint.offsetWidth, h = linkHint.offsetHeight;
    const left = Math.min(x + 18, window.innerWidth - w - 12);
    const top = Math.min(Math.max(y - h - 14, 10), window.innerHeight - h - 10);
    linkHint.style.transform = 'translate3d(' + left + 'px,' + top + 'px,0)';
  }

  function hideLinkHint() {
    if (linkHint) linkHint.classList.remove('on');
  }

  if (linkHint) {
    rig.addEventListener('mousemove', function (e) {
      // In service mode units are taken apart, not opened: the hint there
      // would promise a navigation that is not going to happen.
      const target = rig.classList.contains('service')
        ? null : e.target.closest('a.callout, .unit[data-href]');
      const href = target && (target.getAttribute('href') || target.dataset.href);
      if (href) showLinkHint(href, e.clientX, e.clientY); else hideLinkHint();
    });
    rig.addEventListener('mouseleave', hideLinkHint);
  }

  // ── Console ────────────────────────────────────────────────────────────
  function line(text, cls) {
    const d = document.createElement('div');
    d.className = cls || '';
    d.textContent = text;
    log.appendChild(d);
    while (log.children.length > 400) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }


  // ── Revision strip ─────────────────────────────────────────────────────
  // The board is assembled by code, and every edit to it is a commit. So the
  // board can be walked backwards: the versions live in separate files and
  // are loaded on demand. Keeping all fourteen in the page would mean three
  // megabytes for a feature used once.
  //
  // And it is used during development: the strip is how you compare what the
  // board looked like earlier. A visitor to the business card has no need for
  // it, so the revisions are not copied into the build, and the page does not
  // even reach for them — the request would return 404 and leave a red line
  // in the console for no reason at all.
  const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]'].indexOf(location.hostname) >= 0;
  const timeline = document.getElementById('timeline');
  const board = document.getElementById('board');
  const tlRange = document.getElementById('tl-range');
  const tlPrev = document.getElementById('tl-prev');
  const tlNext = document.getElementById('tl-next');
  const tlRev = document.getElementById('tl-rev');
  const tlSubject = document.getElementById('tl-subject');
  const tlMeta = document.getElementById('tl-meta');
  const REPO = 'https://github.com/CosmDandy/cosmdandy.dev';

  let revs = [];
  let revPos = -1;
  let revLoading = false;
  const revCache = new Map();      // sha → markup, so nothing is fetched twice

  function paintTimeline() {
    const last = revs.length - 1;
    tlRange.style.setProperty('--tl-pos', last > 0 ? revPos / last : 0);
    tlPrev.disabled = revPos <= 0;
    tlNext.disabled = revPos >= last;
    const v = revs[revPos];
    if (!v) return;
    tlRev.textContent = 'REV ' + (revPos + 1) + ' · ' + v.sha.toUpperCase();
    tlSubject.textContent = v.subject;
    tlMeta.href = REPO + '/commit/' + v.sha;
  }

  async function showRev(i) {
    if (revLoading || i < 0 || i >= revs.length || i === revPos) return;
    const v = revs[i];
    revLoading = true;
    chassis.classList.add('loading');
    try {
      let markup = revCache.get(v.sha);
      if (markup === undefined) {
        const res = await fetch('history/' + v.file);
        if (!res.ok) throw new Error(res.status);
        markup = await res.text();
        revCache.set(v.sha, markup);
      }
      board.innerHTML = markup;
      board.setAttribute('viewBox', v.viewBox);
      revPos = i;
      tlRange.value = String(i);
      paintTimeline();
      line('checkout ' + v.sha + ' · ' + v.subject, i === revs.length - 1 ? 'ok' : 'muted');
    } catch (err) {
      line('ревизия ' + v.sha + ' не загрузилась', 'err');
    } finally {
      chassis.classList.remove('loading');
      revLoading = false;
    }
  }

  async function initTimeline() {
    if (revs.length || !LOCAL) return;
    try {
      const res = await fetch('history/index.json');
      if (!res.ok) throw new Error(res.status);
      revs = await res.json();
    } catch (err) {
      return;                       // no history — no strip either, silently
    }
    if (revs.length < 2) return;
    // The current board is already in the page: we put it into the cache as
    // the latest version, otherwise coming back «to today» would re-fetch
    // what is on the screen anyway.
    revCache.set(revs[revs.length - 1].sha, board.innerHTML);
    revPos = revs.length - 1;
    tlRange.max = String(revs.length - 1);
    tlRange.value = String(revPos);
    timeline.hidden = false;
    paintTimeline();
  }

  tlRange.addEventListener('input', function () { showRev(Number(tlRange.value)); });
  tlPrev.addEventListener('click', function () { showRev(revPos - 1); });
  tlNext.addEventListener('click', function () { showRev(revPos + 1); });
  // Arrows are handier than the mouse, but only while the strip is on screen
  document.addEventListener('keydown', function (e) {
    if (timeline.hidden || !rig.classList.contains('service')) return;
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); showRev(revPos - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showRev(revPos + 1); }
  });

  // The self-test is printed by the screen: the lines go both to it and to
  // the console — as on a machine with a monitor attached and SOL open. The
  // lines themselves are built from the passport, the state of the schematic
  // and the firmware settings, so a pulled memory stick shows up here too.
  // All of that lives in parts/screen.js.
  function runPost() {
    screenPost();
  }

  // @block: front_panel

  // @block: lightpath

  // Which lamp on the panel answers for which unit.
  const LP_MAP = {
    mem: '.dimm.pulled',
    cpu: '.cpu-slot.pulled',
    fan: '.fan.pulled',
    nic: '.unit[data-unit="ocp"].pulled, .unit[data-unit="eth"].pulled',
    rsr: '.riser.pulled',
    ps: '.psu.pulled',
  };

  function updateFault() {
    let any = false;
    for (const key in LP_MAP) {
      const on = !!chassis.querySelector(LP_MAP[key]);
      rig.classList.toggle('fault-' + key, on);
      any = any || on;
    }
    rig.classList.toggle('has-fault', any);
    tick();
  }

  // ── Saving on the invisible ────────────────────────────────────────────
  // An SVG animation repaints the scene whether or not anyone is looking at
  // it: the browser dutifully spins the fan blades in a minimised tab and
  // when the schematic has been scrolled off the screen. We put it on pause —
  // come back, and a blade carries on from the same position instead of
  // jumping.
  const chassisBox = document.querySelector('.chassis');
  let onScreen = true;

  function dormancy() {
    // While a full-screen layer stands over the machine there is no point in
    // computing the schematic either: it is not visible, and repainting a
    // semi-transparent layer over an animating SVG is the most expensive
    // thing that can be done here.
    rig.classList.toggle('dormant', document.hidden || !onScreen || screenOpen());
  }

  if (chassisBox && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      dormancy();
    }, { threshold: 0 }).observe(chassisBox);
  }
  document.addEventListener('visibilitychange', dormancy);

  // ── Uptime ─────────────────────────────────────────────────────────────
  let t0 = Date.now();
  const uptimeEl = document.getElementById('uptime');

  function tick() {
    if (!rig.classList.contains('on')) { uptimeEl.textContent = '--:--'; return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    uptimeEl.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ── Service mode ───────────────────────────────────────────────────────
  const svcSwitch = document.getElementById('svc-switch');

  function toggleService() {
    const on = rig.classList.toggle('service');
    line(on ? 'service mode engaged · терминал и диагностика' : 'service mode released',
         on ? 'warn' : 'muted');
    if (on) initTimeline();     // the strip is only for a stripped-down machine
    // The diagnostics panel does not slide out by itself: in service mode it
    // is not always wanted, and it takes up a lot of room. Closing it on the
    // way out is another matter: outside service mode there is no reason for
    // it to hang there.
    if (!on && rig.classList.contains('lp-open')) toggleLp();
    if (!on) {
      // Assemble the machine completely: a unit could have been left at an
      // intermediate step too — with a drive latch flipped open or a heatsink
      // taken off.
      chassis.querySelectorAll('.pulled, .unlatched').forEach(function (p) {
        p.classList.remove('pulled', 'opened', 'unlatched');
      });
      updateFault();
    }
  }
  svcSwitch.addEventListener('click', toggleService);
  svcSwitch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleService(); }
  });

  // The registry of units. Every block says for itself what it is called in
  // the log and, if it does not come apart in one motion, exactly how. This
  // used to be a ladder of ifs over types: to add a unit you had to edit the
  // shared file.
  const PICKS = [];

  // @block: fans
  // @block: memory
  // @block: drives
  // @block: cpu
  // @block: risers
  // @block: psu

  function unitName(el) {
    const kind = PICKS.find(function (k) { return k.test(el); });
    return kind ? kind.name(el) : (el.dataset.unit || 'unit');
  }

  // While service mode is off, the machine works as a business card: clicking
  // a unit follows its address. Turn SERVICE on — the same clicks take the
  // machine apart.
  chassis.addEventListener('click', function (e) {
    if (rig.classList.contains('service')) {
      const pick = e.target.closest('.pick');
      if (!pick) return;
      e.preventDefault();
      // A unit with its own removal script — the processor, say, which comes
      // off in two steps — handles itself.
      const kind = PICKS.find(function (k) { return k.test(pick); });
      if (kind && kind.pull) {
        kind.pull(pick, line);
        updateFault();
        return;
      }
      const pulled = pick.classList.toggle('pulled');
      line((pulled ? 'removed: ' : 'inserted: ') + unitName(pick), pulled ? 'warn' : 'ok');
      updateFault();
      return;
    }
    const unit = e.target.closest('.unit[data-href]');
    if (!unit) return;
    const href = unit.dataset.href;
    if (href.startsWith('mailto:')) { window.location.href = href; return; }
    window.open(href, '_blank', 'noopener');
  });

  // The callouts are real <a> elements; service mode hides them in css. This
  // is the second line, and it covers a different way of pressing: css takes
  // the label out from under the pointer and out of the tab order, while here
  // the activation itself is cancelled — from the keyboard or from anywhere
  // else. Listening on .rig rather than on the labels, because the revision
  // timeline rewrites the whole board and per-label listeners would go with it.
  rig.addEventListener('click', function (e) {
    if (rig.classList.contains('service') && e.target.closest('a.callout')) e.preventDefault();
  }, true);

  // @part: term

  // ── View switch ────────────────────────────────────────────────────────
  // The business card and the schematic are two ways of showing the same
  // thing. The choice is remembered, so a returning visitor lands where they
  // left off.
  const viewBtn = document.getElementById('view-switch');
  function setView(v) {
    document.body.classList.toggle('view-rig', v === 'rig');
    document.body.classList.toggle('view-card', v !== 'rig');
    viewBtn.setAttribute('aria-pressed', String(v === 'rig'));
    try { localStorage.setItem('view', v); } catch (e) {}
  }
  let view = 'card';
  try { view = localStorage.getItem('view') === 'rig' ? 'rig' : 'card'; } catch (e) {}
  setView(view);
  viewBtn.addEventListener('click', function () {
    setView(document.body.classList.contains('view-rig') ? 'card' : 'rig');
  });



  // ── Part numbers of the units ──────────────────────────────────────────
  // Clicking the hash copies it and opens the commit: on a real board a part
  // number is looked up the same way, only in a paper catalogue.
  chassis.addEventListener('click', function (e) {
    const stamp = e.target.closest('a.stamp');
    if (!stamp) return;
    e.preventDefault();
    e.stopPropagation();
    const sha = stamp.dataset.sha;
    if (navigator.clipboard) navigator.clipboard.writeText(sha).catch(function () {});
    line('p/n ' + sha + ' скопирован · открываю коммит', 'ok');
    window.open(stamp.getAttribute('href'), '_blank', 'noopener');
  }, true);   // on capture: otherwise the click goes into taking the machine apart

  // ── Tying a unit to its label ──────────────────────────────────────────
  // The highlight goes both ways: unit ↔ its callout. A class instead of
  // :hover, because the elements sit in different branches of the tree.
  function lit(group, on) {
    chassis.querySelectorAll('[data-group="' + group + '"]').forEach(function (n) {
      n.classList.toggle('lit', on);
    });
    chassis.querySelectorAll('[data-for="' + group + '"]').forEach(function (n) {
      n.classList.toggle('lit', on);
    });
  }
  chassis.querySelectorAll('[data-group], [data-for]').forEach(function (n) {
    const g = n.dataset.group || n.dataset.for;
    n.addEventListener('mouseenter', function () { lit(g, true); });
    n.addEventListener('mouseleave', function () { lit(g, false); });
  });

  // @part: hw

  // @part: fs

  // @part: screen

  // ── Start-up ───────────────────────────────────────────────────────────
  const first = !state.visited;
  state.visited = true; save();

  // The cover. A visitor should not have to guess that it needs taking off:
  // on the first visit it comes off by itself. Putting it back is done by a
  // button on the board, next to the service mode switch.
  const lidRemove = document.getElementById('lid-remove');
  const lidOn = document.getElementById('lid-on');

  function setLid(off) {
    rig.classList.toggle('lid-off', off);
    state.lid = off; save();
  }
  function bindLid(el, off, msg) {
    if (!el) return;
    el.addEventListener('click', function () { setLid(off); line(msg, 'muted'); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLid(off); line(msg, 'muted'); }
    });
  }
  const assembleBtn = document.getElementById('assemble-btn');
  if (assembleBtn) {
    assembleBtn.addEventListener('click', function () {
      line('re-seating all units …', 'muted');
      reassemble();
      wait(assemblyEnd(), function () { line('all units seated', 'ok'); });
    });
  }

  bindLid(lidRemove, true, 'cover removed');
  bindLid(lidOn, false, 'cover in place');

  setLid(!!state.lid);
  wait(260, function () { rig.classList.add('ready'); });
  // first visit: show the closed machine and take the cover off ourselves
  if (first && !reduced && !state.lid) wait(1500, function () { setLid(true); });
  else if (!first) setLid(true);

  if (first && !reduced) {
    line('chassis empty · fans and psu first', 'muted');
    wait(3.0 * 1000, function () { line('cpu seated · dimms by channel', 'muted'); });
    wait(5.1 * 1000, function () { line('risers in · drives last', 'muted'); });
    wait(assemblyEnd(), function () {
      finishAssembly();
      line('all units seated · power on', 'ok');
      powerOn();
    });
  } else {
    finishAssembly();
  }

  if (first && !reduced) {
    // Полный вход, как в стойке: подали дежурку, BMC инициализируется и
    // кнопка мигает часто — жать бесполезно. Закончил — мигает редко, и
    // дальше машину включает уже человек.
    state.powered = false; save();
    setPower('init');
    line('standby power applied', 'muted');
    line('uefi/bmc init …', 'muted');
    tick();
    wait(2600, function () {
      line('bmc ready · press power', 'ok');
      setPower('standby');
      tick();
    });
  } else if (state.powered) {
    setPower('on');
    rig.classList.add('net', 'bmc');
    line('session restored', 'muted');
    line('system ready', 'ok');
    tick();
  } else {
    setPower('standby');
    line('standby · bmc only', 'muted');
    tick();
  }

  window.setInterval(tick, 1000);
})();
