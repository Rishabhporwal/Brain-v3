import {
  type ConnectorHooks,
  type ConnectorManifest,
  type IngestRecord,
  type PullResult,
  sleep,
} from '@brain/connector-kit'

/**
 * Meta Ads connector (PULL lane). Performance data isn't pushed — we poll the Insights API via **async
 * jobs**: submit a report run, poll async_status until complete, then fetch results. Rate-limited (~5
 * insights calls/min/ad-account). Endpoints are env-overridable for tests/mocks.
 */
export const META_ADS_MANIFEST: ConnectorManifest = {
  provider: 'meta', // matches the connect layer (vault refs, integration.integrations, frontend)
  category: 'ads',
  tier: 1,
  auth: 'oauth2',
  ingest: ['pull'],
  streams: [{ name: 'ad_spend', mode: 'pull', cursorField: 'date' }],
  backfill: 'paginated',
}

const graphBase = () =>
  process.env.META_GRAPH_URL ?? `https://graph.facebook.com/${process.env.META_API_VERSION ?? 'v21.0'}`
const adAccountId = () => process.env.META_AD_ACCOUNT_ID ?? '' // act_<id>
const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => isoDate(new Date(Date.now() - n * 86_400_000))

interface InsightRow {
  date_start?: string
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  account_currency?: string
}

export const metaAds: ConnectorHooks = {
  manifest: META_ADS_MANIFEST,

  /** Meta long-lived tokens are already exchanged at connect; refresh re-exchanges if a refresh path exists. */
  // (Meta has no standard refresh-token grant for user tokens; the long-lived token is stored at connect.)

  async pull(stream: string, cursor: string | undefined, accessToken: string): Promise<PullResult> {
    const since = cursor ?? daysAgo(7)
    const until = isoDate(new Date())
    const acct = adAccountId()
    const fields = 'spend,impressions,clicks,campaign_id,campaign_name,account_currency'
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }))

    // 1) Submit async job → report_run_id
    const submit = await fetch(
      `${graphBase()}/act_${acct}/insights?level=campaign&fields=${fields}&time_increment=1&time_range=${timeRange}&access_token=${encodeURIComponent(accessToken)}`,
      { method: 'POST' },
    )
    if (!submit.ok) throw new Error(`meta insights submit ${submit.status}: ${await submit.text().catch(() => '')}`)
    const { report_run_id: runId } = (await submit.json()) as { report_run_id?: string }
    if (!runId) throw new Error('meta insights: no report_run_id')

    // 2) Poll async_status until complete (bounded)
    for (let i = 0; i < 20; i++) {
      const statusRes = await fetch(
        `${graphBase()}/${runId}?fields=async_status,async_percent_completion&access_token=${encodeURIComponent(accessToken)}`,
      )
      const s = (await statusRes.json()) as { async_status?: string; async_percent_completion?: number }
      if (s.async_status === 'Job Completed' && (s.async_percent_completion ?? 0) >= 100) break
      if (s.async_status === 'Job Failed' || s.async_status === 'Job Skipped')
        throw new Error(`meta insights job ${s.async_status}`)
      await sleep(1000)
    }

    // 3) Fetch results
    const resultRes = await fetch(`${graphBase()}/${runId}/insights?access_token=${encodeURIComponent(accessToken)}`)
    if (!resultRes.ok) throw new Error(`meta insights results ${resultRes.status}`)
    const body = (await resultRes.json()) as { data?: InsightRow[] }
    const records: IngestRecord[] = (body.data ?? []).map((row) => ({
      stream,
      primaryKey: `${row.campaign_id ?? ''}:${row.date_start ?? ''}`,
      data: {
        date: row.date_start,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        // canonical money: major-unit decimal string → integer minor units
        spend_minor: String(Math.round(Number(row.spend ?? '0') * 100)),
        spend: row.spend, // provider-native, retained for replay/debug
        impressions: row.impressions,
        clicks: row.clicks,
        currency: row.account_currency, // account currency → ad_spend.currency_code
      },
    }))
    return { records, nextCursor: until }
  },
}
