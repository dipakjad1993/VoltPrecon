// VoltPrecon engine fuzz/property tests — physics must NEVER produce nonsense,
// no matter what the UI sliders feed it. Deterministic PRNG (mulberry32, seed 7);
// 2,000 randomized cases across the input envelope. Run: node --test packages/engine/tests/fuzz.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realRange, sohFor } from '../src/physics.js';
import { normalizeSpec } from '../src/normalizer.js';
import { trueTco } from '../src/tco.js';
import { pmEdriveSubsidy } from '../src/subsidy.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(7);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const num = (lo, hi) => lo + rnd() * (hi - lo);

test('fuzz physics: 2000 CONSISTENT cases stay finite, positive, and bounded', () => {
  // Consistent = lab range derived from battery via segment base (like generator.py),
  // ±30% slop. Inconsistent combos (110 kWh claiming 60 km lab) are covered by the
  // garbage-input test below: those must not crash, but need not be "sane".
  const BASE = { '2W': 42, '3W': 100, '4W': 145 };
  const OPT = { ARAI: 1.30, IDC: 1.30, CLTC: 1.25, WLTP: 1.12, EPA: 1.05 };
  for (let i = 0; i < 2000; i++) {
    const seg = pick(['2W', '2W', '3W', '4W', '4W']);
    const cycle = pick(['ARAI', 'WLTP', 'EPA', 'CLTC', 'IDC']);
    const kwh = seg === '2W' ? num(1.5, 11) : seg === '3W' ? num(5, 22) : num(20, 100);
    const lab = Math.round((kwh * 1000) / BASE[seg] * OPT[cycle] * num(0.7, 1.3));
    const r = realRange({
      batteryKwh: kwh, labRangeKm: lab, cycle,
      chemistry: pick(['LFP', 'NMC811', 'NMC622', 'LMFP', 'NA_ION', 'LTO']),
      vehicleKg: seg === '2W' ? num(80, 250) : seg === '3W' ? num(500, 1200) : num(1200, 2300),
      cda: num(0.4, 1.2), crr: num(0.006, 0.02),
      riderKg: num(40, 150), pillionKg: num(0, 120), cargoKg: num(0, 200),
      speedKph: num(12, 160), cityFrac: num(0, 1), tempC: num(-20, 48),
      acLevel: pick([0, 1, 2, 3]), ageYears: num(0, 8), dcfcFrac: num(0, 1),
    });
    assert.ok(Number.isFinite(r.realRangeKm) && r.realRangeKm > 0 && r.realRangeKm < 3000, `range ${r.realRangeKm} case ${i}`);
    assert.ok(Number.isFinite(r.realWhPerKm) && r.realWhPerKm > 5 && r.realWhPerKm < 2500, `wh ${r.realWhPerKm} case ${i}`);
    assert.ok(r.sohPct >= 60 && r.sohPct <= 100, `soh ${r.sohPct} case ${i}`);
  }
});

test('fuzz physics: garbage inputs never crash (finite output, no throw)', () => {
  for (let i = 0; i < 1000; i++) {
    let r;
    try {
      r = realRange({
        batteryKwh: num(0.1, 200), labRangeKm: num(1, 2000), cycle: pick(['ARAI', 'WLTP', 'EPA', 'CLTC', 'IDC']),
        chemistry: pick(['LFP', 'NMC811', 'NOPE']), vehicleKg: num(50, 3000),
        cda: num(0.1, 3), crr: num(0.001, 0.05), riderKg: num(0, 300),
        speedKph: num(12, 200), cityFrac: num(0, 1), tempC: num(-40, 60), acLevel: pick([0, 1, 2, 3]),
      });
    } catch (e) { assert.fail(`threw on garbage case ${i}: ${String(e).slice(0, 80)}`); }
    assert.ok(Number.isFinite(r.realRangeKm) && r.realRangeKm > 0, `finite range case ${i}`);
  }
});

