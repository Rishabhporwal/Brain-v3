import { Injectable, Logger } from '@nestjs/common'
import nodemailer, { type Transporter } from 'nodemailer'

/** Redact an email for logs (never log PII): "alice@example.com" → "a***@example.com". */
function redactEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

/**
 * Transactional email (invitations, verification, password reset). Uses SMTP when SMTP_HOST is configured
 * (deployment/local/.env → Gmail), otherwise logs the message so local dev / CI works without a mail
 * server. Secrets come from env only — never hardcoded.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail')
  private readonly from = process.env.MAIL_FROM ?? 'Brain <no-reply@brain.local>'
  private readonly transport: Transporter | null

  constructor() {
    const host = process.env.SMTP_HOST
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    const who = redactEmail(to) // never log PII (full email) — redact to a@***.com
    if (!this.transport) {
      this.logger.warn(`(SMTP not configured) would send "${subject}" to ${who}`)
      return
    }
    try {
      await this.transport.sendMail({ from: this.from, to, subject, text })
      this.logger.log(`sent "${subject}" to ${who}`)
    } catch (err) {
      // Don't fail the request if email delivery hiccups — the action (e.g. invite) already persisted.
      this.logger.error(`failed to send "${subject}" to ${who}: ${(err as Error).message}`)
    }
  }
}
