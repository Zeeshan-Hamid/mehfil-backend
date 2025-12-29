const mongoose = require('mongoose');

const demoRequestSchema = new mongoose.Schema({
  // Contact Information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    maxlength: [20, 'Phone number cannot exceed 20 characters']
  },
  
  // Business Information (Optional)
  businessName: {
    type: String,
    required: false,
    trim: true,
    maxlength: [200, 'Business name cannot exceed 200 characters']
  },
  
  // Status and Metadata
  status: {
    type: String,
    enum: ['new', 'contacted', 'scheduled', 'completed', 'cancelled'],
    default: 'new'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },
  
  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now
  },
  contactedAt: {
    type: Date
  },
  scheduledAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
demoRequestSchema.index({ email: 1 });
demoRequestSchema.index({ status: 1 });
demoRequestSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('DemoRequest', demoRequestSchema);

