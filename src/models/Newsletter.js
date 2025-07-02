const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email address is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email address'
    ]
  },
  subscriptionDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscribedTo: {
    events: {
      type: Boolean,
      default: true
    },
    promotions: {
      type: Boolean,
      default: true
    },
    blog: {
      type: Boolean,
      default: true
    }
  },
  unsubscribeToken: {
    type: String,
    select: false
  }
}, {
  timestamps: true
});

// Index for faster lookups
newsletterSchema.index({ email: 1 });
newsletterSchema.index({ isActive: 1 });

// Generate a unique token for unsubscribe functionality
newsletterSchema.pre('save', function(next) {
  if (this.isNew) {
    const crypto = require('crypto');
    this.unsubscribeToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

const Newsletter = mongoose.model('Newsletter', newsletterSchema);

module.exports = Newsletter; 