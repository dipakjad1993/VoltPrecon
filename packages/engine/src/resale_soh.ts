/**
 * Battery Passport Lite + Resale Forecaster.
 * SoH estimator: photo/OBD-lite inputs (cycles, dcfc share, calendar age, swelling flag)
 * Resale: segment depreciation × SoH band × chemistry modifier (chemistries.json).
 */
import { sohFor } from './physics.js';

export interface SohInputs { chemistry?: string; ageYears: number; cycles?: number; dcfcFrac?: number; alwaysFull?: boolean; hotClimate?: boolean; odoKm?: number; ratedKwh?: number; }
export interface SohOutputs { sohPct: number; band: 'Excellent' | 'Good' | 'Fair' | 'Weak'; remainingFastCharges: number; advice: string[]; }

const CHEM_CYCLES: Record<string, number> = { LFP: 3500, LMFP: 2800, NA_ION: 3000, NMC811: 1500, NMC622: 1800, LTO: 15000 };

export function estimateSoh(p: SohInputs): SohOutputs {
  const chem = p.chemistry ?? 'LFP';
  let soh = sohFor(chem, p.ageYears, p.dcfcFrac ?? 0.15) * 100;
  if ((p.cycles ?? 0) > 0) {
    const life = CHEM_CYCLES[chem] ?? 2500;
    const cycleSoh = 100 - ((p.cycles as number) / life) * 20; // to 80% at rated life
    soh = Math.min(soh, cycleSoh);
  }
  if (p.alwaysFull) soh -= 2.5;
  if (p.hotClimate && /NMC/.test(chem)) soh -= 2;
  soh = Math.max(60, Math.min(100, soh));
  const band = soh >= 92 ? 'Excellent' : soh >= 86 ? 'Good' : soh >= 78 ? 'Fair' : 'Weak';
  const life = CHEM_CYCLES[chem] ?? 2500;
  const used = p.cycles ?? Math.round((p.odoKm ?? 30000) / 120);
  const remainingFastCharges = Math.max(0, Math.round((life * 0.6 - used * (p.dcfcFrac ?? 0.15)) / 1));
  const advice: string[] = [];
  if (/NMC/.test(chem)) advice.push('Cap daily charge at 80%; 100% only before trips. NMC hates heat + full + fast combined.');
  else advice.push('LFP/LMFP/Na-ion: 100% once a week is FINE (helps BMS calibrate). Daily DCFC still ages it — home charge when you can.');
  if ((p.dcfcFrac ?? 0) > 0.4) advice.push('DCFC share >40%: expected life −15–25%. Shift 2 sessions/week to slow charging.');
  if (band === 'Weak') advice.push('Get an AVILOO-style independent test before buying/selling — 13.5% variance found in 500k tests; paperwork protects price.');
  return { sohPct: Math.round(soh * 10) / 10, band, remainingFastCharges, advice };
}

const RESALE_MOD: Record<string, number> = { LFP: 1.06, LMFP: 1.04, NA_ION: 0.94, NMC811: 0.97, NMC622: 0.98, LTO: 1.0 };
const SEG_DEP: Record<string, number[]> = { // value fraction at y1/y3/y5
  '2W': [0.78, 0.52, 0.36], '3W': [0.75, 0.50, 0.34], '4W': [0.80, 0.58, 0.42],
};
export function resaleForecast(pricePaid: number, seg: '2W' | '3W' | '4W', chemistry: string, sohPct: number, year: 1 | 3 | 5) {
  const d = SEG_DEP[seg];
  const base = year === 1 ? d[0] : year === 3 ? d[1] : d[2];
  const sohMult = sohPct >= 92 ? 1.08 : sohPct >= 86 ? 1.0 : sohPct >= 78 ? 0.9 : 0.78;
  const val = pricePaid * base * (RESALE_MOD[chemistry] ?? 1) * sohMult;
  return { value: Math.round(val), pctOfNew: Math.round((val / Math.max(1, pricePaid)) * 1000) / 10, sohPct };
}
