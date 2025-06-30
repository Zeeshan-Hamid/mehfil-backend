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
  slug: String,
  eventType: {
    type: String,
    required: [true, 'Event type is required.'],
    enum: ['wedding', 'engagement', 'aqeeqah', 'nikah', 'walima', 'mehendi', 'birthday', 'anniversary', 'corporate', 'other'],
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
    required: true
  },
  packages: [packageSchema],
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to ensure a vendor cannot create two events with the same name and type.
eventSchema.index({ vendor: 1, name: 1, eventType: 1 }, { unique: true });

// Text index for searching across multiple fields
eventSchema.index(
  { name: 'text', "location.city": 'text', "location.state": 'text', "location.zipCode": 'text', tags: 'text' }, 
  { name: 'EventTextIndex', weights: { name: 10, tags: 5, 'location.city': 2, 'location.state': 2 } }
);

// Mongoose Middleware to create a slug from the name before saving
eventSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

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