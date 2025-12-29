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

// Helper function to generate 6-digit verification code for mobile
const generateVerificationCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  const hashedCode = crypto
    .createHash('sha256')
    .update(code)
    .digest('hex');
  return { code, hashedCode };
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
    // Customer signup error
    
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
      vendorVerificationStatus: 'verified', // New vendors need admin verification
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
    // Vendor signup error
    
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
      // Check if this is a mobile user (by checking if they have authProvider === 'email' with no Google ID)
      const isMobileUser = user.authProvider === 'email' && !user.socialLogin?.googleId;
      
      if (isMobileUser) {
        // Generate and send verification code for mobile users
        const { code, hashedCode } = generateVerificationCode();
        user.emailVerificationToken = hashedCode;
        user.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save({ validateBeforeSave: false });

        // Get user's name
        const userName = user.role === 'customer' 
          ? user.customerProfile?.fullName 
          : user.vendorProfile?.ownerName;

        // Send verification code email
        await EmailService.sendVerificationCodeEmail(user.email, code, userName);

        return res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in. A verification code has been sent to your email address.',
          requiresVerification: true,
          email: user.email
        });
      } else {
        // Generate new verification token for web users
        const { token, hashedToken } = generateVerificationToken();
        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        await user.save({ validateBeforeSave: false });

        // Send new verification email
        const origin = `${req.protocol}://${req.get('host')}`;
        await EmailService.sendVerificationEmail(user.email, token, origin);

        return res.status(403).json({
          success: false,
          message: 'Please verify your email before logging in. A new verification email has been sent to your email address.'
        });
      }
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
    // Login error
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
        
      })
      .catch((error) => {
        // Failed to send password reset email
      });

    // Respond immediately to user
    res.status(200).json({
      success: true,
      message: 'If a user exists with this email, they will receive password reset instructions.'
    });
  } catch (error) {
    // Password reset error
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
    // Password reset error
    res.status(500).json({
      success: false,
      message: 'Error resetting password'
    });
  }
};

// ==================== MOBILE PASSWORD RESET FLOW ====================

// @desc    Send password reset code to email (Mobile)
// @route   POST /api/auth/forgot-password/mobile
// @access  Public
const forgotPasswordMobile = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return res.status(400).json({
        success: false,
        message: errorMessages,
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
        message: 'If a user exists with this email, they will receive a password reset code.'
      });
    }

    // Generate 6-digit reset code
    const { code, hashedCode } = generateVerificationCode();

    // Save hashed code
    user.passwordResetToken = hashedCode;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    // Get user's name
    const userName = user.role === 'customer' 
      ? user.customerProfile?.fullName 
      : user.vendorProfile?.ownerName;

    // Send reset code email asynchronously
    EmailService.sendPasswordResetCodeEmail(email, code, userName)
      .then(() => {
        // Code sent successfully
      })
      .catch((error) => {
        console.error('Failed to send password reset code:', error);
      });

    // Respond immediately to user
    res.status(200).json({
      success: true,
      message: 'If a user exists with this email, they will receive a password reset code.'
    });
  } catch (error) {
    console.error('Forgot password mobile error:', error);
    res.status(500).json({
      success: false,
      message: 'There was an error sending the password reset code. Please try again later.'
    });
  }
};

// @desc    Verify password reset code (Mobile)
// @route   POST /api/auth/verify-reset-code
// @access  Public
const verifyResetCode = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return res.status(400).json({
        success: false,
        message: errorMessages,
        errors: errors.array()
      });
    }

    const { email, code } = req.body;

    // Hash the provided code
    const hashedCode = crypto
      .createHash('sha256')
      .update(code.trim())
      .digest('hex');

    // Find user with matching code
    const user = await User.findOne({
      email,
      passwordResetToken: hashedCode,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code. Please request a new code.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Reset code verified successfully. You can now reset your password.',
      data: {
        email: user.email
      }
    });
  } catch (error) {
    console.error('Verify reset code error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying reset code. Please try again.'
    });
  }
};

// @desc    Reset password with verified code (Mobile)
// @route   POST /api/auth/reset-password/mobile
// @access  Public
const resetPasswordMobile = async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('🔐 MOBILE PASSWORD RESET REQUEST');
    console.log('========================================');
    console.log('Email:', req.body.email);
    console.log('Code received:', req.body.code ? 'Yes' : 'No');
    console.log('Password received:', req.body.password ? 'Yes (length: ' + req.body.password?.length + ')' : 'No');
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      console.log('❌ Validation errors:', errors.array());
      console.log('Error messages:', errorMessages);
      console.log('========================================\n');
      return res.status(400).json({
        success: false,
        message: errorMessages,
        errors: errors.array()
      });
    }

    const { email, code, password } = req.body;
    console.log('✅ Validation passed');

    // Hash the provided code
    const hashedCode = crypto
      .createHash('sha256')
      .update(code.trim())
      .digest('hex');

    // Find user with matching code
    const user = await User.findOne({
      email,
      passwordResetToken: hashedCode,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('❌ User not found with provided code');
      console.log('========================================\n');
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset code. Please request a new code.'
      });
    }

    console.log('✅ User found, updating password...');

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    console.log('✅ Password updated successfully');

    // Send confirmation email
    await EmailService.sendPasswordResetConfirmation(user.email);

    console.log('✅ Confirmation email sent');
    console.log('========================================\n');

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password mobile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password. Please try again.'
    });
  }
};

