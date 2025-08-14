const transporter = require('../config/email');
const emailTemplate = require('./emailTemplate');

class EmailService {
  static formatCurrency(amount, currency = 'usd') {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(Number(amount || 0));
    } catch (e) {
      return `$${Number(amount || 0).toFixed(2)}`;
    }
  }

  static buildOrderItemsTable(items = [], currency = 'usd') {
    const rows = items.map((item, index) => {
      const eventName = item.display?.name || 'Event';
      const pkg = item.display?.description || 'Package';
      const date = item.eventDate ? new Date(item.eventDate).toLocaleDateString() : '-';
      const qty = item.attendees || 1;
      const price = this.formatCurrency(item.totalPrice, currency);

      return `
        <tr>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee;">${index + 1}.</td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee;">
            <div style="font-weight: 600; color: #333;">${eventName}</div>
            <div style="font-size: 13px; color: #777;">${pkg}</div>
            <div style="font-size: 12px; color: #999;">Date: ${date}</div>
          </td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee; text-align:center;">${qty}</td>
          <td style="padding: 12px 10px; border-bottom: 1px solid #eee; text-align:right;">${price}</td>
        </tr>
      `;
    }).join('');

    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr>
            <th style="text-align:left; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">#</th>
            <th style="text-align:left; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">Item</th>
            <th style="text-align:center; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">Qty</th>
            <th style="text-align:right; padding: 8px 10px; color:#999; font-weight:600; font-size:12px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  static buildOrderTotals(subtotal, tax, total, currency = 'usd') {
    return `
      <div style="margin-top: 10px;">
        <div style="display:flex; justify-content: space-between; padding: 6px 4px; color:#555;">
          <span>Subtotal</span>
          <span>${this.formatCurrency(subtotal, currency)}</span>
        </div>
        <div style="display:flex; justify-content: space-between; padding: 6px 4px; color:#555;">
          <span>Tax</span>
          <span>${this.formatCurrency(tax, currency)}</span>
        </div>
        <div style="display:flex; justify-content: space-between; padding: 10px 4px; font-weight:700; color:#333; border-top:1px solid #eee; margin-top:6px;">
          <span>Total</span>
          <span>${this.formatCurrency(total, currency)}</span>
        </div>
      </div>
    `;
  }

  static async sendBookingConfirmationEmail({ toEmail, customerName, sessionId, currency = 'usd', items = [], subtotal = 0, tax = 0, total = 0 }) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const title = 'Your Mehfil Booking is Confirmed!';

    const orderHeader = `
      <div style="text-align:left; margin-bottom: 12px;">
        <div style="font-size:14px; color:#555;">Order Reference</div>
        <div style="font-weight:700; font-size:16px; color:#333;">${sessionId || ''}</div>
      </div>
    `;

    const greeting = `
      <p style="text-align:left;">Hi ${customerName || 'there'},</p>
      <p style="text-align:left;">Thank you for your booking on Mehfil. Your payment was received and your order is confirmed. Below are your booking details:</p>
    `;

    const itemsTable = this.buildOrderItemsTable(items, currency);
    const totals = this.buildOrderTotals(subtotal, tax, total, currency);

    const content = `
      ${orderHeader}
      ${greeting}
      ${itemsTable}
      ${totals}
      <p style="text-align:left; color:#777; font-size:13px;">You'll also find this order in your dashboard under <strong>My Orders</strong>. If anything looks off, reply to this email and we'll help.</p>
    `;

    const button = { text: 'View My Orders', url: `${frontendUrl}/customer_profile_dash?tab=My%20Orders` };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: 'Booking Confirmation - Mehfil',
      html,
    };

    try {
      const info = await transporter.sendMail(message);
      console.log('✅ Booking confirmation email sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Error sending booking confirmation email:', error);
      // Do not throw to avoid failing webhook flow
      return false;
    }
  }

  static async sendPasswordResetEmail(email, resetToken, origin) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const title = 'Password Reset Request';
    const content = `
      <p>You requested to reset your password. Please click the button below to proceed. This link will expire in 1 hour.</p>
    `;
    const button = { text: 'Reset Password', url: resetUrl };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request - Mehfil',
      html,
    };

    try {
      console.log(`📧 Attempting to send password reset email to ${email}`);
      const startTime = Date.now();
      
      const info = await transporter.sendMail(message);
      const endTime = Date.now();
      
      console.log(`✅ Password reset email sent successfully to ${email} in ${endTime - startTime}ms`);
      console.log('Message ID:', info.messageId);
      
      return true;
    } catch (error) {
      console.error(`❌ Error sending password reset email to ${email}:`, error);
      console.error('Error details:', {
        code: error.code,
        response: error.response,
        responseCode: error.responseCode
      });
      throw new Error('Failed to send password reset email');
    }
  }

  static async sendPasswordResetConfirmation(email) {
    const title = 'Password Reset Successful';
    const content = `
      <p>Your password has been successfully reset. You can now use your new password to log in.</p>
      <p>If you did not perform this action, please contact our support team immediately.</p>
    `;

    const html = emailTemplate(title, content);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Successful - Mehfil',
      html,
    };

    try {
      await transporter.sendMail(message);
      return true;
    } catch (error) {
      console.error('Error sending password reset confirmation:', error);
      throw new Error('Failed to send password reset confirmation');
    }
  }

  static async sendVerificationEmail(email, verificationToken, origin) {
    const verificationUrl = `${origin}/api/auth/verify-email/${verificationToken}`;

    const title = 'Welcome to Mehfil!';
    const content = `
      <p>Thank you for signing up! Please click the button below to verify your email address and complete your registration. This link will expire in 24 hours.</p>
    `;
    const button = { text: 'Verify Email', url: verificationUrl };

    const html = emailTemplate(title, content, button);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification - Mehfil',
      html,
    };

    try {
      await transporter.sendMail(message);
      return true;
    } catch (error) {
      console.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  static async sendVerificationSuccessEmail(email) {
    const title = 'Email Verified Successfully!';
    const content = `
      <p>Welcome to the Mehfil community! Your email has been successfully verified, and you can now log in to your account.</p>
    `;

    const html = emailTemplate(title, content);

    const message = {
      from: `"Mehfil" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verified Successfully - Mehfil',
      html,
    };

    try {
      await transporter.sendMail(message);
      return true;
    } catch (error) {
      console.error('Error sending verification success email:', error);
      throw new Error('Failed to send verification success email');
    }
  }
}

module.exports = EmailService; 