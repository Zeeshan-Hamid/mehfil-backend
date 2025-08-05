const { body } = require('express-validator');

// Create invoice validation
const validateCreateInvoice = [
  body('clientName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters'),

  body('event')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Event name must be between 2 and 200 characters'),

  body('invoiceNumber')
    .optional()
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage('Invoice number must be between 5 and 50 characters'),

  body('invoiceDate')
    .optional()
    .isISO8601()
    .withMessage('Invoice date must be a valid date'),

  body('dueDate')
    .isISO8601()
    .withMessage('Due date must be a valid date'),

  body('paymentOption')
    .optional()
    .isIn(['Bank Transfer (ACH)', 'Credit Card', 'Cash'])
    .withMessage('Payment option must be one of: Bank Transfer (ACH), Credit Card, Cash'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),

  body('taxEnabled')
    .optional()
    .isBoolean()
    .withMessage('Tax enabled must be a boolean'),

  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100'),

  body('adjustments')
    .optional()
    .isArray()
    .withMessage('Adjustments must be an array'),

  body('adjustments.*')
    .optional()
    .isFloat()
    .withMessage('Each adjustment must be a number'),

  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),

  body('items.*.description')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Item description must be between 2 and 200 characters'),

  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Item quantity must be at least 1'),

  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Item unit price must be at least 0'),

  body('logoUrl')
    .optional()
    .custom((value) => {
      if (value && value.trim() !== '') {
        // Only validate URL if a value is provided
        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(value)) {
          throw new Error('Logo URL must be a valid URL');
        }
      }
      return true;
    })
    .withMessage('Logo URL must be a valid URL')
];

// Update invoice validation
const validateUpdateInvoice = [
  body('clientName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters'),

  body('event')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Event name must be between 2 and 200 characters'),

  body('invoiceNumber')
    .optional()
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage('Invoice number must be between 5 and 50 characters'),

  body('invoiceDate')
    .optional()
    .isISO8601()
    .withMessage('Invoice date must be a valid date'),

  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),

  body('paymentOption')
    .optional()
    .isIn(['Bank Transfer (ACH)', 'Credit Card', 'Cash'])
    .withMessage('Payment option must be one of: Bank Transfer (ACH), Credit Card, Cash'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),

  body('taxEnabled')
    .optional()
    .isBoolean()
    .withMessage('Tax enabled must be a boolean'),

  body('taxRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100'),

  body('adjustments')
    .optional()
    .isArray()
    .withMessage('Adjustments must be an array'),

  body('adjustments.*')
    .optional()
    .isFloat()
    .withMessage('Each adjustment must be a number'),

  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),

  body('items.*.description')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Item description must be between 2 and 200 characters'),

  body('items.*.quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Item quantity must be at least 1'),

  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Item unit price must be at least 0'),

  body('logoUrl')
    .optional()
    .custom((value) => {
      if (value && value.trim() !== '') {
        // Only validate URL if a value is provided
        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(value)) {
          throw new Error('Logo URL must be a valid URL');
        }
      }
      return true;
    })
    .withMessage('Logo URL must be a valid URL'),

  body('status')
    .optional()
    .isIn(['Pending', 'Paid', 'Overdue', 'Cancelled'])
    .withMessage('Status must be one of: Pending, Paid, Overdue, Cancelled')
];

module.exports = {
  validateCreateInvoice,
  validateUpdateInvoice
}; 