const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const EmailService = require('../../services/emailService');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Helper function to generate verification token
const generateVerificationToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  return { token, hashedToken };
};

// @desc    Register a new customer
// @route   POST /api/auth/signup/customer
// @access  Public
const signupCustomer = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      fullName,
      email,
      password,
      phoneNumber,
      city,
      state,
      country,
      zipCode,
      gender
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate verification token
    const { token, hashedToken } = generateVerificationToken();

    // Create new customer with verification token
    const newCustomer = new User({
      email,
      password,
      phoneNumber,
      role: 'customer',
      emailVerificationToken: hashedToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      customerProfile: {
        fullName,
        gender,
        location: {
          city,
          state,
          country: country || 'United States',
          zipCode
        }
      }
    });

    // Save customer to database
    await newCustomer.save();

    // Send verification email
    const origin = `${req.protocol}://${req.get('host')}`;
    await EmailService.sendVerificationEmail(email, token, origin);

    // Remove password and unwanted profiles from response
    const customerResponse = newCustomer.toObject();
    delete customerResponse.password;
    delete customerResponse.vendorProfile;
    delete customerResponse.emailVerificationToken;
    delete customerResponse.emailVerificationExpires;

    // Add profileCompleted flag to response
    customerResponse.profileCompleted = customerResponse.customerProfile.profileCompleted;

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully. Please check your email to verify your account.',
      data: {
        user: customerResponse
      }
    });

  } catch (error) {
    console.error('Customer signup error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during customer registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Register a new vendor
// @route   POST /api/auth/signup/vendor
// @access  Public
const signupVendor = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      businessName,
      ownerName,
      email,
      password,
      phoneNumber,
      street,
      city,
      state,
      country,
      zipCode,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate verification token
    const { token, hashedToken } = generateVerificationToken();

    // Create new vendor with verification token
    const newVendor = new User({
      email,
      password,
      phoneNumber,
      role: 'vendor',
      emailVerificationToken: hashedToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      vendorProfile: {
        businessName,
        ownerName,
        businessAddress: {
          street: street || undefined,
          city: city || undefined,
          state: state || undefined,
          country: country || 'United States',
          zipCode
        },
        // Set default values for required fields - we'll set these as temporary values
        serviceDescription: 'Service description to be updated during profile setup',
        experienceYears: 0,
        serviceAreas: city ? [city] : [],
        pricing: {
          startingPrice: 0,
          currency: 'USD',
          pricingType: 'custom'
        }
      }
    });

    // Save vendor to database
    await newVendor.save();

    // Send verification email
    const origin = `${req.protocol}://${req.get('host')}`;
    await EmailService.sendVerificationEmail(email, token, origin);

    // Remove password and unwanted profiles from response
    const vendorResponse = newVendor.toObject();
    delete vendorResponse.password;
    delete vendorResponse.customerProfile;
    delete vendorResponse.emailVerificationToken;
    delete vendorResponse.emailVerificationExpires;

    // Add profileCompleted flag to response
    vendorResponse.profileCompleted = vendorResponse.vendorProfile.profileCompleted;

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully. Please check your email to verify your account.',
      data: {
        user: vendorResponse
      }
    });

  } catch (error) {
    console.error('Vendor signup error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during vendor registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Login user (customer/vendor/admin)
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user by email and include password for comparison
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if email is verified - strict check
    if (!user.emailVerified) {
      // Generate new verification token if the old one is expired
      const { token, hashedToken } = generateVerificationToken();
      user.emailVerificationToken = hashedToken;
      user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      await user.save({ validateBeforeSave: false });

      // Send new verification email
      const origin = `${req.protocol}://${req.get('host')}`;
      await EmailService.sendVerificationEmail(user.email, token, origin);

      return res.status(401).json({
        success: false,
        message: 'Please verify your email before logging in. A new verification email has been sent to your email address.'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Remove sensitive information from response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.emailVerificationExpires;
    delete userResponse.passwordResetToken;
    delete userResponse.passwordResetExpires;
    
    // Remove unwanted profile based on role and add profileCompleted flag
    if (user.role === 'customer') {
      delete userResponse.vendorProfile;
      userResponse.profileCompleted = userResponse.customerProfile.profileCompleted;
    } else if (user.role === 'vendor') {
      delete userResponse.customerProfile;
      userResponse.profileCompleted = userResponse.vendorProfile.profileCompleted;
    }

    res.status(200).json({
      success: true,
      message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} logged in successfully`,
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      // Return 200 to prevent email enumeration
      return res.status(200).json({
        success: true,
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
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour (60 minutes)
    await user.save({ validateBeforeSave: false });

    // Send reset email asynchronously (don't wait for email to send)
    const origin = `${req.protocol}://${req.get('host')}`;
    EmailService.sendPasswordResetEmail(email, resetToken, origin)
      .then(() => {
        console.log(`✅ Password reset email sent successfully to ${email}`);
      })
      .catch((error) => {
        console.error(`❌ Failed to send password reset email to ${email}:`, error);
      });

    // Respond immediately to user
    res.status(200).json({
      success: true,
      message: 'If a user exists with this email, they will receive password reset instructions.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'There was an error sending the password reset email. Please try again later.'
    });
  }
};

// @desc    Verify reset token
// @route   GET /api/auth/reset-password/:token
// @access  Public
const verifyResetToken = async (req, res) => {
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
        success: false,
        message: 'Password reset token is invalid or has expired'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token is valid'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verifying reset token'
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token } = req.params;
    const { password } = req.body;

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
        success: false,
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
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password'
    });
  }
};

// @desc    Verify email and auto-login
// @route   GET /api/auth/verify-email/:token
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification link'
      });
    }

    // Update user
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Generate JWT token for auto-login
    const authToken = generateToken(user._id);

    // Send success email
    await EmailService.sendVerificationSuccessEmail(user.email);

    // Remove sensitive information from response
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.emailVerificationToken;
    delete userResponse.emailVerificationExpires;
    delete userResponse.passwordResetToken;
    delete userResponse.passwordResetExpires;

    // Remove unwanted profile based on role and add profileCompleted flag
    if (user.role === 'customer') {
      delete userResponse.vendorProfile;
      userResponse.profileCompleted = userResponse.customerProfile.profileCompleted;
    } else if (user.role === 'vendor') {
      delete userResponse.customerProfile;
      userResponse.profileCompleted = userResponse.vendorProfile.profileCompleted;
    }

    // Create a response object with verification success data
    const responseData = {
      success: true,
      message: 'Email verified successfully. You are now logged in.',
      data: {
        user: userResponse,
        token: authToken
      }
    };

    // Encode the response data to be included in the URL
    const encodedData = Buffer.from(JSON.stringify(responseData)).toString('base64');

    // Instead of redirecting to the frontend with just the token, include the encoded data
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/verify-email/success?data=${encodedData}`;
    
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying email'
    });
  }
};

// New resend verification email endpoint
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new verification token
    const { token, hashedToken } = generateVerificationToken();

    // Update user with new token
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    await user.save();

    // Send new verification email
    const origin = `${req.protocol}://${req.get('host')}`;
    await EmailService.sendVerificationEmail(email, token, origin);

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    console.error('Resend verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending verification email'
    });
  }
};

// @desc    Change password for authenticated user
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Find user with password field included
    const user = await User.findById(userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user signed up with Google
    if (user.authProvider === 'google') {
      return res.status(400).json({
        success: false,
        message: 'Password cannot be changed for Google-authenticated accounts'
      });
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = Date.now();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password'
    });
  }
};

module.exports = {
  signupCustomer,
  signupVendor,
  login,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
  changePassword
}; 