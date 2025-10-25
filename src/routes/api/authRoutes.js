const express = require('express');
const router = express.Router();
const {
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
} = require('../../controllers/auth/authController');
const User = require('../../models/User');
const { protect: authMiddleware } = require('../../middleware/authMiddleware');
const detectPlatform = require('../../middleware/platformDetection');
const { 
  verifyGoogleIdToken, 
  verifyGoogleIdTokenMultiPlatform,
  getClientIdForPlatform,
  getAllClientIds 
} = require('../../utils/googleAuth');

const {
  validateCustomerSignup,
  validateVendorSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateVerifyResetCode,
  validateResetPasswordMobile,
  validateChangePassword
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

// @route   POST /api/auth/signup/mobile/customer
// @desc    Register a new customer (Mobile with verification code)
// @access  Public
router.post('/signup/mobile/customer', validateCustomerSignup, signupMobileCustomer);

// @route   POST /api/auth/signup/mobile/vendor
// @desc    Register a new vendor (Mobile with verification code)
// @access  Public
router.post('/signup/mobile/vendor', validateVendorSignup, signupMobileVendor);

// @route   POST /api/auth/verify-email
// @desc    Verify email with 6-digit code
// @access  Public
router.post('/verify-email-code', verifyEmailWithCode);

// @route   POST /api/auth/resend-verification-code
// @desc    Resend verification code
// @access  Public
router.post('/resend-verification-code', emailVerificationLimiter, resendVerificationCode);

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
router.get('/google/test', detectPlatform, (req, res) => {
  res.json({
    success: true,
    message: 'Google OAuth routes are working',
    platform: req.platform ? req.platform.type : 'unknown',
    config: {
      web: {
        clientId: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'Configured' : 'Not configured',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'Not configured'
      },
      mobile: {
        clientId: process.env.GOOGLE_MOBILE_CLIENT_ID ? 'Configured' : 'Not configured',
        clientSecret: process.env.GOOGLE_MOBILE_CLIENT_SECRET ? 'Configured' : 'Not configured',
        redirectUri: process.env.GOOGLE_MOBILE_REDIRECT_URI || 'Not configured'
      },
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
      platformDetection: process.env.ENABLE_PLATFORM_DETECTION || 'false'
    },
    availableRoutes: {
      web: [
        'GET /api/auth/google/customer',
        'GET /api/auth/google/vendor',
        'GET /api/auth/google/callback'
      ],
      ios: [
        'GET /api/auth/google/ios/customer',
        'GET /api/auth/google/ios/vendor',
        'GET /api/auth/google/ios/callback'
      ],
      mobile: [
        'GET /api/auth/google/mobile/customer',
        'GET /api/auth/google/mobile/vendor',
        'GET /api/auth/google/mobile/callback'
      ]
    },
    instructions: {
      web: {
        step1: 'Make sure GOOGLE_REDIRECT_URI in your .env file is: http://localhost:8000/api/auth/google/callback',
        step2: 'In Google Cloud Console, add this exact URI to Authorized redirect URIs: http://localhost:8000/api/auth/google/callback'
      },
      ios: {
        step1: 'Configure GOOGLE_MOBILE_CLIENT_ID and GOOGLE_MOBILE_CLIENT_SECRET in your .env file',
        step2: 'Set GOOGLE_MOBILE_REDIRECT_URI to: mehfilapp://auth/callback',
        step3: 'In Google Cloud Console, create an iOS OAuth client with Bundle ID: com.moneebb.mehfilapp',
        step4: 'Add redirect URI: mehfilapp://auth/callback'
      },
      mobile: {
        step1: 'Configure GOOGLE_MOBILE_CLIENT_ID and GOOGLE_MOBILE_CLIENT_SECRET in your .env file',
        step2: 'Set GOOGLE_MOBILE_REDIRECT_URI to: mehfilapp://auth/callback',
        step3: 'In Google Cloud Console, create a mobile OAuth client and add the redirect URI'
      },
      step4: 'Restart your backend server after making changes'
    }
  });
});

// Google OAuth Routes
// @route   GET /api/auth/google/customer
// @desc    Initiate Google login for customers
// @access  Public
router.get('/google/customer', detectPlatform, (req, res, next) => {
  // Add state parameter to the request
  req.query.state = 'customer';
  
  // Log platform detection for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('🚀 Google OAuth Customer - Platform:', req.platform.type);
  }
  
  passport.authenticate('google-web', {
    state: 'customer',
    session: false
  })(req, res, next);
});

