import nodemailer from 'nodemailer';
import { canonicalOrigin, type AppConfig } from '../config.js';
export function createSmtpDelivery(config: AppConfig) {
  const origin = canonicalOrigin(config.APP_ORIGIN ?? '');
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_PORT === 465,
    requireTLS: true, auth: { user: config.SMTP_USER!, pass: config.SMTP_PASSWORD! },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
  });
  return async (email: string, token: string) => {
    try {
      await transport.sendMail({ from: config.SMTP_FROM, to: email,
        subject: 'Reset your STICH BILL password',
        text: `Reset your password: ${origin}/#reset=${token}\nThis link expires in 20 minutes.`,
      });
    } catch {
      // Provider exceptions can contain addresses, credentials or recovery links.
      console.error('STICH BILL recovery delivery failed');
      throw new Error('Recovery delivery failed');
    }
  };
}
