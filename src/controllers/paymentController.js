const Stripe = require('stripe');
const CheckoutSession = require('../models/CheckoutSession');
const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const EmailService = require('../services/emailService');

function getStripe() {
    const secret = process.env.STRIPE_ACCOUNT_SECRET;
    if (!secret) {
        throw new Error('STRIPE_ACCOUNT_SECRET is not configured');
    }
    return new Stripe(secret);
}

// Create Stripe Checkout session for current cart
exports.createCheckoutSession = async (req, res) => {
	try {
		const userId = req.user.id;
		const user = await User.findById(userId).populate({
			path: 'customerProfile.customerCart.event',
			select: 'name packages customPackages'
		});

		if (!user) {
			return res.status(404).json({ success: false, message: 'User not found' });
		}

		const cart = user.customerProfile.customerCart || [];
		if (!cart.length) {
			return res.status(400).json({ success: false, message: 'Your cart is empty' });
		}

		// Build line items and capture a snapshot
		const currency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
		const lineItems = [];
		const cartSnapshot = [];
		let subtotal = 0;

		for (const item of cart) {
			if (!item.event) continue;
			let pkg;
			if (item.packageType === 'regular') {
				pkg = item.event.packages?.id?.(item.package);
			} else {
				const customPackages = item.event.customPackages || [];
				pkg = customPackages.find(p => p._id.toString() === item.package.toString());
			}

			const unitAmountCents = Math.round((Number(item.totalPrice) || 0) * 100);
			subtotal += Number(item.totalPrice) || 0;

			lineItems.push({
				price_data: {
					currency,
					product_data: {
						name: item.event?.name || 'Event booking',
						description: pkg?.name || 'Package'
					},
					unit_amount: unitAmountCents
				},
				quantity: 1
			});

			// Ensure we capture vendorId from DB
            const eventDoc = await Event.findById(item.event._id).select('vendor name').populate({ path: 'vendor', select: 'vendorProfile.businessName' });
			cartSnapshot.push({
				eventId: item.event._id,
                vendorId: eventDoc?.vendor?._id || eventDoc?.vendor,
                eventName: eventDoc?.name,
                vendorName: eventDoc?.vendor?.vendorProfile?.businessName,
				packageId: item.package,
				packageType: item.packageType,
                packageName: pkg?.name,
				eventDate: item.eventDate,
				attendees: item.attendees,
				totalPrice: item.totalPrice,
				display: { name: item.event?.name, description: pkg?.name }
			});
		}

		if (!lineItems.length) {
			return res.status(400).json({ success: false, message: 'Your cart has invalid items' });
		}

        // No tax line items; totals equal sum of item totals

        const stripe = getStripe();
        const session = await stripe.checkout.sessions.create({
			mode: 'payment',
			payment_method_types: ['card'],
			line_items: lineItems,
			success_url: `${process.env.FRONTEND_URL}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${process.env.FRONTEND_URL}/checkout`,
			metadata: { userId }
		});

		const checkoutSession = await CheckoutSession.create({
			user: userId,
			stripeSessionId: session.id,
			currency,
            totalAmount: subtotal,
			cartItems: cartSnapshot
		});

		return res.status(200).json({ success: true, data: { url: session.url, sessionId: session.id } });
	} catch (error) {
		console.error('Create Checkout Session Error:', error);
		return res.status(500).json({ success: false, message: 'Failed to create checkout session' });
	}
};

// Stripe webhook handler
exports.handleStripeWebhook = async (req, res) => {
    let event;
	try {
		const sig = req.headers['stripe-signature'];
		const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
		if (!webhookSecret) {
			return res.status(500).send('Webhook secret not configured');
		}
		const rawBody = req.body; // bodyParser.raw provides Buffer
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
	} catch (err) {
		console.error('Webhook signature verification failed:', err.message);
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	try {
		switch (event.type) {
			case 'checkout.session.completed': {
				const session = event.data.object;
				await CheckoutSession.findOneAndUpdate({ stripeSessionId: session.id }, { status: 'completed', paymentIntentId: session.payment_intent });

				// Create bookings from snapshot
				const checkout = await CheckoutSession.findOne({ stripeSessionId: session.id });
                if (checkout && checkout.cartItems?.length) {
                    // Preload customer and event for snapshots
                    const customer = await User.findById(checkout.user).select('email phoneNumber customerProfile.fullName customerProfile.location');
                    for (const item of checkout.cartItems) {
                        const eventDoc = await Event.findById(item.eventId).select('name imageUrls location vendor').populate({ path: 'vendor', select: 'vendorProfile.businessName' });
                        const packageSnapshot = {
                            name: item.display?.description || 'Package',
                            description: undefined,
                            price: item.totalPrice,
                            includes: []
                        };
                        await Booking.create({
                            customer: checkout.user,
                            vendor: item.vendorId,
                            event: item.eventId,
                            package: item.packageId,
                            packageType: item.packageType,
                            eventDate: item.eventDate,
                            attendees: item.attendees,
                            totalPrice: item.totalPrice,
                            status: 'Confirmed',
                            payment: {
                                sessionId: session.id,
                                paymentIntentId: session.payment_intent,
                                currency: (process.env.STRIPE_CURRENCY || 'usd').toLowerCase(),
                                amountPaid: Number(item.totalPrice) || 0
                            },
                            customerSnapshot: {
                                fullName: customer?.customerProfile?.fullName,
                                email: customer?.email,
                                phoneNumber: customer?.phoneNumber,
                                location: customer?.customerProfile?.location || {}
                            },
                            eventSnapshot: {
                                name: eventDoc?.name,
                                location: eventDoc?.location,
                                imageUrl: Array.isArray(eventDoc?.imageUrls) && eventDoc.imageUrls.length ? eventDoc.imageUrls[0] : null,
                                vendorBusinessName: eventDoc?.vendor?.vendorProfile?.businessName
                            },
                            packageSnapshot
                        });
                    }

					// Clear the user's cart
					await User.findByIdAndUpdate(checkout.user, { $set: { 'customerProfile.customerCart': [] } });

                    // Send booking confirmation email (best-effort)
                    try {
                        const currency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
                        const subtotal = checkout.cartItems.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
                        const tax = 0;
                        const total = subtotal;
                        await EmailService.sendBookingConfirmationEmail({
                            toEmail: customer?.email,
                            customerName: customer?.customerProfile?.fullName || 'Customer',
                            sessionId: session.id,
                            currency,
                            items: checkout.cartItems,
                            subtotal,
                            tax,
                            total
                        });
                    } catch (emailErr) {
                        console.error('Failed to send booking confirmation email:', emailErr);
                    }
				}
				break;
			}
			case 'checkout.session.expired': {
				const session = event.data.object;
				await CheckoutSession.findOneAndUpdate({ stripeSessionId: session.id }, { status: 'expired' });
				break;
			}
			case 'checkout.session.async_payment_failed':
			case 'checkout.session.failed':
			default:
				break;
		}

		return res.status(200).json({ received: true });
	} catch (error) {
		console.error('Webhook handling error:', error);
		return res.status(500).send('Webhook handling error');
	}
};


