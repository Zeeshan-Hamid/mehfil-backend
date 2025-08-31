const mongoose = require('mongoose');

const contactUsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email address is required'],
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email address'
    ]
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  subject: {
    type: String,
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters'],
    default: 'General Inquiry'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'resolved', 'closed'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  source: {
    type: String,
    enum: ['website', 'mobile', 'api'],
    default: 'website'
  },
  userAgent: {
    type: String,
    trim: true
  },
  ipAddress: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  responseSent: {
    type: Boolean,
    default: false
  },
  responseDate: {
    type: Date
  },
  responseMessage: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
contactUsSchema.index({ email: 1 });
contactUsSchema.index({ status: 1 });
contactUsSchema.index({ createdAt: -1 });
contactUsSchema.index({ priority: 1 });
contactUsSchema.index({ assignedTo: 1 });

// Pre-save middleware for logging
contactUsSchema.pre('save', function(next) {
  
  next();
});

// Instance method to mark as responded
contactUsSchema.methods.markAsResponded = function(responseMessage) {
  this.responseSent = true;
  this.responseDate = new Date();
  this.responseMessage = responseMessage;
  this.status = 'resolved';
  return this.save();
};

// Static method to get statistics
contactUsSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
        highPriority: { $sum: { $cond: [{ $in: ['$priority', ['high', 'urgent']] }, 1, 0] } }
      }
    }
  ]);
  
  return stats[0] || { total: 0, pending: 0, resolved: 0, highPriority: 0 };
};

const ContactUs = mongoose.model('ContactUs', contactUsSchema);

module.exports = ContactUs; 