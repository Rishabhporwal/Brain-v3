/**
 * Brain number/currency formatting — the single seam for every money & quantity shown in the UI.
 * Standard (architecture §6): currency-aware + INDIAN numbering (lakh/crore grouping). No surface should
 * call toLocaleString or hard-code ₹/$ — always go through here so India and GCC render correctly.
 *
 * Money is stored as integer minor units + currency code (matches the DB monetary standard); pass minor
 * units in and this scales by the currency's exponent.
 */

export type CurrencyCode = 'INR' | 'AED' | 'SAR' | 'BHD' | 'OMR' | 'QAR' | 'KWD' | 'USD'

// exponent = number of minor-unit decimals (mirrors reference.currencies.minor_unit in the DB)
const CURRENCY: Record<CurrencyCode, { symbol: string; exponent: number; locale: string }> = {
  INR: { symbol: '₹', exponent: 2, locale: 'en-IN' },
  AED: { symbol: 'د.إ', exponent: 2, locale: 'ar-AE' },
  SAR: { symbol: '﷼', exponent: 2, locale: 'ar-SA' },
  BHD: { symbol: '.د.ب', exponent: 3, locale: 'ar-BH' },
  OMR: { symbol: '﷼', exponent: 3, locale: 'ar-OM' },
  QAR: { symbol: '﷼', exponent: 2, locale: 'ar-QA' },
  KWD: { symbol: 'د.ك', exponent: 3, locale: 'ar-KW' },
  USD: { symbol: '$', exponent: 2, locale: 'en-US' },
}

const isIndian = (c: CurrencyCode) => c === 'INR'

/** Minor units (e.g. paise) → major decimal number (e.g. rupees). */
export function fromMinor(amountMinor: number, currency: CurrencyCode = 'INR'): number {
  return amountMinor / 10 ** CURRENCY[currency].exponent
}

/** Format a money value given in MINOR units. `compact` uses lakh/crore (INR) or K/M/B. */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode = 'INR',
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  const { symbol, exponent } = CURRENCY[currency]
  const value = fromMinor(amountMinor, currency)
  if (opts.compact) return `${symbol}${formatCompact(value, currency)}`
  const decimals = opts.decimals ?? (Math.abs(value) >= 1000 ? 0 : exponent)
  return `${symbol}${formatNumber(value, currency, decimals)}`
}

/** Group a plain number with Indian (1,23,456) or Western (123,456) separators. */
export function formatNumber(value: number, currency: CurrencyCode = 'INR', decimals = 0): string {
  return new Intl.NumberFormat(isIndian(currency) ? 'en-IN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Compact magnitude: INR → K / L (lakh) / Cr (crore); others → K / M / B. */
export function formatCompact(value: number, currency: CurrencyCode = 'INR'): string {
  const sign = value < 0 ? '-' : ''
  const n = Math.abs(value)
  const f = (x: number) => (x % 1 === 0 ? x.toString() : x.toFixed(2))
  if (isIndian(currency)) {
    if (n >= 1e7) return `${sign}${f(n / 1e7)} Cr`
    if (n >= 1e5) return `${sign}${f(n / 1e5)} L`
    if (n >= 1e3) return `${sign}${f(n / 1e3)} K`
    return `${sign}${f(n)}`
  }
  if (n >= 1e9) return `${sign}${f(n / 1e9)}B`
  if (n >= 1e6) return `${sign}${f(n / 1e6)}M`
  if (n >= 1e3) return `${sign}${f(n / 1e3)}K`
  return `${sign}${f(n)}`
}

/** Quantity (orders, units) — Indian grouping, no currency. */
export function formatQty(value: number, currency: CurrencyCode = 'INR'): string {
  return formatNumber(value, currency, 0)
}

/** Ratio (0.1234) → "12.3%". Pass `alreadyPercent` if the value is already 0-100. */
export function formatPercent(value: number, decimals = 1, alreadyPercent = false): string {
  const pct = alreadyPercent ? value : value * 100
  return `${pct.toFixed(decimals)}%`
}

/** Signed delta with explicit + for positives — for MoM/DoD movement chips. */
export function formatDelta(value: number, kind: 'percent' | 'number' = 'percent'): string {
  const s = value > 0 ? '+' : ''
  return kind === 'percent' ? `${s}${formatPercent(value, 1)}` : `${s}${formatNumber(value)}`
}

export const currencySymbol = (c: CurrencyCode = 'INR') => CURRENCY[c].symbol
