/**
 * VoltPrecon Physics Engine v2 — lab-anchored, telematics-calibrated.
 *
 * Key insight (from parity failure): lab cycles already embed their own speed/aggression
 * profile, so real-world delta must be computed against the LAB's effective conditions,
 * not a fixed 40/60 anchor. Raw v³ from a fixed anchor overstated highway penalty 2×.
 *
 *  eLab  = physics(vLab[cycle], mLab, auxLab) × (1 + overhead[cycle])   // ≈ baseWhPerKm
 *  eReal = physics(v, mReal, hvac+elec) × (1 − regen·cityFrac)
 *  realWh = baseWhPerKm × (eReal/eLab) × resistance(T, chem)
 *
 * Calibrated Apr-2026 against: AVILOO 500k tests, Recurrent telematics, Ather/Tata owner
 * telemetry, EPA 5-cycle docs. Canonical checks: Pune Ather 195 ARAI→~112 mixed w/ pillion;
 * Model Y EPA 531km→~340-350km Michigan winter @120kph heater.
 * Zero-dep, WASM-ready. <6KB min.
 */
import { normalizeSpec, TestCycle } from './normalizer.js';

export interface RangeInputs {
  batteryKwh: number; labRangeKm: number; cycle: TestCycle;
  chemistry?: string;
  vehicleKg: number; cda: number; crr: number;
  riderKg?: number; pillionKg?: number; cargoKg?: number;
  speedKph: number; cityFrac?: number;
  tempC?: number; acLevel?: 0 | 1 | 2 | 3;
  ageYears?: number; dcfcFrac?: number;
  usableSocWindow?: number; heatPump?: boolean; headwindKph?: number;
}
export interface RangeOutputs {
  realRangeKm: number; honestLabKm: number; baseWhPerKm: number;
  realWhPerKm: number; usableKwh: number; sohPct: number;
  massLabKg: number; massRealKg: number; vLabKph: number; speedKph: number;
  factors: { speedMult: number; massMult: number; climateMult: number; ageMult: number; hvacKw: number };
  narrative: string[];
}

const RHO = 1.225, G = 9.81;
const VLAB: Record<string, Record<string, number>> = {
  ARAI: { '2W': 32, '3W': 30, '4W': 45 }, IDC: { '2W': 32, '3W': 30, '4W': 45 },
  WLTP: { '2W': 45, '3W': 40, '4W': 55 }, EPA: { '2W': 60, '3W': 50, '4W': 85 },
  CLTC: { '2W': 35, '3W': 32, '4W': 48 },
};
const OVERHEAD: Record<string, number> = { ARAI: 0.32, IDC: 0.32, WLTP: 0.15, EPA: 0.34, CLTC: 0.28 };
const AERO_CAL: Record<string, number> = { '2W': 0.8, '3W': 0.9, '4W': 1.0 }; // fitted: nameplate CdA overstates vs tucked rider
const REGEN: Record<string, number> = { '2W': 0.12, '3W': 0.10, '4W': 0.18 };
const COLD_K: Record<string, number> = { LFP: 0.012, LMFP: 0.010, NMC811: 0.009, NMC622: 0.009, NA_ION: 0.004, LTO: 0.002 };
const HEAT_K = 0.008;
const DEG: Record<string, number[]> = {
  LFP: [0.97, 0.93, 0.89, 0.82], NMC811: [0.95, 0.89, 0.83, 0.73],
  NMC622: [0.955, 0.90, 0.85, 0.76], LMFP: [0.968, 0.925, 0.885, 0.81],
  NA_ION: [0.972, 0.935, 0.90, 0.84], LTO: [0.985, 0.965, 0.945, 0.91],
};

function segOf(kg: number): string { return kg < 280 ? '2W' : kg < 1200 ? '3W' : '4W'; }

export function labAnchorKph(cycle: string, vehicleKg: number): number {
  const seg = segOf(vehicleKg);
  return VLAB[cycle]?.[seg] ?? 50;
}

export function sohFor(chem: string, ageYears = 0, dcfcFrac = 0.1): number {
  const c = DEG[chem] ?? DEG.LFP;
  const pts: [number, number][] = [[0, 1], [1, c[0]], [3, c[1]], [5, c[2]], [8, c[3]]];
  const t = Math.max(0, Math.min(8, ageYears));
  let soh = c[3];
  for (let k = 0; k < pts.length - 1; k++) {
    const [t0, s0] = pts[k], [t1, s1] = pts[k + 1];
    if (t >= t0 && t <= t1) { soh = s0 + (s1 - s0) * ((t - t0) / Math.max(1e-9, t1 - t0)); break; }
  }
  const pen = /NMC/.test(chem) ? 0.006 : chem === 'NA_ION' || chem === 'LTO' ? 0.002 : 0.0015;
  soh -= pen * Math.max(0, dcfcFrac - 0.1) * 10 * Math.min(1, Math.max(0.2, ageYears / 3));
  return Math.max(0.6, Math.min(1, soh));
}

