import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Sending mail, or saying out loud what it would have sent.
 *
 * SMTP is optional: with no host configured the service logs each message and
 * reports success. That keeps password resets and the daily digest working end
 * to end in development and on a server that has no mail relay yet — the link
 * is in the log — instead of failing at the last step.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const host = this.configService.get<string>('mail.host');

    if (!host) {
      this.logger.warn(
        'SMTP is not configured (SMTP_HOST). Emails will be written to the log instead of sent.',
      );

      return;
    }

    const user = this.configService.get<string>('mail.user');
    const password = this.configService.get<string>('mail.password');

    this.transporter = createTransport({
      host,
      port: this.configService.get<number>('mail.port'),
      secure: this.configService.get<boolean>('mail.secure'),
      auth: user && password ? { user, pass: password } : undefined,
    });
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Never throws. A failed email must not fail the request that triggered it —
   * a reset link that could not be sent is a support call, a 500 is an outage.
   */
  async send(message: MailMessage): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(
        `[mail:not-sent] to=${message.to} subject="${message.subject}"\n${message.text}`,
      );

      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('mail.from'),
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send "${message.subject}" to ${message.to}`,
        error instanceof Error ? error.stack : String(error),
      );

      return false;
    }
  }
}
