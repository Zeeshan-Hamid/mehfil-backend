const { body } = require('express-validator');

// Common validation rules
const emailValidation = body('email')
  .isEmail()
  .normalizeEmail()
  .withMessage('Please enter a valid email address');

const passwordValidation = body('password')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters long')
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number');

const phoneValidation = body('phoneNumber')
  .trim()
  .matches(/^[\+]?[0-9\s\-\(\)]{10,17}$/)
  .withMessage('Please enter a valid phone number');

const phoneValidationOptional = body('phoneNumber')
  .optional({ checkFalsy: true })
  .trim();

// Customer signup validation
const validateCustomerSignup = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Full name can only contain letters and spaces'),

  emailValidation,
  passwordValidation,
  phoneValidationOptional, // Phone number is optional for customers

  body('gender')
    .optional({ checkFalsy: true })
    .isIn(['male', 'female', 'prefer_not_to_say'])
    .withMessage('Gender must be male, female, or prefer_not_to_say'),

  body('city')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('City can only contain letters and spaces'),

  body('state')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('State must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('State can only contain letters and spaces'),

  body('country')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Country must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Country can only contain letters and spaces'),

  body('zipCode')
    .optional()
    .trim()
    .isPostalCode('any')
    .withMessage('Please enter a valid zip code')
];

// Vendor signup validation
const validateVendorSignup = [
  body('businessName')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Business name must be between 2 and 200 characters'),

  body('ownerName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Owner name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Owner name can only contain letters and spaces'),

  emailValidation,
  passwordValidation,
  phoneValidationOptional, // Phone number is optional for vendors - any format allowed

  body('street')
    .optional()
    .trim()
    .custom((value) => {
      if (value && value.trim() !== '') {
        if (value.length < 5 || value.length > 200) {
          throw new Error('Street address must be between 5 and 200 characters');
        }
      }
      return true;
    }),

  body('city')
    .optional()
    .trim()
    .custom((value) => {
      if (value && value.trim() !== '') {
        if (value.length < 2 || value.length > 50) {
          throw new Error('City must be between 2 and 50 characters');
        }
        if (!/^[a-zA-Z\s]+$/.test(value)) {
          throw new Error('City can only contain letters and spaces');
        }
      }
      return true;
    }),

  body('state')
    .optional()
    .trim()
    .custom((value) => {
      if (value && value.trim() !== '') {
        if (value.length < 2 || value.length > 50) {
          throw new Error('State must be between 2 and 50 characters');
        }
        if (!/^[a-zA-Z\s]+$/.test(value)) {
          throw new Error('State can only contain letters and spaces');
        }
      }
      return true;
    }),

  body('country')
    .optional()
    .trim()
    .custom((value) => {
      if (value && value.trim() !== '') {
        if (value.length < 2 || value.length > 50) {
          throw new Error('Country must be between 2 and 50 characters');
        }
        if (!/^[a-zA-Z\s]+$/.test(value)) {
          throw new Error('Country can only contain letters and spaces');
        }
      }
      return true;
    }),

  body('zipCode')
    .trim()
    .isPostalCode('any')
    .withMessage('Please enter a valid zip code'),

  body('timezone')
    .optional()
    .isIn(['America/New_York', 'Europe/London', 'America/Los_Angeles', 'America/Chicago', 'America/Denver', 'America/Phoenix'])
    .withMessage('Please select a valid timezone')
];


const validateLogin = [
  emailValidation,
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Password reset validation rules
const validateForgotPassword = [
  emailValidation
];

const validateResetPassword = [
  passwordValidation,
  
  body('passwordConfirm')
    .notEmpty()
    .withMessage('Password confirmation is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

const validateVerifyResetCode = [
  emailValidation,
  body('code')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('Verification code must be 6 digits')
    .isNumeric()
    .withMessage('Verification code must contain only numbers')
];

// Mobile password reset validation (no password confirmation needed - handled on frontend)
const validateResetPasswordMobile = [
  emailValidation,
  body('code')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('Verification code must be 6 digits')
    .isNumeric()
    .withMessage('Verification code must contain only numbers'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
];

// Change password validation
const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
  
  body('confirmPassword')
    .notEmpty()
    .withMessage('Password confirmation is required')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

module.exports = {
  validateCustomerSignup,
  validateVendorSignup,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateVerifyResetCode,
  validateResetPasswordMobile,
  validateChangePassword
}; 