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
        required: function() {
            // Package is not required for flat price items
            return this.packageType !== 'flatPrice';
        }
    },
    packageType: {
        type: String,
        enum: ['regular', 'custom', 'flatPrice'],
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
    // Stripe payment metadata
    payment: {
        sessionId: { type: String },
        paymentIntentId: { type: String },
        currency: { type: String, default: 'usd' },
        amountPaid: { type: Number, default: 0 }
    },
    // Snapshots for auditing: customer, event (listing), and chosen package at time of booking
    customerSnapshot: {
        fullName: String,
        email: String,
        phoneNumber: String,
        location: {
            city: String,
            state: String,
            country: String,
            zipCode: String
        }
    },
    eventSnapshot: {
        name: String,
        location: Object,
        imageUrl: String,
        vendorBusinessName: String
    },
    packageSnapshot: {
        name: String,
        description: String,
        price: Number,
        includes: [String]
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