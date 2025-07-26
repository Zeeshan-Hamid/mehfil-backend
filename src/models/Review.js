const mongoose = require('mongoose');
const Event = require('./Event');

const reviewSchema = new mongoose.Schema({
    event: {
        type: mongoose.Schema.ObjectId,
        ref: 'Event',
        required: [true, 'Review must belong to an event.']
    },
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Review must have a vendor.']
    },
    customer: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Review must belong to a customer.']
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: [true, 'Please provide a rating between 1 and 5.']
    },
    comment: {
        type: String,
        trim: true,
        maxlength: 500
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

reviewSchema.index({ event: 1, customer: 1 }, { unique: true });

reviewSchema.pre(/^find/, function(next) {
    this.populate({
        path: 'customer',
        select: 'customerProfile.fullName customerProfile.profileImage'
    }).populate({
        path: 'event',
        select: 'name'
    });
    next();
});

reviewSchema.statics.calcAverageRatings = async function(eventId) {
    const stats = await this.aggregate([
        {
            $match: { event: eventId }
        },
        {
            $group: {
                _id: '$event',
                nRating: { $sum: 1 },
                avgRating: { $avg: '$rating' }
            }
        }
    ]);

    if (stats.length > 0) {
        await Event.findByIdAndUpdate(eventId, {
            totalReviews: stats[0].nRating,
            averageRating: stats[0].avgRating.toFixed(1)
        });
    } else {
        await Event.findByIdAndUpdate(eventId, {
            totalReviews: 0,
            averageRating: 0
        });
    }
};

reviewSchema.post('save', function() {
    this.constructor.calcAverageRatings(this.event);
});

reviewSchema.post(/^findOneAnd/, async function(doc) {
    if (doc) {
        await doc.constructor.calcAverageRatings(doc.event);
    }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review; 