// VoltPrecon subsidy engine — PM E-DRIVE expiry is DATE-DRIVEN, never silent.
// P0 fix: compute() previously applied the subsidy whenever tariff was IN + 2W/3W,
// with no date check — after 31 Jul 2026 it kept discounting AND showed negative
// "days left". This module is the single source of truth, imported by apps/web/app.js
// AND packages/api/src/server.js, and pinned by unit tests with explicit nowMs so
// CI stays green regardless of the wall-clock date. Zero-dep.
export const PM_EDRIVE_END_IST = '2026-07-31T23:59:59+05:30';
export const PM_EDRIVE_END_MS = Date.parse(PM_EDRIVE_END_IST);
export const PM_EDRIVE_PER_KWH = 5000;
export const PM_EDRIVE_CAP = { '2W': 10000, '3W': 50000 };

export function pmEdriveStatus(nowMs = Date.now()) {
  const ms = Number(nowMs);
  if (Number.isNaN(ms)) return { active: false, expired: true, daysLeft: 0 };
  if (ms <= PM_EDRIVE_END_MS) {
    const daysLeft = Math.max(0, Math.ceil((PM_EDRIVE_END_MS - ms) / 864e5));
    return { active: true, expired: false, daysLeft };
  }
  const daysSince = Math.floor((ms - PM_EDRIVE_END_MS) / 864e5);
  return { active: false, expired: true, daysLeft: 0, daysSince };
}

// Single entry point. Returns { amount, status, note } where status is one of:
// 'applied' (IN 2W/3W, scheme live) | 'expired' (IN 2W/3W, scheme over -> amount 0)
// | 'inapplicable' (4W or non-IN -> amount 0, conservative explainer).
export function pmEdriveSubsidy({ tariffCode = '', segment = '', batteryKwh = 0, nowMs = Date.now() } = {}) {
  const code = String(tariffCode);
  const seg2 = String(segment).startsWith('2W') ? '2W' : String(segment).startsWith('3W') ? '3W' : '4W';
  const inIN = code.startsWith('IN');
  if (!inIN || (seg2 !== '2W' && seg2 !== '3W')) {
    return { amount: 0, status: 'inapplicable', note: 'No PM E-DRIVE for this variant/region.' };
  }
  const st = pmEdriveStatus(nowMs);
  const cap = PM_EDRIVE_CAP[seg2];
  if (!st.active) {
    return {
      amount: 0, status: 'expired',
      note: `PM E-DRIVE ended 31 Jul 2026 (expired ${st.daysSince ?? 0} days ago) — ₹0 applied. TCO below is post-subsidy; verify state top-ups with your dealer.`,
    };
  }
  const amount = Math.min(PM_EDRIVE_PER_KWH * Number(batteryKwh || 0), cap);
  return {
    amount, status: 'applied',
    note: `PM E-DRIVE ₹${amount.toLocaleString('en-IN')} applied — EXPIRES 31 Jul 2026 (${st.daysLeft} days left). Invoice+register before midnight.`,
  };
}
