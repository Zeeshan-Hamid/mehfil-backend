const mongoose = require('mongoose');

const promotionalEventSchema = new mongoose.Schema({
  // Admin who created this promotional event
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Promotional event must be created by an admin.'],
    index: true
  },
  
  // Basic event information
  title: {
    type: String,
    required: [true, 'Event title is required.'],
    trim: true,
    maxlength: [200, 'Event title cannot exceed 200 characters.']
  },
  
  tagline: {
    type: String,
    trim: true,
    maxlength: [300, 'Tagline cannot exceed 300 characters.']
  },
  
  description: {
    type: String,
    required: [true, 'Event description is required.'],
    maxlength: [5000, 'Description cannot exceed 5000 characters.']
  },
  
  // Images array - will store S3 URLs
  images: {
    type: [String],
    validate: [array => array.length > 0, 'At least one image is required.']
  },
  
  // Event URL (optional)
  url: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty
        return /^https?:\/\/.+/.test(v);
      },
      message: 'URL must be a valid HTTP/HTTPS link.'
    }
  },
  
  // Date and time
  date: {
    type: Date,
    required: [true, 'Event date is required.']
  },
  
  time: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Time must be in HH:MM format.'
    }
  },
  
  // Location information
  location: {
    city: {
      type: String,
      required: [true, 'City is required.'],
      trim: true,
      maxlength: [100, 'City name cannot exceed 100 characters.']
    },
    state: {
      type: String,
      required: [true, 'State is required.'],
      trim: true,
      maxlength: [100, 'State name cannot exceed 100 characters.']
    },
    zipCode: {
      type: String,
      required: [true, 'ZIP code is required.'],
      trim: true,
      maxlength: [20, 'ZIP code cannot exceed 20 characters.']
    }
  },
  
  // Ticket information (optional)
  ticketPrice: {
    type: Number,
    min: [0, 'Ticket price cannot be negative.']
  },
  
  ticketsAvailable: {
    type: Number,
    min: [0, 'Tickets available cannot be negative.']
  },
  
  // Status and visibility
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Featured flag for admin promotion
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  
  featuredAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for searching and filtering
promotionalEventSchema.index({ title: 'text', description: 'text', 'location.city': 'text', 'location.state': 'text' });
promotionalEventSchema.index({ date: 1 });
promotionalEventSchema.index({ isActive: 1, isFeatured: 1 });

// Virtual for formatted date
promotionalEventSchema.virtual('formattedDate').get(function() {
  return this.date ? this.date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : null;
});

// Virtual for full location
promotionalEventSchema.virtual('fullLocation').get(function() {
  if (!this.location) return null;
  const { city, state, zipCode } = this.location;
  return `${city}, ${state} ${zipCode}`;
});

// Pre-save middleware to set featuredAt when isFeatured is set to true
promotionalEventSchema.pre('save', function(next) {
  if (this.isModified('isFeatured') && this.isFeatured && !this.featuredAt) {
    this.featuredAt = new Date();
  } else if (this.isModified('isFeatured') && !this.isFeatured) {
    this.featuredAt = null;
  }
  next();
});

const PromotionalEvent = mongoose.model('PromotionalEvent', promotionalEventSchema);

module.exports = PromotionalEvent;
