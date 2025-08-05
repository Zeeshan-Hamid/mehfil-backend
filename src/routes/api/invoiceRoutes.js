const express = require('express');
const router = express.Router();
const {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  markInvoiceAsPaid,
  updateOverdueInvoices,
  downloadInvoice
} = require('../../controllers/invoiceController');
const { protect } = require('../../middleware/authMiddleware');
const { validateCreateInvoice, validateUpdateInvoice } = require('../../validators/invoiceValidators');

// All routes require authentication and vendor role
router.use(protect);

// Check if user is vendor
const vendorOnly = (req, res, next) => {
  if (req.user.role !== 'vendor') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only vendors can manage invoices.'
    });
  }
  next();
};

// Apply vendor-only middleware to all routes
router.use(vendorOnly);

// @route   POST /api/invoices
// @desc    Create a new invoice
// @access  Private (Vendor only)
router.post('/', validateCreateInvoice, createInvoice);

// @route   GET /api/invoices
// @desc    Get all invoices for a vendor
// @access  Private (Vendor only)
router.get('/', getInvoices);

// @route   GET /api/invoices/:id
// @desc    Get a single invoice by ID
// @access  Private (Vendor only)
router.get('/:id', getInvoice);

// @route   PUT /api/invoices/:id
// @desc    Update an invoice
// @access  Private (Vendor only)
router.put('/:id', validateUpdateInvoice, updateInvoice);

// @route   DELETE /api/invoices/:id
// @desc    Delete an invoice
// @access  Private (Vendor only)
router.delete('/:id', deleteInvoice);

// @route   PATCH /api/invoices/:id/mark-paid
// @desc    Mark invoice as paid
// @access  Private (Vendor only)
router.patch('/:id/mark-paid', markInvoiceAsPaid);

// @route   PATCH /api/invoices/:id/status
// @desc    Update invoice status
// @access  Private (Vendor only)
router.patch('/:id/status', updateInvoice);

// @route   PATCH /api/invoices/update-overdue
// @desc    Update overdue invoices status
// @access  Private (Vendor only)
router.patch('/update-overdue', updateOverdueInvoices);

// @route   GET /api/invoices/:id/download
// @desc    Download invoice as PDF
// @access  Private (Vendor only)
router.get('/:id/download', downloadInvoice);

module.exports = router; 