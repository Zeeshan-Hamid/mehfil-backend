const express = require('express');
const router = express.Router();
const {
  signupCustomer,
  signupVendor,
  login
} = require('../../controllers/auth/authController');

const {
  validateCustomerSignup,
  validateVendorSignup,
  validateLogin
} = require('../../validators/authValidators');

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

module.exports = router; 