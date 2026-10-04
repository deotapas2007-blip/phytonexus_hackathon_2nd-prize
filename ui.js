(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const DPR = window.devicePixelRatio || 1;

  const svg = $('#rigSvg');
  const stage = $('#rigStage');
  const fx = $('#fxCanvas');
  const fctx = fx.getContext('2d');
  let parts = [];
  let lastSpark = -9;
  let confettiDone = true;

  function fitFx() {
    if (!stage || !fx) return;
    const r = stage.getBoundingClientRect();
    const w = Math.round(r.width * DPR);
    const h = Math.round(r.height * DPR);
    if (w > 0 && h > 0 && (fx.width !== w || fx.height !== h)) {
      fx.width = w;
      fx.height = h;
    }
  }
  function viewMap() {
    let r = fx.getBoundingClientRect();
    if (!r.width || !r.height) {
      const sr = stage ? stage.getBoundingClientRect() : { width: 960, height: 600 };
      r = { width: sr.width || 960, height: sr.height || 600 };
    }
    const s = Math.min(r.width / 960, r.height / 600) || 1;
    return { s, ox: (r.width - 960 * s) / 2, oy: (r.height - 600 * s) / 2 };
  }

  function spawnVapor(rate, dt, windX) {
    var S = SIM.get();
    var n = rate * dt * 1.2;
    var isLeaking = S.scnName === 'ethanolLeak' || S.spill;
    while (n > 0) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      var isContained = S.lid && !isLeaking;
      parts.push({
        kind: 'vap',
        x: 300 + (Math.random() - 0.5) * (isContained ? 34 : 48),
        y: isContained ? (265 + Math.random() * 25) : (188 + Math.random() * 10),
        vx: (Math.random() - 0.5) * (isContained ? 5 : 10) + (isContained ? 0 : windX),
        vy: isContained ? -(14 + Math.random() * 16) : -(24 + Math.random() * 28),
        life: 0,
        max: isContained ? (1.0 + Math.random() * 0.6) : (1.4 + Math.random() * 1.0),
        r: 3 + Math.random() * 4,
        contained: isContained
      });
    }
  }

  function spawnSparks() {
    const m = viewMap();
    const px = m.ox + 496 * m.s, py = m.oy + 444 * m.s;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      parts.push({ kind: 'spark', sx: px, sy: py, x: px, y: py, vx: Math.cos(a) * sp * m.s, vy: Math.sin(a) * sp * m.s - 30, life: 0, max: 0.35 + Math.random() * 0.25 });
    }
  }

  function spawnConfetti() {
    const m = viewMap();
    for (let i = 0; i < 46; i++) {
      parts.push({
        kind: 'conf',
        x: m.ox + (260 + Math.random() * 120) * m.s,
        y: m.oy + (200 + Math.random() * 40) * m.s,
        vx: (Math.random() - 0.5) * 90,
        vy: -80 - Math.random() * 130,
        g: 220,
        life: 0, max: 1.6 + Math.random(),
        c: ['#34d399', '#22d3ee', '#fbbf24', '#a78bfa'][i % 4], r: 2.4
      });
    }
  }

  function drawFx(dt) {
    fitFx();
    const S = SIM.get();
    const m = viewMap();
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fctx.clearRect(0, 0, fx.width / DPR, fx.height / DPR);
    if (S.powered && S.state !== 'OFF') {
      const b = SIM.CFG.batches[S.batch] || { volat: 1.0 };
      const vgRaw = S.tVessel <= 30 ? 0.4 : Math.pow(Math.min((S.tVessel - 30) / 38, 1.2), 2.0) * b.volat * (S.lid ? 1 : 2.3);
      const leakRate = S.scnName === 'ethanolLeak' ? 40 : 0;
      const rate = Math.max(1.2, vgRaw * 40 + (S.spill ? 24 : 0) + leakRate);
      spawnVapor(rate, dt, S.lid ? 2 : 8);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      const f = p.life / p.max;
      if (p.kind === 'vap') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.contained) {
          if (p.y <= 208) {
            p.y = 208;
            p.vy = Math.abs(p.vy) * 0.2;
            p.vx += (Math.random() - 0.5) * 8;
          }
          p.x = clamp(p.x, 276, 324);
        }
        const a = Math.sin(Math.PI * f) * (p.contained ? 0.35 : 0.55);
        fctx.beginPath();
        fctx.fillStyle = 'rgba(210,235,250,' + a.toFixed(3) + ')';
        fctx.arc(m.ox + p.x * m.s, m.oy + p.y * m.s, (p.r + f * 8) * m.s, 0, 7);
        fctx.fill();
      } else if (p.kind === 'spark') {
        p.vy += 340 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        fctx.strokeStyle = 'rgba(253,' + (180 + Math.floor(60 * (1 - f))) + ',80,' + (1 - f).toFixed(2) + ')';
        fctx.lineWidth = 1.6;
        fctx.beginPath();
        fctx.moveTo(p.x, p.y);
        fctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        fctx.stroke();
      } else {
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        fctx.globalAlpha = 1 - f;
        fctx.fillStyle = p.c;
        fctx.fillRect(p.x, p.y, p.r * 2, p.r * 2);
        fctx.globalAlpha = 1;
      }
    }
  }

  class Gauge {
    constructor(id, min, max, unit, zones) {
      this.c = $(id);
      this.ctx = this.c.getContext('2d');
      this.min = min; this.max = max; this.unit = unit; this.zones = zones;
      this.v = min; this.target = min;
    }
    set(v) { this.target = clamp(v, this.min, this.max); }
    draw() {
      this.v += (this.target - this.v) * 0.12;
      const c = this.c, x = c.getContext('2d');
      const W = 170, H = 120;
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      x.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H - 16, R = 62;
      const a0 = Math.PI, a1 = Math.PI * 2;
      const val2a = v => a0 + (v - this.min) / (this.max - this.min) * Math.PI;
      this.zones.forEach(z => {
        x.beginPath();
        x.arc(cx, cy, R, val2a(z[0]), val2a(z[1]));
        x.strokeStyle = z[2]; x.lineWidth = 9; x.stroke();
      });
      x.beginPath();
      x.arc(cx, cy, R, a0, a1);
      x.strokeStyle = 'rgba(120,160,210,.15)'; x.lineWidth = 1; x.stroke();
      const ang = val2a(this.v);
      x.beginPath();
      x.moveTo(cx - Math.cos(ang) * 10, cy - Math.sin(ang) * 10);
      x.lineTo(cx + Math.cos(ang) * (R - 13), cy + Math.sin(ang) * (R - 13));
      x.strokeStyle = '#e0f2fe'; x.lineWidth = 2.4; x.stroke();
      x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fillStyle = '#93c5fd'; x.fill();
      x.font = '700 17px Consolas,monospace';
      x.textAlign = 'center';
      x.fillStyle = '#7df9ff';
      x.fillText((this.unit === '%' ? Math.round(this.v) : this.v.toFixed(1)) + (this.unit === 'ppm' ? '' : this.unit), cx, cy - 14);
      if (this.unit === 'ppm') { x.font = '10px sans-serif'; x.fillText('ppm', cx, cy - 1); }
      x.font = '9px sans-serif'; x.fillStyle = '#5b7ba8';
      x.fillText(String(this.min), cx - R + 4, cy + 10);
      x.fillText(String(this.max), cx + R - 10, cy + 10);
    }
  }

  function stripChartDraw() {
    const cv = $('#chartMain');
    const cssW = cv.clientWidth || cv.parentElement.clientWidth;
    const cssH = 250;
    if (!cssW) return;
    if (cv.width !== cssW * DPR) { cv.width = cssW * DPR; cv.height = cssH * DPR; cv.style.height = cssH + 'px'; }
    const x = cv.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, cssW, cssH);
    const padL = 42, padR = 48, padT = 12, laneH = 26;
    const plotH = cssH - padT - laneH - 18;
    const plotW = cssW - padL - padR;
    const hist = SIM.get().hist;
    const n = hist.length;

    x.strokeStyle = 'rgba(56,189,248,.12)';
    x.lineWidth = 1;
    x.font = '9px Consolas,monospace';
    for (let g = 0; g <= 4; g++) {
      const gy = padT + plotH * g / 4;
      x.beginPath(); x.moveTo(padL, gy); x.lineTo(padL + plotW, gy); x.stroke();
      x.fillStyle = '#38bdf8aa';
      x.fillText((100 - g * 25) + '°C', 6, gy + 3);
    }
    for (let g = 0; g <= 4; g++) {
      const gy = padT + plotH * g / 4;
      x.fillStyle = '#fbbf24aa';
      x.fillText(((4 - g) * 200) + '', cssW - padR + 6, gy + 3);
    }
    x.fillStyle = '#fbbf2455';
    x.fillText('ppm', cssW - padR + 10, padT - 2);

    const yTemp = v => padT + plotH - clamp((v - 0) / 100, 0, 1) * plotH;
    const yPpm = v => padT + plotH - clamp(v / 800, 0, 1) * plotH;

    [SIM.CFG.safeMax, SIM.CFG.warnMax].forEach((th, i) => {
      x.setLineDash([4, 5]);
      x.strokeStyle = i ? 'rgba(248,113,113,.55)' : 'rgba(251,191,36,.4)';
      x.beginPath(); x.moveTo(padL, yPpm(th)); x.lineTo(padL + plotW, yPpm(th)); x.stroke();
      x.setLineDash([]);
    });

    if (n > 1) {
      const px = i => padL + plotW * i / (n - 1);
      const line = (key, yfn, color, dash, width) => {
        x.beginPath();
        x.setLineDash(dash);
        x.strokeStyle = color;
        x.lineWidth = width;
        for (let i = 0; i < n; i++) {
          const yy = yfn(hist[i][key]);
          i ? x.lineTo(px(i), yy) : x.moveTo(px(i), yy);
        }
        x.stroke();
        x.setLineDash([]);
      };
      line('truth', yPpm, 'rgba(148,163,184,.45)', [3, 4], 1.4);
      line('tv', yTemp, '#22d3ee', [], 2);
      line('ppm', yPpm, '#fbbf24', [], 2);
      line('q', yTemp, '#34d39988', [], 1.2);

      const laneY = cssH - laneH - 6;
      x.fillStyle = 'rgba(52,211,153,.14)';
      let run = null;
      for (let i = 0; i < n; i++) {
        if (hist[i].rl && run === null) run = i;
        if ((!hist[i].rl || i === n - 1) && run !== null) {
          const end = hist[i].rl ? i : i - 1;
          x.fillRect(px(run), laneY, Math.max(px(end) - px(run), 2), laneH);
          run = null;
        }
      }
      x.fillStyle = '#475569';
      x.font = '8px sans-serif';
      x.fillText('RELAY LANE (lit = closed/heater powered)', padL, cssH - 2);
    }
  }

  function compareDraw() {
    const cv = $('#chartCompare');
    const cssW = cv.clientWidth || 400, cssH = 230;
    cv.width = cssW * DPR; cv.height = cssH * DPR;
    cv.style.height = cssH + 'px';
    const x = cv.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.clearRect(0, 0, cssW, cssH);
    const rows = [
      { label: 'Detection-to-isolation · manual operator', human: 45, ai: 0.08, unit: ' s' },
      { label: 'Quality retained after surge drill', human: 62, ai: 94, unit: '%' }
    ];
    let y = 30;
    rows.forEach(r => {
      x.font = '11px Segoe UI'; x.fillStyle = '#9fc3ef';
      x.fillText(r.label, 10, y - 8);
      const maxV = r.human;
      const bw = cssW - 150;
      x.fillStyle = 'rgba(248,113,113,.75)';
      x.fillRect(110, y, bw * 0.96, 16);
      x.fillStyle = '#fca5a5';
      x.fillText('without  ' + r.human + r.unit, 114, y + 27);
      const aiw = Math.max(bw * (r.ai / r.human) * 0.96, 5);
      x.fillStyle = 'rgba(52,211,153,.85)';
      x.fillRect(110, y + 34, aiw, 16);
      x.fillStyle = '#6ee7b7';
      x.fillText('PHYTONEXUS  ' + (r.ai < 1 ? r.ai : r.ai) + r.unit, 114 + Math.min(aiw + 4, bw - 90), y + 47);
      y += 92;
    });
    x.fillStyle = '#5b7ba8'; x.font = '9px sans-serif';
    x.fillText('bars scaled per row · simulated benchmark inside this digital twin', 10, cssH - 8);
  }

  const INFO = {
    vessel: ['Extraction vessel', '<ul><li>Borosilicate flask with tulsi/ethanol batch</li><li>Optimal reflux band: <b>60–77 °C</b></li><li>Above 82 °C delicate phytochemicals begin degrading (the QUALITY GAP)</li><li>Lid state changes vapour escape rate ×2.3</li></ul>'],
    heater: ['Hot plate · 800 W', '<ul><li>The single dangerous actuator in the loop</li><li>Fed through relay CH1 — never directly switched by logic</li><li>Glowing coil = energised; watch it die instantly at every lockdown</li></ul>'],
    mq3: ['MQ-3 alcohol gas sensor · ₹120', '<ul><li>SnO₂ semiconductor; ethanol drops its internal resistance</li><li>Analog output into ESP32 ADC</li><li>Virtual calibration: &lt;200 SAFE · 200–400 PRE-WARN · &gt;400 LOCKDOWN · reset &lt;150</li><li>Watchdog guards against drift/freeze</li></ul>'],
    dht: ['DHT22 climate sensor · ₹145', '<ul><li>Temperature + relative humidity inside the extraction vessel above liquid</li><li>Tracks vapor space climate directly</li><li>NaN/no-response for 10 s ⇒ fail-safe FAULT state</li></ul>'],
    esp: ['ESP32-WROOM-32 devkit · ₹350', '<ul><li>240 MHz dual-core brain running the safety state machine</li><li>Arduino IDE firmware, non-blocking super-loop</li><li>Wi-Fi/BLE headroom reserved for future telemetry</li><li>Type-C power + flashing</li></ul>'],
    relay: ['5 V 1-channel relay · ₹68', '<ul><li>The muscle of the closed loop</li><li>Opens in &lt;50 ms on LOCKDOWN, watchdog FAULT or E-STOP</li><li>Hysteresis recovery prevents rapid chattering</li><li>Lever here animates the real contact arm</li></ul>'],
    buzzer: ['Mini buzzer 5 V · ₹15', '<ul><li>Intermittent chirps during PRE-WARN</li><li>Continuous tone during LOCKDOWN/FAULT</li><li>Silent during safe monitoring</li></ul>'],
    batt: ['2× 18650 Li-ion pack · ₹113 incl charger+holder', '<ul><li>1200 mAh cells power controller rail off-grid</li><li>Heater load always lives on the mains side of the relay</li><li>Enables field deployment before grid access</li></ul>']
  };

  const TOUR = [
    ['#partVessel', 'Extraction vessel', 'Ethanol macerates botanical material (tulsi shown). Heat drives extraction — but ethanol boils at 78 °C and its vapour is flammable. Everything PHYTONEXUS does follows from managing this vapour.'],
    ['#partHeater', 'Hot plate — the hazard source', 'An 800 W heating element under the flask. In manual labs it just... stays on. Here its entire power path passes through one component you will meet soon: the relay.'],
    ['#partMq3', 'MQ-3 — smelling the danger', 'Continuously samples room air for ethanol vapour. Its analog reading is the heartbeat of the safety loop: under 200 ppm is calm, above 400 the world turns red.'],
    ['#partDht', 'DHT22 — feeling the climate', 'Temperature and humidity sensor positioned inside the extraction vessel above the liquid to monitor vapour space conditions directly.'],
    ['#partEsp', 'ESP32 — the brain', 'Runs the non-blocking state machine: classify readings, watch for dead sensors, drive outputs. The whole intelligence of EDGE NOVA\u201926 lives on this ₹350 board.'],
    ['#partRelay', 'Relay CH1 — the muscle', 'When the ESP32 decides, THIS opens physically, cutting the hot plate in under 50 milliseconds. Watch its lever snap during a lockdown.'],
    ['#partBuzzer', 'Buzzer + status LEDs', 'PRE-WARN chirps, LOCKDOWN blares. Green means safe, amber means attention, red means the system already protected you.'],
    ['.oled', 'OLED live display', 'The operator window: ppm, temperature, humidity, state and relay status — exactly what the real SSD1306 screen shows on the prototype.'],
    ['.scenario-row', 'Demo scenarios — your script', 'Run Safe Batch for the happy path, Vapour Surge to trigger a live lockdown, Ethanol Spill to prove detection without heat, Sensor Fault to show the watchdog catching sabotage.']
  ];
  let tourIdx = -1;

  function tourSpotPosition() {
    if (tourIdx < 0 || tourIdx >= TOUR.length) return;
    const el = document.querySelector(TOUR[tourIdx][0]);
    const spot = $('#tourSpot');
    if (!el) return;
    const r = el.getBoundingClientRect();
    spot.style.left = (r.left - 8) + 'px';
    spot.style.top = (r.top - 8) + 'px';
    spot.style.width = (r.width + 16) + 'px';
    spot.style.height = (r.height + 16) + 'px';
  }

  function tourShow(i) {
    tourIdx = i;
    const ov = $('#tourOverlay');
    if (i < 0 || i >= TOUR.length) { ov.classList.add('hidden'); return; }
    ov.classList.remove('hidden');
    const [sel, title, body] = TOUR[i];
    const el = document.querySelector(sel);
    const spot = $('#tourSpot');
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        spot.style.left = (r.left - 8) + 'px';
        spot.style.top = (r.top - 8) + 'px';
        spot.style.width = (r.width + 16) + 'px';
        spot.style.height = (r.height + 16) + 'px';
      }, 350);
    }
    $('#tourTitle').textContent = title;
    $('#tourBody').textContent = body;
    $('#tourStep').textContent = 'STEP ' + (i + 1) + '/' + TOUR.length;
    $('#tourPrev').style.visibility = i === 0 ? 'hidden' : 'visible';
    $('#tourNext').textContent = i === TOUR.length - 1 ? 'FINISH' : 'NEXT';
  }

  const snd = { ctx: null, on: false };
  function beep(freq, dur, vol) {
    if (!snd.on) return;
    try {
      if (!snd.ctx) snd.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = snd.ctx.createOscillator(), g = snd.ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.05, snd.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, snd.ctx.currentTime + dur);
      o.connect(g); g.connect(snd.ctx.destination);
      o.start(); o.stop(snd.ctx.currentTime + dur);
    } catch (e) { }
  }

  function addLog(kind, msg) {
    const ul = $('#eventLog');
    const li = document.createElement('li');
    li.className = kind === 'crit' ? 'ev-crit' : kind === 'warn' ? 'ev-warn' : kind === 'good' ? 'ev-good' : kind === 'sim' ? 'ev-sim' : '';
    li.innerHTML = '<time>' + new Date().toLocaleTimeString() + '</time>' + msg;
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight;
    if (kind !== 'sim') toast(msg, kind);
  }

  function toast(msg, kind) {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'crit' ? ' t-crit' : kind === 'warn' ? ' t-warn' : kind === 'good' ? ' t-good' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .5s'; }, 5200);
    setTimeout(() => t.remove(), 5800);
    while (box.children.length > 4) box.firstChild.remove();
  }

  const serialEl = $('#serialOut');
  let serialPaused = false;
  function pushSerial(line) {
    if (serialPaused) return;
    serialEl.textContent += line + '\n';
    if (serialEl.textContent.length > 9000) serialEl.textContent = serialEl.textContent.slice(-7000);
    serialEl.scrollTop = serialEl.scrollHeight;
  }

  const gauges = {
    temp: new Gauge('#gaugeTemp', 15, 100, '°C', [[55, 77, 'rgba(52,211,153,.8)'], [82, 100, 'rgba(248,113,113,.8)']]),
    mq: new Gauge('#gaugeMq3', 0, 800, 'ppm', [[200, 400, 'rgba(251,191,36,.75)'], [400, 800, 'rgba(248,113,113,.8)']]),
    hum: new Gauge('#gaugeHum', 0, 100, '%', [[40, 70, 'rgba(52,211,153,.6)']]),
    qual: new Gauge('#gaugeQual', 0, 100, '%', [[70, 100, 'rgba(52,211,153,.8)']])
  };

  const ST_CLASS = { OFF: '', BOOT: 'st-rec', MONITOR: 'st-safe', PREWARN: 'st-warn', LOCKDOWN: 'st-bad', RECOVERY: 'st-rec', FAULT: 'st-bad', HOLD: 'st-bad' };

  let uiAcc = 0, chartAcc = 0, lastBuzz = 0, alarmIv = null;

  function fmtJoules(j) {
    if (!j || j < 0) return '0 J';
    if (j < 1000) return Math.round(j) + ' J';
    if (j < 1000000) return (j / 1000).toFixed(1) + ' kJ';
    return (j / 1000000).toFixed(2) + ' MJ';
  }

  function syncDom() {
    const S = SIM.get(), s = SIM.snapshot();
    $('#chipState').textContent = s.powered ? S.state : 'OFFLINE';
    $('#chipState').className = 'chip ' + (ST_CLASS[S.state] || '');
    $('#chipRelay').textContent = 'RELAY ' + (s.relayClosed && s.powered ? 'CLOSED' : 'OPEN');
    $('#chipRelay').style.color = s.relayClosed && s.powered ? '' : 'var(--red)';
    $('#chipUptime').textContent = SIM.fmtClock(S.uptime);
    $('#statUp').textContent = SIM.fmtClock(S.uptime);
    $('#statTrips').textContent = S.trips;

    const oled = $('#oledScreen');
    if (!s.powered) {
      oled.className = 'oled off';
      $('#oledL1').textContent = 'PHYTONEXUS';
      $('#oledL2').textContent = 'TEMP: --.- °C';
      $('#oledL3').textContent = 'ALC:  0 ppm';
      $('#oledL4').textContent = 'YIELD: 0%';
      if ($('#oledL5')) $('#oledL5').textContent = 'ENERGY: 0 J';
    } else {
      const cls = S.state === 'LOCKDOWN' || S.state === 'FAULT' || S.state === 'HOLD' ? 'oled alert' : S.state === 'PREWARN' ? 'oled warn' : 'oled';
      oled.className = cls;
      const pPct = Math.round(S.progress);

      const dispPpm = (S.lid && S.scnName !== 'ethanolLeak' && !S.spill) ? 0 : Math.round(S.ppmSensed);

      $('#oledL1').textContent = 'PHYTONEXUS v2.1';
      $('#oledL2').textContent = 'TEMP:   ' + S.tVessel.toFixed(1) + ' °C';
      $('#oledL3').textContent = 'ALC:    ' + dispPpm + ' ppm';
      const isComplete = S.batchDone || S.progress >= 100;
      $('#oledL4').textContent = S.state === 'LOCKDOWN' ? (S.tempAlert ? '!! TEMP EXCEEDS 90C !!' : '!! VAPOUR HAZARD !!') : S.state === 'FAULT' ? '! SENSOR FAULT !' : S.state === 'HOLD' ? '** E-STOP LATCHED **' : (isComplete ? 'YIELD: 100% COMPLETE' : 'YIELD:  ' + pPct + '%');
      if ($('#oledL5')) $('#oledL5').textContent = 'ENERGY: ' + fmtJoules(S.energyJoules);
    }

    $('#ledGreen').classList.toggle('on', s.powered && (S.state === 'MONITOR'));
    $('#ledAmber').classList.toggle('on', S.state === 'PREWARN');
    $('#ledRed').classList.toggle('on', S.state === 'LOCKDOWN' || S.state === 'FAULT' || S.state === 'HOLD');

    const powerOn = s.powered && S.state !== 'OFF';
    const tempExceeded = S.tVessel > 80 || (S.auto && S.tVessel > S.setTemp + 10);
    const vapourDetected = s.ppmSensed > 200 || S.state === 'PREWARN' || S.state === 'LOCKDOWN';
    const vesselSafe = powerOn && S.state === 'MONITOR' && !tempExceeded && !vapourDetected;
    const vesselAlarm = powerOn && (tempExceeded || vapourDetected || S.state === 'FAULT' || S.state === 'HOLD');

    $('#vLedBlue').classList.toggle('on', powerOn);
    $('#vLedGreen').classList.toggle('on', vesselSafe);
    $('#vLedRed').classList.toggle('on', vesselAlarm);

    const heatCoil = document.getElementById('heatCoil');
    if (heatCoil) {
      const isHeating = s.duty > 2 && s.relayClosed && powerOn;
      heatCoil.style.opacity = isHeating ? '1' : '0.28';
      heatCoil.style.stroke = isHeating ? (s.duty > 70 ? '#fde047' : '#f97316') : '#f97316';
      heatCoil.style.filter = isHeating ? 'drop-shadow(0 0 10px #f97316)' : 'none';
    }

    svg.classList.toggle('powered', powerOn);
    svg.classList.toggle('heating', s.duty > 2 && s.relayClosed && powerOn);
    svg.classList.toggle('lid-open', !S.lid);
    svg.classList.toggle('buzzing', !!S.buzzChirp);
    svg.classList.toggle('relay-open', !(s.relayClosed && s.powered));
    svg.classList.toggle('boiling', powerOn && s.relayClosed && S.tVessel > 35);

    $('#relayTxt').textContent = s.relayClosed && s.powered ? 'CLOSED' : 'OPEN';
    $('#relayTxt').style.color = s.relayClosed && s.powered ? 'var(--green)' : 'var(--red)';
    const rLed = document.getElementById('relayLedDot');
    if (rLed) rLed.setAttribute('fill', s.relayClosed && s.powered ? '#22c55e' : '#7f1d1d');
    $('#buzzerIcon').classList.toggle('active', !!S.buzzChirp);
    $('#battFill').style.width = S.batt + '%';
    $('#battFill').style.background = S.batt < 25 ? 'var(--red)' : 'var(--green)';
    const bc1 = document.getElementById('battCell1'), bc2 = document.getElementById('battCell2');
    if (bc1) { bc1.setAttribute('height', Math.max(2, 46 * S.batt / 100)); bc1.setAttribute('y', 561 - Math.max(2, 46 * S.batt / 100)); }
    if (bc2) { bc2.setAttribute('height', Math.max(2, 46 * S.batt / 100)); bc2.setAttribute('y', 561 - Math.max(2, 46 * S.batt / 100)); }

    $('#spillPool').setAttribute('rx', S.spill ? 95 : Math.max(0, parseFloat($('#spillPool').getAttribute('rx')) - 3));
    $('#btnFixSensor').classList.toggle('hidden', !(S.mqStuck || S.dhtDead));
    $('#btnCleanup').classList.toggle('hidden', !S.spill);

    gauges.temp.set(S.tVessel);
    gauges.mq.set(S.ppmSensed);
    gauges.hum.set(S.dhtDead ? 0 : S.rhRead);
    gauges.qual.set(S.quality);

    $('#bigProg').textContent = Math.round(S.progress) + '%';
    $('#progBar').style.width = S.progress + '%';
    $('#statTimer').textContent = SIM.getExtractionTimer();
    if ($('#statEnergy')) $('#statEnergy').textContent = fmtJoules(S.energyJoules);
    if ($('#statEff')) $('#statEff').textContent = (S.effPct || 96) + '%';

    const banner = $('#alarmBanner');
    if (S.state === 'LOCKDOWN') { banner.classList.remove('hidden'); if (S.tempAlert) { $('#alarmText').textContent = 'TEMP HAZARD'; $('#alarmSub').textContent = 'Vessel temperature ' + Math.round(S.tVessel) + ' °C — exceeding 90 °C limit. Heater isolated.'; } else { $('#alarmText').textContent = 'LOCKDOWN ACTIVE'; $('#alarmSub').textContent = 'Ethanol vapour ' + Math.round(S.ppmSensed) + ' ppm — heater isolated automatically.'; } }
    else if (S.state === 'FAULT') { banner.classList.remove('hidden'); $('#alarmText').textContent = 'SENSOR FAULT'; $('#alarmSub').textContent = 'Watchdog fail-safe engaged — replace faulty sensor.'; }
    else if (S.state === 'HOLD') { banner.classList.remove('hidden'); $('#alarmText').textContent = 'EMERGENCY STOP'; $('#alarmSub').textContent = 'Latched. Press Reset Rig to restore.'; }
    else banner.classList.add('hidden');
  }

  function loop(ts) {
    try {
      const dtReal = Math.min((ts - (loop.last || ts)) / 1000, 0.06);
      loop.last = ts;
      const S = SIM.get();

      SIM.tick(dtReal);
      try { syncDom(); } catch (e) { if (window.__dbg) console.error(e); }

      if (S.fx.sparkAt !== lastSpark) { lastSpark = S.fx.sparkAt; try { spawnSparks(); } catch (e) {} }
      if (S.fx.confetti && confettiDone) { confettiDone = false; try { spawnConfetti(); } catch (e) {} }

      if (S.buzzChirp && snd.on) {
        if (S.state === 'PREWARN') { if (ts - lastBuzz > 900) { lastBuzz = ts; beep(880, 0.09, 0.04); } }
        else if (!alarmIv) alarmIv = setInterval(() => beep(620, 0.18, 0.06), 650);
      } else if (alarmIv) { clearInterval(alarmIv); alarmIv = null; }

      try { Object.values(gauges).forEach(g => g.draw()); } catch (e) {}
      chartAcc += dtReal;
      if (chartAcc > 0.5) { chartAcc = 0; try { stripChartDraw(); } catch (e) {} }
      try { drawFx(dtReal); } catch (e) { if (window.__dbg) console.error(e); }
    } catch (e) { if (window.__dbg) console.error(e); }
    requestAnimationFrame(loop);
  }

  function bindRange(id, outId, fn, fmtFn) {
    const el = $(id), out = $(outId);
    const upd = () => {
      const v = +el.value;
      el.style.setProperty('--v', ((v - el.min) / (el.max - el.min) * 100) + '%');
      out.textContent = fmtFn(v);
      fn(v);
    };
    el.addEventListener('input', upd);
    upd();
  }

  function bindSwitch(id, fn) {
    const el = $(id);
    el.addEventListener('change', () => fn(el.checked));
  }

  function openInfo(key) {
    const item = INFO[key];
    if (!item) return;
    $('#infoTitle').textContent = item[0];
    $('#infoBody').innerHTML = item[1];
    $('#infoModal').classList.remove('hidden');
  }

  function init() {
    fitFx();
    window.addEventListener('resize', () => { fitFx(); stripChartDraw(); compareDraw(); });

    SIM.onEvent(addLog);
    SIM.onSerial(pushSerial);

    $('#btnPower').addEventListener('click', () => {
      if (window.autoConnect && !window.isWiringVerified()) {
        window.autoConnect();
      }
      const on = !SIM.get().powered;
      SIM.power(on);
      syncDom();
      $('#btnPower').textContent = on ? 'POWER OFF' : 'POWER ON';
      $('#btnPower').classList.toggle('on', on);
      if (on) toast('System Powered ON — Glowing status LEDs & live process rig active!', 'good');
    });
    $('#btnEstop').addEventListener('click', () => SIM.estop());
    $('#simSpeed').addEventListener('change', e => {
      SIM.setSpeed(+e.target.value);
      $('#chipSim').textContent = 'SIM x' + e.target.value;
      addLog('sim', 'Simulation speed set to x' + e.target.value + '.');
    });
    $('#btnSound').addEventListener('click', () => {
      snd.on = !snd.on;
      $('#btnSound').textContent = snd.on ? 'SND ON' : 'SND OFF';
      if (snd.on) beep(880, 0.08, 0.03);
    });

    bindRange('#ctlSet', '#outSet', v => SIM.setTemp(v), v => v + ' °C');
    bindRange('#ctlHeat', '#outHeat', v => SIM.setManHeat(v), v => v + '%');
    bindSwitch('#ctlAuto', v => { SIM.setAuto(v); $('#rowSet').style.opacity = v ? 1 : 0.35; $('#ctlHeat').parentElement.style.opacity = v ? 0.35 : 1; });
    bindSwitch('#ctlLid', v => SIM.setLid(v));
    $('#rowSet').style.opacity = $('#ctlAuto').checked ? 1 : 0.35;
    $('#ctlHeat').parentElement.style.opacity = $('#ctlAuto').checked ? 0.35 : 1;
    $('#selBatch').addEventListener('change', e => SIM.setBatch(e.target.value));

    $$('.scn').forEach(b => {
      if (!b.id.startsWith('scn')) return;
      b.addEventListener('click', () => {
        if (window.autoConnect && !window.isWiringVerified()) {
          window.autoConnect();
        }
        const key = { scnSafe: 'safe', scnEthanolLeak: 'ethanolLeak', scnTempExceed: 'tempExceed' }[b.id];
        if (key) SIM.scenario(key);
        $('#ctlLid').checked = SIM.get().lid;
        $('#ctlAuto').checked = SIM.get().auto;
        confettiDone = true;
        if (!$('#btnPower').classList.contains('on')) { $('#btnPower').textContent = 'POWER OFF'; $('#btnPower').classList.add('on'); }
      });
    });
    $('#btnResetSim').addEventListener('click', () => location.reload());
    $('#btnFixSensor').addEventListener('click', () => SIM.fixSensor());
    $('#btnCleanup').addEventListener('click', () => SIM.cleanup());
    $('#btnAlarmAck').addEventListener('click', () => $('#alarmBanner').classList.add('hidden'));

    $$('#rigSvg .clickable').forEach(el => el.addEventListener('click', () => openInfo(el.dataset.part)));

    $('#infoClose').addEventListener('click', () => $('#infoModal').classList.add('hidden'));
    $('#infoModal').addEventListener('click', e => { if (e.target.id === 'infoModal') e.currentTarget.classList.add('hidden'); });

    $('#btnTour').addEventListener('click', () => tourShow(0));
    $('#tourNext').addEventListener('click', () => tourShow(tourIdx >= TOUR.length - 1 ? -1 : tourIdx + 1));
    $('#tourPrev').addEventListener('click', () => tourShow(Math.max(0, tourIdx - 1)));
    $('#tourEnd').addEventListener('click', () => tourShow(-1));
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { tourShow(-1); $$('.modal').forEach(m => m.classList.add('hidden')); }
      if (tourIdx >= 0 && e.key === 'ArrowRight') tourShow(Math.min(TOUR.length - 1, tourIdx + 1));
      if (tourIdx >= 0 && e.key === 'ArrowLeft') tourShow(Math.max(0, tourIdx - 1));
    });
    window.addEventListener('scroll', () => { if (tourIdx >= 0) tourSpotPosition(); });

    $('#btnSerialPause').addEventListener('click', e => { serialPaused = !serialPaused; e.target.textContent = serialPaused ? 'RESUME' : 'PAUSE'; });
    $('#btnSerialClr').addEventListener('click', () => serialEl.textContent = '');
    $('#btnLogClr').addEventListener('click', () => $('#eventLog').innerHTML = '');
    $('#btnSerialDl').addEventListener('click', dl(() => serialEl.textContent, 'phytonexus_serial.txt'));
    $('#btnLogDl').addEventListener('click', dl(() => [...$('#eventLog').children].map(li => li.textContent).join('\n'), 'phytonexus_events.txt'));

    function dl(getText, name) {
      return () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([getText()], { type: 'text/plain' }));
        a.download = name;
        a.click();
      };
    }

    const navLinks = $$('#docNav a');
    const obs = new IntersectionObserver(es => {
      es.forEach(en => {
        if (en.isIntersecting) {
          navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id));
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    $$('.doc').forEach(d => obs.observe(d));

    try { compareDraw(); } catch (e) { if (window.__dbg) console.error('compareDraw', e); }
    try { stripChartDraw(); } catch (e) { if (window.__dbg) console.error('stripChartDraw', e); }
    addLog('sim', 'Virtual Lab ready. This digital twin runs the exact firmware decision logic of the PHYTONEXUS prototype.');
    toast('Press POWER ON to boot the ESP32, then try GUIDED TOUR.', '');
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
