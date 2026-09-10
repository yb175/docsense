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

export class ResendEmailSender implements EmailSender {
  constructor(private readonly apiKey: string, private readonly request: typeof fetch = fetch) {}

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    const response = await this.request('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
    });
    if (!response.ok) throw new Error(`Resend email request failed (${response.status})`);
  }
}

class SmtpEmailSender implements EmailSender {
  constructor(private readonly transporter: Transporter) {}

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'unknown error';
      console.error(`[email:send] failed recipient=${to} reason=${cause}`);
      throw error;
    }
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
  if (env.RESEND_API_KEY) return new ResendEmailSender(env.RESEND_API_KEY);
  if (!env.SMTP_HOST) return new ConsoleEmailSender();

  const port = env.SMTP_PORT ?? 1025;
  return new SmtpEmailSender(
    createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    }),
  );
}

export const emailSender: EmailSender = buildEmailSender();
