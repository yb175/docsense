import { createTransport, type Transporter } from 'nodemailer';

import { env } from '../lib/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Replaceable email boundary — auth logic only depends on this interface. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class SmtpEmailSender implements EmailSender {
  constructor(private readonly transporter: Transporter) {}

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
  }
}

/**
 * Development fallback. The body is deliberately not printed so OTPs never
 * reach the logs; use an SMTP capture inbox (Mailpit) to read messages.
 */
class ConsoleEmailSender implements EmailSender {
  async send({ to, subject }: EmailMessage): Promise<void> {
    console.log(`[email:console] to=${to} subject="${subject}" body-suppressed-contains-secret`);
  }
}

function buildEmailSender(): EmailSender {
  if (!env.SMTP_HOST) return new ConsoleEmailSender();

  const port = env.SMTP_PORT ?? 1025;
  return new SmtpEmailSender(
    createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    }),
  );
}

export const emailSender: EmailSender = buildEmailSender();
