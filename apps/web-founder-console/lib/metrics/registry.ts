/**
 * Metric registry — the single source of KPI definitions for the UI (labels, help text, render format).
 * Surfaces NEVER inline a KPI label or formatting; they reference this registry so the console stays
 * honest against the backend metric engine. Values arrive from the BFF; this only governs presentation.
 */
import type { CurrencyCode } from '@/lib/format'
import { formatMoney, formatPercent, formatQty } from '@/lib/format'

export type MetricFormat = 'money' | 'money_compact' | 'qty' | 'percent' | 'ratio'

export interface MetricDef {
  id: string
  label: string
  format: MetricFormat
  help?: string
}

export const METRICS = {
  realized_revenue: {
    id: 'realized_revenue',
    label: 'Realized Revenue',
    format: 'money_compact',
    help: 'Revenue that survived cancellation, RTO, refund and settlement — not placed or platform-reported.',
  },
  cm2: {
    id: 'cm2',
    label: 'CM2',
    format: 'money_compact',
    help: 'Contribution margin after COGS, fees, shipping, COD, RTO, returns and marketing.',
  },
  cm2_margin: { id: 'cm2_margin', label: 'CM2 Margin', format: 'percent' },
  orders: { id: 'orders', label: 'Orders', format: 'qty' },
  aov: { id: 'aov', label: 'AOV', format: 'money' },
  mer: { id: 'mer', label: 'MER', format: 'ratio', help: 'Marketing efficiency ratio = revenue ÷ ad spend.' },
  rto_rate: { id: 'rto_rate', label: 'RTO Rate', format: 'percent' },
  cod_share: { id: 'cod_share', label: 'COD Share', format: 'percent' },
  prepaid_share: { id: 'prepaid_share', label: 'Prepaid Share', format: 'percent' },
  refund_rate: { id: 'refund_rate', label: 'Refund Rate', format: 'percent' },

  // Customer
  ltv: { id: 'ltv', label: 'LTV', format: 'money_compact', help: 'Predicted lifetime value (CM2-based).' },
  cac: { id: 'cac', label: 'CAC', format: 'money' },
  ltv_cac: { id: 'ltv_cac', label: 'LTV : CAC', format: 'ratio' },
  repeat_rate: { id: 'repeat_rate', label: 'Repeat Rate', format: 'percent' },
  churn_rate: { id: 'churn_rate', label: 'Churn Rate', format: 'percent' },
  new_customers: { id: 'new_customers', label: 'New Customers', format: 'qty' },
  returning_customers: { id: 'returning_customers', label: 'Returning', format: 'qty' },

  // Channels / traffic
  spend: { id: 'spend', label: 'Ad Spend', format: 'money_compact' },
  roas: { id: 'roas', label: 'ROAS', format: 'ratio', help: 'Platform-attributed; CM2 is the truth source.' },
  ctr: { id: 'ctr', label: 'CTR', format: 'percent' },
  cpm: { id: 'cpm', label: 'CPM', format: 'money' },
  cpc: { id: 'cpc', label: 'CPC', format: 'money' },
  conversions: { id: 'conversions', label: 'Conversions', format: 'qty' },
  sessions: { id: 'sessions', label: 'Sessions', format: 'qty' },
  conversion_rate: { id: 'conversion_rate', label: 'Conversion Rate', format: 'percent' },

  // Logistics / inventory
  delivered_rate: { id: 'delivered_rate', label: 'Delivered Rate', format: 'percent' },
  ndr_rate: { id: 'ndr_rate', label: 'NDR Rate', format: 'percent' },
  inventory_cover: { id: 'inventory_cover', label: 'Days of Cover', format: 'qty' },
  stockouts: { id: 'stockouts', label: 'Stockouts', format: 'qty' },
} satisfies Record<string, MetricDef>

export type MetricId = keyof typeof METRICS

/** Render a raw metric value (money in minor units; percent as 0–100; ratio as a number) per its format. */
export function formatMetric(format: MetricFormat, value: number, currency: CurrencyCode): string {
  switch (format) {
    case 'money':
      return formatMoney(value, currency)
    case 'money_compact':
      return formatMoney(value, currency, { compact: true })
    case 'qty':
      return formatQty(value, currency)
    case 'percent':
      return formatPercent(value, 1, true)
    case 'ratio':
      return `${value.toFixed(2)}x`
  }
}
