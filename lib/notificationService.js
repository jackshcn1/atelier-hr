import nodemailer from 'nodemailer';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function sendFailureEmail({ subject, message, errorDetails, failedReports = [] }) {
  const cfgPath = join(__dirname, '../scripts/petpooja-config.json');
  let cfg = {};
  if (existsSync(cfgPath)) {
    try {
      cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    } catch {}
  }

  const recipient = cfg.NOTIFICATION_EMAIL || 'atelier.trivandrum@gmail.com';
  const smtpUser = process.env.SMTP_USER || cfg.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS || cfg.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || cfg.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT || cfg.SMTP_PORT || 465);

  const reportListHtml = failedReports.length > 0
    ? `<h3>Failed Reports / Metrics:</h3><ul>${failedReports.map(r => `<li><b>${r.name}</b>: ${r.error || 'Timed out or not found'}</li>`).join('')}</ul>`
    : '';

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #dc2626; color: white; padding: 16px 20px;">
        <h2 style="margin: 0; font-size: 20px;">⚠️ Atelier Automated Sync Failure</h2>
      </div>
      <div style="padding: 20px;">
        <p style="font-size: 15px; margin-top: 0;"><b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)</p>
        <p style="font-size: 15px;"><b>Status:</b> ${message}</p>
        ${reportListHtml}
        ${errorDetails ? `<div style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; overflow-x: auto; margin-top: 15px;"><b>Error Details:</b><br/>${errorDetails}</div>` : ''}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">This is an automated alert from Atelier HR & Variable Pay Engine running on the local office computer.</p>
      </div>
    </div>
  `;

  if (!smtpUser || !smtpPass) {
    console.warn('\n⚠️  [Email Alert Skipped]: SMTP credentials (SMTP_USER & SMTP_PASS / App Password) are not configured in petpooja-config.json.');
    console.warn(`   Notification would have been sent to: ${recipient}`);
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from: `"Atelier Sync Engine" <${smtpUser}>`,
      to: recipient,
      subject: subject || `⚠️ Sync Alert: Petpooja & Google Sheets Failed (${new Date().toLocaleDateString('en-IN')})`,
      html: htmlBody
    });

    console.log(`📧 Failure notification email sent to ${recipient}`);
    return true;
  } catch (err) {
    console.error('❌ Failed to send alert email:', err.message);
    return false;
  }
}
