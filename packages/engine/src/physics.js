// VoltPrecon physics runtime v2 (plain JS ESM). Mirrors physics.ts. Zero-dep.
import { normalizeSpec } from './normalizer.js';
const RHO = 1.225, G = 9.81;
const VLAB = { ARAI: { '2W': 32, '3W': 30, '4W': 45 }, IDC: { '2W': 32, '3W': 30, '4W': 45 },
  WLTP: { '2W': 45, '3W': 40, '4W': 55 }, EPA: { '2W': 60, '3W': 50, '4W': 85 }, CLTC: { '2W': 35, '3W': 32, '4W': 48 } };
const OVERHEAD = { ARAI: 0.32, IDC: 0.32, WLTP: 0.15, EPA: 0.34, CLTC: 0.28 };
const AERO_CAL = { '2W': 0.8, '3W': 0.9, '4W': 1.0 };
const REGEN = { '2W': 0.12, '3W': 0.10, '4W': 0.18 };
const COLD_K = { LFP: 0.012, LMFP: 0.010, NMC811: 0.009, NMC622: 0.009, NA_ION: 0.004, LTO: 0.002 };
const HEAT_K = 0.008;
const DEG = { LFP: [0.97, 0.93, 0.89, 0.82], NMC811: [0.95, 0.89, 0.83, 0.73],
  NMC622: [0.955, 0.90, 0.85, 0.76], LMFP: [0.968, 0.925, 0.885, 0.81],
  NA_ION: [0.972, 0.935, 0.90, 0.84], LTO: [0.985, 0.965, 0.945, 0.91] };
