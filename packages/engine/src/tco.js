// VoltPrecon TCO runtime (plain JS ESM). Mirrors tco.ts.
export function trueTco(p) {
  const yrs = p.years ?? 5, dpy = p.daysPerYear ?? 300;
  const kmY = p.kmPerDay * dpy, kmT = kmY * yrs;
  const blended = (p.homeFrac ?? 0.8) * p.homeKwhPrice + (1 - (p.homeFrac ?? 0.8)) * p.dcfcKwhPrice;
  const energyEvY = (p.realWhPerKm / 1000) * kmY * blended;
  const fuelIceY = (kmY / p.iceKmPerL) * p.fuelPerL;
  const capexEv = p.priceEv - (p.subsidyEv ?? 0), capexIce = p.priceIce;
  const insEv = Array.from({ length: yrs }, (_, i) => p.insuranceEvYear1 * Math.pow(1 - 0.08, i));
  const insIce = Array.from({ length: yrs }, (_, i) => p.insuranceIceYear1 * Math.pow(1 - 0.08, i));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const totalEv = capexEv + energyEvY * yrs + p.maintEvPerKm * kmT + sum(insEv) + (p.tyreEvPerKm ?? 0.15) * kmT + (p.batteryReplaceReservePerKm ?? 0) * kmT;
  const totalIce = capexIce + fuelIceY * yrs + p.maintIcePerKm * kmT + sum(insIce) + (p.tyreIcePerKm ?? 0.25) * kmT;
  let interestEv = 0, interestIce = 0, loanNote = 'Cash purchase.';
  if ((p.loanAprPct ?? 0) > 0 && (p.loanYears ?? 0) > 0) {
    const r = p.loanAprPct / 100, princ = (v) => v * (1 - (p.loanDownPct ?? 0.2));
    interestEv = princ(capexEv) * r * p.loanYears * 0.55; interestIce = princ(capexIce) * r * p.loanYears * 0.55;
    loanNote = `${p.loanAprPct}% x ${p.loanYears}y. Interest EV ${Math.round(interestEv).toLocaleString('en-IN')} vs ICE ${Math.round(interestIce).toLocaleString('en-IN')}.`;
  }
  const tEv = totalEv + interestEv, tIce = totalIce + interestIce;
  // Monthly schedule uses the SAME yearly components as the totals (declining
  // insurance included) — breakeven can never contradict horizon savings.
  const maintEvY = p.maintEvPerKm * kmY, maintIceY = p.maintIcePerKm * kmY;
  const tyreEvY = (p.tyreEvPerKm ?? 0.15) * kmY, tyreIceY = (p.tyreIcePerKm ?? 0.25) * kmY;
  const intEvY = interestEv / yrs, intIceY = interestIce / yrs;
  const monthly = []; let be = null, cumEv = capexEv, cumIce = capexIce;
  monthly.push({ m: 0, cumEv: Math.round(cumEv), cumIce: Math.round(cumIce) });
  for (let m = 1; m <= yrs * 12; m++) {
    const y = Math.min(yrs - 1, Math.floor((m - 1) / 12));
    cumEv += (energyEvY + maintEvY + tyreEvY + insEv[y] + intEvY) / 12;
    cumIce += (fuelIceY + maintIceY + tyreIceY + insIce[y] + intIceY) / 12;
    monthly.push({ m, cumEv: Math.round(cumEv), cumIce: Math.round(cumIce) });
    if (be === null && cumEv <= cumIce) be = m;
  }
  // Stable-breakeven rule: a first-crossing that later reverses reports null.
  if (be !== null) {
    const last = monthly[monthly.length - 1];
    if (last.cumEv > last.cumIce) be = null;
  }
  const co2SavedT = (((p.co2PerLitre ?? 2.31) * kmT) / Math.max(6, p.iceKmPerL) - (p.co2PerKwh ?? 0.7) * (p.realWhPerKm / 1000) * kmT) / 1000;
  return { capexEv: Math.round(capexEv), capexIce: Math.round(capexIce),
    energyEvYear: Math.round(energyEvY), fuelIceYear: Math.round(fuelIceY),
    totalEv: Math.round(tEv), totalIce: Math.round(tIce), savings: Math.round(tIce - tEv),
    savingsPct: Math.round(((tIce - tEv) / Math.max(1, tIce)) * 1000) / 10,
    costPerKmEv: Math.round((tEv / Math.max(1, kmT)) * 100) / 100,
    costPerKmIce: Math.round((tIce / Math.max(1, kmT)) * 100) / 100,
    breakevenMonth: be, monthly, co2SavedT: Math.round(co2SavedT * 100) / 100, loanNote };
}
export const MAINT_DEFAULTS = {
  '2W': { ev: 0.30, ice: 1.20, iceKmpl: 50 }, '3W': { ev: 0.45, ice: 1.60, iceKmpl: 30 }, '4W': { ev: 0.90, ice: 4.20, iceKmpl: 15 } };
