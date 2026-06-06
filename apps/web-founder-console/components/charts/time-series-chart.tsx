'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CurrencyCode } from '@/lib/format'
import { formatCompact, formatMoney, formatPercent, formatQty } from '@/lib/format'

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

type ValueFormat = 'money' | 'qty' | 'percent'

function fmt(v: number, vf: ValueFormat, currency: CurrencyCode, compact = false) {
  if (vf === 'percent') return formatPercent(v, 1, true)
  if (vf === 'qty') return compact ? formatCompact(v, currency) : formatQty(v, currency)
  return formatMoney(v, currency, { compact })
}

export function TimeSeriesChart({
  data,
  series,
  kind = 'line',
  currency,
  valueFormat = 'money',
  height = 280,
}: {
  data: Array<Record<string, number | string>>
  series: Array<{ key: string; label: string }>
  kind?: 'line' | 'area' | 'bar'
  currency: CurrencyCode
  valueFormat?: ValueFormat
  height?: number
}) {
  if (!data?.length) {
    return <div className="text-muted-foreground py-10 text-center text-sm">No data for this period.</div>
  }

  const axis = { stroke: 'var(--muted-foreground)', fontSize: 11 }
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
  const x = <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} />
  const y = (
    <YAxis
      tickLine={false}
      axisLine={false}
      tick={axis}
      width={56}
      tickFormatter={(v: number) => fmt(v, valueFormat, currency, true)}
    />
  )
  const tip = (
    <Tooltip
      formatter={(v) => fmt(Number(v), valueFormat, currency)}
      contentStyle={{
        background: 'var(--popover)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        fontSize: 12,
      }}
    />
  )

  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === 'area' ? (
        <AreaChart data={data}>
          {grid}
          {x}
          {y}
          {tip}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      ) : kind === 'bar' ? (
        <BarChart data={data}>
          {grid}
          {x}
          {y}
          {tip}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data}>
          {grid}
          {x}
          {y}
          {tip}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
