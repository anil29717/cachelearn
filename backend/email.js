import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { assertSafeHttpUrl, escapeHtml } from './utils/htmlEscape.js';
dotenv.config();

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const smtpFrom = process.env.SMTP_FROM || smtpUser;

export function getTransport() {
  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
  }
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  });
}

export async function sendVerificationEmail(to, link) {
  const safeLink = escapeHtml(assertSafeHttpUrl(link));
  const transporter = getTransport();
  const info = await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: 'Verify your email - Cache Learning',
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
        <h2>Verify your email</h2>
        <p>Thanks for signing up. Please verify your email to activate your account.</p>
        <p><a href="${safeLink}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">Verify Email</a></p>
        <p>If the button doesn’t work, copy and paste this link:</p>
        <p>${safeLink}</p>
        <p>This link expires in 48 hours.</p>
      </div>
    `,
  });
  return info;
}
