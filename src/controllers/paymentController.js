const Stripe = require('stripe');
const CheckoutSession = require('../models/CheckoutSession');
const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const EmailService = require('../services/emailService');
const taxService = require('../services/taxService');

function getStripe() {
    const secret = process.env.STRIPE_ACCOUNT_SECRET;
    if (!secret) {
        throw new Error('STRIPE_ACCOUNT_SECRET is not configured');
    }
    return new Stripe(secret);
}

// Helper function to safely format Stripe metadata (under 500 chars)
function formatStripeMetadata(userId, taxBreakdownData, totalTaxAmount) {
    const metadata = {
        userId: userId.toString(),
        totalTaxAmount: totalTaxAmount.toString()
    };
    
    if (taxBreakdownData && taxBreakdownData.length > 0) {
        // Limit to first 3 items to stay under 500 chars
        const limitedData = taxBreakdownData.slice(0, 3);
        
        // Add states (limit length)
        const states = limitedData.map(t => t.state || 'Unknown').join(',');
        if (states.length <= 50) {
            metadata.taxStates = states;
        }
        
        // Add tax rates (limit length)
        const taxRates = limitedData.map(t => t.taxRate.toString()).join(',');
        if (taxRates.length <= 30) {
            metadata.taxRates = taxRates;
        }
    }
    
    // Ensure total metadata length is under 500 chars
    const totalLength = JSON.stringify(metadata).length;
    
    
    if (totalLength > 450) { // Leave some buffer
        // Remove less essential fields if needed
        delete metadata.taxStates;
        delete metadata.taxRates;
    
    }
    
    return metadata;
}

