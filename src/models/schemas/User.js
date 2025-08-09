const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const findZone = require("zipcode-to-timezone");

const userSchema = new mongoose.Schema(
  {
    // Common fields for all user types
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },

    phoneNumber: {
      type: String,
      required: function () {
        return this.authProvider === "email";
      },
      trim: true,
    },

    role: {
      type: String,
      enum: ["customer", "vendor", "admin"],
      required: [true, "User role is required"],
    },

    // Authentication & Security (Common)
    authProvider: {
      type: String,
      enum: ["email", "google", "facebook", "vendor-created"],
      default: "email",
    },

    passwordResetToken: {
      type: String,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      select: false,
    },

    socialLogin: {
      googleId: {
        type: String,
        sparse: true,
      },
      facebookId: {
        type: String,
        sparse: true,
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    lastLogin: {
      type: Date,
    },

    emailVerificationToken: {
      type: String,
      select: false,
    },

    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    // CUSTOMER-SPECIFIC FIELDS (only populated when role = 'customer')
    customerProfile: {
      fullName: {
        type: String,
        required: function () {
          return this.role === "customer" && this.authProvider === "email";
        },
        trim: true,
        maxlength: [100, "Full name cannot exceed 100 characters"],
      },

      gender: {
        type: String,
        enum: ["male", "female", "prefer_not_to_say"],
        required: function () {
          return this.role === "customer" && this.authProvider === "email";
        },
      },

      location: {
        city: {
          type: String,
          required: function () {
            return this.role === "customer" && this.authProvider === "email";
          },
          trim: true,
        },
        state: {
          type: String,
          required: function () {
            return this.role === "customer" && this.authProvider === "email";
          },
          trim: true,
        },
        country: {
          type: String,
          required: function () {
            return this.role === "customer" && this.authProvider === "email";
          },
          trim: true,
          default: "United States",
        },
        zipCode: {
          type: String,
          trim: true,
        },
      },

      profileImage: {
        type: String,
        default: null,
      },
      customerCart: [
        {
          event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Event',
            required: true,
          },
          package: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
          },
          packageType: {
            type: String,
            enum: ['regular', 'custom'],
            required: true,
            default: 'regular'
          },
          eventDate: {
            type: Date,
            required: true
          },
          attendees: {
            type: Number,
            required: true,
            min: [1, 'Must have at least one attendee.'],
          },
          totalPrice: {
            type: Number,
            required: true,
            min: [0, 'Total price cannot be negative.']
          },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      profileCompleted: {
        type: Boolean,
        default: false,
      },
      preferences: {
        categories: {
          type: [String],
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
          default: [],
        },
        budgetRange: {
          min: {
            type: Number,
            min: 0,
          },
          max: {
            type: Number,
            min: 0,
          },
          currency: {
            type: String,
            default: "USD",
            enum: ["USD", "CAD", "GBP", "EUR"],
          },
        },
        preferredLanguages: {
          type: [String],
          default: ["English"],
        },
      },

      preferredVendors: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      favorites: [
        {
          event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Event',
            required: true
          },
          addedAt: {
            type: Date,
            default: Date.now
          }
        }
      ],
    },

    // VENDOR-SPECIFIC FIELDS (only populated when role = 'vendor')
    vendorProfile: {
      businessName: {
        type: String,
        required: function () {
          return this.role === "vendor" && this.authProvider === "email";
        },
        trim: true,
        maxlength: [200, "Business name cannot exceed 200 characters"],
      },

      ownerName: {
        type: String,
        required: function () {
          return this.role === "vendor" && this.authProvider === "email";
        },
        trim: true,
        maxlength: [100, "Owner name cannot exceed 100 characters"],
      },

      // Business Details
      businessAddress: {
        street: {
          type: String,
          trim: true,
        },
        city: {
          type: String,
          trim: true,
        },
        state: {
          type: String,
          trim: true,
        },
        country: {
          type: String,
          trim: true,
          default: "United States",
        },
        zipCode: {
          type: String,
          required: function () {
            return this.role === "vendor" && this.authProvider === "email";
          },
          trim: true,
        },
      },

      timezone: {
        type: String,
        enum: [
          "America/New_York",
          "Europe/London",
          "America/Los_Angeles",
          "America/Chicago",
          "America/Denver",
          "America/Phoenix",
          "America/Anchorage",
          "Pacific/Honolulu",
        ],
        default: null,
      },

      // Geolocation for proximity-based search
      geo: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: [0, 0],
        },
      },

      // Service Information
      primaryServiceCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: false, // Will be required during profile completion, not signup
      },

      // Enhanced Halal Compliance with Status
      halalCertification: {
        hasHalalCert: {
          type: Boolean,
          default: false,
        },
        certificationFile: {
          type: String,
          default: null,
        },
        certificateNumber: {
          type: String,
          trim: true,
        },
        expiryDate: {
          type: Date,
        },
        issuingAuthority: {
          type: String,
          trim: true,
        },
        verifiedByAdmin: {
          type: Boolean,
          default: false,
        },
        verificationDate: {
          type: Date,
        },
        status: {
          type: String,
          enum: [
            "certified",
            "expired",
            "unverified",
            "self-declared",
            "not-applicable",
          ],
          default: "unverified",
        },
        renewalReminders: {
          thirtyDays: {
            type: Boolean,
            default: false,
          },
          sevenDays: {
            type: Boolean,
            default: false,
          },
          oneDayBefore: {
            type: Boolean,
            default: false,
          },
        },
      },

      // Trust & Verification Badges
      verifiedBadge: {
        type: Boolean,
        default: false,
      },

      halalVerifiedBadge: {
        type: Boolean,
        default: false,
      },

      // Portfolio & Media
      portfolio: {
        images: {
          type: [String],
          default: [],
        },
        videos: {
          type: [String],
          default: [],
        },
        description: {
          type: String,
          maxlength: [
            2000,
            "Portfolio description cannot exceed 2000 characters",
          ],
        },
        beforeAfterPhotos: [
          {
            before: {
              type: String,
              required: true,
            },
            after: {
              type: String,
              required: true,
            },
            description: {
              type: String,
              maxlength: [
                500,
                "Before/after description cannot exceed 500 characters",
              ],
            },
          },
        ],
      },

      // Online Presence
      socialLinks: {
        website: {
          type: String,
          trim: true,
        },
        instagram: {
          type: String,
          trim: true,
        },
        facebook: {
          type: String,
          trim: true,
        },
        twitter: {
          type: String,
          trim: true,
        },
        youtube: {
          type: String,
          trim: true,
        },
        linkedin: {
          type: String,
          trim: true,
        },
      },

      // Enhanced Booking Rules
      bookingRules: {
        minNoticeHours: {
          type: Number,
          default: 24,
          min: [1, "Minimum notice hours must be at least 1"],
        },
        cancellationPolicy: {
          type: String,
          maxlength: [
            1000,
            "Cancellation policy cannot exceed 1000 characters",
          ],
        },
        depositRequired: {
          type: Number,
          min: [0, "Deposit required cannot be negative"],
        },
        depositPercentage: {
          type: Number,
          min: [0, "Deposit percentage cannot be negative"],
          max: [100, "Deposit percentage cannot exceed 100"],
        },
        paymentTerms: {
          type: String,
          maxlength: [500, "Payment terms cannot exceed 500 characters"],
        },
      },

      // Reviews & Ratings
      rating: {
        average: {
          type: Number,
          default: 0,
          min: [0, "Rating cannot be negative"],
          max: [5, "Rating cannot exceed 5"],
        },
        totalReviews: {
          type: Number,
          default: 0,
          min: [0, "Total reviews cannot be negative"],
        },
        breakdown: {
          fiveStar: {
            type: Number,
            default: 0,
          },
          fourStar: {
            type: Number,
            default: 0,
          },
          threeStar: {
            type: Number,
            default: 0,
          },
          twoStar: {
            type: Number,
            default: 0,
          },
          oneStar: {
            type: Number,
            default: 0,
          },
        },
      },

      isFeatured: {
        type: Boolean,
        default: false,
      },

      // Enhanced Performance Metrics
      stats: {
        totalBookings: {
          type: Number,
          default: 0,
          min: [0, "Total bookings cannot be negative"],
        },
        completedBookings: {
          type: Number,
          default: 0,
          min: [0, "Completed bookings cannot be negative"],
        },
        cancelledBookings: {
          type: Number,
          default: 0,
          min: [0, "Cancelled bookings cannot be negative"],
        },
      },

      profileCompleted: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ "customerProfile.location.city": 1 });
