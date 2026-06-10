import { type ConnectorHooks, type ConnectorManifest, type IngestRecord, type PullResult, type TokenSet } from '@brain/connector-kit'

/**
 * Google Ads connector (PULL lane). Ad platforms don't push metrics — we poll. Spend/clicks/conversions
 * come from GAQL via GoogleAdsService.SearchStream. Cursor = the last synced date (incremental by date).
 * Endpoints are env-overridable for tests/mocks.
 */
export const GOOGLE_ADS_MANIFEST: ConnectorManifest = {
  provider: 'google', // matches the connect layer (vault refs, integration.integrations, frontend)
  category: 'ads',
  tier: 1,
  auth: 'oauth2',
  ingest: ['pull'],
  streams: [{ name: 'ad_spend', mode: 'pull', cursorField: 'date' }],
  backfill: 'paginated',
}

const tokenUrl = () => process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token'
const apiBase = () => process.env.GOOGLE_ADS_API_URL ?? 'https://googleads.googleapis.com'
const apiVer = () => process.env.GOOGLE_ADS_API_VERSION ?? 'v23'
const customerId = () => (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '')

const isoDate = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => isoDate(new Date(Date.now() - n * 86_400_000))

interface GoogleAdsRow {
  campaign?: { id?: string; name?: string }
  metrics?: { costMicros?: string; clicks?: string; conversions?: number }
  segments?: { date?: string }
  customer?: { currencyCode?: string }
}

export const googleAds: ConnectorHooks = {
  manifest: GOOGLE_ADS_MANIFEST,

  /** OAuth refresh-token grant → fresh access token. */
  async refresh(token: TokenSet): Promise<TokenSet> {
    const res = await fetch(tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
        refresh_token: token.refreshToken ?? '',
      }),
    })
    if (!res.ok) throw new Error(`google token refresh ${res.status}`)
    const d = (await res.json()) as { access_token: string; expires_in?: number }
    return { ...token, accessToken: d.access_token, expiresIn: d.expires_in }
  },

  /** Pull daily campaign stats since the cursor date via SearchStream (GAQL). */
  async pull(stream: string, cursor: string | undefined, accessToken: string): Promise<PullResult> {
    const from = cursor ?? daysAgo(7)
    const to = isoDate(new Date())
    const query = `SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions, segments.date, customer.currency_code FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}'`
    const res = await fetch(`${apiBase()}/${apiVer()}/customers/${customerId()}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        'login-customer-id': customerId(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error(`google ads searchStream ${res.status}: ${await res.text().catch(() => '')}`)
    const batches = (await res.json()) as Array<{ results?: GoogleAdsRow[] }>
    const records: IngestRecord[] = []
    for (const batch of Array.isArray(batches) ? batches : [batches]) {
      for (const row of batch.results ?? []) {
        records.push({
          stream,
          primaryKey: `${row.campaign?.id ?? ''}:${row.segments?.date ?? ''}`,
          data: {
            date: row.segments?.date,
            campaign_id: row.campaign?.id,
            campaign_name: row.campaign?.name,
            // canonical money: micros → integer minor units (1e6 micros = 1 major = 100 minor)
            spend_minor: String(Math.round(Number(row.metrics?.costMicros ?? '0') / 10_000)),
            cost_micros: row.metrics?.costMicros, // provider-native, retained for replay/debug
            clicks: row.metrics?.clicks,
            conversions: row.metrics?.conversions,
            currency: row.customer?.currencyCode, // account currency → ad_spend.currency_code
          },
        })
      }
    }
    return { records, nextCursor: to }
  },
}
