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

// Google OAuth Routes
// @route   GET /api/auth/google/customer
// @desc    Initiate Google login for customers
// @access  Public
router.get('/google/customer', passport.authenticate('google', {
  state: 'customer',
  session: false
}));

// @route   GET /api/auth/google/vendor
// @desc    Initiate Google login for vendors
// @access  Public
router.get('/google/vendor', passport.authenticate('google', {
  state: 'vendor',
  session: false
}));

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback URL
// @access  Public
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login-failed' }),
  (req, res) => {
    // On successful authentication, the user object is attached to req.user
    const token = generateToken(req.user._id);

    // For backend testing, we'll just return the user and token as JSON
    // In a real app, you might redirect to a frontend URL with the token
    res.json({
      success: true,
      message: 'Successfully authenticated with Google',
      token: token,
      user: req.user
    });
  }
);

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

module.exports = router; 