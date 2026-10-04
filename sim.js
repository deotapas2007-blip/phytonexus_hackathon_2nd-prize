(function () {
  var CYCLE_SEC = 1920;

  var YIELD_TABLE = [
    [0, 0.0], [300, 1.0], [600, 2.5], [900, 4.0],
    [1200, 5.2], [1500, 6.2], [1800, 6.8], [1920, 7.0]
  ];

  function interpYield(sec) {
    if (sec <= 0) return 0;
    if (sec >= CYCLE_SEC) return 7.0;
    for (var i = 1; i < YIELD_TABLE.length; i++) {
      if (sec <= YIELD_TABLE[i][0]) {
        var t0 = YIELD_TABLE[i - 1][0], y0 = YIELD_TABLE[i - 1][1];
        var t1 = YIELD_TABLE[i][0], y1 = YIELD_TABLE[i][1];
        var frac = (sec - t0) / (t1 - t0);
        return y0 + frac * (y1 - y0);
      }
    }
    return 7.0;
  }

  var CFG = {
    kHeat: 8.5,
    kLoss: 0.04,
    evapCool: 0.004,
    powerW: 800,

    tempTarget: 44,
    tempWarn: 50,
    tempCrit: 55,

    ppmSafe: 499,
    ppmWarn: 500,
    ppmCrit: 1000,
    ppmReset: 400,
    ppmLEL: 3300,

    holdResetSec: 3.0,
    rearmCooldown: 3.0,
    bootSec: 0.05,
    frozenDetectSec: 25,
    deadVal: -999,
    histLen: 260,
    extractionDuration: CYCLE_SEC,
    progressRate: 100 / CYCLE_SEC
  };

  var S = {
    powered: false,
    state: 'OFF',
    tState: 0,
    speed: 1,
    clock: 0,
    uptime: 0,
    trips: 0,
    batt: 92,
    estopLatched: false,

    tVessel: 25,
    ambSet: 25,
    humSet: 55,
    ppmTruth: 0,
    ppmMqLag: 0,
    ppmSensed: 0,
    tRead: 25,
    rhRead: 55,

    auto: true,
    setTemp: 44,
    manHeat: 0,
    duty: 0,
    lid: true,
    lidOpenTime: 0,
    batch: 'tulsi',

    progress: 0,
    yieldPct: 0,
    batchDone: false,
    energyJoules: 0,
    elapsedSec: 0,

    spill: false,
    mqStuck: false,
    mqFrozenT: 0,
    dhtDead: false,
    dhtDeadT: 0,

    scnName: null,
    scnStage: 0,

    recovT: 0,
    coolT: 0,
    buzzChirp: 0,

    hist: [],
    serialAcc: 0,
    histAcc: 0,
    noiseT: 0,

    fx: { sparkAt: -9, confetti: false },
    tempAlert: false,
    _integ: 0
  };

  var evHandler = null;
  var serialHandler = null;

  function emit(k, m) { if (evHandler) evHandler(k, m); }
  function serial(line) { if (serialHandler) serialHandler(line); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function fmtClock(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function fmtTimer(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function setState(st) {
    if (S.state === st) return;
    var prev = S.state;
    S.state = st;
    S.tState = 0;

    if (st === 'PREWARN' && prev === 'MONITOR')
      emit('warn', 'ALERT: ethanol vapour ' + Math.round(S.ppmSensed) + ' ppm (>=500). Warning indicator active.');
    if (st === 'LOCKDOWN') {
      S.trips++;
      S.fx.sparkAt = S.clock;
      if (S.tempAlert) {
        emit('crit', 'CRITICAL: Temperature ' + S.tVessel.toFixed(1) + ' °C >= 55 °C limit — TEMPERATURE SAFETY CUTOFF. Relay CH1 OPENED, heater OFF.');
      } else if (S.lid) {
        emit('crit', 'CRITICAL: Ethanol vapour ' + Math.round(S.ppmSensed) + ' ppm >= 1000 — ETHANOL VAPOUR HIGH. Relay CH1 OPENED, heater OFF.');
      } else {
        emit('crit', 'CRITICAL: Ethanol vapour ' + Math.round(S.ppmSensed) + ' ppm >= 1000 — ETHANOL VAPOUR HIGH. Relay CH1 OPENED, heater OFF.');
      }
    }
    if (st === 'RECOVERY') emit('info', 'Vapour below safe threshold. Closed-loop recovery — heater re-arming.');
    if (st === 'MONITOR' && prev === 'RECOVERY')
      emit('good', 'Relay CH1 re-closed. Heater back ON — safe extraction resumed.');
    if (st === 'FAULT') emit('crit', 'WATCHDOG: sensor check FAILED. Fail-safe cutoff engaged.');
  }

  function isSafetyLock() {
    return S.state === 'LOCKDOWN' || S.state === 'FAULT' || S.state === 'HOLD';
  }

  function shouldHeaterRun() {
    if (!S.powered) return false;
    if (S.estopLatched) return false;
    if (isSafetyLock()) return false;
    if (!S.lid) return false;
    if (S.tVessel >= CFG.tempCrit) return false;
    if (S.ppmSensed >= CFG.ppmCrit) return false;
    if (S.batchDone) return false;
    return true;
  }

  function step(dt) {
    S.clock += dt;

    if (!S.powered || S.estopLatched || S.state === 'OFF') {
      S.duty = 0;
      decayWorld(dt, true);
      return;
    }
    S.uptime += dt;
    S.tState += dt;

    if (S.state === 'BOOT') {
      if (S.tState >= CFG.bootSec) {
        setState('MONITOR');
        emit('good', 'PHYTONEXUS booted. Sensors online. Target: 44 °C. Cycle: 32 min.');
      }
      decayWorld(dt, false);
      return;
    }

    if (S.batchDone) {
      S.duty = 0;
      S.manHeat = 0;
      S._integ = 0;
      return;
    }

    if (S.scnName === 'tempExceed') {
      if (S.scnStage === 0) {
        S.auto = false;
        S.manHeat = 100;
        if (S.tVessel >= CFG.tempCrit) {
          S.tempAlert = true;
          S.scnStage = 1;
          S.manHeat = 0;
          S.duty = 0;
          setState('LOCKDOWN');
        }
      } else if (S.scnStage === 1) {
        S.manHeat = 0;
        S.duty = 0;
        if (S.tVessel <= 40) {
          S.tempAlert = false;
          S.scnStage = 2;
          S.auto = true;
          S.setTemp = CFG.tempTarget;
          setState('MONITOR');
          emit('good', 'Temperature cooled to ' + S.tVessel.toFixed(1) + ' °C. Re-engaging autopilot at 44 °C — extraction resumed.');
        }
      }
    }

    var heaterAllowed = shouldHeaterRun();

    if (!heaterAllowed) {
      S.duty = 0;
      S._integ = 0;
    } else if (S.auto) {
      var err = CFG.tempTarget - S.tVessel;
      S._integ = clamp((S._integ || 0) + err * dt * 0.18, -30, 180);
      S.duty = clamp(3.5 * err + 0.4 * S._integ + 15, 0, 100);
      if (S.tVessel >= CFG.tempTarget - 2) S.duty = clamp(S.duty, 0, 55);
    } else {
      S.duty = clamp(S.manHeat, 0, 100);
      S._integ = 0;
    }

    if (heaterAllowed && S.duty > 0) {
      S.energyJoules += (S.duty / 100) * CFG.powerW * dt;
    }

    var heatIn = (S.duty / 100) * CFG.kHeat;
    var lidLoss = S.lid ? 0 : 0.04;
    S.tVessel += dt * (heatIn - CFG.kLoss * (S.tVessel - S.ambSet) - lidLoss * (S.tVessel - S.ambSet));
    S.tVessel = clamp(S.tVessel, S.ambSet - 2, 65);

    var dv = 0;
    if (S.scnName === 'ethanolLeak') {
      if (!heaterAllowed || S.duty <= 0) {
        dv = -60 * Math.max(0.1, S.ppmTruth / 500);
      } else {
        dv = 90 - 0.04 * S.ppmTruth;
      }
    } else if (!S.lid) {
      S.lidOpenTime = (S.lidOpenTime || 0) + dt;
      dv = 105; // Smoothly reaches 500 ppm in ~5s and 1000 ppm in ~10s
    } else if (S.spill) {
      dv = 45 - 0.04 * S.ppmTruth;
    } else {
      S.lidOpenTime = 0;
      S.ppmTruth = 0;
      dv = 0;
    }

    if (S.lid && S.scnName !== 'ethanolLeak' && !S.spill) {
      S.ppmTruth = 0;
      S.ppmMqLag = 0;
      S.ppmSensed = 0;
    } else {
      S.ppmTruth = clamp(S.ppmTruth + dv * dt, 0, 4000);
      S.ppmMqLag += (S.ppmTruth - S.ppmMqLag) * Math.min(dt * 2.0, 1);
      S.noiseT += dt;
      var n = Math.sin(S.noiseT * 7.3) * Math.cos(S.noiseT * 3.1);
      if (S.mqStuck) {
        S.mqFrozenT += dt;
        S.ppmSensed = S._stuckVal;
      } else {
        S.mqFrozenT = 0;
        S._stuckVal = S.ppmSensed;
        S.ppmSensed = clamp(Math.round(S.ppmMqLag * (1 + 0.015 * n)), 0, 4000);
      }
    }

    S.noiseT += dt;
    var nt = Math.sin(S.noiseT * 7.3) * Math.cos(S.noiseT * 3.1);
    S.tRead = S.dhtDead ? CFG.deadVal : S.ambSet + (S.tVessel - S.ambSet) * 0.12 + 0.1 * nt;
    S.rhRead = S.humSet + 1.2 * nt;
    if (S.dhtDead) S.dhtDeadT += dt; else S.dhtDeadT = 0;

    if (S.tVessel >= CFG.tempCrit && !S.tempAlert && !isSafetyLock() && S.powered) {
      S.tempAlert = true;
      S.duty = 0;
      S._integ = 0;
      setState('LOCKDOWN');
    }

    var sensing = S.state === 'MONITOR' || S.state === 'PREWARN';
    if (sensing) {
      if (S.ppmSensed >= CFG.ppmCrit) setState('LOCKDOWN');
      else if (S.ppmSensed >= CFG.ppmWarn) setState('PREWARN');
      else if (S.state === 'PREWARN') { setState('MONITOR'); emit('info', 'Vapour back under 500 ppm — advisory cleared.'); }
    } else if (S.state === 'LOCKDOWN') {
      if (!S.tempAlert && S.ppmSensed < CFG.ppmReset) {
        S.recovT += dt;
        if (S.recovT >= CFG.holdResetSec) { S.recovT = 0; setState('RECOVERY'); }
      } else if (S.tempAlert && S.tVessel <= 40) {
        S.tempAlert = false;
        S.recovT += dt;
        if (S.recovT >= CFG.holdResetSec) { S.recovT = 0; setState('RECOVERY'); }
      } else {
        S.recovT = 0;
      }
    } else if (S.state === 'RECOVERY') {
      if (S.ppmSensed >= CFG.ppmCrit || S.tVessel >= CFG.tempCrit) {
        S.recovT = 0; S.coolT = 0;
        if (S.ppmSensed >= CFG.ppmCrit) setState('LOCKDOWN');
      } else {
        S.coolT += dt;
        if (S.coolT >= CFG.rearmCooldown && S.ppmSensed < CFG.ppmWarn && S.tVessel < CFG.tempWarn) {
          S.coolT = 0;
          setState('MONITOR');
        }
      }
    }

    if (S.dhtDead && S.dhtDeadT > 10 && S.state !== 'FAULT') {
      setState('FAULT');
      emit('crit', 'DHT22 stopped responding. Fail-safe lockdown.');
    }
    if (S.mqStuck && S.mqFrozenT > CFG.frozenDetectSec && S.state !== 'FAULT') {
      setState('FAULT');
      emit('crit', 'MQ-3 signal frozen — watchdog fail-safe triggered.');
    }

    if (heaterAllowed && S.duty > 0 && !S.batchDone) {
      S.elapsedSec += dt;
      S.progress = clamp((S.elapsedSec / CFG.extractionDuration) * 100, 0, 100);
      S.yieldPct = interpYield(S.elapsedSec);

      if (S.progress >= 100) {
        S.batchDone = true;
        S.progress = 100;
        S.yieldPct = 7.0;
        S.duty = 0;
        S.manHeat = 0;
        S.fx.confetti = true;
        emit('good', 'EXTRACTION COMPLETE · ' + S.batch.toUpperCase() + ' batch finished. Simulated yield: 7.0%. Heater OFF.');
      }
    }

    S.buzzChirp = (S.state === 'PREWARN') ? (Math.sin(S.clock * 6) > 0.55 ? 1 : 0) : (S.state === 'LOCKDOWN' || S.state === 'FAULT' ? 1 : 0);
    S.batt = clamp(S.batt - dt * (0.0009 + (S.buzzChirp ? 0.004 : 0)), 3, 100);

    S.serialAcc += dt;
    if (S.serialAcc >= 1) {
      S.serialAcc -= 1;
      var tStr = S.dhtDead ? '--.-' : S.tRead.toFixed(1);
      var rStr = S.dhtDead ? '--' : Math.round(S.rhRead);
      var dPpm = (S.lid && S.scnName !== 'ethanolLeak' && !S.spill) ? 0 : Math.round(S.ppmSensed);
      serial('[' + new Date().toISOString().substr(11, 8) + '] MQ3=' + String(dPpm).padStart(4) +
        'ppm T=' + tStr + 'C RH=' + rStr + '% ST=' + S.state.padEnd(8) +
        ' RL=' + (heaterAllowed ? 'CLOSED' : 'OPEN  ') +
        ' DUTY=' + String(Math.round(S.duty)).padStart(3) + '%' +
        ' YLD=' + S.yieldPct.toFixed(1) + '%' +
        ' E=' + (S.energyJoules / 1000).toFixed(1) + 'kJ');
    }

    S.histAcc += dt;
    if (S.histAcc >= 0.5) {
      S.histAcc -= 1;
      var hPpm = (S.lid && S.scnName !== 'ethanolLeak' && !S.spill) ? 0 : S.ppmSensed;
      S.hist.push({
        t: S.clock, tv: S.tVessel, ppm: hPpm, truth: S.ppmTruth,
        q: S.yieldPct * (100 / 7), rl: heaterAllowed ? 1 : 0
      });
      if (S.hist.length > CFG.histLen) S.hist.shift();
    }
  }

  function decayWorld(dt, hard) {
    if (S.lid && S.scnName !== 'ethanolLeak' && !S.spill) {
      S.ppmTruth = 0;
      S.ppmMqLag = 0;
      S.ppmSensed = 0;
    } else {
      S.ppmTruth = Math.max(0, S.ppmTruth - (hard ? 40 : 18) * dt);
      S.ppmMqLag += (S.ppmTruth - S.ppmMqLag) * Math.min(dt * 2.0, 1);
      S.ppmSensed = Math.round(S.ppmMqLag);
    }
    S.tVessel += dt * CFG.kLoss * (S.ambSet - S.tVessel);
    if (S.spill) S.ppmTruth = Math.max(S.ppmTruth, 40 + 20 * Math.sin(S.clock));
  }

  var API = {
    CFG: CFG,
    YIELD_TABLE: YIELD_TABLE,
    CYCLE_SEC: CYCLE_SEC,
    get: function () { return S; },
    onEvent: function (fn) { evHandler = fn; },
    onSerial: function (fn) { serialHandler = fn; },

    tick: function (dtReal) {
      var total = Math.min(dtReal, 0.06) * S.speed;
      var steps = Math.max(1, Math.ceil(total / 0.05));
      var dt = total / steps;
      for (var i = 0; i < steps; i++) step(dt);
    },

    power: function (on) {
      S.powered = on;
      if (on) {
        S.estopLatched = false;
        S.tVessel = 25.0;
        S.ppmTruth = 0;
        S.ppmSensed = 0;
        S.ppmMqLag = 0;
        S.duty = 0;
        S.progress = 0;
        S.yieldPct = 0;
        S.elapsedSec = 0;
        S.energyJoules = 0;
        S.batchDone = false;
        S._integ = 0;
        S.tempAlert = false;
        setState('MONITOR');
        emit('good', 'PHYTONEXUS booted. Target: 44 °C. Cycle: 32 min. Heater ON — warming.');
        serial('');
        serial('rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)');
        serial('load:0x40078000 len:0x4a0c PHY init: ok  phy_ver:1.1');
        serial('PHYTONEXUS fw v2.1 — closed-loop safety controller online.');
        serial('Target=' + CFG.tempTarget + 'C TempWarn=' + CFG.tempWarn + 'C TempCrit=' + CFG.tempCrit + 'C');
        serial('PPM Warn=' + CFG.ppmWarn + ' Crit=' + CFG.ppmCrit + ' Reset=' + CFG.ppmReset);
      } else {
        S.state = 'OFF'; S.tState = 0; S.duty = 0; S.tVessel = 25;
        emit('sim', 'POWER OFF — controller de-energised.');
      }
    },

    estop: function () {
      if (!S.powered) return;
      S.estopLatched = true;
      S.duty = 0;
      setState('HOLD');
      S.fx.sparkAt = S.clock;
      emit('crit', 'EMERGENCY STOP pressed. Relay forced OPEN. Latched until Reset Rig.');
    },

    setAuto: function (v) { S.auto = !!v; emit('sim', 'Autopilot ' + (v ? 'ENGAGED' : 'DISENGAGED')); },
    setTemp: function (v) { S.setTemp = clamp(v, 40, 55); },
    setManHeat: function (v) { S.manHeat = clamp(v, 0, 100); },
    setLid: function (v) {
      S.lid = !!v;
      if (v) { S.lidOpenTime = 0; emit('info', 'Lid CLOSED — ethanol vapour contained.'); }
      else { emit('warn', 'Lid OPEN — EXTRACTION PAUSED. Heater stopped. Alcohol vapour rising.'); }
    },
    setBatch: function (v) { S.batch = v; emit('sim', 'Batch loaded: ' + v.toUpperCase() + '.'); },
    setSpeed: function (v) { S.speed = v; },

    getExtractionTimer: function () {
      if (S.batchDone) return '00:00';
      if (!S.powered || S.state === 'OFF') return '--:--';
      var remaining = Math.max(0, CYCLE_SEC - S.elapsedSec);
      return fmtTimer(remaining / S.speed);
    },

    getElapsedFormatted: function () {
      return fmtTimer(S.elapsedSec / S.speed);
    },

    scenario: function (name) {
      if (!S.powered) this.power(true);
      S.scnName = name; S.scnStage = 0;
      S._integ = 0;
      if (name === 'safe') {
        S.auto = true; S.setTemp = CFG.tempTarget; S.lid = true;
        S.tVessel = 28.0; S.duty = 80;
        S.progress = 0; S.yieldPct = 0; S.elapsedSec = 0;
        S.energyJoules = 0; S.batchDone = false; S.manHeat = 0;
        S.ppmTruth = 0; S.ppmSensed = 0; S.ppmMqLag = 0;
        emit('sim', 'SCENARIO Safe Batch Run — autopilot targeting 44 °C, lid sealed, 32 min cycle.');
      } else if (name === 'ethanolLeak') {
        S.auto = true; S.setTemp = CFG.tempTarget; S.lid = true;
        S.tVessel = 42.0; S.duty = 60;
        S.ppmTruth = 0; S.ppmSensed = 0;
        emit('warn', 'SCENARIO Ethanol Vapour Leak — seal failing. Watch PPM rise past 500 (warn) then 1000 (cutoff).');
      } else if (name === 'tempExceed') {
        S.auto = false; S.manHeat = 100; S.lid = true;
        S.tVessel = 40.0; S.scnStage = 0;
        emit('warn', 'SCENARIO Temperature Exceeds Threshold — heater forced 100%. Watch warning at 50 °C, cutoff at 55 °C.');
      }
    },

    fixSensor: function () {
      if (!S.mqStuck && !S.dhtDead) return;
      S.mqStuck = false; S.dhtDead = false; S.mqFrozenT = 0; S.dhtDeadT = 0;
      if (S.state === 'FAULT') setState('RECOVERY');
      emit('good', 'Sensor replaced. Watchdog satisfied — system re-arming.');
    },

    cleanup: function () {
      S.spill = false;
      emit('good', 'Spill cleaned. Bench restored.');
    },

    reset: function () {
      var sp = S.speed;
      var ev = evHandler, sr = serialHandler;
      var fresh = {
        powered: false, state: 'OFF', tState: 0, speed: sp, clock: 0, uptime: 0, trips: 0, batt: 92,
        estopLatched: false, tVessel: 25, ambSet: 25, humSet: 55, ppmTruth: 0, ppmMqLag: 0, ppmSensed: 0,
        tRead: 25, rhRead: 55, auto: true, setTemp: CFG.tempTarget, manHeat: 0, duty: 0, lid: true, lidOpenTime: 0,
        batch: S.batch, progress: 0, yieldPct: 0, batchDone: false, energyJoules: 0, elapsedSec: 0,
        spill: false, mqStuck: false, mqFrozenT: 0, dhtDead: false, dhtDeadT: 0,
        scnName: null, scnStage: 0, recovT: 0, coolT: 0, buzzChirp: 0, tempAlert: false,
        hist: [], serialAcc: 0, histAcc: 0, noiseT: 0, fx: { sparkAt: -9, confetti: false }, _integ: 0
      };
      Object.keys(fresh).forEach(function (k) { S[k] = fresh[k]; });
      evHandler = ev; serialHandler = sr;
      emit('sim', 'Rig reset. Press POWER ON to begin a session.');
    },

    fmtClock: fmtClock,
    fmtTimer: fmtTimer,
    snapshot: function () {
      var relayClosed = !isSafetyLock() && S.powered && S.state !== 'OFF';
      var dPpm = (S.lid && S.scnName !== 'ethanolLeak' && !S.spill) ? 0 : S.ppmSensed;
      return {
        powered: S.powered, state: S.state, relayClosed: relayClosed, tVessel: S.tVessel,
        tRead: S.tRead, rhRead: S.rhRead, ppmTruth: S.ppmTruth, ppmSensed: dPpm,
        quality: S.quality || 100, yieldPct: S.yieldPct, progress: S.progress, batt: S.batt, uptime: S.uptime,
        trips: S.trips, lid: S.lid, auto: S.auto, setTemp: CFG.tempTarget,
        duty: S.duty, batch: S.batch, spill: S.spill, mqStuck: S.mqStuck, dhtDead: S.dhtDead,
        batchDone: S.batchDone, speed: S.speed, elapsedSec: S.elapsedSec,
        energyJoules: S.energyJoules,
        thresholds: { ppmWarn: CFG.ppmWarn, ppmCrit: CFG.ppmCrit, ppmReset: CFG.ppmReset, tempWarn: CFG.tempWarn, tempCrit: CFG.tempCrit }
      };
    }
  };

  window.SIM = API;
})();
