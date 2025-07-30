const express = require('express');
const router = express.Router();
const {
  signupCustomer,
  signupVendor,
  login,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  verifyEmail,
  resendVerificationEmail
} = require('../../controllers/auth/authController');
const User = require('../../models/User');
const { protect: authMiddleware } = require('../../middleware/authMiddleware');

const {
  validateCustomerSignup,
  validateVendorSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword
} = require('../../validators/authValidators');
const passport = require('passport');
const jwt = require('jsonwebtoken');

// Rate limiting middleware
const rateLimit = require('express-rate-limit');
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: 'Too many password reset attempts. Please try again in an hour.'
});

const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: 'Too many verification email requests. Please try again in an hour.'
});

// Generate JWT Token
// This helper function can be moved to a shared utility file later
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// @route   POST /api/auth/signup/customer
// @desc    Register a new customer
// @access  Public
router.post('/signup/customer', validateCustomerSignup, signupCustomer);

// @route   POST /api/auth/signup/vendor
// @desc    Register a new vendor
// @access  Public
router.post('/signup/vendor', validateVendorSignup, signupVendor);

// @route   POST /api/auth/login
// @desc    Login user (customer/vendor/admin)
// @access  Public
router.post('/login', validateLogin, login);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Test route to verify Google OAuth configuration
// @route   GET /api/auth/google/test
// @desc    Test Google OAuth configuration
// @access  Public
router.get('/google/test', (req, res) => {
  res.json({
    success: true,
    message: 'Google OAuth routes are working',
    config: {
      clientId: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'Configured' : 'Not configured',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'Not configured',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      expectedRedirectUri: 'http://localhost:8000/api/auth/google/callback'
    },
    instructions: {
      step1: 'Make sure GOOGLE_REDIRECT_URI in your .env file is: http://localhost:8000/api/auth/google/callback',
      step2: 'In Google Cloud Console, add this exact URI to Authorized redirect URIs: http://localhost:8000/api/auth/google/callback',
      step3: 'Restart your backend server after making changes'
    }
  });
});

// Google OAuth Routes
// @route   GET /api/auth/google/customer
// @desc    Initiate Google login for customers
// @access  Public
router.get('/google/customer', (req, res, next) => {
  console.log('Google OAuth customer route hit');
  console.log('Current redirect URI:', process.env.GOOGLE_REDIRECT_URI);
  
  // Add state parameter to the request
  req.query.state = 'customer';
  passport.authenticate('google', {
    state: 'customer',
    session: false
  })(req, res, next);
});

