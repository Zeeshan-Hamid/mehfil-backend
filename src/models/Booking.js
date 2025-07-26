const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Booking must belong to a customer.']
    },
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Booking must be for a vendor.']
    },
    event: {
        type: mongoose.Schema.ObjectId,
        ref: 'Event',
        required: [true, 'Booking must be for an event.']
    },
    package: {
        type: mongoose.Schema.ObjectId,
        required: [true, 'Booking must include a package.']
    },
    packageType: {
        type: String,
        enum: ['regular', 'custom'],
        required: true
    },
    eventDate: {
        type: Date,
        required: [true, 'Please provide an event date.']
    },
    attendees: {
        type: Number,
        required: [true, 'Please specify the number of attendees.']
    },
    totalPrice: {
        type: Number,
        required: [true, 'Booking must have a total price.']
    },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Cancelled', 'Completed'],
        default: 'Pending'
    },
    bookingDate: {
        type: Date,
        default: Date.now
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Populate customer and vendor details when finding a booking
bookingSchema.pre(/^find/, function(next) {
    this.populate({
        path: 'customer',
        select: 'customerProfile.fullName customerProfile.profileImage email phoneNumber'
    }).populate({
        path: 'vendor',
        select: 'vendorProfile.businessName vendorProfile.ownerName email phoneNumber'
    }).populate({
        path: 'event',
        select: 'name imageUrls location'
    });
    next();
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking; 