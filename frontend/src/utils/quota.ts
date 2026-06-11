/**
 * Quota <-> USD conversion — the single source of truth for amount math.
 *
 * The backend stores amounts as integer "quota units" where
 * QUOTA_PER_UNIT units == $1 (see backend common/constants.go QuotaPerUnit).
 * Every display divides by it; every submission multiplies and rounds.
 * Never inline the constant anywhere else.
 */

export const QUOTA_PER_UNIT = 500000

/** Integer quota units -> USD (display). */
export function quotaToUSD(quota: number): number {
  if (!Number.isFinite(quota)) return 0
  return quota / QUOTA_PER_UNIT
}

/** USD -> integer quota units (submission). */
export function usdToQuota(usd: number): number {
  if (!Number.isFinite(usd)) return 0
  return Math.round(usd * QUOTA_PER_UNIT)
}

/** Format quota units as a dollar string, e.g. 100000 -> "$0.20". */
export function formatQuotaUSD(quota: number, fractionDigits = 2): string {
  return `$${quotaToUSD(quota).toFixed(fractionDigits)}`
}
