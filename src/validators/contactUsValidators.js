const { body } = require('express-validator');

// Validation rules for contact form submission
exports.validateContactForm = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email cannot exceed 255 characters'),

  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters'),

  body('subject')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Subject cannot exceed 200 characters'),

  body('acceptTerms')
    .optional()
    .isBoolean()
    .withMessage('Terms acceptance must be a boolean value')
];

// Validation rules for updating submission status (Admin)
exports.validateStatusUpdate = [
  body('status')
    .optional()
    .isIn(['pending', 'in-progress', 'resolved', 'closed'])
    .withMessage('Invalid status value'),

  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority value'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),

  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid user ID for assignment')
];

// Validation rules for responding to submission (Admin)
exports.validateResponse = [
  body('responseMessage')
    .trim()
    .notEmpty()
    .withMessage('Response message is required')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Response message must be between 1 and 2000 characters')
];

// Validation rules for query parameters
exports.validateQueryParams = [
  body('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  body('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  body('status')
    .optional()
    .isIn(['pending', 'in-progress', 'resolved', 'closed'])
    .withMessage('Invalid status filter'),

  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority filter'),

  body('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'name', 'email', 'status', 'priority'])
    .withMessage('Invalid sort field'),

  body('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either "asc" or "desc"')
]; 