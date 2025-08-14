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
			packageId: { type: mongoose.Schema.Types.ObjectId, required: true },
			packageType: { type: String, enum: ['regular', 'custom'], required: true },
			packageName: { type: String },
			eventDate: { type: Date, required: true },
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


