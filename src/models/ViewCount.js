const mongoose = require('mongoose');

const viewCountSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: false,
      index: true
    },
    viewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true
    },
    userId: {
      type: String, // Store as string since it comes from frontend
      required: false,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      index: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    userAgent: {
      type: String,
      required: true
    },
    referrer: {
      type: String,
      required: false
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true
    },
    viewType: {
      type: String,
      enum: ['profile', 'event', 'listing'],
      default: 'profile',
      required: true
    },
    isUnique: {
      type: Boolean,
      default: true,
      required: true
    },
    geoLocation: {
      country: String,
      city: String,
      coordinates: [Number, Number]
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for better performance
viewCountSchema.index({ vendorId: 1, timestamp: -1 });
viewCountSchema.index({ sessionId: 1, vendorId: 1, timestamp: -1 });
viewCountSchema.index({ ipAddress: 1, vendorId: 1, timestamp: -1 });
viewCountSchema.index({ timestamp: -1 }); // For aggregation queries

// TTL index to automatically delete old records (90 days)
viewCountSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const ViewCount = mongoose.model('ViewCount', viewCountSchema);

module.exports = ViewCount;