// ==================== END MOBILE PASSWORD RESET FLOW ====================

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
    
    // Email verification completed

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
    // Email verification error
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
    // Resend verification email error
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
    // Change password error
    res.status(500).json({
      success: false,
      message: 'Error changing password'
    });
  }
};

// @desc    Register a new customer (Mobile with verification code)
// @route   POST /api/auth/signup/mobile/customer
// @access  Public
const signupMobileCustomer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return res.status(400).json({
        success: false,
        message: errorMessages,
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

    // Generate 6-digit verification code
    const { code, hashedCode } = generateVerificationCode();

    // Create new customer with verification code
    const newCustomer = new User({
      email,
      password,
      phoneNumber,
      role: 'customer',
      authProvider: 'email',
      emailVerificationToken: hashedCode,
      emailVerificationExpires: Date.now() + 10 * 60 * 1000, // 10 minutes
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

    // Send verification code email
    await EmailService.sendVerificationCodeEmail(email, code, fullName);

    // Remove sensitive data from response
    const customerResponse = newCustomer.toObject();
    delete customerResponse.password;
    delete customerResponse.vendorProfile;
    delete customerResponse.emailVerificationToken;
    delete customerResponse.emailVerificationExpires;

    customerResponse.profileCompleted = customerResponse.customerProfile.profileCompleted;

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully. Please check your email for the verification code.',
      data: {
        user: customerResponse,
        requiresVerification: true
      }
    });

  } catch (error) {
    console.error('Mobile customer signup error:', error);
    
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

// @desc    Register a new vendor (Mobile with verification code)
// @route   POST /api/auth/signup/mobile/vendor
// @access  Public
const signupMobileVendor = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return res.status(400).json({
        success: false,
        message: errorMessages,
        errors: errors.array()
      });
    }

    const {
      businessName,
      ownerName,
      email,
      password,
      phoneNumber,
      streetAddress,
      city,
      state,
      zipCode
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Generate 6-digit verification code
    const { code, hashedCode } = generateVerificationCode();

    // Create new vendor with verification code
    const newVendor = new User({
      email,
      password,
      phoneNumber,
      role: 'vendor',
      authProvider: 'email',
      emailVerificationToken: hashedCode,
      emailVerificationExpires: Date.now() + 10 * 60 * 1000, // 10 minutes
      vendorProfile: {
        ownerName,
        businessName,
        businessAddress: {
          street: streetAddress,
          city,
          state,
          zipCode,
          country: 'United States'
        }
      }
    });

    // Save vendor to database
    await newVendor.save();

    // Send verification code email
    await EmailService.sendVerificationCodeEmail(email, code, ownerName);

    // Remove sensitive data from response
    const vendorResponse = newVendor.toObject();
    delete vendorResponse.password;
    delete vendorResponse.customerProfile;
    delete vendorResponse.emailVerificationToken;
    delete vendorResponse.emailVerificationExpires;

    vendorResponse.profileCompleted = vendorResponse.vendorProfile.profileCompleted;

    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully. Please check your email for the verification code.',
      data: {
        user: vendorResponse,
        requiresVerification: true
      }
    });

  } catch (error) {
    console.error('Mobile vendor signup error:', error);
    
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

// @desc    Verify email with code
// @route   POST /api/auth/verify-email
// @access  Public
const verifyEmailWithCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    // Hash the provided code
    const hashedCode = crypto
      .createHash('sha256')
      .update(code)
      .digest('hex');

    // Find user with matching email and verification code
    const user = await User.findOne({
      email,
      emailVerificationToken: hashedCode,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Mark email as verified and clear verification fields
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Prepare user response
    const userResponse = user.toObject();
    delete userResponse.password;
    
    if (user.role === 'customer') {
      delete userResponse.vendorProfile;
      userResponse.profileCompleted = user.customerProfile.profileCompleted;
    } else {
      delete userResponse.customerProfile;
      userResponse.profileCompleted = user.vendorProfile.profileCompleted;
    }

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Resend verification code
// @route   POST /api/auth/resend-verification-code
// @access  Public
const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user
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

    // Generate new verification code
    const { code, hashedCode } = generateVerificationCode();

    // Update user with new code
    user.emailVerificationToken = hashedCode;
    user.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Get user's name
    const userName = user.role === 'customer' 
      ? user.customerProfile?.fullName 
      : user.vendorProfile?.ownerName;

    // Send verification code email
    await EmailService.sendVerificationCodeEmail(email, code, userName);

    res.status(200).json({
      success: true,
      message: 'Verification code has been resent to your email'
    });

  } catch (error) {
    console.error('Resend verification code error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resending verification code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  signupCustomer,
  signupVendor,
  signupMobileCustomer,
  signupMobileVendor,
  verifyEmailWithCode,
  resendVerificationCode,
  login,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  forgotPasswordMobile,
  verifyResetCode,
  resetPasswordMobile,
  verifyEmail,
  resendVerificationEmail,
  changePassword
}; 