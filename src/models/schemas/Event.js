const mongoose = require('mongoose');
const slugify = require('slugify'); // A library to create URL-friendly slugs

// Sub-schema for Packages
const packageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Package name is required.'],
    trim: true,
    maxlength: [100, 'Package name cannot exceed 100 characters.']
  },
  price: {
    type: Number,
    required: [true, 'Package price is required.'],
    min: [0, 'Package price cannot be negative.']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'CAD', 'GBP', 'EUR']
  },
  includes: {
    type: [String],
    required: [true, 'Package inclusions are required.']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Package description cannot exceed 500 characters.']
  },
  // Pricing mode: perAttendee or flatPrice
  pricingMode: {
    type: String,
    enum: ['perAttendee', 'flatPrice'],
    default: 'perAttendee'
  }
});

// Sub-schema for Reviews
const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Review must belong to a user.']
  },
  rating: {
    type: Number,
    required: [true, 'Rating is required.'],
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true,
    maxlength: [1000, 'Review comment cannot exceed 1000 characters.']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const eventSchema = new mongoose.Schema({
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'An event must be associated with a vendor.'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Event name is required.'],
    trim: true,
    maxlength: [150, 'Event name cannot exceed 150 characters.']
  },
  slug: {
    type: String,
    unique: true,
    sparse: true, // Allow null values but enforce uniqueness for non-null values
    index: true
  },
  category: {
    type: String,
    required: [true, 'Event category is required.'],
    enum: [
      'Drinks',
      'Desserts', 
      'Decor',
      'Henna',
      'Food',
      'Videography',
      'Venue Management',
      'Entertainment',
      'Hair',
      'Makeup',
      'Photography',
      'Catering',
      'Wedding Planner',
      'Event Planner',
      'Other'
    ],
    index: true
  },
  description: {
    type: String,
    required: [true, 'Event description is required.'],
    maxlength: [5000, 'Description cannot exceed 5000 characters.']
  },
  imageUrls: {
    type: [String],
    validate: [array => array.length > 0, 'At least one image URL is required.']
  },
  services: {
    type: [String],
    required: false // Made optional for backward compatibility
  },
  offerings: {
    type: [String],
    required: false, // Made optional for backward compatibility with existing events
    validate: {
      validator: function(array) {
        // If array is null, undefined, or empty, it's valid (optional field)
        if (!array || array.length === 0) {
          return true;
        }
        // If array has items, all items must be non-empty strings
        return array.every(item => typeof item === 'string' && item.trim().length > 0);
      },
      message: 'If provided, offerings must be non-empty strings.'
    }
  },
  packages: [packageSchema],
  flatPrice: {
    amount: {
      type: Number,
      min: [0, 'Flat price cannot be negative.']
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'CAD', 'GBP', 'EUR']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Flat price description cannot exceed 500 characters.']
    },
    features: {
      type: [String],
      default: []
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  customPackages: [
    {
      name: {
        type: String,
        required: [true, 'Custom package name is required.'],
        trim: true,
        maxlength: [100, 'Custom package name cannot exceed 100 characters.']
      },
      price: {
        type: Number,
        required: [true, 'Custom package price is required.'],
        min: [0, 'Custom package price cannot be negative.']
      },
      // Number of attendees the quote is based on
      attendees: {
        type: Number,
        min: [1, 'Attendees must be at least 1'],
        default: 1
      },
      // Pricing mode: perAttendee or flatPrice
      pricingMode: {
        type: String,
        enum: ['perAttendee', 'flatPrice'],
        default: 'perAttendee'
      },
      currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'CAD', 'GBP', 'EUR']
      },
      includes: {
        type: [String],
        required: [true, 'Custom package inclusions are required.']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [500, 'Custom package description cannot exceed 500 characters.']
      },
      createdFor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Custom package must be created for a specific customer.']
      },
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Custom package must have a creator.']
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }
  ],
  location: {
    address: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    country: { type: String, default: 'United States', trim: true }
  },
  reviews: [reviewSchema],
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
    set: val => Math.round(val * 10) / 10 // Rounds to one decimal place
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  tags: {
    type: [String],
    index: true
  },
  // Admin featured listing flag
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  featuredAt: {
    type: Date
  },
  flexible_price: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to ensure a vendor cannot create two events with the same name and category.
eventSchema.index({ vendor: 1, name: 1, category: 1 }, { unique: true });

// Text index for searching across multiple fields
eventSchema.index(
  { name: 'text', "location.city": 'text', "location.state": 'text', "location.zipCode": 'text', tags: 'text' }, 
  { name: 'EventTextIndex', weights: { name: 10, tags: 5, 'location.city': 2, 'location.state': 2 } }
);

// Mongoose Middleware to create a slug from the name, location, and vendor before saving
eventSchema.pre('save', async function(next) {
  try {
    // Only generate slug if name, location, or vendor is modified, or if slug doesn't exist
    if (this.isModified('name') || this.isModified('location') || this.isModified('vendor') || !this.slug) {
      await this.generateUniqueSlug();
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Method to generate unique slug
eventSchema.methods.generateUniqueSlug = async function() {
  const Event = this.constructor;
  
  // Use the event name as the primary component
  const eventName = this.name || '';
  
  // Get location info
  const city = this.location?.city || '';
  const state = this.location?.state || '';
  
  // Create base slug: event-name-city-state
  let baseSlug = '';
  if (eventName) {
    baseSlug += slugify(eventName, { lower: true, strict: true });
  }
  if (city) {
    baseSlug += baseSlug ? '-' + slugify(city, { lower: true, strict: true }) : slugify(city, { lower: true, strict: true });
  }
  if (state) {
    baseSlug += baseSlug ? '-' + slugify(state, { lower: true, strict: true }) : slugify(state, { lower: true, strict: true });
  }
  
  // If we still don't have a base slug, use a fallback
  if (!baseSlug) {
    baseSlug = 'event';
  }
  
  // Add part of ObjectId for uniqueness (last 8 characters)
  const idSuffix = this._id ? this._id.toString().slice(-8) : '';
  let candidateSlug = baseSlug + (idSuffix ? '-' + idSuffix : '');
  
  // Check for uniqueness and modify if needed
  let counter = 1;
  let finalSlug = candidateSlug;
  
  while (await Event.findOne({ slug: finalSlug, _id: { $ne: this._id } })) {
    finalSlug = candidateSlug + '-' + counter;
    counter++;
  }
  
  this.slug = finalSlug;
};

// Mongoose Middleware to update average rating when a review is added/changed
// Note: This is a simplified calculation. A more complex app might handle this in a service layer.
eventSchema.pre('save', function(next) {
  if (this.isModified('reviews')) {
    if (this.reviews.length > 0) {
      const total = this.reviews.reduce((acc, review) => acc + review.rating, 0);
      this.averageRating = total / this.reviews.length;
      this.totalReviews = this.reviews.length;
    } else {
      this.averageRating = 0;
      this.totalReviews = 0;
    }
  }
  next();
});


const Event = mongoose.model('Event', eventSchema);

module.exports = Event; 