userSchema.index({ "vendorProfile.businessAddress.city": 1 });
userSchema.index({ "vendorProfile.approvalStatus": 1 });
userSchema.index({ "vendorProfile.rating.average": -1 });
userSchema.index({ "vendorProfile.isFeatured": -1, createdAt: -1 });
userSchema.index({ "vendorProfile.geo": "2dsphere" });
userSchema.index({ "vendorProfile.halalCertification.status": 1 });
userSchema.index({ "customerProfile.preferences.categories": 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ "socialLogin.googleId": 1 }, { sparse: true });
userSchema.index({ "socialLogin.facebookId": 1 }, { sparse: true });
userSchema.index({ "vendorProfile.businessName": 1 });
userSchema.index({ "vendorProfile.primaryServiceCategory": 1 });
userSchema.index({ "vendorProfile.serviceCategories": 1 });

// Pre-save middleware to handle automatic profile completion logic
userSchema.pre("save", function (next) {
  // --- Customer Profile Completion ---
  if (this.role === "customer" && this.customerProfile) {
    const { fullName, gender, location } = this.customerProfile;
    if (
      fullName &&
      this.phoneNumber &&
      gender &&
      location &&
      location.city &&
      location.state &&
      location.country &&
      location.zipCode
    ) {
      this.customerProfile.profileCompleted = true;
    } else {
      this.customerProfile.profileCompleted = false;
    }
  }

  // --- Vendor Profile Completion & Timezone ---
  if (this.role === "vendor" && this.vendorProfile) {
    // 1. Automatically set timezone if zip code is present
    if (
      this.vendorProfile.businessAddress &&
      this.vendorProfile.businessAddress.zipCode
    ) {
      try {
        console.log('Looking up timezone for zip:', this.vendorProfile.businessAddress.zipCode);
        const zone = findZone.lookup(
          this.vendorProfile.businessAddress.zipCode
        );
        if (zone) {
          this.vendorProfile.timezone = zone;
          console.log('Timezone set to:', zone);
        } else {
          console.log('No timezone found for zip:', this.vendorProfile.businessAddress.zipCode);
        }
      } catch (e) {
        // Ignore errors if zipcode is invalid, timezone will remain null
        console.warn(
          `Could not find timezone for zip: ${this.vendorProfile.businessAddress.zipCode}`
        );
      }
    }

    // 2. Check for profile completion
    const { businessName, ownerName, businessAddress, timezone } =
      this.vendorProfile;
    
    console.log('Vendor profile completion check:', {
      businessName,
      ownerName,
      phoneNumber: this.phoneNumber,
      timezone,
      businessAddress,
      hasAllRequiredFields: !!(
        businessName &&
        ownerName &&
        this.phoneNumber &&
        businessAddress &&
        businessAddress.zipCode
      )
    });
    
    if (
      businessName &&
      ownerName &&
      this.phoneNumber &&
      businessAddress &&
      businessAddress.zipCode
    ) {
      this.vendorProfile.profileCompleted = true;
      console.log('Vendor profile marked as completed');
    } else {
      this.vendorProfile.profileCompleted = false;
      console.log('Vendor profile marked as incomplete');
    }
  }

  next();
});

