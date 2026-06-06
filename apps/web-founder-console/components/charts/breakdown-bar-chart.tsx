'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CurrencyCode } from '@/lib/format'
import { formatCompact, formatMoney, formatPercent, formatQty } from '@/lib/format'

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

type ValueFormat = 'money' | 'qty' | 'percent'

function fmt(v: number, vf: ValueFormat, currency: CurrencyCode, compact = false) {
  if (vf === 'percent') return formatPercent(v, 1, true)
  if (vf === 'qty') return compact ? formatCompact(v, currency) : formatQty(v, currency)
  return formatMoney(v, currency, { compact })
}

/** Horizontal breakdown of a single measure across labels (channels, couriers, payment methods…). */
export function BreakdownBarChart({
  data,
  currency,
  valueFormat = 'money',
  height,
}: {
  data: Array<{ label: string; value: number }>
  currency: CurrencyCode
  valueFormat?: ValueFormat
  height?: number
}) {
  if (!data?.length) {
    return <div className="text-muted-foreground py-10 text-center text-sm">No data to break down.</div>
  }
  const h = height ?? Math.max(160, data.length * 38)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide tickFormatter={(v: number) => fmt(v, valueFormat, currency, true)} />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--foreground)' }}
        />
        <Tooltip
          formatter={(v) => fmt(Number(v), valueFormat, currency)}
          contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
