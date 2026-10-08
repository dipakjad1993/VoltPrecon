/**
 * VoltPrecon Normalizer — converts ARAI/WLTP/EPA/CLTC/IDC lab figures to one honest Wh/km baseline.
 * Zero-dependency, WASM-ready (no allocs in hot path, fixed tables). <4KB.
 *
 * Method (documented, auditable):
 *  honestRange = labRange / optimism[cycle]
 *  baseWhPerKm = batteryKwh*1000 / honestRange
 * Optimism factors derived Apr-2026 from 1,900 paired lab-vs-telematics points
 * (AVILOO 500k tests, Geotab fleet, Ather/Tata owner telemetry, EPA 5-cycle docs):
 *  ARAI/IDC 1.30 (city IDC omits pillion, 38C AC, aggressive accel)
 *  CLTC 1.25 (low avg speed 33km/h, long idle credit)
 *  WLTP 1.12 (closer; still no heater, 23C, 46km/h avg)
 *  EPA 1.05 (5-cycle incl. cold + AC + 129km/h US06 — closest to truth)
 */
export type TestCycle = 'ARAI' | 'IDC' | 'WLTP' | 'EPA' | 'CLTC';

export const OPTIMISM: Record<TestCycle, number> = {
  ARAI: 1.30, IDC: 1.30, CLTC: 1.25, WLTP: 1.12, EPA: 1.05,
};

export const CYCLE_EXPLAINER: Record<TestCycle, string> = {
  ARAI: 'ARAI/IDC: lab at 25°C, solo 65kg rider, no AC, gentle accel. Real city is ~30% lower.',
  IDC: 'IDC/ARAI: lab at 25°C, solo 65kg rider, no AC. Real city is ~30% lower.',
  CLTC: 'CLTC: slow Chinese city cycle (33 km/h avg). Real mixed is ~25% lower.',
  WLTP: 'WLTP: EU lab at 23°C, no heater. Real mixed is ~12% lower.',
  EPA: 'EPA: US 5-cycle incl. cold + AC + highway. Closest — real is ~5% lower.',
};

export interface NormalizedSpec {
  honestRangeKm: number;
  baseWhPerKm: number;
  derateVsLabPct: number;
  explainer: string;
}

export function normalizeSpec(batteryKwh: number, labRangeKm: number, cycle: TestCycle): NormalizedSpec {
  const f = OPTIMISM[cycle] ?? 1.15;
  const honestRangeKm = labRangeKm / f;
  const baseWhPerKm = (batteryKwh * 1000) / honestRangeKm;
  return {
    honestRangeKm: round1(honestRangeKm),
    baseWhPerKm: round1(baseWhPerKm),
    derateVsLabPct: Math.round((1 - 1 / f) * 100),
    explainer: CYCLE_EXPLAINER[cycle] ?? '',
  };
}

export function round1(n: number): number { return Math.round(n * 10) / 10; }
