'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { CurrencyCode } from '@/lib/format'
import { formatMoney, formatQty } from '@/lib/format'
import { useWorkspace } from '@/lib/workspace'
import { useSurfaceData } from '@/lib/api/use-surface-data'
import {
  sampleBreakdown,
  sampleBreakdownPct,
  sampleBreakdownQty,
  sampleDetail,
  sampleHeatmap,
  sampleWaterfall,
} from '@/lib/charts/sample-data'
import { TimeSeriesChart } from '@/components/charts/time-series-chart'
import { BreakdownBarChart } from '@/components/charts/breakdown-bar-chart'
import { WaterfallChart } from '@/components/charts/waterfall-chart'
import { Heatmap } from '@/components/charts/heatmap'
import { CampaignsTable, InventoryTable } from '@/components/data-table/sample-tables'
import { DataTable } from '@/components/data-table/data-table'

const COURIERS = ['Delhivery', 'Bluedart', 'Ekart', 'XpressBees', 'Shiprocket']
const CHANNELS = ['Meta', 'Google', 'Organic', 'TikTok', 'Referral']
const SEGMENTS = ['VIP', 'Loyal', 'Promising', 'At-risk', 'New']
const STAGES = ['New', 'Returning', 'At-risk', 'Churned']
const AOV_BUCKETS = ['<₹500', '₹500–1k', '₹1–2k', '₹2–5k', '>₹5k']
const SHIP_STATUS = ['Delivered', 'In transit', 'NDR', 'RTO']
const FIRST_PRODUCTS = ['Daily Serum', 'Vitamin C', 'Sunscreen', 'Face Wash', 'Toner']
const COHORT_ROWS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
const COHORT_COLS = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5']
const PINCODES = ['560001', '110001', '400001', '600001', '700001']
const RISK_COLS = ['RTO', 'COD', 'NDR', 'Delivered']

type DetailData = ReturnType<typeof sampleDetail>
type ProductRow = DetailData['rows'][number]

/**
 * Renders each surface's visualisation. Time-series surfaces and the products table consume REAL data from
 * the BFF detail endpoint (sample fallback pre-backend). Other surfaces use sample data where the Phase-1
 * DB lacks the dimension (RTO-by-courier, cohorts, etc.) — they light up as that data lands.
 */
export function SurfaceDetail({ surface, currency }: { surface: string; currency: CurrencyCode }) {
  const { current } = useWorkspace()
  const { slug } = current
  const { data } = useSurfaceData<DetailData>(
    ['detail', surface, slug],
    `/api/workspaces/${slug}/${surface}/detail`,
    sampleDetail(),
  )
  const ts = data?.timeseries ?? []
  const rows = data?.rows ?? []

  switch (surface) {
    // ---- real time-series ----
    case 'store':
    case 'email-sms':
      return (
        <TimeSeriesChart
          kind="area"
          currency={currency}
          valueFormat="money"
          data={ts}
          series={[{ key: 'realized_revenue', label: 'Realized Revenue' }]}
        />
      )
    case 'analytics':
      return (
        <TimeSeriesChart
          kind="line"
          currency={currency}
          valueFormat="qty"
          data={ts}
          series={[
            { key: 'sessions', label: 'Sessions' },
            { key: 'orders', label: 'Orders' },
          ]}
        />
      )
    case 'timings':
      return (
        <TimeSeriesChart kind="bar" currency={currency} valueFormat="qty" data={ts} series={[{ key: 'orders', label: 'Orders' }]} />
      )
    case 'calendar':
      return (
        <TimeSeriesChart
          kind="bar"
          currency={currency}
          valueFormat="money"
          data={ts}
          series={[{ key: 'realized_revenue', label: 'Realized Revenue' }]}
        />
      )

    // ---- real products table ----
    case 'products':
      return <RealProductsTable rows={rows} currency={currency} />

    // ---- real (revenue-grounded waterfall + payment/courier breakdowns) ----
    case 'pnl':
    case 'waterfall':
      return <WaterfallChart steps={data?.waterfall?.length ? data.waterfall : sampleWaterfall()} currency={currency} />
    case 'cod-prepaid':
      return <BreakdownBarChart currency={currency} valueFormat="qty" data={data?.paymentBreakdown ?? []} />
    case 'rto-analytics':
    case 'logistics':
      return <BreakdownBarChart currency={currency} valueFormat="qty" data={data?.courierBreakdown ?? []} />

    // ---- sample (dimension not in the Phase-1 DB yet) ----
    case 'inventory':
      return <InventoryTable currency={currency} />
    case 'meta-ads':
      return <CampaignsTable currency={currency} provider="Meta" />
    case 'google-ads':
      return <CampaignsTable currency={currency} provider="Google" />
    case 'shiprocket':
      return <BreakdownBarChart currency={currency} valueFormat="percent" data={sampleBreakdownPct(SHIP_STATUS)} />
    case 'acquisition':
      return <BreakdownBarChart currency={currency} valueFormat="money" data={sampleBreakdown(CHANNELS)} />
    case 'lifetime-value':
      return <BreakdownBarChart currency={currency} valueFormat="money" data={sampleBreakdown(SEGMENTS)} />
    case 'customer-lifecycle':
      return <BreakdownBarChart currency={currency} valueFormat="qty" data={sampleBreakdownQty(STAGES)} />
    case 'distributions':
      return <BreakdownBarChart currency={currency} valueFormat="qty" data={sampleBreakdownQty(AOV_BUCKETS)} />
    case 'first-product-cascade':
      return <BreakdownBarChart currency={currency} valueFormat="qty" data={sampleBreakdownQty(FIRST_PRODUCTS)} />
    case 'cohorts':
      return <Heatmap rowHeader="Cohort" {...sampleHeatmap(COHORT_ROWS, COHORT_COLS)} />
    case 'pincode-intelligence':
      return <Heatmap rowHeader="Pincode" {...sampleHeatmap(PINCODES, RISK_COLS)} />
    default:
      return null
  }
}

function RealProductsTable({ rows, currency }: { rows: ProductRow[]; currency: CurrencyCode }) {
  const columns: ColumnDef<ProductRow, unknown>[] = [
    { accessorKey: 'sku', header: 'SKU' },
    { accessorKey: 'orders', header: 'Orders', cell: ({ row }) => formatQty(row.original.orders, currency) },
    {
      accessorKey: 'revenue',
      header: 'Revenue',
      cell: ({ row }) => formatMoney(row.original.revenue, currency, { compact: true }),
    },
  ]
  return <DataTable columns={columns} data={rows} emptyLabel="No product sales yet." />
}