// @route   GET /api/auth/google/vendor
// @desc    Initiate Google login for vendors
// @access  Public
router.get('/google/vendor', detectPlatform, (req, res, next) => {
  // Add state parameter to the request
  req.query.state = 'vendor';
  
  // Log platform detection for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('🚀 Google OAuth Vendor - Platform:', req.platform.type);
  }
  
  passport.authenticate('google-web', {
    state: 'vendor',
    session: false
  })(req, res, next);
});

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback URL
// @access  Public
router.get('/google/callback',
  detectPlatform,
  passport.authenticate('google-web', { session: false, failureRedirect: '/api/auth/google/failure' }),
  (req, res) => {
    // On successful authentication, the user object is attached to req.user
    const token = generateToken(req.user._id);

    // Create a response object with authentication data
    const responseData = {
      type: 'GOOGLE_AUTH_SUCCESS',
      user: req.user,
      token: token,
      platform: req.platform ? req.platform.type : 'web'
    };

    // Platform-aware response handling
    if (req.platform && req.platform.isMobile) {
      // For mobile apps, return JSON response
      return res.json({
        success: true,
        message: 'Authentication successful',
        data: responseData
      });
    }

    // For web apps, return HTML popup response (existing behavior)
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
router.get('/google/failure', detectPlatform, (req, res) => {
  const errorData = {
    type: 'GOOGLE_AUTH_ERROR',
    error: 'Authentication failed. Please try again.',
    platform: req.platform ? req.platform.type : 'web'
  };

  // Platform-aware error response handling
  if (req.platform && req.platform.isMobile) {
    // For mobile apps, return JSON error response
    return res.status(400).json({
      success: false,
      message: 'Authentication failed',
      error: errorData
    });
  }

  // For web apps, return HTML error response (existing behavior)
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

// iOS-specific OAuth routes for better iOS app integration
// Mobile-specific routes (simplified direct flow)
// @route   GET /api/auth/google/mobile/customer
// @desc    Initiate Google OAuth for mobile customer
// @access  Public
router.get('/google/mobile/customer', detectPlatform, (req, res, next) => {
  req.platform = { type: 'mobile', isMobile: true, isWeb: false };
  req.query.state = 'mobile:customer'; // Add mobile: prefix to identify mobile flow
  
  console.log('\n========================================');
  console.log('📱 MOBILE OAUTH FLOW INITIATED');
  console.log('========================================');
  console.log('Role: Customer');
  console.log('Platform:', req.platform);
  console.log('User Agent:', req.headers['user-agent']);
  console.log('State:', req.query.state);
  console.log('========================================\n');
  
  passport.authenticate('google-web', {
    state: 'mobile:customer',
    session: false,
    scope: ['openid', 'email', 'profile']
  })(req, res, next);
});

// @route   GET /api/auth/google/mobile/vendor
// @desc    Initiate Google OAuth for mobile vendor
// @access  Public
router.get('/google/mobile/vendor', detectPlatform, (req, res, next) => {
  req.platform = { type: 'mobile', isMobile: true, isWeb: false };
  req.query.state = 'mobile:vendor'; // Add mobile: prefix to identify mobile flow
  
  console.log('\n========================================');
  console.log('📱 MOBILE OAUTH FLOW INITIATED');
  console.log('========================================');
  console.log('Role: Vendor');
  console.log('Platform:', req.platform);
  console.log('User Agent:', req.headers['user-agent']);
  console.log('State:', req.query.state);
  console.log('========================================\n');
  
  passport.authenticate('google-web', {
    state: 'mobile:vendor',
    session: false,
    scope: ['openid', 'email', 'profile']
  })(req, res, next);
});

// @route   GET /api/auth/google/callback (used for both web and mobile)
// @desc    Handle Google OAuth callback
// @access  Public
router.get('/google/callback',
  detectPlatform,
  passport.authenticate('google-web', { session: false, failureRedirect: '/api/auth/google/failure' }),
  (req, res) => {
    // Check if this is a mobile auth request by checking the state parameter
    const state = req.query.state || '';
    const isMobile = state.startsWith('mobile:');
    const role = isMobile ? state.split(':')[1] : state;
    
    console.log('\n========================================');
    console.log('🔄 GOOGLE OAUTH CALLBACK RECEIVED');
    console.log('========================================');
    console.log('State parameter:', state);
    console.log('Is Mobile:', isMobile);
    console.log('Role:', role);
    console.log('User Email:', req.user.email);
    console.log('User Role:', req.user.role);
    console.log('========================================\n');
    
    if (isMobile) {
      // Mobile flow - redirect to app with deep link
      try {
        const token = generateToken(req.user._id);
        
        const userResponse = req.user.toObject();
        userResponse.profileCompleted = req.user.role === 'customer' ? 
          req.user.customerProfile.profileCompleted : 
          req.user.vendorProfile.profileCompleted;
        
        console.log('\n========================================');
        console.log('✅ MOBILE AUTH SUCCESS');
        console.log('========================================');
        console.log('User:', req.user.email);
        console.log('Role:', req.user.role);
        console.log('Token generated:', token.substring(0, 20) + '...');
        console.log('Profile completed:', userResponse.profileCompleted);
        console.log('========================================\n');
        
        // Redirect back to the app with the token and user data
        const userData = encodeURIComponent(JSON.stringify({
          _id: userResponse._id,
          email: userResponse.email,
          role: userResponse.role,
          profileCompleted: userResponse.profileCompleted,
          vendorProfile: userResponse.role === 'vendor' ? {
            ownerName: userResponse.vendorProfile.ownerName,
            businessName: userResponse.vendorProfile.businessName
          } : undefined,
          customerProfile: userResponse.role === 'customer' ? {
            fullName: userResponse.customerProfile.fullName
          } : undefined
        }));
        
        const redirectUrl = `mehfilapp://auth/callback?token=${token}&user=${userData}`;
        
        console.log('🔗 Deep Link URL:', redirectUrl.substring(0, 100) + '...');
        console.log('📤 Sending HTML response with auto-triggering deep link\n');
        
        // For mobile, send HTML that will trigger the deep link AND close the browser
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Authentication Successful</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-align: center;
              }
              .container {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                padding: 40px;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
              }
              h1 { margin: 0 0 10px 0; font-size: 28px; }
              p { margin: 10px 0; font-size: 16px; opacity: 0.9; }
              .link {
                display: inline-block;
                margin-top: 20px;
                padding: 12px 24px;
                background: white;
                color: #667eea;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
              }
              .spinner {
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 3px solid white;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✅ Success!</h1>
              <p>Welcome ${req.user.vendorProfile?.ownerName || req.user.customerProfile?.fullName || req.user.email}!</p>
              <div class="spinner"></div>
              <p>Redirecting to app...</p>
              <p><a href="${redirectUrl}" class="link">Tap here if not redirected</a></p>
            </div>
            <script>
              // Try multiple methods to ensure redirect works
              setTimeout(function() {
                window.location.href = '${redirectUrl}';
              }, 100);
              
              setTimeout(function() {
                window.location.replace('${redirectUrl}');
              }, 500);
              
              // Also try direct navigation
              try {
                window.location = '${redirectUrl}';
              } catch(e) {
                console.error('Redirect error:', e);
              }
            </script>
          </body>
          </html>
        `;
        
        return res.send(html);
      } catch (error) {
        console.error('Mobile OAuth callback error:', error);
        const errorMsg = encodeURIComponent('Authentication failed');
        const redirectUrl = `mehfilapp://auth/callback?error=${errorMsg}`;
        return res.redirect(redirectUrl);
      }
    }
    
    // Web flow - send HTML response
    const token = generateToken(req.user._id);
    const responseData = {
      type: 'GOOGLE_AUTH_SUCCESS',
      user: req.user,
      token: token,
      platform: req.platform ? req.platform.type : 'web'
    };
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
      </head>
      <body>
        <h1>Authentication Successful!</h1>
        <p>You can close this window.</p>
        <script>
          window.opener && window.opener.postMessage(${JSON.stringify(responseData)}, '*');
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `;
    
    res.send(html);
  }
);

// @route   GET /api/auth/google/mobile/failure
// @desc    Handle Google OAuth failure for mobile
// @access  Public
router.get('/google/mobile/failure', (req, res) => {
  const errorMsg = encodeURIComponent('Google authentication failed');
  return res.redirect(`mehfilapp://auth/callback?error=${errorMsg}`);
});

// @route   GET /api/auth/google/ios/customer
// @desc    iOS-specific Google login for customers
// @access  Public
router.get('/google/ios/customer', detectPlatform, (req, res, next) => {
  // Force iOS platform detection
  req.platform = { type: 'ios', isMobile: true, isWeb: false };
  
  // Add state parameter to the request
  req.query.state = 'customer';
  
  console.log('🍎 iOS Google OAuth Customer initiated');
  
  passport.authenticate('google-mobile', {
    state: 'customer',
    session: false
  })(req, res, next);
});

// Mobile-specific OAuth routes for better mobile app integration
// @route   GET /api/auth/google/mobile/customer
// @desc    Mobile-specific Google login for customers
// @access  Public
router.get('/google/mobile/customer', detectPlatform, (req, res, next) => {
  // Force mobile platform detection
  req.platform = { type: 'mobile', isMobile: true, isWeb: false };
  
  // Add state parameter to the request
  req.query.state = 'customer';
  
  console.log('📱 Mobile Google OAuth Customer initiated');
  
  passport.authenticate('google-mobile', {
    state: 'customer',
    session: false
  })(req, res, next);
});

// @route   GET /api/auth/google/ios/vendor
// @desc    iOS-specific Google login for vendors
// @access  Public
router.get('/google/ios/vendor', detectPlatform, (req, res, next) => {
  // Force iOS platform detection
  req.platform = { type: 'ios', isMobile: true, isWeb: false };
  
  // Add state parameter to the request
  req.query.state = 'vendor';
  
  console.log('🍎 iOS Google OAuth Vendor initiated');
  
  passport.authenticate('google-mobile', {
    state: 'vendor',
    session: false
  })(req, res, next);
});

// @route   GET /api/auth/google/mobile/vendor
// @desc    Mobile-specific Google login for vendors
// @access  Public
router.get('/google/mobile/vendor', detectPlatform, (req, res, next) => {
  // Force mobile platform detection
  req.platform = { type: 'mobile', isMobile: true, isWeb: false };
  
  // Add state parameter to the request
  req.query.state = 'vendor';
  
  console.log('📱 Mobile Google OAuth Vendor initiated');
  
  passport.authenticate('google-mobile', {
    state: 'vendor',
    session: false
  })(req, res, next);
});

// @route   GET /api/auth/google/ios/callback
// @desc    iOS-specific Google OAuth callback
// @access  Public
router.get('/google/ios/callback',
  detectPlatform,
  passport.authenticate('google-mobile', { session: false, failureRedirect: '/api/auth/google/ios/failure' }),
  (req, res) => {
    // Force iOS platform for this route
    req.platform = { type: 'ios', isMobile: true, isWeb: false };
    
    const token = generateToken(req.user._id);
    
    const responseData = {
      success: true,
      message: 'iOS authentication successful',
      data: {
        type: 'GOOGLE_AUTH_SUCCESS',
        user: req.user,
        token: token,
        platform: 'ios'
      }
    };
    
    console.log('🍎 iOS OAuth callback successful for user:', req.user.email);
    
    // Always return JSON for iOS callback
    return res.json(responseData);
  }
);

// @route   GET /api/auth/google/mobile/callback
// @desc    Mobile-specific Google OAuth callback
// @access  Public
router.get('/google/mobile/callback',
  detectPlatform,
  passport.authenticate('google-mobile', { session: false, failureRedirect: '/api/auth/google/mobile/failure' }),
  (req, res) => {
    // Force mobile platform for this route
    req.platform = { type: 'mobile', isMobile: true, isWeb: false };
    
    const token = generateToken(req.user._id);
    
    const responseData = {
      success: true,
      message: 'Mobile authentication successful',
      data: {
        type: 'GOOGLE_AUTH_SUCCESS',
        user: req.user,
        token: token,
        platform: 'mobile'
      }
    };
    
    console.log('📱 Mobile OAuth callback successful for user:', req.user.email);
    
    // Always return JSON for mobile callback
    return res.json(responseData);
  }
);

// @route   GET /api/auth/google/ios/failure
// @desc    iOS-specific Google OAuth failure handler
// @access  Public
router.get('/google/ios/failure', detectPlatform, (req, res) => {
  const errorData = {
    success: false,
    message: 'iOS authentication failed',
    error: {
      type: 'GOOGLE_AUTH_ERROR',
      error: 'Authentication failed. Please try again.',
      platform: 'ios'
    }
  };
  
  console.log('🍎 iOS OAuth failure');
  
  // Always return JSON for iOS failure
  return res.status(400).json(errorData);
});

// @route   GET /api/auth/google/mobile/failure
// @desc    Mobile-specific Google OAuth failure handler
// @access  Public
router.get('/google/mobile/failure', detectPlatform, (req, res) => {
  const errorData = {
    success: false,
    message: 'Mobile authentication failed',
    error: {
      type: 'GOOGLE_AUTH_ERROR',
      error: 'Authentication failed. Please try again.',
      platform: 'mobile'
    }
  };
  
  console.log('📱 Mobile OAuth failure');
  
  // Always return JSON for mobile failure
  return res.status(400).json(errorData);
});

// Mobile Google OAuth Code Exchange
// @route   POST /api/auth/google/mobile/exchange
// @desc    Exchange authorization code for tokens
// @access  Public
router.post('/google/mobile/exchange', detectPlatform, async (req, res) => {
  try {
    const { code, role } = req.body;
    
    if (!code || !role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: code and role'
      });
    }

    if (!['customer', 'vendor'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be customer or vendor'
      });
    }

    console.log('📱 Mobile Google OAuth code exchange:', {
      role,
      platform: req.platform ? req.platform.type : 'unknown'
    });

    // For now, we'll simulate the OAuth flow by creating a mock user
    // In production, you would exchange the code with Google's token endpoint
    // and then verify the ID token
    
    // Mock user data (in production, this would come from Google's API)
    const mockUser = {
      id: `google_${Date.now()}`,
      email: `user_${Date.now()}@example.com`,
      name: 'Google User',
      photo: null
    };

    // Check if user already exists
    let existingUser = await User.findOne({ 'socialLogin.googleId': mockUser.id });
    
    if (existingUser) {
      // User exists, log them in
      const token = generateToken(existingUser._id);
      
      const userResponse = existingUser.toObject();
      userResponse.profileCompleted = existingUser.role === 'customer' ? 
        existingUser.customerProfile.profileCompleted : 
        existingUser.vendorProfile.profileCompleted;
      
      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userResponse,
          token: token
        }
      });
    }

    // Check if user exists with this email
    existingUser = await User.findOne({ email: mockUser.email });
    
    if (existingUser) {
      // Link Google account to existing user
      existingUser.socialLogin.googleId = mockUser.id;
      existingUser.authProvider = 'google';
      await existingUser.save({ validateBeforeSave: false });
      
      const token = generateToken(existingUser._id);
      const userResponse = existingUser.toObject();
      userResponse.profileCompleted = existingUser.role === 'customer' ? 
        existingUser.customerProfile.profileCompleted : 
        existingUser.vendorProfile.profileCompleted;
      
      return res.json({
        success: true,
        message: 'Google account linked successfully',
        data: {
          user: userResponse,
          token: token
        }
      });
    }

    // Create new user
    const newUser = new User({
      email: mockUser.email,
      authProvider: 'google',
      socialLogin: { googleId: mockUser.id },
      role: role,
      emailVerified: true,
      phoneNumber: null,
    });

    if (role === 'customer') {
      newUser.customerProfile = {
        fullName: mockUser.name || '',
        gender: null,
        location: {
          city: null,
          state: null,
          country: null,
          zipCode: null
        },
        profileImage: mockUser.photo || null,
        preferences: {
          categories: [],
          budgetRange: null,
          preferredLanguages: [],
          genderPreference: null,
          culturalPreferences: []
        },
        preferredVendors: [],
        customerCart: [],
        profileCompleted: false
      };
    }

    if (role === 'vendor') {
      newUser.vendorProfile = {
        ownerName: mockUser.name || '',
        businessName: null,
        profileImage: mockUser.photo || null,
        businessAddress: {
          street: null,
          city: null,
          state: null,
          zipCode: null,
          country: null
        },
        timezone: null,
        geo: { type: 'Point', coordinates: [0, 0] },
        serviceDescription: null,
        experienceYears: null,
        serviceCategories: [],
        languagesSpoken: [],
        serviceAreas: [],
        halalCertification: {
          hasHalalCert: false,
          status: 'unverified',
          renewalReminders: {},
          certificationFile: null,
          certificateNumber: null,
          expiryDate: null,
          issuingAuthority: null,
          verificationDate: null,
        },
        portfolio: {
          images: [],
          videos: [],
          description: null,
          beforeAfterPhotos: []
        },
        socialLinks: {},
        availability: {
          calendar: [],
          workingDays: [],
          workingHours: { start: null, end: null },
          advanceBookingDays: null,
          blackoutDates: []
        },
        bookingRules: {
          minNoticeHours: null,
          cancellationPolicy: null,
          depositRequired: null,
          depositPercentage: null,
          paymentTerms: null
        },
        pricing: {
          startingPrice: null,
          maxPrice: null,
          currency: 'USD',
          pricingType: null,
          packageDeals: []
        },
        paymentInfo: {},
        rating: {
          average: 0,
          totalReviews: 0,
          breakdown: { fiveStar: 0, fourStar: 0, threeStar: 0, twoStar: 0, oneStar: 0 }
        },
        approvalHistory: [],
        stats: {
            totalBookings: 0,
            completedBookings: 0,
            cancelledBookings: 0,
            responseTime: 0,
            responseRate: 0,
            repeatCustomers: 0
        },
        verifications: {
            businessVerified: false,
            backgroundCheckComplete: false,
            insuranceVerified: false
        },
        team: [],
        tags: [],
        profileCompleted: false
      };
    }

    await newUser.save({ validateBeforeSave: false });
    
    const token = generateToken(newUser._id);
    const userResponse = newUser.toObject();
    userResponse.profileCompleted = role === 'customer' ? 
      newUser.customerProfile.profileCompleted : 
      newUser.vendorProfile.profileCompleted;
    
    console.log('📱 New mobile user created:', { email: mockUser.email, role });
    
    res.json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: userResponse,
        token: token
      }
    });

  } catch (error) {
    console.error('Mobile Google OAuth code exchange error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during mobile authentication',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Mobile Google OAuth Token Verification (SECURE VERSION - 2025)
// @route   POST /api/auth/google/mobile/verify
// @desc    Verify Google ID token from mobile app (iOS/Android)
// @access  Public
router.post('/google/mobile/verify', detectPlatform, async (req, res) => {
  try {
    const { idToken, role, platform } = req.body;
    
    if (!idToken || !role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: idToken and role'
      });
    }

    if (!['customer', 'vendor'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be customer or vendor'
      });
    }

    // SECURITY: Verify the ID token with Google's servers
    // Support multiple client IDs (iOS, Android, Web) for flexibility
    const clientIds = getAllClientIds();
    
    if (clientIds.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Google OAuth not properly configured'
      });
    }

    const verificationResult = await verifyGoogleIdTokenMultiPlatform(idToken, clientIds);
    
    if (!verificationResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Google ID token',
        error: verificationResult.error,
        details: verificationResult.details
      });
    }

    const googleUser = verificationResult.data;
    console.log('✅ Google Auth Success:', {
      email: googleUser.email,
      role: role,
      platform: platform || req.platform?.type || 'unknown',
    });

    // Check if user already exists by Google ID
    let existingUser = await User.findOne({ 'socialLogin.googleId': googleUser.googleId });
    
    if (existingUser) {
      // User exists, log them in
      const token = generateToken(existingUser._id);
      
      const userResponse = existingUser.toObject();
      delete userResponse.password;
      userResponse.profileCompleted = existingUser.role === 'customer' ? 
        existingUser.customerProfile.profileCompleted : 
        existingUser.vendorProfile.profileCompleted;
      
      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userResponse,
          token: token
        }
      });
    }

    // Check if user exists with this email
    existingUser = await User.findOne({ email: googleUser.email });
    
    if (existingUser) {
      console.log('👤 Existing user found by email - linking Google account');
      // Link Google account to existing user
      existingUser.socialLogin.googleId = googleUser.googleId;
      existingUser.authProvider = 'google';
      existingUser.emailVerified = googleUser.emailVerified;
      await existingUser.save({ validateBeforeSave: false });
      
      const token = generateToken(existingUser._id);
      const userResponse = existingUser.toObject();
      delete userResponse.password;
      userResponse.profileCompleted = existingUser.role === 'customer' ? 
        existingUser.customerProfile.profileCompleted : 
        existingUser.vendorProfile.profileCompleted;
      
      return res.json({
        success: true,
        message: 'Google account linked successfully',
        data: {
          user: userResponse,
          token: token
        }
      });
    }

    // Create new user with VERIFIED Google data
    const newUser = new User({
      email: googleUser.email,
      authProvider: 'google',
      socialLogin: { googleId: googleUser.googleId },
      role: role,
      emailVerified: googleUser.emailVerified,
      phoneNumber: null,
    });

    if (role === 'customer') {
      newUser.customerProfile = {
        fullName: googleUser.name || '',
        gender: null,
        location: {
          city: null,
          state: null,
          country: null,
          zipCode: null
        },
        profileImage: googleUser.picture || null,
        preferences: {
          categories: [],
          budgetRange: null,
          preferredLanguages: [],
          genderPreference: null,
          culturalPreferences: []
        },
        preferredVendors: [],
        customerCart: [],
        profileCompleted: false
      };
    }

    if (role === 'vendor') {
      newUser.vendorProfile = {
        ownerName: googleUser.name || '',
        businessName: null,
        profileImage: googleUser.picture || null,
        businessAddress: {
          street: null,
          city: null,
          state: null,
          zipCode: null,
          country: null
        },
        timezone: null,
        geo: { type: 'Point', coordinates: [0, 0] },
        serviceDescription: null,
        experienceYears: null,
        serviceCategories: [],
        languagesSpoken: [],
        serviceAreas: [],
        halalCertification: {
          hasHalalCert: false,
          status: 'unverified',
          renewalReminders: {},
          certificationFile: null,
          certificateNumber: null,
          expiryDate: null,
          issuingAuthority: null,
          verificationDate: null,
        },
        portfolio: {
          images: [],
          videos: [],
          description: null,
          beforeAfterPhotos: []
        },
        socialLinks: {},
        availability: {
          calendar: [],
          workingDays: [],
          workingHours: { start: null, end: null },
          advanceBookingDays: null,
          blackoutDates: []
        },
        bookingRules: {
          minNoticeHours: null,
          cancellationPolicy: null,
          depositRequired: null,
          depositPercentage: null,
          paymentTerms: null
        },
        pricing: {
          startingPrice: null,
          maxPrice: null,
          currency: 'USD',
          pricingType: null,
          packageDeals: []
        },
        paymentInfo: {},
        rating: {
          average: 0,
          totalReviews: 0,
          breakdown: { fiveStar: 0, fourStar: 0, threeStar: 0, twoStar: 0, oneStar: 0 }
        },
        approvalHistory: [],
        stats: {
            totalBookings: 0,
            completedBookings: 0,
            cancelledBookings: 0,
            responseTime: 0,
            responseRate: 0,
            repeatCustomers: 0
        },
        verifications: {
            businessVerified: false,
            backgroundCheckComplete: false,
            insuranceVerified: false
        },
        team: [],
        tags: [],
        profileCompleted: false
      };
    }

    await newUser.save({ validateBeforeSave: false });
    
    const token = generateToken(newUser._id);
    const userResponse = newUser.toObject();
    delete userResponse.password;
    userResponse.profileCompleted = role === 'customer' ? 
      newUser.customerProfile.profileCompleted : 
      newUser.vendorProfile.profileCompleted;
    
    res.json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: userResponse,
        token: token
      }
    });

  } catch (error) {
    console.error('❌ Mobile Google OAuth verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during mobile authentication',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Email Verification Routes
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', emailVerificationLimiter, resendVerificationEmail);

// Password Reset Routes
// @route   POST /api/auth/forgot-password
// @desc    Request password reset email
// @access  Public
router.post('/forgot-password', passwordResetLimiter, validateForgotPassword, forgotPassword);

// ==================== MOBILE PASSWORD RESET ROUTES (MUST BE BEFORE PARAMETERIZED ROUTES) ====================

// @route   POST /api/auth/forgot-password/mobile
// @desc    Send password reset code to email (Mobile)
// @access  Public
router.post('/forgot-password/mobile', passwordResetLimiter, validateForgotPassword, forgotPasswordMobile);

// @route   POST /api/auth/verify-reset-code
// @desc    Verify password reset code (Mobile)
// @access  Public
router.post('/verify-reset-code', validateVerifyResetCode, verifyResetCode);

// @route   POST /api/auth/reset-password/mobile
// @desc    Reset password with verified code (Mobile)
// @access  Public
router.post('/reset-password/mobile', validateResetPasswordMobile, resetPasswordMobile);

// ==================== END MOBILE PASSWORD RESET ROUTES ====================

// ==================== WEB PASSWORD RESET ROUTES ====================

// @route   GET /api/auth/reset-password/:token
// @desc    Verify password reset token (Web)
// @access  Public
router.get('/reset-password/:token', verifyResetToken);

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password with token (Web)
// @access  Public
router.post('/reset-password/:token', validateResetPassword, resetPassword);

// ==================== END WEB PASSWORD RESET ROUTES ====================

// @route   PUT /api/auth/change-password
// @desc    Change password for authenticated user
// @access  Private
router.put('/change-password', authMiddleware, validateChangePassword, changePassword);

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
      
      
      user.vendorProfile = {
        ...user.vendorProfile,
        businessName: updateData.businessName,
        ownerName: updateData.ownerName,
        businessAddress: updateData.businessAddress
      };
      
      
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
          customerProfile: user.customerProfile,
          vendorVerificationStatus: user.vendorVerificationStatus,
          vendorVerificationDate: user.vendorVerificationDate,
          vendorVerificationNotes: user.vendorVerificationNotes
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