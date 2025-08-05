const Invoice = require('../models/Invoice');
const { validationResult } = require('express-validator');

// @desc    Create a new invoice
// @route   POST /api/invoices
// @access  Private (Vendor only)
const createInvoice = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      clientName,
      event,
      invoiceNumber,
      invoiceDate,
      dueDate,
      paymentOption,
      notes,
      taxEnabled,
      taxRate,
      adjustments,
      items,
      logoUrl
    } = req.body;

    // Check if invoice number already exists
    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return res.status(409).json({
        success: false,
        message: 'Invoice number already exists'
      });
    }

    // Create new invoice
    const newInvoice = new Invoice({
      vendor: req.user.id,
      clientName,
      event,
      invoiceNumber: invoiceNumber || Invoice.generateInvoiceNumber(),
      invoiceDate: invoiceDate || new Date(),
      dueDate,
      paymentOption,
      notes,
      taxEnabled,
      taxRate,
      adjustments: adjustments || [],
      items,
      logoUrl,
      subtotal: req.body.subtotal,
      taxAmount: req.body.taxAmount,
      adjustmentsTotal: req.body.adjustmentsTotal,
      total: req.body.total
    });

    await newInvoice.save();

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: {
        invoice: newInvoice
      }
    });

  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during invoice creation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get all invoices for a vendor
// @route   GET /api/invoices
// @access  Private (Vendor only)
const getInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = { vendor: req.user.id };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { clientName: { $regex: search, $options: 'i' } },
        { event: { $regex: search, $options: 'i' } },
        { invoiceNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Get invoices with pagination
    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count
    const total = await Invoice.countDocuments(query);

    // Calculate summary stats
    const allInvoices = await Invoice.find({ vendor: req.user.id });
    const totalAmount = allInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const pending = allInvoices.filter(inv => inv.status === 'Pending');
    const paid = allInvoices.filter(inv => inv.status === 'Paid');
    const overdue = allInvoices.filter(inv => inv.status === 'Overdue');
    const pendingAmount = pending.reduce((sum, inv) => sum + inv.total, 0);
    const paidAmount = paid.reduce((sum, inv) => sum + inv.total, 0);
    const overdueAmount = overdue.reduce((sum, inv) => sum + inv.total, 0);

    res.status(200).json({
      success: true,
      message: 'Invoices retrieved successfully',
      data: {
        invoices,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        },
        summary: {
          totalAmount,
          pending: {
            count: pending.length,
            amount: pendingAmount
          },
          paid: {
            count: paid.length,
            amount: paidAmount
          },
          overdue: {
            count: overdue.length,
            amount: overdueAmount
          }
        }
      }
    });

  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving invoices',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get a single invoice by ID
// @route   GET /api/invoices/:id
// @access  Private (Vendor only)
const getInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Invoice retrieved successfully',
      data: {
        invoice
      }
    });

  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update an invoice
// @route   PUT /api/invoices/:id
// @access  Private (Vendor only)
const updateInvoice = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Check if invoice number is being changed and if it already exists
    if (updateData.invoiceNumber && updateData.invoiceNumber !== invoice.invoiceNumber) {
      const existingInvoice = await Invoice.findOne({ 
        invoiceNumber: updateData.invoiceNumber,
        _id: { $ne: id }
      });
      if (existingInvoice) {
        return res.status(409).json({
          success: false,
          message: 'Invoice number already exists'
        });
      }
    }

    // Update invoice
    const updatedInvoice = await Invoice.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: {
        invoice: updatedInvoice
      }
    });

  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete an invoice
// @route   DELETE /api/invoices/:id
// @access  Private (Vendor only)
const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Delete invoice
    await Invoice.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully'
    });

  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while deleting invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Mark invoice as paid
// @route   PATCH /api/invoices/:id/mark-paid
// @access  Private (Vendor only)
const markInvoiceAsPaid = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Mark as paid
    await invoice.markAsPaid();

    res.status(200).json({
      success: true,
      message: 'Invoice marked as paid successfully',
      data: {
        invoice
      }
    });

  } catch (error) {
    console.error('Mark invoice as paid error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while marking invoice as paid',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update overdue invoices status
// @route   PATCH /api/invoices/update-overdue
// @access  Private (Vendor only)
const updateOverdueInvoices = async (req, res) => {
  try {
    const result = await Invoice.updateOverdueStatus();

    res.status(200).json({
      success: true,
      message: 'Overdue invoices updated successfully',
      data: {
        updatedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Update overdue invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating overdue invoices',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Download invoice as PDF
// @route   GET /api/invoices/:id/download
// @access  Private (Vendor only)
const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice and check ownership
    const invoice = await Invoice.findOne({ _id: id, vendor: req.user.id });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    // Generate PDF using jsPDF
    const { jsPDF } = require('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Set font
    pdf.setFont('helvetica');
    
    // Add content to PDF
    let yPosition = 20;
    
    // Header
    pdf.setFontSize(24);
    pdf.setTextColor(175, 142, 186); // #AF8EBA
    pdf.text('INVOICE', 20, yPosition);
    yPosition += 20;
    
    // Invoice details
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`Invoice #: ${invoice.invoiceNumber}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Date: ${invoice.formattedInvoiceDate || invoice.invoiceDate.toLocaleDateString()}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Due Date: ${invoice.formattedDueDate || invoice.dueDate.toLocaleDateString()}`, 20, yPosition);
    yPosition += 20;
    
    // Client information
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Bill To:', 20, yPosition);
    yPosition += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.text(invoice.clientName, 20, yPosition);
    yPosition += 8;
    if (invoice.event) {
      pdf.text(`Event: ${invoice.event}`, 20, yPosition);
      yPosition += 20;
    } else {
      yPosition += 12;
    }
    
    // Items table header
    pdf.setFont('helvetica', 'bold');
    pdf.text('Description', 20, yPosition);
    pdf.text('Qty', 100, yPosition);
    pdf.text('Unit Price', 130, yPosition);
    pdf.text('Total', 170, yPosition);
    yPosition += 8;
    
    // Items
    pdf.setFont('helvetica', 'normal');
    invoice.items.forEach(item => {
      pdf.text(item.description, 20, yPosition);
      pdf.text(item.quantity.toString(), 100, yPosition);
      pdf.text(`$${item.unitPrice.toFixed(2)}`, 130, yPosition);
      pdf.text(`$${(item.quantity * item.unitPrice).toFixed(2)}`, 170, yPosition);
      yPosition += 8;
    });
    
    yPosition += 10;
    
    // Totals
    if (invoice.adjustmentsTotal > 0) {
      pdf.text(`Adjustments: $${invoice.adjustmentsTotal.toFixed(2)}`, 120, yPosition);
      yPosition += 8;
    }
    pdf.text(`Subtotal: $${invoice.subtotal.toFixed(2)}`, 120, yPosition);
    yPosition += 8;
    if (invoice.taxAmount > 0) {
      pdf.text(`Tax: $${invoice.taxAmount.toFixed(2)}`, 120, yPosition);
      yPosition += 8;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Total: $${invoice.total.toFixed(2)}`, 120, yPosition);
    
    // Payment method
    yPosition += 20;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Payment Method: ${invoice.paymentOption}`, 20, yPosition);
    
    // Notes
    if (invoice.notes) {
      yPosition += 20;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Notes:', 20, yPosition);
      yPosition += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.text(invoice.notes, 20, yPosition);
    }
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    
    // Send PDF as buffer
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Download invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while downloading invoice',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  markInvoiceAsPaid,
  updateOverdueInvoices,
  downloadInvoice
}; 