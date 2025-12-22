const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Availability must belong to a vendor.'],
        index: true
    },
    month: {
        type: Number,
        required: [true, 'Availability must specify a month.'],
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: [true, 'Availability must specify a year.']
    },
    unavailableDays: {
        type: [Number],
        default: []
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Unique index to prevent duplicate records for the same month/year/vendor
availabilitySchema.index({ vendor: 1, month: 1, year: 1 }, { unique: true });

const Availability = mongoose.model('Availability', availabilitySchema);

module.exports = Availability;
