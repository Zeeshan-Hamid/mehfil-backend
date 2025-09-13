const mongoose = require('mongoose');

const checkoutSessionSchema = new mongoose.Schema({
	user: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	stripeSessionId: {
		type: String,
		index: true
	},
	status: {
		type: String,
		enum: ['pending', 'completed', 'failed', 'expired'],
		default: 'pending'
	},
	currency: {
		type: String,
		default: 'usd'
	},
	totalAmount: {
		type: Number,
		default: 0
	},
	subtotal: {
		type: Number,
		default: 0
	},
	taxAmount: {
		type: Number,
		default: 0
	},
	taxRate: {
		type: Number,
		default: 0
	},
	state: {
		type: String,
		default: null
	},
	zipCode: {
		type: String,
		default: null
	},
	// Tax breakdown for multiple locations
	taxBreakdown: [
		{
			zipCode: { type: String, required: true },
			state: { type: String },
			city: { type: String },
			taxRate: { type: Number, required: true },
			subtotal: { type: Number, required: true },
			taxAmount: { type: Number, required: true }
		}
	],
	paymentIntentId: {
		type: String
	},
	// Snapshot of cart at the time of creating the Checkout Session
	cartItems: [
		{
			eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
			vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
			eventName: { type: String },
			vendorName: { type: String },
			packageId: { 
				type: mongoose.Schema.Types.ObjectId, 
				required: function() {
					// Package ID is not required for flat price items
					return this.packageType !== 'flatPrice';
				}
			},
			packageType: { type: String, enum: ['regular', 'custom', 'flatPrice'], required: true },
			packageName: { type: String },
			eventDate: { type: Date, required: true },
			eventTime: { 
				type: String, 
				required: true,
				validate: {
					validator: function(v) {
						// Validate time format (HH:MM AM/PM)
						return /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(v);
					},
					message: 'Event time must be in HH:MM AM/PM format (US timezone)'
				}
			},
			attendees: { type: Number, required: true },
			totalPrice: { type: Number, required: true },
			display: {
				name: String,
				description: String
			}
		}
	],
	createdAt: {
		type: Date,
		default: Date.now
	}
});

const CheckoutSession = mongoose.model('CheckoutSession', checkoutSessionSchema);

module.exports = CheckoutSession;


