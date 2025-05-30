const crypto = require('crypto');
const User = require('../models/User');
const EmailService = require('../services/emailService');
const { promisify } = require('util');

// Rate limiting for password reset attempts
const passwordResetAttempts = new Map();
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const checkRateLimit = (email) => {
  const now = Date.now();
  const attempts = passwordResetAttempts.get(email) || [];
  
  // Remove attempts outside the window
  const validAttempts = attempts.filter(timestamp => now - timestamp < WINDOW_MS);
  passwordResetAttempts.set(email, validAttempts);
  
  return validAttempts.length < MAX_ATTEMPTS;
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide your email address'
      });
    }

    // Check rate limit
    if (!checkRateLimit(email)) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many password reset attempts. Please try again in an hour.'
      });
    }

    // Record attempt
    const attempts = passwordResetAttempts.get(email) || [];
    attempts.push(Date.now());
    passwordResetAttempts.set(email, attempts);

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      // Return 200 to prevent email enumeration
      return res.status(200).json({
        status: 'success',
        message: 'If a user exists with this email, they will receive password reset instructions.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Save hashed token
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    // Send reset email
    const origin = `${req.protocol}://${req.get('host')}`;
    await EmailService.sendPasswordResetEmail(email, resetToken, origin);

    res.status(200).json({
      status: 'success',
      message: 'If a user exists with this email, they will receive password reset instructions.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'There was an error sending the password reset email. Please try again later.'
    });
  }
};

exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Password reset token is invalid or has expired'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Token is valid'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error verifying reset token'
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, passwordConfirm } = req.body;

    if (!password || !passwordConfirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide password and password confirmation'
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({
        status: 'error',
        message: 'Passwords do not match'
      });
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Send confirmation email
    await EmailService.sendPasswordResetConfirmation(user.email);

    res.status(200).json({
      status: 'success',
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error resetting password'
    });
  }
}; 