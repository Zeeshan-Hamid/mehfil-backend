const { body } = require('express-validator');

// Validation for vendor profile general settings update
const validateVendorGeneralProfile = [
  body('businessName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Business name must be between 2 and 200 characters')
    .matches(/^[a-zA-Z0-9\s\-\.,&']+$/)
    .withMessage('Business name contains invalid characters'),

  body('ownerName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Owner name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s\-'\.]+$/)
    .withMessage('Owner name can only contain letters, spaces, hyphens, apostrophes, and periods'),

  body('phoneNumber')
    .optional()
    .trim()
    .matches(/^[\+]?[0-9\s\-\(\)]{10,17}$/)
    .withMessage('Please enter a valid phone number'),

  // Business address validations (all optional)
  body('street')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Street address cannot exceed 200 characters'),

  body('city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('City cannot exceed 100 characters')
    .matches(/^[a-zA-Z\s\-'\.]*$/)
    .withMessage('City can only contain letters, spaces, hyphens, apostrophes, and periods'),

  body('state')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('State cannot exceed 100 characters')
    .matches(/^[a-zA-Z\s\-'\.]*$/)
    .withMessage('State can only contain letters, spaces, hyphens, apostrophes, and periods'),

  body('country')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Country must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s\-'\.]+$/)
    .withMessage('Country can only contain letters, spaces, hyphens, apostrophes, and periods'),

  body('zipCode')
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Zip code must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9\s\-]+$/)
    .withMessage('Zip code contains invalid characters'),

  // Halal certification validations (all optional)
  body('hasHalalCert')
    .optional()
    .isBoolean()
    .withMessage('Has halal certification must be true or false'),

  body('certificateNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Certificate number cannot exceed 100 characters')
    .matches(/^[a-zA-Z0-9\s\-\/\.]+$/)
    .withMessage('Certificate number contains invalid characters'),

  body('issuingAuthority')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Issuing authority cannot exceed 200 characters'),

  body('expiryDate')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Expiry date must be a valid date in ISO format (YYYY-MM-DD)'),

  // Email validation should reject any attempts to change email
  body('email')
    .custom((value) => {
      if (value !== undefined) {
        throw new Error('Email cannot be changed through this endpoint');
      }
      return true;
    })
];

module.exports = {
  validateVendorGeneralProfile
};
