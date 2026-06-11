'use client'

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CurrencyCode } from '@/lib/format'
import { formatMoney } from '@/lib/format'
import type { WaterfallStep } from '@/lib/charts/sample-data'

/** Contribution-margin waterfall: cumulative floating bars from revenue → CM2. Money in minor units. */
export function WaterfallChart({
  steps,
  currency,
  height = 300,
}: {
  steps: WaterfallStep[]
  currency: CurrencyCode
  height?: number
}) {
  if (!steps?.length) {
    return <div className="text-muted-foreground py-10 text-center text-sm">No waterfall data.</div>
  }

  // Build floating bars: [base, top] so subtract/add steps "float" between cumulative levels.
  let running = 0
  const rows = steps.map((s) => {
    if (s.kind === 'start' || s.kind === 'total') {
      const row = { label: s.label, base: 0, span: s.value, value: s.value, kind: s.kind }
      running = s.value
      return row
    }
    const prev = running
    running = prev + s.value
    const base = Math.min(prev, running)
    const span = Math.abs(s.value)
    return { label: s.label, base, span, value: s.value, kind: s.kind }
  })

  const color = (kind: WaterfallStep['kind']) =>
    kind === 'start' || kind === 'total' ? 'var(--chart-1)' : kind === 'add' ? 'var(--chart-2)' : 'var(--destructive)'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ left: 8, right: 8 }}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={56}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
        />
        <Tooltip
          formatter={(_v, _n, p) => formatMoney(Number(p?.payload?.value ?? 0), currency)}
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
        />
        {/* transparent base to lift the visible span */}
        <Bar dataKey="base" stackId="w" fill="transparent" />
        <Bar dataKey="span" stackId="w" radius={[4, 4, 0, 0]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={color(r.kind)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