// Create Stripe Checkout session for current cart
exports.createCheckoutSession = async (req, res) => {
	try {
		const userId = req.user.id;
		const { taxBreakdown, totalTaxAmount } = req.body; // Get tax breakdown from request body
		
		const user = await User.findById(userId).populate({
			path: 'customerProfile.customerCart.event',
			select: 'name packages customPackages location'
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
			let packageName;
			let packageDescription;
			
			if (item.packageType === 'flatPrice') {
				// For flat price items, use flat price data
				pkg = { name: 'Flat Price' };
				packageName = 'Flat Price';
				packageDescription = item.event.flatPrice?.description || 'Standard pricing';
			} else if (item.packageType === 'regular') {
				pkg = item.event.packages?.id?.(item.package);
				packageName = pkg?.name;
				packageDescription = pkg?.name || 'Package';
			} else {
				const customPackages = item.event.customPackages || [];
				pkg = customPackages.find(p => p._id.toString() === item.package.toString());
				packageName = pkg?.name;
				packageDescription = pkg?.name || 'Custom Package';
			}

			const unitAmountCents = Math.round((Number(item.totalPrice) || 0) * 100);
			subtotal += Number(item.totalPrice) || 0;

			lineItems.push({
				price_data: {
					currency,
					product_data: {
						name: item.event?.name || 'Event booking',
						description: packageDescription
					},
					unit_amount: unitAmountCents
				},
				quantity: 1
			});

			// Ensure we capture vendorId from DB
            const eventDoc = await Event.findById(item.event._id).select('vendor name flatPrice').populate({ path: 'vendor', select: 'vendorProfile.businessName' });
			
			const cartItem = {
				eventId: item.event._id,
				vendorId: eventDoc?.vendor?._id || eventDoc?.vendor,
				eventName: eventDoc?.name,
				vendorName: eventDoc?.vendor?.vendorProfile?.businessName,
				packageType: item.packageType,
				eventDate: item.eventDate,
				eventTime: item.eventTime,
				attendees: item.attendees,
				totalPrice: item.totalPrice,
				display: { name: item.event?.name, description: packageDescription }
			};

			// For flat price items, don't set packageId
			if (item.packageType !== 'flatPrice') {
				cartItem.packageId = item.package;
				cartItem.packageName = packageName;
			}

			cartSnapshot.push(cartItem);
		}

		if (!lineItems.length) {
			return res.status(400).json({ success: false, message: 'Your cart has invalid items' });
		}

		// Use tax breakdown from frontend if provided, otherwise calculate from listings
		let taxAmount = 0;
		let totalWithTax = subtotal;
		let taxInfo = { state: null, taxRate: 0 };
		let taxBreakdownData = [];

		if (taxBreakdown && taxBreakdown.length > 0) {
			// Use the tax breakdown provided by frontend
			taxAmount = totalTaxAmount || 0;
			totalWithTax = subtotal + taxAmount;
			taxBreakdownData = taxBreakdown;
			
			// Get the first state for backward compatibility
			if (taxBreakdown.length > 0) {
				taxInfo.state = taxBreakdown[0].state;
				taxInfo.taxRate = taxBreakdown[0].taxRate;
			}
		} else {
			// Fallback: calculate tax from listing zipcodes (for backward compatibility)
			const zipcodeGroups = {};
			
			cart.forEach(item => {
				if (item.event?.location?.zipCode) {
					const zipCode = item.event.location.zipCode;
					if (!zipcodeGroups[zipCode]) {
						zipcodeGroups[zipCode] = {
							items: [],
							subtotal: 0
						};
					}
					zipcodeGroups[zipCode].items.push(item);
					zipcodeGroups[zipCode].subtotal += item.totalPrice;
				}
			});

			// Calculate tax for each zipcode group
			for (const [zipCode, group] of Object.entries(zipcodeGroups)) {
				try {
					const taxResult = taxService.getTaxInfoFromZipCode(zipCode);
					if (!taxResult.error) {
						const itemTaxAmount = taxService.calculateTaxAmount(group.subtotal, taxResult.taxRate);
						taxAmount += itemTaxAmount;
						
						taxBreakdownData.push({
							zipCode,
							state: taxResult.state,
							city: taxResult.city,
							taxRate: taxResult.taxRate,
							subtotal: group.subtotal,
							taxAmount: itemTaxAmount
						});
					}
				} catch (error) {
					console.error(`Error calculating tax for zipcode ${zipCode}:`, error);
				}
			}
			
			totalWithTax = subtotal + taxAmount;
			
			// Get the first state for backward compatibility
			if (taxBreakdownData.length > 0) {
				taxInfo.state = taxBreakdownData[0].state;
				taxInfo.taxRate = taxBreakdownData[0].taxRate;
			}
		}

		// Add tax as a separate line item in Stripe if there's tax
		if (taxAmount > 0) {
			lineItems.push({
				price_data: {
					currency,
					product_data: {
						name: 'Sales Tax',
						description: `Sales tax for multiple locations (${taxBreakdownData.map(t => `${t.state} ${t.taxRate}%`).join(', ')})`
					},
					unit_amount: Math.round(taxAmount * 100)
				},
				quantity: 1
			});
		}

        const stripe = getStripe();
        
        // Format metadata safely - Stripe has a 500 character limit for metadata
        // We only include essential information: userId, totalTaxAmount, and limited tax info
        const metadata = formatStripeMetadata(userId, taxBreakdownData, totalTaxAmount);
        
        // Validate metadata length before creating session
        const metadataLength = JSON.stringify(metadata).length;
        if (metadataLength > 500) {
            console.error(`Metadata still too long: ${metadataLength} chars. Stripping to essential fields only.`);
            metadata.taxStates = undefined;
            metadata.taxRates = undefined;
        }
        
        const session = await stripe.checkout.sessions.create({
			mode: 'payment',
			payment_method_types: ['card'],
			line_items: lineItems,
			success_url: `${process.env.FRONTEND_URL}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${process.env.FRONTEND_URL}/checkout`,
			metadata
		});

		const checkoutSession = await CheckoutSession.create({
			user: userId,
			stripeSessionId: session.id,
			currency,
            totalAmount: totalWithTax,
			subtotal: subtotal,
			taxAmount: taxAmount,
			taxRate: taxInfo.taxRate,
			state: taxInfo.state,
			zipCode: '', // No single zipcode anymore
			cartItems: cartSnapshot,
			taxBreakdown: taxBreakdownData
		});

		return res.status(200).json({ 
			success: true, 
			data: { 
				url: session.url, 
				sessionId: session.id,
				taxInfo: {
					states: taxBreakdownData.map(t => t.state),
					taxRates: taxBreakdownData.map(t => t.taxRate),
					taxAmount,
					total: totalWithTax,
					breakdown: taxBreakdownData
				},
				metadata: formatStripeMetadata(userId, taxBreakdownData, totalTaxAmount)
			} 
		});
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
                            eventTime: item.eventTime,
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
                        const subtotal = checkout.subtotal || checkout.cartItems.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
                        const tax = checkout.taxAmount || 0;
                        const total = checkout.totalAmount || subtotal + tax;
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


