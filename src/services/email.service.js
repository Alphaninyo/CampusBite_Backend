const nodemailer = require('nodemailer');

const CONFIGURED = !!(
  process.env.EMAIL_HOST &&
  process.env.EMAIL_USER &&
  process.env.EMAIL_PASS
);

let transporter;
if (CONFIGURED) {
  transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
} else {
  console.warn('[EMAIL] SMTP env vars missing — emails will be logged to console only.');
}

/**
 * Sends a password-reset OTP email.
 * Falls back to console logging when SMTP is not configured (development).
 *
 * @param {string} email  - Recipient email address
 * @param {string} name   - Recipient display name
 * @param {string} otp    - 6-digit one-time password (plain, before hashing)
 */
async function sendPasswordReset(email, name, otp) {
  if (!CONFIGURED) {
    console.log(`[EMAIL DEV] Password reset OTP for ${email}: ${otp}  (expires in 10 min)`);
    return;
  }

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM || 'CampusBite <noreply@campusbite.com>',
    to:      email,
    subject: 'CampusBite — Password Reset Code',
    html: `
      <h2>Hello ${name},</h2>
      <p>Use the code below to reset your CampusBite password.</p>
      <h1 style="letter-spacing:8px;">${otp}</h1>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you did not request a password reset, ignore this email.</p>
    `,
  });
}

module.exports = { sendPasswordReset };
