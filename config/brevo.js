let brevoSDK = null;
let transactionalEmailApi = null;
let BrevoClient = null;

// Support both 'brevo' package and 'sib-api-v3-sdk' (official Brevo SDK name) as a fallback
try {
  brevoSDK = require('brevo');
  BrevoClient = brevoSDK;
  const brevoClient = new brevoSDK.ApiClient();
  brevoClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;
  transactionalEmailApi = new brevoSDK.TransactionalEmailsApi();
  console.log('✓ Brevo SDK (brevo) loaded');
} catch (err1) {
  try {
    // try official package name
    const SibApi = require('sib-api-v3-sdk');
    BrevoClient = SibApi;
    const client = SibApi.ApiClient.instance;
    const apiKey = client.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    transactionalEmailApi = new SibApi.TransactionalEmailsApi();
    brevoSDK = SibApi; // alias for SendSmtpEmail class access
    console.log('✓ Brevo SDK (sib-api-v3-sdk) loaded');
  } catch (err2) {
    console.warn('Brevo SDK not available; email sending disabled:', err1.message);
  }
}

// Send OTP email
const sendOTPEmail = async (email, otp, recipientName = 'User') => {
  if (!transactionalEmailApi || !brevoSDK) {
    console.warn(`Skipping sendOTPEmail to ${email} - Brevo not configured`);
    return { success: true, message: 'Email sending disabled (dev mode)' };
  }

  try {
    const SendSmtpEmail = brevoSDK.SendSmtpEmail || brevoSDK.SendSmtpEmail;
    const sendSmtpEmail = new SendSmtpEmail();
    sendSmtpEmail.subject = 'Your OTP for Drugs.ng Verification';
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 0; background-color: #f9f9f9; }
            .header { background: linear-gradient(135deg, #00bcd4 0%, #0097a7 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .logo { max-width: 200px; height: auto; margin: 0 auto 15px; display: block; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
            .content { background-color: white; padding: 40px 30px; border-radius: 0 0 5px 5px; }
            .greeting { font-size: 18px; color: #2c3e50; margin-bottom: 20px; font-weight: 500; }
            .description { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 25px; }
            .otp-box { background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); padding: 25px; text-align: center; border-radius: 8px; margin: 30px 0; border-left: 4px solid #00bcd4; }
            .otp-label { font-size: 13px; color: #0097a7; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
            .otp-code { font-size: 42px; font-weight: bold; color: #00bcd4; letter-spacing: 8px; font-family: monospace; }
            .validity { font-size: 13px; color: #666; margin-top: 15px; }
            .note { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #e65100; }
            .backup-info { background-color: #f3e5f5; border-left: 4px solid #9c27b0; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #6a1b9a; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            .footer p { margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://cdn.builder.io/api/v1/image/assets%2F59e93344ecf940faacc3f16a19f2960b%2F72bbbc03cabc4cdb838704d104c36c9e?format=webp&width=200" alt="Drugs.ng Logo" class="logo">
              <h1>Drugs.ng</h1>
            </div>
            <div class="content">
              <p class="greeting">Hello ${recipientName},</p>
              <p class="description">Your one-time password (OTP) for email verification is ready. Use the code below to complete your registration:</p>
              <div class="otp-box">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">${otp}</div>
                <div class="validity">Valid for <strong>5 minutes</strong></div>
              </div>
              <div class="note">
                <strong>⚠️ Security Alert:</strong> Never share this code with anyone. Drugs.ng staff will never ask for your OTP.
              </div>
              <div class="backup-info">
                <strong>💡 Backup Option:</strong> If you don't receive the OTP email or if sending fails, please contact our support team. They can provide you with a backup OTP code to verify your account.
              </div>
              <p class="description">If you didn't request this code, you can safely ignore this email. Your account will remain secure.</p>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Drugs.ng. All rights reserved.</p>
                <p>For support, contact us via WhatsApp or email at support@drugs.ng</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    sendSmtpEmail.sender = {
      name: 'Drugs.ng',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@drugs.ng'
    };
    sendSmtpEmail.to = [{ email: email, name: recipientName }];

    const response = await transactionalEmailApi.sendTransacEmail(sendSmtpEmail);
    console.log(`✉️  OTP email sent to ${email}. Message ID: ${response.messageId || response.messageId}`);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error('Error sending OTP email via Brevo:', error);
    throw error;
  }
};

// Send password reset email with OTP
const sendPasswordResetEmail = async (email, otp, recipientName = 'User') => {
  try {
    const sendSmtpEmail = new brevoSDK.SendSmtpEmail();
    sendSmtpEmail.subject = 'Reset Your Drugs.ng Password';
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 0; background-color: #f9f9f9; }
            .header { background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .logo { max-width: 200px; height: auto; margin: 0 auto 15px; display: block; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
            .content { background-color: white; padding: 40px 30px; border-radius: 0 0 5px 5px; }
            .greeting { font-size: 18px; color: #2c3e50; margin-bottom: 20px; font-weight: 500; }
            .description { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 25px; }
            .otp-box { background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); padding: 25px; text-align: center; border-radius: 8px; margin: 30px 0; border-left: 4px solid #d32f2f; }
            .otp-label { font-size: 13px; color: #b71c1c; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
            .otp-code { font-size: 42px; font-weight: bold; color: #d32f2f; letter-spacing: 8px; font-family: monospace; }
            .validity { font-size: 13px; color: #666; margin-top: 15px; }
            .warning { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #e65100; }
            .note { background-color: #f3e5f5; border-left: 4px solid #9c27b0; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #6a1b9a; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            .footer p { margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://cdn.builder.io/api/v1/image/assets%2F59e93344ecf940faacc3f16a19f2960b%2F72bbbc03cabc4cdb838704d104c36c9e?format=webp&width=200" alt="Drugs.ng Logo" class="logo">
              <h1>Drugs.ng</h1>
            </div>
            <div class="content">
              <p class="greeting">Hello ${recipientName},</p>
              <p class="description">We received a request to reset your password. Use the verification code below to confirm your identity:</p>
              <div class="otp-box">
                <div class="otp-label">Password Reset Code</div>
                <div class="otp-code">${otp}</div>
                <div class="validity">Valid for <strong>5 minutes</strong></div>
              </div>
              <div class="warning">
                <strong>⚠️ Security Alert:</strong> If you didn't request this password reset, your account might be at risk. Please change your password immediately or contact our support team.
              </div>
              <div class="note">
                <strong>💡 Tips:</strong> Never share this code with anyone. This code is only valid for 5 minutes. After expiration, you'll need to request a new one.
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Drugs.ng. All rights reserved.</p>
                <p>For support, contact us via WhatsApp or email at support@drugs.ng</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    sendSmtpEmail.sender = {
      name: 'Drugs.ng',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@drugs.ng'
    };
    sendSmtpEmail.to = [{
      email: email,
      name: recipientName
    }];

    const response = await transactionalEmailApi.sendTransacEmail(sendSmtpEmail);
    console.log(`✉️  Password reset email sent to ${email}. Message ID: ${response.messageId}`);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error('Error sending password reset email via Brevo:', error);
    throw error;
  }
};

// Send booking confirmation email
const sendBookingConfirmationEmail = async (email, bookingDetails, recipientName = 'User') => {
  try {
    const sendSmtpEmail = new brevoSDK.SendSmtpEmail();
    sendSmtpEmail.subject = '✅ Appointment Booking Confirmed - Drugs.ng';
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 0; background-color: #f9f9f9; }
            .header { background: linear-gradient(135deg, #27ae60 0%, #229954 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .logo { max-width: 200px; height: auto; margin: 0 auto 15px; display: block; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
            .content { background-color: white; padding: 40px 30px; border-radius: 0 0 5px 5px; }
            .greeting { font-size: 18px; color: #2c3e50; margin-bottom: 20px; font-weight: 500; }
            .description { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 25px; }
            .details-box { background: linear-gradient(135deg, #e8f8f5 0%, #d5f4e6 100%); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #27ae60; }
            .detail-item { margin: 12px 0; font-size: 14px; color: #2c3e50; }
            .detail-label { font-weight: 600; color: #16a085; }
            .reminder-box { background-color: #fef9e7; border-left: 4px solid #f39c12; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #d68910; }
            .support-box { background-color: #ebf5fb; border-left: 4px solid #3498db; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 13px; color: #2874a6; }
            .footer { text-align: center; font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            .footer p { margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://cdn.builder.io/api/v1/image/assets%2F01bff6d14aa548b2ab2583e4f3f687c7%2Ff35fc00e76f24785934b7375bdbb5029?format=webp&width=200" alt="Drugs.ng Logo" class="logo">
              <h1>✅ Appointment Confirmed</h1>
            </div>
            <div class="content">
              <p class="greeting">Dear ${recipientName},</p>
              <p class="description">Your appointment has been successfully booked! Please find the details below.</p>
              <div class="details-box">
                <div class="detail-item">
                  <span class="detail-label">👨‍⚕️ Doctor:</span> ${bookingDetails.doctorName || 'N/A'}
                </div>
                <div class="detail-item">
                  <span class="detail-label">🏥 Specialty:</span> ${bookingDetails.specialty || 'N/A'}
                </div>
                <div class="detail-item">
                  <span class="detail-label">📅 Date & Time:</span> ${bookingDetails.dateTime || 'N/A'}
                </div>
                <div class="detail-item">
                  <span class="detail-label">🎫 Booking ID:</span> ${bookingDetails.bookingId || 'N/A'}
                </div>
              </div>
              <div class="reminder-box">
                <strong>📍 Important Reminder:</strong> Please arrive 10 minutes before your scheduled appointment time. Bring any necessary medical documents or previous test results with you.
              </div>
              <div class="support-box">
                <strong>📞 Need Help?</strong> If you need to reschedule or cancel your appointment, please contact us through the Drugs.ng app or reach out to our support team.
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Drugs.ng. All rights reserved.</p>
                <p>For support, contact us via WhatsApp or email at support@drugs.ng</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
    sendSmtpEmail.sender = {
      name: 'Drugs.ng',
      email: process.env.BREVO_SENDER_EMAIL || 'noreply@drugs.ng'
    };
    sendSmtpEmail.to = [{
      email: email,
      name: recipientName
    }];

    const response = await transactionalEmailApi.sendTransacEmail(sendSmtpEmail);
    console.log(`✉️  Booking confirmation email sent to ${email}`);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error('Error sending booking confirmation email via Brevo:', error);
    throw error;
  }
};

module.exports = {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendBookingConfirmationEmail
};
