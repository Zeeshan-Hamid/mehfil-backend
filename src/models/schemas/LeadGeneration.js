const mongoose = require('mongoose');

const leadGenerationSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    source: {
        type: String,
        default: 'promotions_page',
        enum: ['promotions_page', 'landing_page', 'vendor_signup', 'other']
    },
    status: {
        type: String,
        default: 'new',
        enum: ['new', 'contacted', 'converted', 'rejected']
    },
    notes: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt timestamp before saving
leadGenerationSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Create indexes for better query performance
leadGenerationSchema.index({ email: 1 });
leadGenerationSchema.index({ createdAt: -1 });
leadGenerationSchema.index({ status: 1 });

const LeadGeneration = mongoose.model('LeadGeneration', leadGenerationSchema);

module.exports = LeadGeneration;
