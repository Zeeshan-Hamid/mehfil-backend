const transporter = require('../config/email');
const emailTemplate = require('./emailTemplate');

class EmailService {
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