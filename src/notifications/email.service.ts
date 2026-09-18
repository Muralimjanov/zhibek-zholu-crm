import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';

export interface SendEmailInput {
  to: string[];
  subject: string;
  text: string;
}

/**
 * Provider-agnostic SMTP email delivery. Deliberately NOT tied to any
 * specific vendor (SendGrid/SES/Mailgun/etc.) - that choice was explicitly
 * out of scope to decide unilaterally (OPEN_QUESTIONS.md #23). Point
 * SMTP_HOST/USER/PASS at whichever provider's SMTP relay is chosen.
 *
 * Callers must treat delivery as best-effort: a thrown error here must
 * never silently swallow a security-relevant action - see
 * ConfirmationsService, which still creates/records the underlying action
 * and surfaces delivery failure rather than blocking on it.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  private getTransporter(): Transporter {
    if (!this.config.isSmtpConfigured) {
      throw new Error(
        'SMTP is not configured (SMTP_HOST missing, or SMTP_USER/SMTP_PASS missing/incomplete)',
      );
    }
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpSecure,
        // Auth-less SMTP is only reachable outside production - see
        // AppConfigService.isSmtpConfigured.
        auth: this.config.smtpHasCredentials
          ? { user: this.config.smtpUser, pass: this.config.smtpPass }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<void> {
    if (this.config.emailTransport === 'brevo') {
      const messageId = await this.sendViaBrevo(input);
      // The message id is what Brevo's own log is searched by, so a code that
      // the provider accepted but never delivered can still be traced.
      this.logger.log(
        `Email sent: "${input.subject}" to ${input.to.map(maskEmail).join(', ')}` +
          (messageId ? ` (Brevo messageId ${messageId})` : ''),
      );
      return;
    }
    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: this.config.smtpFrom,
      to: input.to.join(','),
      subject: input.subject,
      text: input.text,
    });
    this.logger.log(`Email sent: "${input.subject}" to ${input.to.map(maskEmail).join(', ')}`);
  }

  /**
   * Brevo transactional email over HTTPS (port 443). Hosts such as Render's
   * free tier block outbound SMTP ports 25/465/587.
   */
  private async sendViaBrevo(input: SendEmailInput): Promise<string | undefined> {
    const apiKey = this.config.brevoApiKey;
    if (!apiKey) throw new Error('EMAIL_TRANSPORT=brevo but BREVO_API_KEY is not set');
    const sender = parseAddress(this.config.smtpFrom);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: input.to.map((email) => ({ email })),
        subject: input.subject,
        textContent: input.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Brevo API responded with HTTP ${res.status}${await brevoErrorSummary(res)}`);
    }
    return brevoMessageId(res);
  }
}

/** Brevo answers a successful send with {"messageId":"<...@smtp-relay.brevo.com>"}. */
async function brevoMessageId(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { messageId?: unknown };
    return typeof body.messageId === 'string' ? body.messageId.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

/** "aibek@example.kg" -> "ai***@example.kg"; never log a full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${email.slice(at)}`;
}

/** "Name <email@x>" or "email@x" -> { name?, email }. */
export function parseAddress(value: string): { name?: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: value.trim() };
  const name = match[1].replace(/^"|"$/g, '').trim();
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/**
 * Brevo errors look like {"code":"unauthorized","message":"Key not found"}.
 * The message is logged so the cause (wrong key, unverified sender, blocked
 * IP) is visible, but email addresses in it are masked.
 */
async function brevoErrorSummary(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    const code = typeof body.code === 'string' ? body.code : '';
    const message = typeof body.message === 'string' ? body.message.replace(/[^\s@]+@[^\s@]+/g, '<email>').slice(0, 300) : '';
    return code || message ? `: ${code}${code && message ? ' - ' : ''}${message}` : '';
  } catch {
    return '';
  }
}
