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
    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: this.config.smtpFrom,
      to: input.to.join(','),
      subject: input.subject,
      text: input.text,
    });
    this.logger.log(`Email sent: "${input.subject}" to ${input.to.length} recipient(s)`);
  }
}
