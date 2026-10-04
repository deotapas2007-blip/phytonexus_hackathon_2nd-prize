(function () {
  const COMPONENTS = [
    { id: 'esp32', label: 'ESP32 DevKit', w: 145, h: 72, color: '#1e40af', pins: ['VIN','GND','3V3','GPIO34','GPIO4','GPIO5','GPIO16','GPIO17','GPIO18','GPIO19','GPIO23'], desc: 'Edge controller running safety state machine' },
    { id: 'mq3', label: 'MQ-3 Gas Sensor', w: 85, h: 50, color: '#854d0e', pins: ['VCC','GND','AOUT'], desc: 'Ethanol vapour proxy sensor' },
    { id: 'dht22', label: 'DHT22 Climate', w: 75, h: 50, color: '#166534', pins: ['VCC','DATA','GND'], desc: 'Temperature & humidity sensor' },
    { id: 'relay', label: 'Relay Module', w: 90, h: 55, color: '#7c2d12', pins: ['VCC','GND','IN','COM','NO'], desc: '5V 1-channel relay for load isolation' },
    { id: 'oled', label: '0.96" OLED', w: 75, h: 48, color: '#1e293b', pins: ['VCC','GND','SCL','SDA'], desc: 'SSD1306 live telemetry display' },
    { id: 'buzzer', label: 'Alarm Buzzer', w: 55, h: 42, color: '#374151', pins: ['+','-'], desc: 'Acoustic alarm indicator' },
    { id: 'led_green', label: 'Green LED', w: 45, h: 38, color: '#166534', pins: ['+','-'], desc: 'SAFE status LED' },
    { id: 'led_red', label: 'Red LED', w: 45, h: 38, color: '#7f1d1d', pins: ['+','-'], desc: 'ALERT status LED' },
    { id: 'battery', label: '2x 18650 Pack', w: 85, h: 45, color: '#44403c', pins: ['+','-'], desc: 'Off-grid battery power supply' },
    { id: 'hotplate', label: 'Hot Plate 800W', w: 105, h: 48, color: '#92400e', pins: ['L','N'], desc: 'Heating element connected through relay' }
  ];

  const CORRECT_WIRES = [
    { from: 'battery:+', to: 'esp32:VIN', color: '#ef4444', label: 'Main Power +' },
    { from: 'battery:-', to: 'esp32:GND', color: '#64748b', label: 'Main Ground' },
    { from: 'mq3:AOUT', to: 'esp32:GPIO34', color: '#fbbf24', label: 'MQ-3 Analog Signal' },
    { from: 'mq3:VCC', to: 'esp32:3V3', color: '#ef4444', label: 'MQ-3 3.3V Power' },
    { from: 'mq3:GND', to: 'esp32:GND', color: '#64748b', label: 'MQ-3 Ground' },
    { from: 'dht22:DATA', to: 'esp32:GPIO4', color: '#22d3ee', label: 'DHT22 Data Line' },
    { from: 'dht22:VCC', to: 'esp32:3V3', color: '#ef4444', label: 'DHT22 3.3V Power' },
    { from: 'dht22:GND', to: 'esp32:GND', color: '#64748b', label: 'DHT22 Ground' },
    { from: 'relay:IN', to: 'esp32:GPIO5', color: '#a855f7', label: 'Relay Control Signal' },
    { from: 'relay:VCC', to: 'esp32:3V3', color: '#ef4444', label: 'Relay 5V/3V Power' },
    { from: 'relay:GND', to: 'esp32:GND', color: '#64748b', label: 'Relay Ground' },
    { from: 'oled:SDA', to: 'esp32:GPIO16', color: '#3b82f6', label: 'OLED I2C SDA' },
    { from: 'oled:SCL', to: 'esp32:GPIO17', color: '#06b6d4', label: 'OLED I2C SCL' },
    { from: 'oled:VCC', to: 'esp32:3V3', color: '#ef4444', label: 'OLED Power' },
    { from: 'oled:GND', to: 'esp32:GND', color: '#64748b', label: 'OLED Ground' },
    { from: 'buzzer:+', to: 'esp32:GPIO18', color: '#f59e0b', label: 'Buzzer Signal' },
    { from: 'buzzer:-', to: 'esp32:GND', color: '#64748b', label: 'Buzzer Ground' },
    { from: 'led_green:+', to: 'esp32:GPIO19', color: '#10b981', label: 'Green LED Signal' },
    { from: 'led_green:-', to: 'esp32:GND', color: '#64748b', label: 'Green LED Ground' },
    { from: 'led_red:+', to: 'esp32:GPIO23', color: '#f87171', label: 'Red LED Signal' },
    { from: 'led_red:-', to: 'esp32:GND', color: '#64748b', label: 'Red LED Ground' },
    { from: 'hotplate:L', to: 'relay:COM', color: '#f97316', label: 'Heater Live Line' },
    { from: 'hotplate:N', to: 'battery:-', color: '#64748b', label: 'Heater Neutral' }
  ];

  let placed = [];
  let wires = [];
  let dragging = null;
  let dragOff = { x: 0, y: 0 };
  let wireStart = null;
  let canvas, ctx, sidebar, tooltip, scoreEl, statusEl, checkBtn, resetBtn, autoBtn, helpPanel;
  let animFrame = 0;
  let completedWires = 0;
  let showHelp = false;

  function getPinPos(comp, pinName) {
    const idx = comp.pins.indexOf(pinName);
    if (idx < 0) return { x: comp.x + comp.w / 2, y: comp.y + comp.h / 2 };
    const spacing = comp.w / (comp.pins.length + 1);
    return { x: comp.x + spacing * (idx + 1), y: comp.y + comp.h + 6 };
  }

  function findPinAt(mx, my) {
    for (const c of placed) {
      for (const pin of c.pins) {
        const p = getPinPos(c, pin);
        if (Math.abs(mx - p.x) < 12 && Math.abs(my - p.y) < 12) {
          return { comp: c, pin, pos: p };
        }
      }
    }
    return null;
  }

  function findCompAt(mx, my) {
    for (let i = placed.length - 1; i >= 0; i--) {
      const c = placed[i];
      if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) return c;
    }
    return null;
  }

  function drawRoundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function draw() {
    animFrame++;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    ctx.strokeStyle = 'rgba(99,102,241,.08)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < cw; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ch); ctx.stroke(); }
    for (let gy = 0; gy < ch; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(cw, gy); ctx.stroke(); }

    for (const w of wires) {
      const from = getPinPos(w.fromComp, w.fromPin);
      const to = getPinPos(w.toComp, w.toPin);
      const mx = (from.x + to.x) / 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.bezierCurveTo(from.x, from.y + 40, to.x, to.y + 40, to.x, to.y);
      ctx.strokeStyle = w.color || '#6366f1';
      ctx.lineWidth = 3;
      ctx.setLineDash(w.correct ? [] : [6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (w.correct) {
        const pulse = (Math.sin(animFrame * 0.06) + 1) * 0.3;
        ctx.strokeStyle = w.color || '#6366f1';
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(from.x, from.y + 40, to.x, to.y + 40, to.x, to.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      if (w.label) ctx.fillText(w.label, mx, Math.min(from.y, to.y) + 32);
    }

    if (wireStart) {
      const p = wireStart.pos;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const c of placed) {
      const glow = (dragging === c) ? 'rgba(99,102,241,.5)' : 'rgba(255,255,255,.08)';
      ctx.shadowColor = dragging === c ? '#6366f1' : 'transparent';
      ctx.shadowBlur = dragging === c ? 16 : 0;
      drawRoundRect(c.x, c.y, c.w, c.h, 8, c.color, glow);
      ctx.shadowBlur = 0;

      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.fillText(c.label, c.x + c.w / 2, c.y + c.h / 2 + 4);

      for (const pin of c.pins) {
        const p = getPinPos(c, pin);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '7.5px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(pin, p.x, p.y + 13);
      }
    }

    requestAnimationFrame(draw);
  }

  function checkWiring() {
    let correct = 0;
    for (const w of wires) {
      const key1 = w.fromComp.id + ':' + w.fromPin;
      const key2 = w.toComp.id + ':' + w.toPin;
      const match = CORRECT_WIRES.find(cw =>
        (cw.from === key1 && cw.to === key2) || (cw.from === key2 && cw.to === key1)
      );
      w.correct = !!match;
      if (match) {
        w.color = match.color;
        w.label = match.label;
        correct++;
      } else {
        w.color = '#ef4444';
        w.label = 'Wrong connection';
      }
    }
    completedWires = correct;
    scoreEl.textContent = correct + '/' + CORRECT_WIRES.length;

    if (correct >= CORRECT_WIRES.length) {
      statusEl.textContent = 'ALL ' + correct + ' CONNECTIONS CORRECT — System is ready! Click POWER ON below.';
      statusEl.style.color = '#4ade80';
      document.getElementById('wiringSuccess').classList.remove('hidden');
      window.WIRING_OK = true;
    } else if (correct > 0) {
      statusEl.textContent = correct + ' correct ports connected out of ' + CORRECT_WIRES.length + '. Keep wiring!';
      statusEl.style.color = '#fbbf24';
    } else if (wires.length > 0) {
      statusEl.textContent = 'Incorrect connections detected. Click "Connect Automatically" to auto-wire all ports.';
      statusEl.style.color = '#f87171';
    }
  }

  function autoConnect() {
    placed = [
      { ...COMPONENTS.find(c=>c.id==='battery'), x: 20, y: 20, pins: [...COMPONENTS.find(c=>c.id==='battery').pins] },
      { ...COMPONENTS.find(c=>c.id==='esp32'), x: 135, y: 20, pins: [...COMPONENTS.find(c=>c.id==='esp32').pins] },
      { ...COMPONENTS.find(c=>c.id==='oled'), x: 310, y: 20, pins: [...COMPONENTS.find(c=>c.id==='oled').pins] },
      { ...COMPONENTS.find(c=>c.id==='mq3'), x: 415, y: 20, pins: [...COMPONENTS.find(c=>c.id==='mq3').pins] },
      { ...COMPONENTS.find(c=>c.id==='dht22'), x: 530, y: 20, pins: [...COMPONENTS.find(c=>c.id==='dht22').pins] },
      { ...COMPONENTS.find(c=>c.id==='buzzer'), x: 640, y: 20, pins: [...COMPONENTS.find(c=>c.id==='buzzer').pins] },
      { ...COMPONENTS.find(c=>c.id==='led_green'), x: 30, y: 230, pins: [...COMPONENTS.find(c=>c.id==='led_green').pins] },
      { ...COMPONENTS.find(c=>c.id==='led_red'), x: 110, y: 230, pins: [...COMPONENTS.find(c=>c.id==='led_red').pins] },
      { ...COMPONENTS.find(c=>c.id==='relay'), x: 230, y: 230, pins: [...COMPONENTS.find(c=>c.id==='relay').pins] },
      { ...COMPONENTS.find(c=>c.id==='hotplate'), x: 460, y: 230, pins: [...COMPONENTS.find(c=>c.id==='hotplate').pins] }
    ];

    wires = CORRECT_WIRES.map(cw => {
      const [fromCId, fromPinName] = cw.from.split(':');
      const [toCId, toPinName] = cw.to.split(':');
      const fromComp = placed.find(c => c.id === fromCId);
      const toComp = placed.find(c => c.id === toCId);
      return {
        fromComp, fromPin: fromPinName,
        toComp, toPin: toPinName,
        color: cw.color,
        correct: true,
        label: cw.label
      };
    });

    completedWires = wires.length;
    scoreEl.textContent = completedWires + '/' + CORRECT_WIRES.length;
    statusEl.textContent = 'ALL ' + completedWires + ' PORTS CONNECTED AUTOMATICALLY & VERIFIED! Click POWER ON to start system.';
    statusEl.style.color = '#4ade80';
    document.getElementById('wiringSuccess').classList.remove('hidden');
    window.WIRING_OK = true;
  }

  function resetAssembler() {
    placed = [];
    wires = [];
    wireStart = null;
    completedWires = 0;
    scoreEl.textContent = '0/' + CORRECT_WIRES.length;
    statusEl.textContent = 'Drag components from the palette or click "Connect Automatically" to auto-wire all ports.';
    statusEl.style.color = '#94a3b8';
    document.getElementById('wiringSuccess').classList.add('hidden');
    window.WIRING_OK = false;
  }

  window.autoConnect = autoConnect;
  window.isWiringVerified = () => completedWires >= CORRECT_WIRES.length;

  function init() {
    const section = document.getElementById('wiringAssembler');
    if (!section) return;
    canvas = document.getElementById('wiringCanvas');
    ctx = canvas.getContext('2d');
    sidebar = document.getElementById('wiringSidebar');
    tooltip = document.getElementById('wiringTooltip');
    scoreEl = document.getElementById('wiringScore');
    statusEl = document.getElementById('wiringStatus');
    checkBtn = document.getElementById('wiringCheck');
    resetBtn = document.getElementById('wiringReset');
    autoBtn = document.getElementById('wiringAutoBtn');
    helpPanel = document.getElementById('wiringHelp');

    COMPONENTS.forEach(c => {
      const chip = document.createElement('div');
      chip.className = 'wiring-chip';
      chip.style.background = c.color;
      chip.textContent = c.label;
      chip.title = c.desc;
      chip.dataset.cid = c.id;
      chip.setAttribute('draggable', 'true');
      chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', c.id);
      });
      sidebar.appendChild(chip);
    });

    canvas.addEventListener('dragover', e => e.preventDefault());
    canvas.addEventListener('drop', e => {
      e.preventDefault();
      const cid = e.dataTransfer.getData('text/plain');
      const tmpl = COMPONENTS.find(c => c.id === cid);
      if (!tmpl) return;
      if (placed.find(c => c.id === cid)) return;
      const rect = canvas.getBoundingClientRect();
      placed.push({
        ...tmpl,
        x: e.clientX - rect.left - tmpl.w / 2,
        y: e.clientY - rect.top - tmpl.h / 2,
        pins: [...tmpl.pins]
      });
    });

    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const pin = findPinAt(mx, my);
      if (pin && !wireStart) {
        wireStart = pin;
        return;
      }
      if (pin && wireStart) {
        if (pin.comp !== wireStart.comp) {
          wires.push({
            fromComp: wireStart.comp, fromPin: wireStart.pin,
            toComp: pin.comp, toPin: pin.pin,
            color: '#6366f1', correct: false, label: ''
          });
          checkWiring();
        }
        wireStart = null;
        return;
      }
      wireStart = null;
      const comp = findCompAt(mx, my);
      if (comp) {
        dragging = comp;
        dragOff.x = mx - comp.x;
        dragOff.y = my - comp.y;
      }
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (dragging) {
        dragging.x = mx - dragOff.x;
        dragging.y = my - dragOff.y;
        return;
      }
      const pin = findPinAt(mx, my);
      const comp = findCompAt(mx, my);
      if (pin) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX - canvas.getBoundingClientRect().left + 14) + 'px';
        tooltip.style.top = (e.clientY - canvas.getBoundingClientRect().top - 10) + 'px';
        tooltip.textContent = pin.comp.label + ' : ' + pin.pin;
      } else if (comp) {
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX - canvas.getBoundingClientRect().left + 14) + 'px';
        tooltip.style.top = (e.clientY - canvas.getBoundingClientRect().top - 10) + 'px';
        tooltip.textContent = comp.desc;
      } else {
        tooltip.style.display = 'none';
      }
    });

    canvas.addEventListener('mouseup', () => { dragging = null; });
    canvas.addEventListener('mouseleave', () => { dragging = null; });

    canvas.addEventListener('dblclick', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const comp = findCompAt(mx, my);
      if (comp) {
        wires = wires.filter(w => w.fromComp !== comp && w.toComp !== comp);
        placed = placed.filter(c => c !== comp);
        checkWiring();
      }
    });

    if (autoBtn) autoBtn.addEventListener('click', autoConnect);
    if (checkBtn) checkBtn.addEventListener('click', checkWiring);
    if (resetBtn) resetBtn.addEventListener('click', resetAssembler);
    document.getElementById('wiringHelpBtn').addEventListener('click', () => {
      showHelp = !showHelp;
      helpPanel.classList.toggle('hidden', !showHelp);
    });

    requestAnimationFrame(draw);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
