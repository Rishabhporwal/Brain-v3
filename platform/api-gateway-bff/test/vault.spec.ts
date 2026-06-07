import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { vaultProvider, type Vault } from '../src/vault'

// M6 — the dev vault must encrypt at rest (no plaintext on disk) and round-trip correctly.
const PATH = '/tmp/brain-vault-spec.json'

describe('DevVault', () => {
  let vault: Vault

  beforeAll(() => {
    process.env.VAULT_PATH = PATH
    process.env.VAULT_KEY = 'spec-key'
    vault = (vaultProvider as { useFactory: () => Vault }).useFactory()
  })

  afterAll(() => {
    try {
      require('node:fs').unlinkSync(PATH)
    } catch {
      /* ignore */
    }
  })

  it('round-trips a secret', async () => {
    await vault.put('ref-1', 'super-secret-token')
    expect(await vault.get('ref-1')).toBe('super-secret-token')
  })

  it('does not write plaintext to disk', async () => {
    await vault.put('ref-2', 'shpat_PLAINTEXT_LEAK')
    const onDisk = readFileSync(PATH, 'utf8')
    expect(onDisk).not.toContain('shpat_PLAINTEXT_LEAK')
  })

  it('returns null for an unknown ref', async () => {
    expect(await vault.get('nope')).toBeNull()
  })
})
