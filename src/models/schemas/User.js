const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Common fields for all user types
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  
  role: {
    type: String,
    enum: ['customer', 'vendor', 'admin'],
    required: [true, 'User role is required']
  },
  
  // Authentication & Security (Common)
  authProvider: {
    type: String,
    enum: ['email', 'google', 'facebook'],
    default: 'email'
  },
  
  passwordResetToken: {
    type: String,
    select: false
  },
  
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  socialLogin: {
    googleId: {
      type: String,
      sparse: true
    },
    facebookId: {
      type: String,
      sparse: true
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  emailVerified: {
    type: Boolean,
    default: false
  },
  
  phoneVerified: {
    type: Boolean,
    default: false
  },
  
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  
  lastLogin: {
    type: Date
  },
  
  // CUSTOMER-SPECIFIC FIELDS (only populated when role = 'customer')
  customerProfile: {
    fullName: {
      type: String,
      required: function() { return this.role === 'customer'; },
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    
    gender: {
      type: String,
      enum: ['male', 'female', 'prefer_not_to_say'],
      required: function() { return this.role === 'customer'; }
    },
    
    location: {
      city: {
        type: String,
        required: function() { return this.role === 'customer'; },
        trim: true
      },
      state: {
        type: String,
        required: function() { return this.role === 'customer'; },
        trim: true
      },
      country: {
        type: String,
        required: function() { return this.role === 'customer'; },
        trim: true,
        default: 'United States'
      },
      zipCode: {
        type: String,
        trim: true
      }
    },
    
    profileImage: {
      type: String,
      default: null
    },
    
    preferences: {
      eventTypes: {
        type: [String],
        enum: ['wedding', 'engagement', 'aqeeqah', 'nikah', 'walima', 'mehendi', 'birthday', 'anniversary'],
        default: []
      },
      budgetRange: {
        min: {
          type: Number,
          min: 0
        },
        max: {
          type: Number,
          min: 0
        },
        currency: {
          type: String,
          default: 'USD',
          enum: ['USD', 'CAD', 'GBP', 'EUR']
        }
      },
      preferredLanguages: {
        type: [String],
        default: ['English']
      },
      genderPreference: {
        type: String,
        enum: ['mixed', 'female_only', 'male_only'],
        default: 'mixed'
      },
      culturalPreferences: {
        type: [String],
        default: []
      }
    },
    
    preferredVendors: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  
  // VENDOR-SPECIFIC FIELDS (only populated when role = 'vendor')
  vendorProfile: {
    businessName: {
      type: String,
      required: function() { return this.role === 'vendor'; },
      trim: true,
      maxlength: [200, 'Business name cannot exceed 200 characters']
    },
    
    ownerName: {
      type: String,
      required: function() { return this.role === 'vendor'; },
      trim: true,
      maxlength: [100, 'Owner name cannot exceed 100 characters']
    },
    
    // Business Details
    businessAddress: {
      street: {
        type: String,
        required: function() { return this.role === 'vendor'; },
        trim: true
      },
      city: {
        type: String,
        required: function() { return this.role === 'vendor'; },
        trim: true
      },
      state: {
        type: String,
        required: function() { return this.role === 'vendor'; },
        trim: true
      },
      country: {
        type: String,
        required: function() { return this.role === 'vendor'; },
        trim: true,
        default: 'United States'
      },
      zipCode: {
        type: String,
        required: function() { return this.role === 'vendor'; },
        trim: true
      }
    },
    
    timezone: {
      type: String,
      required: function() { return this.role === 'vendor'; },
      enum: ['America/New_York', 'Europe/London', 'America/Los_Angeles', 'America/Chicago', 'America/Denver', 'America/Phoenix'],
      default: 'America/New_York'
    },
    
    businessRegistration: {
      registrationNumber: {
        type: String,
        trim: true
      },
      registrationType: {
        type: String,
        enum: ['LLC', 'Corp', 'Sole Proprietorship', 'Partnership'],
        trim: true
      },
      taxId: {
        type: String,
        trim: true
      }
    },
    
    // Geolocation for proximity-based search
    geo: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    },
    
    // Service Information
    primaryServiceCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: false // Will be required during profile completion, not signup
    },
    
    serviceCategories: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    
    serviceDescription: {
      type: String,
      required: false, // Will be required during profile completion, not signup
      maxlength: [1000, 'Service description cannot exceed 1000 characters']
    },
    
    experienceYears: {
      type: Number,
      required: false, // Will be required during profile completion, not signup
      min: [0, 'Experience years cannot be negative'],
      max: [50, 'Experience years cannot exceed 50']
    },
    
    languagesSpoken: {
      type: [String],
      default: ['English']
    },
    
    serviceAreas: {
      type: [String],
      required: false // Will be required during profile completion, not signup
    },
    
    // Enhanced Halal Compliance with Status
    halalCertification: {
      hasHalalCert: {
        type: Boolean,
        default: false
      },
      certificationFile: {
        type: String,
        default: null
      },
      certificateNumber: {
        type: String,
        trim: true
      },
      expiryDate: {
        type: Date
      },
      issuingAuthority: {
        type: String,
        trim: true
      },
      verifiedByAdmin: {
        type: Boolean,
        default: false
      },
      verificationDate: {
        type: Date
      },
      status: {
        type: String,
        enum: ['certified', 'expired', 'unverified', 'self-declared', 'not-applicable'],
        default: 'unverified'
      },
      renewalReminders: {
        thirtyDays: {
          type: Boolean,
          default: false
        },
        sevenDays: {
          type: Boolean,
          default: false
        },
        oneDayBefore: {
          type: Boolean,
          default: false
        }
      }
    },
    
    // Trust & Verification Badges
    verifiedBadge: {
      type: Boolean,
      default: false
    },
    
    halalVerifiedBadge: {
      type: Boolean,
      default: false
    },
    
    // Portfolio & Media
    portfolio: {
      images: {
        type: [String],
        default: []
      },
      videos: {
        type: [String],
        default: []
      },
      description: {
        type: String,
        maxlength: [2000, 'Portfolio description cannot exceed 2000 characters']
      },
      beforeAfterPhotos: [{
        before: {
          type: String,
          required: true
        },
        after: {
          type: String,
          required: true
        },
        description: {
          type: String,
          maxlength: [500, 'Before/after description cannot exceed 500 characters']
        }
      }]
    },
    
    // Online Presence
    socialLinks: {
      website: {
        type: String,
        trim: true
      },
      instagram: {
        type: String,
        trim: true
      },
      facebook: {
        type: String,
        trim: true
      },
      twitter: {
        type: String,
        trim: true
      },
      youtube: {
        type: String,
        trim: true
      },
      linkedin: {
        type: String,
        trim: true
      }
    },
    
    // Availability & Scheduling with Timezone Support
    availability: {
      calendar: [{
        date: {
          type: Date,
          required: true
        },
        isAvailable: {
          type: Boolean,
          default: true
        },
        timeSlots: [{
          startTime: {
            type: String,
            required: true
          },
          endTime: {
            type: String,
            required: true
          },
          isBooked: {
            type: Boolean,
            default: false
          },
          bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
          }
        }]
      }],
      workingDays: {
        type: [String],
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
      },
      workingHours: {
        start: {
          type: String,
          default: '09:00'
        },
        end: {
          type: String,
          default: '18:00'
        }
      },
      advanceBookingDays: {
        type: Number,
        default: 30,
        min: [1, 'Advance booking days must be at least 1']
      },
      blackoutDates: [{
        startDate: {
          type: Date,
          required: true
        },
        endDate: {
          type: Date,
          required: true
        },
        reason: {
          type: String,
          maxlength: [200, 'Blackout reason cannot exceed 200 characters']
        }
      }]
    },
    
    // Enhanced Booking Rules
    bookingRules: {
      minNoticeHours: {
        type: Number,
        default: 24,
        min: [1, 'Minimum notice hours must be at least 1']
      },
      cancellationPolicy: {
        type: String,
        maxlength: [1000, 'Cancellation policy cannot exceed 1000 characters']
      },
      depositRequired: {
        type: Number,
        min: [0, 'Deposit required cannot be negative']
      },
      depositPercentage: {
        type: Number,
        min: [0, 'Deposit percentage cannot be negative'],
        max: [100, 'Deposit percentage cannot exceed 100']
      },
      paymentTerms: {
        type: String,
        maxlength: [500, 'Payment terms cannot exceed 500 characters']
      }
    },
    
    // Pricing & Financial
    pricing: {
      startingPrice: {
        type: Number,
        required: false, // Will be required during profile completion, not signup
        min: [0, 'Starting price cannot be negative']
      },
      maxPrice: {
        type: Number,
        min: [0, 'Max price cannot be negative']
      },
      currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'CAD', 'GBP', 'EUR']
      },
      pricingType: {
        type: String,
        enum: ['fixed', 'hourly', 'package', 'custom'],
        required: false // Will be required during profile completion, not signup
      },
      packageDeals: [{
        packageName: {
          type: String,
          required: true,
          trim: true
        },
        description: {
          type: String,
          maxlength: [500, 'Package description cannot exceed 500 characters']
        },
        price: {
          type: Number,
          required: true,
          min: [0, 'Package price cannot be negative']
        },
        inclusions: {
          type: [String],
          default: []
        }
      }]
    },
    
    // Bank & Payment Info
    paymentInfo: {
      bankAccountNumber: {
        type: String,
        trim: true,
        select: false
      },
      routingNumber: {
        type: String,
        trim: true,
        select: false
      },
      accountHolderName: {
        type: String,
        trim: true,
        select: false
      },
      bankName: {
        type: String,
        trim: true,
        select: false
      },
      stripeAccountId: {
        type: String,
        trim: true,
        select: false
      },
      paypalEmail: {
        type: String,
        trim: true,
        select: false
      },
      preferredPaymentMethod: {
        type: String,
        enum: ['bank_transfer', 'stripe', 'paypal'],
        default: 'stripe'
      }
    },
    
    // Reviews & Ratings
    rating: {
      average: {
        type: Number,
        default: 0,
        min: [0, 'Rating cannot be negative'],
        max: [5, 'Rating cannot exceed 5']
      },
      totalReviews: {
        type: Number,
        default: 0,
        min: [0, 'Total reviews cannot be negative']
      },
      breakdown: {
        fiveStar: {
          type: Number,
          default: 0
        },
        fourStar: {
          type: Number,
          default: 0
        },
        threeStar: {
          type: Number,
          default: 0
        },
        twoStar: {
          type: Number,
          default: 0
        },
        oneStar: {
          type: Number,
          default: 0
        }
      }
    },
    
    // Admin & Status
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending'
    },
    
    approvalHistory: [{
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'suspended'],
        required: true
      },
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      reason: {
        type: String,
        maxlength: [500, 'Approval reason cannot exceed 500 characters']
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    
    rejectionReason: {
      type: String,
      maxlength: [1000, 'Rejection reason cannot exceed 1000 characters']
    },
    
    isFeatured: {
      type: Boolean,
      default: false
    },
    
    featuredUntil: {
      type: Date
    },
    
    subscriptionTier: {
      type: String,
      enum: ['basic', 'premium', 'enterprise'],
      default: 'basic'
    },
    
    // Enhanced Performance Metrics
    stats: {
      totalBookings: {
        type: Number,
        default: 0,
        min: [0, 'Total bookings cannot be negative']
      },
      completedBookings: {
        type: Number,
        default: 0,
        min: [0, 'Completed bookings cannot be negative']
      },
      cancelledBookings: {
        type: Number,
        default: 0,
        min: [0, 'Cancelled bookings cannot be negative']
      },
      responseTime: {
        type: Number,
        default: 0,
        min: [0, 'Response time cannot be negative']
      },
      responseRate: {
        type: Number,
        default: 0,
        min: [0, 'Response rate cannot be negative'],
        max: [100, 'Response rate cannot exceed 100']
      },
      repeatCustomers: {
        type: Number,
        default: 0,
        min: [0, 'Repeat customers cannot be negative']
      }
    },
    
    // Verification & Trust
    verifications: {
      businessVerified: {
        type: Boolean,
        default: false
      },
      backgroundCheckComplete: {
        type: Boolean,
        default: false
      },
      insuranceVerified: {
        type: Boolean,
        default: false
      }
    },
    
    // Additional Business Features
    team: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      role: {
        type: String,
        required: true,
        trim: true
      },
      photo: {
        type: String
      },
      bio: {
        type: String,
        maxlength: [500, 'Team member bio cannot exceed 500 characters']
      }
    }],
    
    // Search & Discovery
    tags: {
      type: [String],
      default: []
    },
    
    specialties: {
      type: [String],
      default: []
    },
    
    awards: {
      type: [String],
      default: []
    },
    
    certifications: {
      type: [String],
      default: []
    },
    
    // Communication Preferences
    communicationPrefs: {
      emailNotifications: {
        type: Boolean,
        default: true
      },
      smsNotifications: {
        type: Boolean,
        default: true
      },
      pushNotifications: {
        type: Boolean,
        default: true
      },
      marketingEmails: {
        type: Boolean,
        default: false
      }
    },
    
    profileCompleteness: {
      type: Number,
      default: 0,
      min: [0, 'Profile completeness cannot be negative'],
      max: [100, 'Profile completeness cannot exceed 100']
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'customerProfile.location.city': 1 });
userSchema.index({ 'vendorProfile.businessAddress.city': 1 });
userSchema.index({ 'vendorProfile.primaryServiceCategory': 1 });
userSchema.index({ 'vendorProfile.serviceCategories': 1 });
userSchema.index({ 'vendorProfile.approvalStatus': 1 });
userSchema.index({ 'vendorProfile.rating.average': -1 });
userSchema.index({ 'vendorProfile.isFeatured': -1, createdAt: -1 });
userSchema.index({ 'vendorProfile.geo': '2dsphere' });
userSchema.index({ 'vendorProfile.halalCertification.status': 1 });
userSchema.index({ 'customerProfile.preferences.eventTypes': 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware to clean profiles based on role
userSchema.pre('save', function(next) {
  // Remove unwanted profiles based on role
  if (this.role === 'customer') {
    this.vendorProfile = undefined;
  } else if (this.role === 'vendor') {
    this.customerProfile = undefined;
  }
  next();
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Instance method for vendor profile completeness calculation
userSchema.methods.calculateVendorProfileCompleteness = function() {
  if (this.role !== 'vendor') return 0;
  
  let score = 0;
  const totalFields = 20;
  
  // Basic info (5 points each)
  if (this.vendorProfile.businessName) score += 5;
  if (this.vendorProfile.ownerName) score += 5;
  if (this.email) score += 5;
  if (this.phoneNumber) score += 5;
  if (this.vendorProfile.businessAddress.street && this.vendorProfile.businessAddress.city) score += 5;
  
  // Service info (5 points each)
  if (this.vendorProfile.primaryServiceCategory) score += 5;
  if (this.vendorProfile.serviceDescription) score += 5;
  if (this.vendorProfile.experienceYears >= 0) score += 5;
  if (this.vendorProfile.serviceAreas.length > 0) score += 5;
  if (this.vendorProfile.pricing.startingPrice > 0) score += 5;
  
  // Portfolio (5 points each)
  if (this.vendorProfile.portfolio.images.length > 0) score += 5;
  if (this.vendorProfile.portfolio.description) score += 5;
  
  // Additional features (5 points each)
  if (this.vendorProfile.halalCertification.hasHalalCert) score += 5;
  if (this.vendorProfile.socialLinks.website) score += 5;
  if (this.vendorProfile.availability.workingDays.length > 0) score += 5;
  if (this.vendorProfile.bookingRules.cancellationPolicy) score += 5;
  if (this.vendorProfile.team.length > 0) score += 5;
  if (this.vendorProfile.tags.length > 0) score += 5;
  if (this.emailVerified) score += 5;
  if (this.phoneVerified) score += 5;
  
  this.vendorProfile.profileCompleteness = Math.round(score);
  return this.vendorProfile.profileCompleteness;
};

// Virtual for customer full location
userSchema.virtual('customerFullLocation').get(function() {
  if (this.role !== 'customer' || !this.customerProfile.location) return null;
  return `${this.customerProfile.location.city}, ${this.customerProfile.location.state}, ${this.customerProfile.location.country}`;
});

// Virtual for vendor full business address
userSchema.virtual('vendorFullBusinessAddress').get(function() {
  if (this.role !== 'vendor' || !this.vendorProfile.businessAddress) return null;
  return `${this.vendorProfile.businessAddress.street}, ${this.vendorProfile.businessAddress.city}, ${this.vendorProfile.businessAddress.state}, ${this.vendorProfile.businessAddress.country} ${this.vendorProfile.businessAddress.zipCode}`;
});

// Virtual for checking if vendor is halal certified
userSchema.virtual('isHalalCertified').get(function() {
  if (this.role !== 'vendor') return false;
  return this.vendorProfile.halalCertification.status === 'certified' && this.vendorProfile.halalCertification.verifiedByAdmin;
});

// Virtual for user display name
userSchema.virtual('displayName').get(function() {
  if (this.role === 'customer') {
    return this.customerProfile.fullName;
  } else if (this.role === 'vendor') {
    return this.vendorProfile.businessName;
  }
  return this.email;
});

module.exports = mongoose.model('User', userSchema); 