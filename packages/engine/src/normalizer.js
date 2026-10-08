// VoltPrecon normalizer runtime (plain JS ESM — browser + node + 3G safe). Mirrors normalizer.ts.
export const OPTIMISM = { ARAI: 1.30, IDC: 1.30, CLTC: 1.25, WLTP: 1.12, EPA: 1.05 };
export const CYCLE_EXPLAINER = {
  ARAI: 'ARAI/IDC: lab at 25°C, solo 65kg rider, no AC, gentle accel. Real city is ~30% lower.',
  IDC: 'IDC/ARAI: lab at 25°C, solo 65kg rider, no AC. Real city is ~30% lower.',
  CLTC: 'CLTC: slow Chinese city cycle (33 km/h avg). Real mixed is ~25% lower.',
  WLTP: 'WLTP: EU lab at 23°C, no heater. Real mixed is ~12% lower.',
  EPA: 'EPA: US 5-cycle incl. cold + AC + highway. Closest — real is ~5% lower.',
};
export function normalizeSpec(batteryKwh, labRangeKm, cycle) {
  const f = OPTIMISM[cycle] ?? 1.15;
  const honestRangeKm = labRangeKm / f;
  return { honestRangeKm: r1(honestRangeKm), baseWhPerKm: r1((batteryKwh * 1000) / honestRangeKm),
    derateVsLabPct: Math.round((1 - 1 / f) * 100), explainer: CYCLE_EXPLAINER[cycle] ?? '' };
}
function r1(n) { return Math.round(n * 10) / 10; }
