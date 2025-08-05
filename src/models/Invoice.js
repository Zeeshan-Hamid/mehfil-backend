const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  clientName: {
    type: String,
    required: true,
    trim: true
  },
  event: {
    type: String,
    trim: true
  },
  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  paymentOption: {
    type: String,
    enum: ['Bank Transfer (ACH)', 'Credit Card', 'Cash'],
    default: 'Bank Transfer (ACH)'
  },
  notes: {
    type: String,
    trim: true
  },
  taxEnabled: {
    type: Boolean,
    default: true
  },
  taxRate: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },
  adjustments: [{
    type: Number,
    default: 0
  }],
  items: [{
    description: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    }
  }],
  logoUrl: {
    type: String
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  adjustmentsTotal: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Overdue', 'Cancelled'],
    default: 'Pending'
  },
  pdfUrl: {
    type: String
  },
  paidAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better performance
invoiceSchema.index({ vendor: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ dueDate: 1 });

// Pre-save middleware to calculate totals
invoiceSchema.pre('save', function(next) {
  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => {
    return sum + (item.quantity * item.unitPrice);
  }, 0);

  // Calculate adjustments total
  this.adjustmentsTotal = this.adjustments.reduce((sum, adj) => {
    return sum + (adj || 0);
  }, 0);

  // Calculate tax amount
  this.taxAmount = this.taxEnabled ? (this.subtotal * this.taxRate / 100) : 0;

  // Calculate total
  this.total = this.subtotal + this.taxAmount + this.adjustmentsTotal;

  // Check if invoice is overdue
  if (this.status === 'Pending' && this.dueDate < new Date()) {
    this.status = 'Overdue';
  }

  next();
});

// Virtual for formatted invoice number
invoiceSchema.virtual('formattedInvoiceNumber').get(function() {
  return this.invoiceNumber;
});

// Virtual for formatted dates
invoiceSchema.virtual('formattedInvoiceDate').get(function() {
  return this.invoiceDate.toISOString().split('T')[0];
});

invoiceSchema.virtual('formattedDueDate').get(function() {
  return this.dueDate.toISOString().split('T')[0];
});

// Virtual for status color
invoiceSchema.virtual('statusColor').get(function() {
  switch (this.status) {
    case 'Paid':
      return 'green';
    case 'Pending':
      return 'orange';
    case 'Overdue':
      return 'red';
    case 'Cancelled':
      return 'gray';
    default:
      return 'black';
  }
});

// Instance method to mark as paid
invoiceSchema.methods.markAsPaid = function() {
  this.status = 'Paid';
  this.paidAt = new Date();
  return this.save();
};

// Instance method to mark as overdue
invoiceSchema.methods.markAsOverdue = function() {
  if (this.status === 'Pending' && this.dueDate < new Date()) {
    this.status = 'Overdue';
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to generate invoice number
invoiceSchema.statics.generateInvoiceNumber = function() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `INVOICE-${datePart}-${randomPart}`;
};

// Static method to get overdue invoices
invoiceSchema.statics.getOverdueInvoices = function() {
  return this.find({
    status: 'Pending',
    dueDate: { $lt: new Date() }
  });
};

// Static method to update overdue status
invoiceSchema.statics.updateOverdueStatus = function() {
  return this.updateMany(
    {
      status: 'Pending',
      dueDate: { $lt: new Date() }
    },
    {
      $set: { status: 'Overdue' }
    }
  );
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice; 