const segOf = (kg) => (kg < 280 ? '2W' : kg < 1200 ? '3W' : '4W');
// Lab speed anchor per cycle/segment (kph) — exposed so the UI can show
// "your speed vs the speed the lab number was measured at" honestly.
export function labAnchorKph(cycle, vehicleKg) {
  const seg = cycle && vehicleKg != null ? segOf(vehicleKg) : null;
  const table = VLAB[cycle];
  if (table && seg && table[seg] != null) return table[seg];
  return 50;
}
export function sohFor(chem, ageYears = 0, dcfcFrac = 0.1) {
  const c = DEG[chem] ?? DEG.LFP;
  const pts = [[0, 1], [1, c[0]], [3, c[1]], [5, c[2]], [8, c[3]]];
  const t = Math.max(0, Math.min(8, ageYears));
  let soh = c[3];
  for (let k = 0; k < pts.length - 1; k++) {
    const [t0, s0] = pts[k], [t1, s1] = pts[k + 1];
    if (t >= t0 && t <= t1) { soh = s0 + (s1 - s0) * ((t - t0) / Math.max(1e-9, t1 - t0)); break; }
  }
  const pen = /NMC/.test(chem) ? 0.006 : (chem === 'NA_ION' || chem === 'LTO') ? 0.002 : 0.0015;
  soh -= pen * Math.max(0, dcfcFrac - 0.1) * 10 * Math.min(1, Math.max(0.2, ageYears / 3));
  return Math.max(0.6, Math.min(1, soh));
}
function hvacKw(tempC, acLevel, isCar, heatPump) {
  const lvl = [0, 0.45, 0.8, 1.0][acLevel ?? 1];
  if (tempC < 10) { const b = isCar ? (heatPump ? 1.1 : 3.2) : 0.25;
    return b * lvl * (tempC < -2 ? 1.35 : tempC < 5 ? 1.15 : 1.0) + (isCar ? 0.25 : 0.05); }
  if (tempC > 30) { const b = isCar ? 1.6 : 0.3;
    return b * lvl * (tempC > 40 ? 1.4 : tempC > 35 ? 1.2 : 1.0) + (tempC > 38 && isCar ? 0.5 : 0); }
  return (isCar ? 0.2 : 0.03) * lvl;
}
export function realRange(inp) {
  const chem = inp.chemistry ?? 'LFP';
  const norm = normalizeSpec(inp.batteryKwh, inp.labRangeKm, inp.cycle);
  const seg = segOf(inp.vehicleKg), isCar = seg === '4W';
  const cdaEff = inp.cda * (AERO_CAL[seg] ?? 1);
  const T = inp.tempC ?? 25, cityFrac = inp.cityFrac ?? 0.6;
  const vLab = ((VLAB[inp.cycle]?.[seg]) ?? 50) / 3.6;
  const mLab = inp.vehicleKg + 75, auxLab = isCar ? 0.3 : 0.1;
  const eLabRaw = (0.5 * RHO * cdaEff * vLab ** 3 + inp.crr * mLab * G * vLab) / vLab + auxLab * 1000 / vLab;
  const eLab = eLabRaw * (1 + (OVERHEAD[inp.cycle] ?? 0.25) + (seg === '2W' ? 0.08 : 0));
  const v = Math.max(12, inp.speedKph) / 3.6, wind = (inp.headwindKph ?? 0) / 3.6, vAir = v + wind;
  const mReal = inp.vehicleKg + (inp.riderKg ?? 75) + (inp.pillionKg ?? 0) + (inp.cargoKg ?? 0);
  const hvac = hvacKw(T, inp.acLevel ?? 1, isCar, inp.heatPump ?? isCar);
  const elec = isCar ? 0.25 : 0.06;
  let eReal = (0.5 * RHO * cdaEff * vAir * v * v + inp.crr * mReal * G * v) / v + (hvac + elec) * 1000 / v;
  eReal *= 1 - (REGEN[seg] ?? 0.1) * cityFrac;
  let resist = 1;
  if (T < 10) resist = 1 + (10 - T) * (COLD_K[chem] ?? 0.009);
  else if (T > 33) resist = 1 + (T - 33) * HEAT_K;
  const soh = sohFor(chem, inp.ageYears ?? 0, inp.dcfcFrac ?? 0.1);
  const usable = inp.batteryKwh * (inp.usableSocWindow ?? 0.95) * soh;
  const ratio = eReal / eLab, realWh = norm.baseWhPerKm * ratio * resist;
  const narrative = [`Lab ${inp.labRangeKm} km (${inp.cycle}) → honest ${norm.honestRangeKm.toFixed(0)} km at ${norm.baseWhPerKm.toFixed(0)} Wh/km.`];
  if (mReal > mLab + 5) narrative.push(`+${Math.round(mReal - mLab)} kg over lab → rolling drag +${Math.round((mReal / mLab - 1) * 100)}%.`);
  if (inp.speedKph > vLab * 3.6 + 10) narrative.push(`${inp.speedKph} km/h vs ~${Math.round(vLab * 3.6)} lab anchor: aero penalty ×${ratio.toFixed(2)}.`);
  if (T <= 3) narrative.push(`${T}°C: preheat on wall power, keep 20–80%.`);
  if (T >= 38) narrative.push(`${T}°C: AC + battery chiller ≈ ${hvac.toFixed(1)} kW continuous.`);
  if ((inp.ageYears ?? 0) >= 3) narrative.push(`Age ${inp.ageYears}y → SoH ≈ ${(soh * 100).toFixed(0)}% (${chem}).`);
  const r2 = (n) => Math.round(n * 100) / 100;
  return { realRangeKm: Math.round(((usable * 1000) / realWh) * 10) / 10,
    honestLabKm: norm.honestRangeKm, baseWhPerKm: norm.baseWhPerKm,
    realWhPerKm: Math.round(realWh * 10) / 10, usableKwh: Math.round(usable * 100) / 100,
    sohPct: Math.round(soh * 1000) / 10,
    // audit trail for deep-dive UI (no recompute drift — same numbers as the math above)
    massLabKg: Math.round(mLab), massRealKg: Math.round(mReal),
    vLabKph: Math.round(vLab * 3.6), speedKph: inp.speedKph,
    factors: { speedMult: r2(ratio), massMult: r2(mReal / mLab), climateMult: r2(resist), ageMult: r2(soh), hvacKw: Math.round(hvac * 100) / 100 }, narrative };
}
