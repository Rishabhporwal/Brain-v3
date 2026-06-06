import { createHmac } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { ShopifyService } from '../src/shopify.service'

/**
 * M6 — security-critical, DB-free coverage for the Shopify OAuth crypto: signed-state CSRF defence and
 * the callback HMAC. We construct the service with stub deps (these helpers touch neither pg nor vault).
 */
const SECRET = 'test-client-secret'

function makeService(): ShopifyService {
  return new ShopifyService({} as never, {} as never, { emit() {}, emitWebhook() {} })
}

describe('ShopifyService crypto', () => {
  let svc: ShopifyService

  beforeAll(() => {
    process.env.SHOPIFY_CLIENT_ID = 'test-client-id'
    process.env.SHOPIFY_CLIENT_SECRET = SECRET
    svc = makeService()
  })

  describe('signState / verifyState', () => {
    it('round-trips a valid, unexpired state', () => {
      const exp = Math.floor(Date.now() / 1000) + 600
      const state = svc.signState({ brandId: 'brand-1', shop: 'store.myshopify.com', exp })
      const decoded = svc.verifyState(state)
      expect(decoded.brandId).toBe('brand-1')
      expect(decoded.shop).toBe('store.myshopify.com')
    })

    it('rejects a tampered signature', () => {
      const exp = Math.floor(Date.now() / 1000) + 600
      const state = svc.signState({ brandId: 'b', shop: 's.myshopify.com', exp })
      const tampered = `${state.slice(0, -2)}xx`
      expect(() => svc.verifyState(tampered)).toThrow()
    })

    it('rejects an expired state', () => {
      const exp = Math.floor(Date.now() / 1000) - 1
      const state = svc.signState({ brandId: 'b', shop: 's.myshopify.com', exp })
      expect(() => svc.verifyState(state)).toThrow(/expired/)
    })

    it('rejects a malformed state', () => {
      expect(() => svc.verifyState('not-a-state')).toThrow()
    })
  })

  describe('verifyCallbackHmac', () => {
    const validHmac = (params: Record<string, string>) => {
      const msg = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&')
      return createHmac('sha256', SECRET).update(msg).digest('hex')
    }

    it('accepts a correctly-signed callback', () => {
      const params = { code: 'abc', shop: 'store.myshopify.com', state: 'x', timestamp: '1700000000' }
      expect(svc.verifyCallbackHmac({ ...params, hmac: validHmac(params) })).toBe(true)
    })

    it('rejects a wrong hmac', () => {
      const params = { code: 'abc', shop: 'store.myshopify.com', state: 'x', timestamp: '1700000000' }
      expect(svc.verifyCallbackHmac({ ...params, hmac: 'deadbeef' })).toBe(false)
    })

    it('rejects when hmac is missing', () => {
      expect(svc.verifyCallbackHmac({ code: 'abc', shop: 'store.myshopify.com' })).toBe(false)
    })

    it('rejects when a param is altered after signing', () => {
      const params = { code: 'abc', shop: 'store.myshopify.com', state: 'x', timestamp: '1700000000' }
      const hmac = validHmac(params)
      expect(svc.verifyCallbackHmac({ ...params, code: 'tampered', hmac })).toBe(false)
    })
  })

  describe('verifyWebhookHmac', () => {
    it('accepts a body signed with the app secret (base64 over raw bytes)', () => {
      const body = Buffer.from(JSON.stringify({ id: 1, total_price: '99.00' }))
      const sig = createHmac('sha256', SECRET).update(body).digest('base64')
      expect(svc.verifyWebhookHmac(body, sig)).toBe(true)
    })
    it('rejects a wrong/absent signature and a tampered body', () => {
      const body = Buffer.from('{"id":1}')
      const sig = createHmac('sha256', SECRET).update(body).digest('base64')
      expect(svc.verifyWebhookHmac(body, 'wrong')).toBe(false)
      expect(svc.verifyWebhookHmac(body, undefined)).toBe(false)
      expect(svc.verifyWebhookHmac(Buffer.from('{"id":2}'), sig)).toBe(false)
    })
  })

  it('reports configured only when both id and secret are present', () => {
    expect(svc.isConfigured()).toBe(true)
    delete process.env.SHOPIFY_CLIENT_SECRET
    expect(makeService().isConfigured()).toBe(false)
    process.env.SHOPIFY_CLIENT_SECRET = SECRET // restore for any later tests
  })
})