// Pre-save middleware to clean profiles based on role
userSchema.pre("save", function (next) {
  // Remove unwanted profiles based on role
  if (this.role === "customer") {
    this.vendorProfile = undefined;
  } else if (this.role === "vendor") {
    this.customerProfile = undefined;
  }
  next();
});

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate password reset token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

// Virtual for customer full location
userSchema.virtual("customerFullLocation").get(function () {
  if (this.role !== "customer" || !this.customerProfile.location) return null;
  return `${this.customerProfile.location.city}, ${this.customerProfile.location.state}, ${this.customerProfile.location.country}`;
});

// Virtual for vendor full business address
userSchema.virtual("vendorFullBusinessAddress").get(function () {
  if (this.role !== "vendor" || !this.vendorProfile.businessAddress)
    return null;
  
  const address = this.vendorProfile.businessAddress;
  const addressParts = [
    address.street,
    address.city,
    address.state,
    address.country,
    address.zipCode
  ].filter(part => part && part !== 'undefined' && part.trim() !== '');
  
  return addressParts.join(', ');
});

// Virtual for user display name
userSchema.virtual("displayName").get(function () {
  if (this.role === "customer") {
    return this.customerProfile.fullName;
  } else if (this.role === "vendor") {
    return this.vendorProfile.businessName;
  }
  return this.email;
});

// Use a toJSON transform to customize the output of the user object
userSchema.set("toJSON", {
  virtuals: true, // ensure virtuals like 'id' are included
  transform: (doc, ret) => {
    // 'ret' is the plain object that will be sent as JSON

    // Based on the user's role, remove the profile that is not relevant
    if (ret.role === "customer") {
      delete ret.vendorProfile;
    } else if (ret.role === "vendor") {
      delete ret.customerProfile;
      
      // Clean up undefined address fields in vendor profile
      if (ret.vendorProfile && ret.vendorProfile.businessAddress) {
        const address = ret.vendorProfile.businessAddress;
        if (address.street === undefined || address.street === 'undefined') {
          delete address.street;
        }
        if (address.city === undefined || address.city === 'undefined') {
          delete address.city;
        }
        if (address.state === undefined || address.state === 'undefined') {
          delete address.state;
        }
        if (address.country === undefined || address.country === 'undefined') {
          delete address.country;
        }
      }
    }

    // Also remove the internal version key for a cleaner output
    delete ret.__v;

    return ret;
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;

