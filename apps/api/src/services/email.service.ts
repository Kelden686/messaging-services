import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

// Lazy-initialized transporter
let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (transporter) return transporter;

  if (config.EMAIL_USER && config.EMAIL_PASS) {
    if (config.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT || 587,
        secure: config.SMTP_PORT === 465,
        auth: {
          user: config.EMAIL_USER,
          pass: config.EMAIL_PASS,
        },
      });
    } else {
      // Default to Gmail service
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: config.EMAIL_USER,
          pass: config.EMAIL_PASS,
        },
      });
    }
  }

  return transporter;
};

export const sendOtpEmail = async (
  toEmail: string,
  otpCode: string
): Promise<{ sent: boolean; message: string }> => {
  const mailer = getTransporter();

  // If email credentials are not yet configured in .env
  if (!mailer || !config.EMAIL_USER) {
    console.warn(`\n⚠️  [EMAIL SERVICE WARNING]`);
    console.warn(`EMAIL_USER or EMAIL_PASS is not configured in .env.`);
    console.warn(`To receive real emails in Gmail:`);
    console.warn(`1. Enable 2-Step Verification on your Google Account`);
    console.warn(`2. Generate an App Password at https://myaccount.google.com/apppasswords`);
    console.warn(`3. Add to your root .env file:`);
    console.warn(`   EMAIL_USER=your_email@gmail.com`);
    console.warn(`   EMAIL_PASS=your_16_char_app_password\n`);
    console.warn(`🔑 [DEV FALLBACK] OTP for ${toEmail}: ${otpCode}\n`);

    return {
      sent: false,
      message: 'Email credentials not configured in .env. OTP printed to server terminal for testing.',
    };
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
        .container { max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
        .header { background: #00a884; padding: 32px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
        .content { padding: 32px 24px; text-align: center; color: #333333; }
        .content p { font-size: 15px; line-height: 1.6; color: #555555; margin: 0 0 24px; }
        .otp-box { display: inline-block; background: #e8f7f3; border: 2px dashed #00a884; border-radius: 12px; padding: 16px 36px; margin: 12px 0 28px; }
        .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #00a884; letter-spacing: 8px; }
        .footer { background: #fafafa; border-top: 1px solid #eeeeee; padding: 20px 24px; text-align: center; font-size: 12px; color: #999999; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header" style="background: linear-gradient(135deg, #0066ff, #8b5cf6); padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Beam Chat</h1>
          <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Secure Email Verification</p>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>Welcome to <strong>Beam Chat</strong>! Please use the following 6-digit verification code to complete your registration:</p>
          <div class="otp-box" style="display: inline-block; background: #f3f0ff; border: 2px dashed #8b5cf6; border-radius: 14px; padding: 18px 40px; margin: 12px 0 28px;">
            <span class="otp-code" style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; color: #6d28d9; letter-spacing: 8px;">${otpCode}</span>
          </div>
          <p>This code is valid for <strong>10 minutes</strong>. Never share this code with anyone.</p>
          <p style="font-size: 13px; color: #888888; margin-top: 24px;">If you did not request this verification code, you can safely ignore this email.</p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Beam Chat. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: `"Beam Chat" <${config.EMAIL_USER}>`,
      to: toEmail,
      subject: `Beam Chat Verification Code: ${otpCode}`,
      text: `Your Beam Chat verification code is ${otpCode}. It expires in 10 minutes.`,
      html: htmlContent,
    });

    console.log(`\n📧 Real-time OTP email successfully delivered to: ${toEmail}\n`);

    return {
      sent: true,
      message: `Verification code sent to ${toEmail}`,
    };
  } catch (error: any) {
    console.error(`❌ Failed to send OTP email to ${toEmail}:`, error.message);
    console.warn(`🔑 [FALLBACK] OTP for ${toEmail}: ${otpCode}\n`);

    return {
      sent: false,
      message: `Failed to deliver email: ${error.message}. Simulated in server console.`,
    };
  }
};