test('property: heat always costs range; speed always costs range; load always costs range', () => {
  const base = { batteryKwh: 45, labRangeKm: 489, cycle: 'ARAI', chemistry: 'LFP', vehicleKg: 1720, cda: 0.85, crr: 0.01, riderKg: 75, speedKph: 60, cityFrac: 0.5, tempC: 25, acLevel: 2 };
  const mild = realRange(base).realRangeKm;
  assert.ok(realRange({ ...base, tempC: 44 }).realRangeKm < mild, '44C heat costs range');
  assert.ok(realRange({ ...base, tempC: -7, acLevel: 3 }).realRangeKm < mild, '-7C cold costs range');
  assert.ok(realRange({ ...base, speedKph: 120 }).realRangeKm < realRange({ ...base, speedKph: 50 }).realRangeKm, 'speed costs range');
  assert.ok(realRange({ ...base, pillionKg: 100 }).realRangeKm < mild, 'load costs range');
  assert.ok(realRange({ ...base, ageYears: 8 }).realRangeKm < mild, 'age costs range');
});

test('property: normalizer optimism ordering EPA < WLTP < CLTC < ARAI derate', () => {
  const d = (cy) => normalizeSpec(50, 500, cy).derateVsLabPct;
  assert.ok(d('EPA') < d('WLTP') && d('WLTP') < d('CLTC') && d('CLTC') < d('ARAI'), 'derate ordering');
});

test('property: TCO savings sign is consistent; breakeven implies savings>0 at horizon', () => {
  for (let i = 0; i < 500; i++) {
    const t = trueTco({
      priceEv: num(1e5, 5e6), priceIce: num(8e4, 3e6), subsidyEv: pick([0, 10000, 45000]),
      kmPerDay: num(5, 200), realWhPerKm: num(25, 250), iceKmPerL: num(12, 60),
      fuelPerL: num(50, 200), homeKwhPrice: num(3, 40), dcfcKwhPrice: num(10, 60),
      homeFrac: num(0, 1), maintEvPerKm: 0.9, maintIcePerKm: 4.2,
      insuranceEvYear1: 40000, insuranceIceYear1: 25000, years: pick([5, 8]),
    });
    assert.ok(Number.isFinite(t.totalEv) && Number.isFinite(t.totalIce), `totals finite case ${i}`);
    assert.equal(Math.sign(t.savings), Math.sign(t.totalIce - t.totalEv) || 0, 'savings sign');
    if (t.breakevenMonth !== null) {
      assert.ok(t.breakevenMonth >= 1 && t.breakevenMonth <= 96, `breakeven in window case ${i}`);
      const last = t.monthly.at(-1);
      assert.ok(last.cumEv <= last.cumIce, `breakeven implies horizon savings case ${i}`);
    }
  }
});

test('property: subsidy never negative, never exceeds cap, 4W always zero', () => {
  for (let i = 0; i < 500; i++) {
    const s = pmEdriveSubsidy({ tariffCode: pick(['IN-MH', 'IN-DL', 'US-TX', 'DE']), segment: pick(['2W', '3W', '4W']), batteryKwh: num(1, 100), nowMs: num(Date.parse('2026-01-01'), Date.parse('2027-06-01')) });
    assert.ok(s.amount >= 0 && s.amount <= 50000, `bounded case ${i}`);
    if (s.status === 'applied') assert.ok(s.amount > 0, 'applied means money');
    if (s.status !== 'applied') assert.equal(s.amount, 0, 'not-applied means zero');
  }
  const c4 = pmEdriveSubsidy({ tariffCode: 'IN-MH', segment: '4W', batteryKwh: 90, nowMs: Date.parse('2026-06-01') });
  assert.equal(c4.amount, 0);
});

test('property: SoH bounded 60..100 across chemistries and ages', () => {
  for (const chem of ['LFP', 'NMC811', 'NMC622', 'LMFP', 'NA_ION', 'LTO', 'UNKNOWN']) {
    for (let age = 0; age <= 8; age += 0.5) {
      const s = sohFor(chem, age, 0.9);
      assert.ok(s >= 0.6 && s <= 1, `${chem}@${age}y = ${s}`);
    }
  }
});
