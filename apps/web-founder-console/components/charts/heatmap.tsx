'use client'

import { formatPercent } from '@/lib/format'

/** Cohort / pincode heatmap: rows × cols of 0–100 intensity. Colour-AND-number (a11y: never colour-only). */
export function Heatmap({
  rowLabels,
  colLabels,
  values,
  rowHeader = '',
}: {
  rowLabels: string[]
  colLabels: string[]
  values: number[][]
  rowHeader?: string
}) {
  if (!rowLabels?.length) {
    return <div className="text-muted-foreground py-10 text-center text-sm">No cohort data.</div>
  }
  const cell = (v: number) => {
    if (!v) return { background: 'var(--muted)', color: 'var(--muted-foreground)' }
    const alpha = 0.12 + (v / 100) * 0.78
    return {
      background: `color-mix(in oklab, var(--chart-1) ${Math.round(alpha * 100)}%, transparent)`,
      color: v > 55 ? 'white' : 'var(--foreground)',
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr>
            <th className="text-muted-foreground p-1 text-left font-medium">{rowHeader}</th>
            {colLabels.map((c) => (
              <th key={c} className="text-muted-foreground p-1 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, ri) => (
            <tr key={r}>
              <td className="text-muted-foreground p-1 text-left font-medium whitespace-nowrap">{r}</td>
              {colLabels.map((_, ci) => {
                const v = values[ri]?.[ci] ?? 0
                return (
                  <td key={ci} className="rounded-md p-2 tabular-nums" style={cell(v)}>
                    {v ? formatPercent(v, 0, true) : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
