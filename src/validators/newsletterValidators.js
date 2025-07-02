const { body } = require('express-validator');

// Validator for newsletter subscription
exports.validateSubscription = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .trim(),
  
  body('preferences')
    .optional()
    .isObject()
    .withMessage('Preferences must be an object'),
  
  body('preferences.events')
    .optional()
    .isBoolean()
    .withMessage('Events preference must be a boolean'),
  
  body('preferences.promotions')
    .optional()
    .isBoolean()
    .withMessage('Promotions preference must be a boolean'),
  
  body('preferences.blog')
    .optional()
    .isBoolean()
    .withMessage('Blog preference must be a boolean')
];

// Validator for updating preferences
exports.validatePreferencesUpdate = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .trim(),
  
  body('preferences')
    .isObject()
    .withMessage('Preferences must be an object'),
  
  body('token')
    .optional()
    .isString()
    .withMessage('Token must be a string')
];

module.exports = {
  validateSubscription: exports.validateSubscription,
  validatePreferencesUpdate: exports.validatePreferencesUpdate
}; 