/**
 * VoltPrecon subsidy engine (typed reference — runtime truth is subsidy.js).
 * PM E-DRIVE expiry is date-driven, never silent. See subsidy.js.
 */
export const PM_EDRIVE_END_IST = '2026-07-31T23:59:59+05:30';
export const PM_EDRIVE_END_MS: number = Date.parse(PM_EDRIVE_END_IST);
export const PM_EDRIVE_PER_KWH = 5000;
export const PM_EDRIVE_CAP: Record<string, number> = { '2W': 10000, '3W': 50000 };

export interface EdriveStatus { active: boolean; expired: boolean; daysLeft: number; daysSince?: number }
export interface EdriveResult { amount: number; status: 'applied' | 'expired' | 'inapplicable'; note: string }

export function pmEdriveStatus(nowMs: number = Date.now()): EdriveStatus {
  const ms = Number(nowMs);
  if (Number.isNaN(ms)) return { active: false, expired: true, daysLeft: 0 };
  if (ms <= PM_EDRIVE_END_MS) {
    return { active: true, expired: false, daysLeft: Math.max(0, Math.ceil((PM_EDRIVE_END_MS - ms) / 864e5)) };
  }
  return { active: false, expired: true, daysLeft: 0, daysSince: Math.floor((ms - PM_EDRIVE_END_MS) / 864e5) };
}

export function pmEdriveSubsidy(p: { tariffCode?: string; segment?: string; batteryKwh?: number; nowMs?: number } = {}): EdriveResult {
  const code = String(p.tariffCode ?? '');
  const seg = String(p.segment ?? '');
  const seg2 = seg.startsWith('2W') ? '2W' : seg.startsWith('3W') ? '3W' : '4W';
  if (!code.startsWith('IN') || (seg2 !== '2W' && seg2 !== '3W')) {
    return { amount: 0, status: 'inapplicable', note: 'No PM E-DRIVE for this variant/region.' };
  }
  const st = pmEdriveStatus(p.nowMs ?? Date.now());
  if (!st.active) {
    return { amount: 0, status: 'expired', note: `PM E-DRIVE ended 31 Jul 2026 (expired ${st.daysSince ?? 0} days ago) — ₹0 applied. TCO below is post-subsidy; verify state top-ups with your dealer.` };
  }
  const amount = Math.min(PM_EDRIVE_PER_KWH * Number(p.batteryKwh || 0), PM_EDRIVE_CAP[seg2]);
  return { amount, status: 'applied', note: `PM E-DRIVE ₹${amount.toLocaleString('en-IN')} applied — EXPIRES 31 Jul 2026 (${st.daysLeft} days left). Invoice+register before midnight.` };
}
