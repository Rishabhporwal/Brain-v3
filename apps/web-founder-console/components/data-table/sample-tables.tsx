'use client'

import type { ColumnDef } from '@tanstack/react-table'
import type { CurrencyCode } from '@/lib/format'
import { formatMoney, formatPercent, formatQty } from '@/lib/format'
import { sampleRows } from '@/lib/charts/sample-data'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table/data-table'

const money = (c: CurrencyCode) => (v: number) => formatMoney(v, c, { compact: true })

type ProductRow = { sku: string; title: string; revenue: number; orders: number; cm2: number; rto: number }
export function ProductsTable({ currency }: { currency: CurrencyCode }) {
  const data = sampleRows<ProductRow>(8, (i, r) => ({
    sku: `SKU-${1000 + i}`,
    title: ['Daily Serum', 'Vitamin C', 'Sunscreen SPF50', 'Face Wash', 'Night Cream', 'Toner', 'Lip Balm', 'Hair Oil'][
      i
    ],
    revenue: Math.round(8_000_000 * (0.5 + r(1))),
    orders: Math.round(120 * (0.4 + r(2))),
    cm2: Math.round(2200 + r(3) * 2000) / 100,
    rto: Math.round(800 + r(4) * 2200) / 100,
  }))
  const columns: ColumnDef<ProductRow, unknown>[] = [
    { accessorKey: 'sku', header: 'SKU' },
    { accessorKey: 'title', header: 'Product' },
    { accessorKey: 'revenue', header: 'Revenue', cell: ({ row }) => money(currency)(row.original.revenue) },
    { accessorKey: 'orders', header: 'Orders', cell: ({ row }) => formatQty(row.original.orders, currency) },
    { accessorKey: 'cm2', header: 'CM2 %', cell: ({ row }) => formatPercent(row.original.cm2, 1, true) },
    { accessorKey: 'rto', header: 'RTO %', cell: ({ row }) => formatPercent(row.original.rto, 1, true) },
  ]
  return <DataTable columns={columns} data={data} />
}

type CampaignRow = { name: string; spend: number; roas: number; cac: number; conv: number }
export function CampaignsTable({ currency, provider }: { currency: CurrencyCode; provider: string }) {
  const data = sampleRows<CampaignRow>(6, (i, r) => ({
    name: `${provider} — ${['Prospecting', 'Retargeting', 'Brand', 'Lookalike', 'Catalog', 'Pmax'][i]}`,
    spend: Math.round(12_000_000 * (0.4 + r(1))),
    roas: Math.round(250 + r(2) * 350) / 100,
    cac: Math.round(40_000 + r(3) * 60_000),
    conv: Math.round(120 + r(4) * 400),
  }))
  const columns: ColumnDef<CampaignRow, unknown>[] = [
    { accessorKey: 'name', header: 'Campaign' },
    { accessorKey: 'spend', header: 'Spend', cell: ({ row }) => money(currency)(row.original.spend) },
    { accessorKey: 'roas', header: 'ROAS', cell: ({ row }) => `${row.original.roas.toFixed(2)}x` },
    { accessorKey: 'cac', header: 'CAC', cell: ({ row }) => formatMoney(row.original.cac, currency) },
    { accessorKey: 'conv', header: 'Conversions', cell: ({ row }) => formatQty(row.original.conv, currency) },
  ]
  return <DataTable columns={columns} data={data} />
}

type InventoryRow = { sku: string; onHand: number; cover: number; status: string }
export function InventoryTable({ currency }: { currency: CurrencyCode }) {
  const data = sampleRows<InventoryRow>(8, (i, r) => {
    const cover = Math.round(2 + r(2) * 40)
    return {
      sku: `SKU-${1000 + i}`,
      onHand: Math.round(50 + r(1) * 600),
      cover,
      status: cover < 7 ? 'Low' : cover > 30 ? 'Overstock' : 'Healthy',
    }
  })
  const columns: ColumnDef<InventoryRow, unknown>[] = [
    { accessorKey: 'sku', header: 'SKU' },
    { accessorKey: 'onHand', header: 'On hand', cell: ({ row }) => formatQty(row.original.onHand, currency) },
    { accessorKey: 'cover', header: 'Days of cover' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status
        return <Badge variant={s === 'Low' ? 'destructive' : s === 'Overstock' ? 'secondary' : 'outline'}>{s}</Badge>
      },
    },
  ]
  return <DataTable columns={columns} data={data} />
}
