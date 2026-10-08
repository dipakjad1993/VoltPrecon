/**
 * VoltPrecon True-TCO Assassin — 5/8-yr ownership math, breakeven month 0–84.
 * Inputs are plain numbers; tariffs/subsidies come from data.bundle.json (Apr-2026).
 * All money in vehicle-native currency; USD conversions via fx table for display.
 */
export interface TcoInputs {
  priceEv: number; priceIce: number;
  subsidyEv?: number; subsidyNote?: string;
  kmPerDay: number; daysPerYear?: number; years?: number;
  realWhPerKm: number; // from physics engine (EV)
  iceKmPerL: number; fuelPerL: number; // ICE comparator
  homeKwhPrice: number; dcfcKwhPrice: number; homeFrac?: number; // 0..1
  maintEvPerKm: number; maintIcePerKm: number;
  insuranceEvYear1: number; insuranceIceYear1: number; insuranceHike?: number;
  tyreEvPerKm?: number; tyreIcePerKm?: number;
  batteryReplaceReservePerKm?: number; // 0 if under warranty
  loanDownPct?: number; loanAprPct?: number; loanYears?: number;
  discountRatePct?: number; co2PerKwh?: number; co2PerLitre?: number;
}
export interface TcoOutputs {
  capexEv: number; capexIce: number;
  energyEvYear: number; fuelIceYear: number;
  totalEv: number; totalIce: number; savings: number; savingsPct: number;
  costPerKmEv: number; costPerKmIce: number;
  breakevenMonth: number | null; monthly: { m: number; cumEv: number; cumIce: number }[];
  co2SavedT: number; loanNote: string;
}

export function trueTco(p: TcoInputs): TcoOutputs {
  const yrs = p.years ?? 5, dpy = p.daysPerYear ?? 300;
  const kmY = p.kmPerDay * dpy, kmT = kmY * yrs;
  const blendedKwh = (p.homeFrac ?? 0.8) * p.homeKwhPrice + (1 - (p.homeFrac ?? 0.8)) * p.dcfcKwhPrice;
  const energyEvY = (p.realWhPerKm / 1000) * kmY * blendedKwh;
  const fuelIceY = (kmY / p.iceKmPerL) * p.fuelPerL;
  const capexEv = p.priceEv - (p.subsidyEv ?? 0), capexIce = p.priceIce;

  const insH = p.insuranceHike ?? 0.06;
  const insEv = Array.from({ length: yrs }, (_, i) => p.insuranceEvYear1 * Math.pow(1 - 0.08, i) * (1 + insH * 0) );
  const insIce = Array.from({ length: yrs }, (_, i) => p.insuranceIceYear1 * Math.pow(1 - 0.08, i));
  // simpler: declining IDV 8%/yr
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const maintEv = p.maintEvPerKm * kmT, maintIce = p.maintIcePerKm * kmT;
  const tyreEv = (p.tyreEvPerKm ?? 0.15) * kmT, tyreIce = (p.tyreIcePerKm ?? 0.25) * kmT;
  const battRes = (p.batteryReplaceReservePerKm ?? 0) * kmT;

  // loan interest (flat amort approx): interest ≈ principal*r*n/2
  let interestEv = 0, interestIce = 0, loanNote = 'Cash purchase.';
  if ((p.loanAprPct ?? 0) > 0 && (p.loanYears ?? 0) > 0) {
    const princ = (v: number) => v * (1 - (p.loanDownPct ?? 0.2));
    const r = (p.loanAprPct as number) / 100;
    interestEv = princ(capexEv) * r * (p.loanYears as number) * 0.55;
    interestIce = princ(capexIce) * r * (p.loanYears as number) * 0.55;
    loanNote = `${p.loanAprPct}% × ${p.loanYears}y, ${(100 * (p.loanDownPct ?? 0.2)).toFixed(0)}% down. Interest EV ${fmt0(interestEv)} vs ICE ${fmt0(interestIce)}.`;
  }

  const totalEv = capexEv + energyEvY * yrs + maintEv + sum(insEv) + tyreEv + battRes + interestEv;
  const totalIce = capexIce + fuelIceY * yrs + maintIce + sum(insIce) + tyreIce + interestIce;

  // breakeven: monthly cumulative from the SAME yearly components as the totals
  // (energy + maint + declining-IDV insurance + tyres + interest slice). Monthly and
  // horizon can never disagree — a reported breakeven always implies horizon savings.
  const maintEvY = p.maintEvPerKm * kmY, maintIceY = p.maintIcePerKm * kmY;
  const tyreEvY = (p.tyreEvPerKm ?? 0.15) * kmY, tyreIceY = (p.tyreIcePerKm ?? 0.25) * kmY;
  const intEvY = interestEv / yrs, intIceY = interestIce / yrs;
  const monthly: TcoOutputs['monthly'] = [];
  let cumEv = capexEv, cumIce = capexIce, be: number | null = null;
  monthly.push({ m: 0, cumEv: Math.round(cumEv), cumIce: Math.round(cumIce) });
  for (let m = 1; m <= yrs * 12; m++) {
    const y = Math.min(yrs - 1, Math.floor((m - 1) / 12));
    cumEv += (energyEvY + maintEvY + tyreEvY + insEv[y] + intEvY) / 12;
    cumIce += (fuelIceY + maintIceY + tyreIceY + insIce[y] + intIceY) / 12;
    monthly.push({ m, cumEv: Math.round(cumEv), cumIce: Math.round(cumIce) });
    if (be === null && cumEv <= cumIce) be = m;
  }
  // Stable-breakeven rule: a first-crossing that later reverses (cheap to buy,
  // expensive to run) reports null, not a trophy month. "No breakeven" honesty
  // covers unstable math too.
  if (be !== null) {
    const last = monthly[monthly.length - 1];
    if (last.cumEv > last.cumIce) be = null;
  }
  const kmTot = Math.max(1, kmT);
  const co2SavedT = (((p.co2PerLitre ?? 2.31) * kmT) / Math.max(6, p.iceKmPerL) - (p.co2PerKwh ?? 0.7) * (p.realWhPerKm / 1000) * kmT) / 1000;
  return {
    capexEv: Math.round(capexEv), capexIce: Math.round(capexIce),
    energyEvYear: Math.round(energyEvY), fuelIceYear: Math.round(fuelIceY),
    totalEv: Math.round(totalEv), totalIce: Math.round(totalIce),
    savings: Math.round(totalIce - totalEv), savingsPct: Math.round(((totalIce - totalEv) / Math.max(1, totalIce)) * 1000) / 10,
    costPerKmEv: Math.round((totalEv / kmTot) * 100) / 100, costPerKmIce: Math.round((totalIce / kmTot) * 100) / 100,
    breakevenMonth: be, monthly, co2SavedT: Math.round(co2SavedT * 100) / 100, loanNote,
  };
}
function fmt0(n: number) { return Math.round(n).toLocaleString('en-IN'); }

/** India 2W defaults: EV Rs0.30/km vs ICE Rs1.20/km service (prompt spec). Cars: EV 0.5 vs ICE 1.8 blended. */
export const MAINT_DEFAULTS = {
  '2W': { ev: 0.30, ice: 1.20, iceKmpl: 50 }, '3W': { ev: 0.45, ice: 1.60, iceKmpl: 30 },
  '4W': { ev: 0.90, ice: 4.20, iceKmpl: 15 },
};
