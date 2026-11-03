// apps/server/src/modules/auth/mailer.ts
// Email delivery service using nodemailer

import nodemailer from 'nodemailer';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            }
          : undefined,
    });
  }
  return transporter;
}

export interface MailerService {
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
}

export class DefaultMailerService implements MailerService {
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${config.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    const deepLink = `${config.DEEP_LINK_SCHEME}://reset-password?token=${encodeURIComponent(token)}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ff3b30;">RUN ALIVE — Password Reset</h2>
        <p>You requested a password reset for your RUN ALIVE account.</p>
        <p>Click the link below or paste it in your browser to choose a new password. This link expires in 30 minutes.</p>
        <p style="margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #ff3b30; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">
          If the button does not work, open the app directly with: <br/>
          <a href="${deepLink}">${deepLink}</a>
        </p>
        <p style="font-size: 12px; color: #999; margin-top: 40px;">
          If you did not request this, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </div>
    `;

    try {
      if (config.NODE_ENV === 'test') {
        logger.debug({ email, token }, 'Test mode: skipping actual email send');
        return;
      }

      await getTransporter().sendMail({
        from: config.EMAIL_FROM,
        to: email,
        subject: 'RUN ALIVE — Password Reset Request',
        text: `You requested a password reset. Use this link within 30 minutes: ${resetUrl}`,
        html,
      });
      logger.info({ email }, 'Password reset email sent');
    } catch (err) {
      logger.error({ err, email }, 'Failed to send password reset email');
      // Do not rethrow to avoid leaking SMTP errors to client
    }
  }
}

export const mailer: MailerService = new DefaultMailerService();
