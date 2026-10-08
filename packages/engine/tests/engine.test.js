import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from '../src/normalizer.js';
import { realRange } from '../src/physics.js';
import { trueTco } from '../src/tco.js';
import { estimateSoh, resaleForecast } from '../src/resale_soh.js';
import { pmEdriveSubsidy, pmEdriveStatus, PM_EDRIVE_END_MS } from '../src/subsidy.js';

const DAY = 864e5;

test('normalizer: ARAI 195 -> honest 150', () => {
  const n = normalizeSpec(3.7, 195, 'ARAI');
  assert.ok(Math.abs(n.honestRangeKm - 150) < 1, JSON.stringify(n));
  assert.equal(n.derateVsLabPct, 23);
});

test('Pune Ather story: 195 ARAI -> ~95-125 mixed w/ pillion 55kph 38C', () => {
  const r = realRange({ batteryKwh: 3.7, labRangeKm: 195, cycle: 'ARAI', chemistry: 'NMC811', vehicleKg: 111, cda: 0.62, crr: 0.012, riderKg: 85, pillionKg: 60, speedKph: 55, cityFrac: 0.7, tempC: 38, acLevel: 2 });
  assert.ok(r.realRangeKm >= 85 && r.realRangeKm <= 130, `got ${r.realRangeKm}`);
});

test('Michigan Model Y story: EPA 531km -> ~300-390km at -7C 120kph heater', () => {
  const r = realRange({ batteryKwh: 75, labRangeKm: 531, cycle: 'EPA', chemistry: 'NMC811', vehicleKg: 1921, cda: 0.65, crr: 0.008, speedKph: 120, cityFrac: 0.2, tempC: -7, acLevel: 3, heatPump: true });
  assert.ok(r.realRangeKm >= 290 && r.realRangeKm <= 395, `got ${r.realRangeKm}`);
});

test('TCO truth: Nexon 4W @40km/d does NOT break even in 5y (honest gap); @55km/d 8y it does', () => {
  const low = trueTco({ priceEv: 1999000, priceIce: 1150000, subsidyEv: 0, kmPerDay: 40, realWhPerKm: 140, iceKmPerL: 15, fuelPerL: 104.77, homeKwhPrice: 9.5, dcfcKwhPrice: 22, homeFrac: 0.85, maintEvPerKm: 0.9, maintIcePerKm: 4.2, insuranceEvYear1: 65000, insuranceIceYear1: 42000, years: 5 });
  assert.equal(low.breakevenMonth, null); // honest: Rs 8.49L gap needs miles
  const high = trueTco({ priceEv: 1999000, priceIce: 1150000, subsidyEv: 0, kmPerDay: 55, realWhPerKm: 140, iceKmPerL: 15, fuelPerL: 104.77, homeKwhPrice: 9.5, dcfcKwhPrice: 22, homeFrac: 0.85, maintEvPerKm: 0.9, maintIcePerKm: 4.2, insuranceEvYear1: 65000, insuranceIceYear1: 42000, years: 8 });
  assert.ok(high.breakevenMonth !== null && high.breakevenMonth <= 84, JSON.stringify({ be: high.breakevenMonth, sav: high.savings }));
});

test('TCO 2W breakeven fast: Ola S1X vs Activa ~month 19', () => {
  const t = trueTco({ priceEv: 89999, priceIce: 88000, subsidyEv: 10000, kmPerDay: 35, realWhPerKm: 38, iceKmPerL: 50, fuelPerL: 104.77, homeKwhPrice: 9.5, dcfcKwhPrice: 22, homeFrac: 0.95, maintEvPerKm: 0.30, maintIcePerKm: 1.20, insuranceEvYear1: 5200, insuranceIceYear1: 4800, years: 5 });
  assert.ok(t.breakevenMonth !== null && t.breakevenMonth <= 24, JSON.stringify({ be: t.breakevenMonth, sav: t.savings }));
});

test('SoH + resale sane', () => {
  const s = estimateSoh({ chemistry: 'LFP', ageYears: 3, cycles: 800, dcfcFrac: 0.3 });
  assert.ok(s.sohPct >= 78 && s.sohPct <= 96, JSON.stringify(s));
  const r = resaleForecast(1999000, '4W', 'LFP', s.sohPct, 3);
  assert.ok(r.pctOfNew > 40 && r.pctOfNew < 75, JSON.stringify(r));
});

test('P0 subsidy expiry: applied before deadline, ₹0 after, never silent', () => {
  const before = PM_EDRIVE_END_MS - 10 * DAY;
  const after = PM_EDRIVE_END_MS + 10 * DAY;
  // 2W 3kWh before expiry: min(5000*3, 10000) = 10000, status applied
  const a = pmEdriveSubsidy({ tariffCode: 'IN-MH', segment: '2W', batteryKwh: 3, nowMs: before });
  assert.equal(a.status, 'applied');
  assert.equal(a.amount, 10000);
  assert.match(a.note, /EXPIRES 31 Jul 2026/);
  // 3W 9kWh before expiry: min(45000, 50000) = 45000
  const a3 = pmEdriveSubsidy({ tariffCode: 'IN-DL', segment: '3W', batteryKwh: 9, nowMs: before });
  assert.equal(a3.status, 'applied');
  assert.equal(a3.amount, 45000);
  // after expiry: ₹0 + expired status + explicit expired note (no negative countdown)
  const e = pmEdriveSubsidy({ tariffCode: 'IN-MH', segment: '2W', batteryKwh: 3, nowMs: after });
  assert.equal(e.status, 'expired');
  assert.equal(e.amount, 0);
  assert.match(e.note, /ended 31 Jul 2026/);
  assert.doesNotMatch(e.note, /-\d+ days/);
  // 4W never eligible, any date
  const c = pmEdriveSubsidy({ tariffCode: 'IN-MH', segment: '4W', batteryKwh: 45, nowMs: before });
  assert.equal(c.status, 'inapplicable');
  assert.equal(c.amount, 0);
  // non-IN never eligible
  const u = pmEdriveSubsidy({ tariffCode: 'US-TX', segment: '2W', batteryKwh: 3, nowMs: before });
  assert.equal(u.status, 'inapplicable');
  assert.equal(u.amount, 0);
  // status helper: active before, expired after
  assert.equal(pmEdriveStatus(before).active, true);
  assert.equal(pmEdriveStatus(after).expired, true);
});
