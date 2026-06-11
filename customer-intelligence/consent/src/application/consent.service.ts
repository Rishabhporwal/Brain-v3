import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { Pool } from 'pg'
import { decide, type Channel, type ConsentDecision, type ConsentState, type Purpose } from '../domain/policy'
import { PG_POOL } from '../persistence/db.providers'

export interface RecordInput {
  brand_id: string
  customer_id: string
  channel: Channel
  purpose: Purpose
  to_state: ConsentState
  source_name: string // e.g. 'checkout_checkbox', 'whatsapp_optin', 'preference_center'
  legal_basis?: string
}

/**
 * Consent service (P1, BRD §10.2/§27.4): the append-only record of every consent transition
 * (consent.consent_history) and the single check every outbound send / capture decision calls.
 * Withdrawal is a NEW row, never an update — the history is the audit trail.
 */
@Injectable()
export class ConsentService {
  constructor(@Inject(PG_POOL) private readonly pg: Pool) {}

  async record(input: RecordInput): Promise<{ id: string }> {
    const client = await this.pg.connect()
    try {
      await client.query('BEGIN')
      const src = await client.query<{ id: string }>(
        `INSERT INTO consent.consent_sources(brand_id, name, channel, legal_basis)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (brand_id, name) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [input.brand_id, input.source_name, input.channel, input.legal_basis ?? 'consent'],
      )
      const prev = await this.latestState(input.brand_id, input.customer_id, input.channel, input.purpose, client)
      const hist = await client.query<{ id: string }>(
        `INSERT INTO consent.consent_history(brand_id, customer_id, channel, purpose, from_state, to_state, source_id, effective_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         RETURNING id`,
        [input.brand_id, input.customer_id, input.channel, input.purpose, prev, input.to_state, src.rows[0].id],
      )
      await client.query('COMMIT')
      return { id: hist.rows[0].id }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e instanceof Error && /invalid input value for enum/.test(e.message)
        ? new BadRequestException(e.message)
        : e
    } finally {
      client.release()
    }
  }

  async check(brandId: string, customerId: string, channel: Channel, purpose: Purpose): Promise<ConsentDecision> {
    const latest = await this.latestState(brandId, customerId, channel, purpose)
    return decide(purpose, latest)
  }

  private async latestState(
    brandId: string,
    customerId: string,
    channel: Channel,
    purpose: Purpose,
    client: { query: Pool['query'] } = this.pg,
  ): Promise<ConsentState | null> {
    const { rows } = await client.query<{ to_state: ConsentState }>(
      `SELECT to_state FROM consent.consent_history
        WHERE brand_id=$1 AND customer_id=$2 AND channel=$3 AND purpose=$4
        ORDER BY effective_at DESC LIMIT 1`,
      [brandId, customerId, channel, purpose],
    )
    return rows[0]?.to_state ?? null
  }
}
