const mongoose = require('mongoose');

const eventDataSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    }
}, {
    timestamps: true,
    collection: 'event_data'
});

// Ensure email is indexed for faster lookups if needed later
eventDataSchema.index({ email: 1 });

module.exports = mongoose.model('EventData', eventDataSchema);