// @route   GET /api/auth/google/vendor
// @desc    Initiate Google login for vendors
// @access  Public
router.get('/google/vendor', (req, res, next) => {
  console.log('Google OAuth vendor route hit');
  console.log('Current redirect URI:', process.env.GOOGLE_REDIRECT_URI);
  
  // Add state parameter to the request
  req.query.state = 'vendor';
  passport.authenticate('google', {
    state: 'vendor',
    session: false
  })(req, res, next);
});

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback URL
// @access  Public
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/google/failure' }),
  (req, res) => {
    // On successful authentication, the user object is attached to req.user
    const token = generateToken(req.user._id);

    // Create a response object with authentication data
    const responseData = {
      type: 'GOOGLE_AUTH_SUCCESS',
      user: req.user,
      token: token
    };

    // Send the data back to the parent window (frontend)
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              font-family: 'Outfit', sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            }
            .success-card {
              background: rgba(255,255,255,0.1);
              backdrop-filter: blur(17.5px);
              border-radius: 25px;
              padding: 48px;
              text-align: center;
              max-width: 400px;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }
            .success-icon {
              color: #10b981;
              margin-bottom: 24px;
            }
            .success-title {
              font-size: 28px;
              font-weight: 500;
              color: #000;
              margin-bottom: 16px;
            }
            .success-message {
              font-size: 16px;
              color: #000;
              opacity: 0.8;
              margin-bottom: 32px;
            }
            .spinner {
              width: 40px;
              height: 40px;
              border: 4px solid #f3f3f3;
              border-top: 4px solid #AF8EBA;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 0 auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="success-card">
            <div class="success-icon">
              <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h2 class="success-title">Authentication Successful!</h2>
            <p class="success-message">You have been successfully authenticated. This window will close automatically.</p>
            <div class="spinner"></div>
          </div>
          <script>
            // Send the authentication data to the parent window
            if (window.opener) {
              window.opener.postMessage(${JSON.stringify(responseData)}, '${process.env.FRONTEND_URL || 'http://localhost:3000'}');
              // Close the popup after a short delay
              setTimeout(() => {
                window.close();
              }, 2000);
            } else {
              // Fallback if no opener (direct navigation)
              window.location.href = '${process.env.FRONTEND_URL || 'http://localhost:3000'}';
            }
          </script>
        </body>
      </html>
    `;

    res.send(htmlResponse);
  }
);

// @route   GET /api/auth/google/failure
// @desc    Google OAuth failure handler
// @access  Public
router.get('/google/failure', (req, res) => {
  const errorData = {
    type: 'GOOGLE_AUTH_ERROR',
    error: 'Authentication failed. Please try again.'
  };

  const htmlResponse = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Authentication Failed</title>
        <style>
          body {
            font-family: 'Outfit', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          }
          .error-card {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(17.5px);
            border-radius: 25px;
            padding: 48px;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          }
          .error-icon {
            color: #ef4444;
            margin-bottom: 24px;
          }
          .error-title {
            font-size: 28px;
            font-weight: 500;
            color: #000;
            margin-bottom: 16px;
          }
          .error-message {
            font-size: 16px;
            color: #000;
            opacity: 0.8;
            margin-bottom: 32px;
          }
          .close-btn {
            background: #AF8EBA;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 44px;
            font-family: 'Outfit', sans-serif;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
          }
          .close-btn:hover {
            background: #9A7BA5;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <div class="error-icon">
            <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          <h2 class="error-title">Authentication Failed</h2>
          <p class="error-message">Something went wrong during authentication. Please try again.</p>
          <button class="close-btn" onclick="closeWindow()">Close Window</button>
        </div>
        <script>
          // Send error data to parent window
          if (window.opener) {
            window.opener.postMessage(${JSON.stringify(errorData)}, '${process.env.FRONTEND_URL || 'http://localhost:3000'}');
          }
          
          function closeWindow() {
            window.close();
          }
          
          // Auto close after 5 seconds
          setTimeout(() => {
            window.close();
          }, 5000);
        </script>
      </body>
    </html>
  `;

  res.send(htmlResponse);
});

// Email Verification Routes
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', emailVerificationLimiter, resendVerificationEmail);

// Password Reset Routes
// @route   POST /api/auth/forgot-password
// @desc    Request password reset email
// @access  Public
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, forgotPassword);

// @route   GET /api/auth/reset-password/:token
// @desc    Verify password reset token
// @access  Public
router.get('/reset-password/:token', verifyResetToken);

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password with token
// @access  Public
router.post('/reset-password/:token', validateResetPassword, resetPassword);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const updateData = req.body;
    
    console.log('Profile update request:', {
      userId: user._id,
      role: user.role,
      updateData: updateData
    });

    // Update vendor profile if user is a vendor
    if (user.role === 'vendor' && updateData.businessName) {
      console.log('Updating vendor profile with data:', updateData);
      
      user.vendorProfile = {
        ...user.vendorProfile,
        businessName: updateData.businessName,
        ownerName: updateData.ownerName,
        businessAddress: updateData.businessAddress
      };
      
      console.log('Updated vendor profile:', user.vendorProfile);
    }

    // Update phone number if provided
    if (updateData.phoneNumber) {
      user.phoneNumber = updateData.phoneNumber;
    }

    console.log('Before save - User profile:', {
      profileCompleted: user.vendorProfile?.profileCompleted,
      vendorProfile: user.vendorProfile
    });

    // Save the user (this will trigger the pre-save middleware to check profile completion)
    await user.save();
    
    console.log('After save - Profile updated successfully:', {
      profileCompleted: user.vendorProfile?.profileCompleted,
      vendorProfile: user.vendorProfile
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          phoneNumber: user.phoneNumber,
          vendorProfile: user.vendorProfile,
          customerProfile: user.customerProfile
        }
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

module.exports = router; 