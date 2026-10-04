global.window = {};
require('./js/sim.js');
const SIM = window.SIM;
const evts = [];
SIM.onEvent((k, m) => { evts.push(k + ': ' + m); });
SIM.onSerial(() => {});

SIM.power(true);
SIM.setSpeed(5);
SIM.scenario('safe');
for (let i = 0; i < 400; i++) SIM.tick(0.05);
let s = SIM.snapshot();
console.log('SAFE RUN -> state:', s.state, '| T:', s.tVessel.toFixed(1), '| ppm:', Math.round(s.ppmSensed), '| prog:', Math.round(s.progress), '| qual:', Math.round(s.quality));
if (!(s.state === 'MONITOR' && s.tVessel > 35 && s.progress > 0)) { console.error('FAIL safe scenario'); process.exit(1); }

SIM.scenario('ethanolLeak');
let lockdowns = 0;
for (let i = 0; i < 3000; i++) {
  SIM.tick(0.05);
  const st = SIM.get().state;
  if (st === 'LOCKDOWN' && evts.length && evts[evts.length - 1].startsWith('crit') && !evts._c) { evts._c = 1; }
}
s = SIM.snapshot();
console.log('ETHANOL LEAK -> state:', s.state, '| T:', s.tVessel.toFixed(1), '| ppm sensed:', Math.round(s.ppmSensed), 'true:', Math.round(s.ppmTruth), '| lockdowns:', s.trips);
if (s.trips < 1) { console.error('FAIL: never locked down in ethanol leak'); process.exit(1); }

SIM.reset();
SIM.power(true);
SIM.scenario('tempExceed');
for (let i = 0; i < 5000; i++) SIM.tick(0.05);
s = SIM.snapshot();
console.log('TEMP EXCEED -> state:', s.state, '| T:', s.tVessel.toFixed(1), '| duty:', Math.round(s.duty), '| stage:', SIM.get().scnStage);

SIM.reset();
SIM.power(true);
SIM.setLid(false);
for (let i = 0; i < 200; i++) SIM.tick(0.05);
s = SIM.snapshot();
console.log('LID OPEN 10s -> state:', s.state, '| ppm:', Math.round(s.ppmSensed), '| trips:', s.trips);
if (s.trips < 1) { console.error('FAIL lid open surge'); process.exit(1); }

SIM.reset();
s = SIM.snapshot();
console.log('RESET -> state:', s.state, '| powered:', s.powered);

console.log('--- event sample ---');
evts.slice(0, 8).forEach(e => console.log(' ', e.slice(0, 100)));
console.log('SMOKE TEST PASSED');
