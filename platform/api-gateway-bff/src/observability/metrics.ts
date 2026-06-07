import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client'

/** Per-process Prometheus registry. Scraped by Prometheus at GET /metrics (see MetricsController). */
export const registry = new Registry()
registry.setDefaultLabels({ service: 'api-gateway-bff' })
collectDefaultMetrics({ register: registry }) // process/node runtime metrics (cpu, mem, gc, event loop)

// RED metrics. Route label uses the matched PATTERN (e.g. /api/workspaces/:slug/context), not the raw URL,
// to keep cardinality bounded — never the brand slug/id.
export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
})

export const httpTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
})
