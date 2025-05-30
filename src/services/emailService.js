const transporter = require('../config/email');

class EmailService {
  static async sendPasswordResetEmail(email, resetToken, origin) {
    const resetUrl = `${origin}/api/auth/reset-password/${resetToken}`;
    
    const message = {
      from: process.env.EMAIL_FROM || 'noreply@mehfil.com',
      to: email,
      subject: 'Password Reset Request - Mehfil',
      html: `
        <h1>Password Reset Request</h1>
        <p>You requested to reset your password. Please click the link below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
        <p>If you didn't request this, please ignore this email.</p>
        <p>This link will expire in 10 minutes.</p>
        <p>Best regards,<br>Mehfil Team</p>
      `
    };

    try {
      await transporter.sendMail(message);
      return true;
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  static async sendPasswordResetConfirmation(email) {
    const message = {
      from: process.env.EMAIL_FROM || 'noreply@mehfil.com',
      to: email,
      subject: 'Password Reset Successful - Mehfil',
      html: `
        <h1>Password Reset Successful</h1>
        <p>Your password has been successfully reset.</p>
        <p>If you did not perform this action, please contact our support team immediately.</p>
        <p>Best regards,<br>Mehfil Team</p>
      `
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
    
    const message = {
      from: process.env.EMAIL_FROM || 'noreply@mehfil.com',
      to: email,
      subject: 'Email Verification - Mehfil',
      html: `
        <h1>Welcome to Mehfil!</h1>
        <p>Thank you for signing up. Please click the button below to verify your email address:</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px;">Verify Email</a>
        <p>If you didn't create an account with us, please ignore this email.</p>
        <p>This link will expire in 24 hours.</p>
        <p>Best regards,<br>Mehfil Team</p>
      `
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
    const message = {
      from: process.env.EMAIL_FROM || 'noreply@mehfil.com',
      to: email,
      subject: 'Email Verified Successfully - Mehfil',
      html: `
        <h1>Email Verified Successfully!</h1>
        <p>Your email has been successfully verified. You can now log in to your Mehfil account.</p>
        <p>Best regards,<br>Mehfil Team</p>
      `
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