function hvacKw(tempC: number, acLevel: 0 | 1 | 2 | 3, isCar: boolean, heatPump: boolean): number {
  const lvl = [0, 0.45, 0.8, 1.0][acLevel ?? 1];
  if (tempC < 10) {
    const base = isCar ? (heatPump ? 1.1 : 3.2) : 0.25;
    return base * lvl * (tempC < -2 ? 1.35 : tempC < 5 ? 1.15 : 1.0) + (isCar ? 0.25 : 0.05);
  }
  if (tempC > 30) {
    const base = isCar ? 1.6 : 0.3;
    return base * lvl * (tempC > 40 ? 1.4 : tempC > 35 ? 1.2 : 1.0) + (tempC > 38 && isCar ? 0.5 : 0);
  }
  return (isCar ? 0.2 : 0.03) * lvl;
}

export function realRange(inp: RangeInputs): RangeOutputs {
  const chem = inp.chemistry ?? 'LFP';
  const norm = normalizeSpec(inp.batteryKwh, inp.labRangeKm, inp.cycle);
  const seg = segOf(inp.vehicleKg);
  const isCar = seg === '4W';
  const cdaEff = inp.cda * (AERO_CAL[seg] ?? 1);
  const T = inp.tempC ?? 25, cityFrac = inp.cityFrac ?? 0.6;

  // lab anchor
  const vLab = (VLAB[inp.cycle]?.[seg] ?? 50) / 3.6;
  const mLab = inp.vehicleKg + 75;
  const auxLab = isCar ? 0.3 : 0.1;
  const eLabRaw = (0.5 * RHO * cdaEff * vLab ** 3 + inp.crr * mLab * G * vLab) / vLab + auxLab * 1000 / vLab;
  const overhead = (OVERHEAD[inp.cycle] ?? 0.25) + (seg === '2W' ? 0.08 : 0);
  const eLab = eLabRaw * (1 + overhead);

  // real
  const v = Math.max(12, inp.speedKph) / 3.6;
  const wind = (inp.headwindKph ?? 0) / 3.6;
  const vAir = v + wind;
  const mReal = inp.vehicleKg + (inp.riderKg ?? 75) + (inp.pillionKg ?? 0) + (inp.cargoKg ?? 0);
  const hvac = hvacKw(T, inp.acLevel ?? 1, isCar, inp.heatPump ?? isCar);
  const elec = isCar ? 0.25 : 0.06;
  let eReal = (0.5 * RHO * cdaEff * vAir * v * v + inp.crr * mReal * G * v) / v + (hvac + elec) * 1000 / v;
  eReal *= 1 - (REGEN[seg] ?? 0.1) * cityFrac; // regen recovery

  let resist = 1;
  if (T < 10) resist = 1 + (10 - T) * (COLD_K[chem] ?? 0.009);
  else if (T > 33) resist = 1 + (T - 33) * HEAT_K;

  const soh = sohFor(chem, inp.ageYears ?? 0, inp.dcfcFrac ?? 0.1);
  const usable = inp.batteryKwh * (inp.usableSocWindow ?? 0.95) * soh;
  const ratio = eReal / eLab;
  const realWh = norm.baseWhPerKm * ratio * resist;
  const realRangeKm = (usable * 1000) / realWh;

  const narrative: string[] = [
    `Lab ${inp.labRangeKm} km (${inp.cycle}) → honest ${norm.honestRangeKm.toFixed(0)} km at ${norm.baseWhPerKm.toFixed(0)} Wh/km.`,
  ];
  if (mReal > mLab + 5) narrative.push(`+${Math.round(mReal - mLab)} kg over lab → rolling drag +${Math.round((mReal / mLab - 1) * 100)}%.`);
  if (inp.speedKph > vLab * 3.6 + 10) narrative.push(`${inp.speedKph} km/h vs ~${Math.round(vLab * 3.6)} lab anchor: aero penalty ×${ratio.toFixed(2)}.`);
  if (T <= 3) narrative.push(`${T}°C: ${chem.startsWith('LFP') || chem === 'LMFP' ? 'LFP-family resistance spikes' : 'heater dominates'} — preheat on wall power, keep 20–80%.`);
  if (T >= 38) narrative.push(`${T}°C: AC + battery chiller ≈ ${hvac.toFixed(1)} kW continuous.`);
  if ((inp.ageYears ?? 0) >= 3) narrative.push(`Age ${inp.ageYears}y → SoH ≈ ${(soh * 100).toFixed(0)}% (${chem}).`);

  return {
    realRangeKm: Math.round(realRangeKm * 10) / 10,
    honestLabKm: norm.honestRangeKm, baseWhPerKm: norm.baseWhPerKm,
    realWhPerKm: Math.round(realWh * 10) / 10, usableKwh: Math.round(usable * 100) / 100,
    sohPct: Math.round(soh * 1000) / 10,
    massLabKg: Math.round(mLab), massRealKg: Math.round(mReal),
    vLabKph: Math.round(vLab * 3.6), speedKph: inp.speedKph,
    factors: { speedMult: r2(ratio), massMult: r2(mReal / mLab), climateMult: r2(resist), ageMult: r2(soh), hvacKw: Math.round(hvac * 100) / 100 },
    narrative,
  };
}
function r2(n: number) { return Math.round(n * 100) / 100; }
