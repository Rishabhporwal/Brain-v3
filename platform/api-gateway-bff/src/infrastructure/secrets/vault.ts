import { Provider } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const VAULT = 'VAULT'

/**
 * Secret vault seam. The DB stores only a `secret_ref` (see integration.oauth_tokens) — NEVER token
 * material. In production this is AWS Secrets Manager/KMS; locally it's an encrypted file-backed shim
 * (AES-256-GCM) so OAuth flows are exercisable end-to-end without leaking plaintext to disk or DB.
 */
export interface Vault {
  put(ref: string, plaintext: string): Promise<void>
  get(ref: string): Promise<string | null>
}

type Sealed = { iv: string; tag: string; data: string }

/** Dev-only KMS shim: AES-256-GCM, key derived from VAULT_KEY, ciphertext persisted to VAULT_PATH. */
class DevVault implements Vault {
  private readonly key: Buffer
  private readonly path: string

  constructor() {
    const secret = process.env.VAULT_KEY ?? 'brain-local-dev-vault-key-change-me'
    this.key = scryptSync(secret, 'brain-vault-salt', 32)
    this.path = process.env.VAULT_PATH ?? '/tmp/brain-dev-vault.json'
  }

  private read(): Record<string, Sealed> {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, Sealed>
    } catch {
      return {}
    }
  }

  private write(store: Record<string, Sealed>) {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(store), { mode: 0o600 })
  }

  async put(ref: string, plaintext: string): Promise<void> {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const store = this.read()
    store[ref] = { iv: iv.toString('hex'), tag: tag.toString('hex'), data: data.toString('hex') }
    this.write(store)
  }

  async get(ref: string): Promise<string | null> {
    const sealed = this.read()[ref]
    if (!sealed) return null
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(sealed.iv, 'hex'))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'hex')), decipher.final()]).toString('utf8')
  }
}

export const vaultProvider: Provider = { provide: VAULT, useFactory: (): Vault => new DevVault() }
