const Booking = require('../models/Booking');
const User = require('../models/User');
const Event = require('../models/Event');
const mongoose = require('mongoose');

const catchAsync = fn => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// Helper function to populate package details for a booking
const populatePackageDetails = async (booking) => {
    // The 'event' field is partially populated by a pre-find hook.
    // We need to fetch the full event to get package details.
    const event = await Event.findById(booking.event._id).select('packages customPackages');
    if (!event) {
        return { ...booking.toObject(), package: null, error: 'The original event for this booking has been deleted.' };
    }

    let eventPackage;
    if (booking.packageType === 'regular') {
        eventPackage = event.packages.id(booking.package);
    } else {
        eventPackage = event.customPackages.id(booking.package);
    }

    return {
        ...booking.toObject(),
        package: eventPackage ? eventPackage.toObject() : { name: 'Package not found' }
    };
};


exports.bookEvent = catchAsync(async (req, res, next) => {
    const { eventId, packageId, packageType, eventDate, attendees, totalPrice } = req.body;
    const customerId = req.user.id;

    if (!eventId || !packageId || !packageType || !eventDate || !attendees || totalPrice === undefined) {
        return res.status(400).json({ success: false, message: 'Please provide eventId, packageId, packageType, eventDate, attendees, and totalPrice.' });
    }

    if (!['regular', 'custom'].includes(packageType)) {
        return res.status(400).json({ success: false, message: 'packageType must be either "regular" or "custom".' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
        return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    let eventPackage;
    
    if (packageType === 'regular') {
        eventPackage = event.packages.id(packageId);
        if (!eventPackage) {
            return res.status(404).json({ success: false, message: 'Package not found for this event.' });
        }
    } else {
        // For custom packages, check if it exists and is created for this customer
        eventPackage = event.customPackages.find(pkg => 
            pkg._id.toString() === packageId && 
            pkg.createdFor.toString() === customerId &&
            pkg.isActive
        );
        if (!eventPackage) {
            return res.status(404).json({ success: false, message: 'Custom package not found or not available for you.' });
        }
    }

    // Create a new booking document
    const newBooking = await Booking.create({
        customer: customerId,
        vendor: event.vendor,
        event: eventId,
        package: packageId,
        packageType,
        eventDate,
        attendees,
        totalPrice
    });

    // Remove the event from the cart if it exists there
    try {
        await User.findOneAndUpdate(
            { _id: customerId },
            { 
                $pull: { 
                    'customerProfile.customerCart': { 
                        event: eventId, 
                        package: packageId, 
                        packageType: packageType 
                    } 
                } 
            }
        );
    } catch (cartError) {
        // Log the error but don't fail the booking creation
        console.error('Error removing item from cart:', cartError);
        // Continue with booking creation even if cart removal fails
    }

    res.status(201).json({
        success: true,
        message: 'Event booked successfully.',
        data: {
            booking: newBooking
        }
    });
});

exports.getCustomerBookings = catchAsync(async (req, res, next) => {
    const customerId = req.user.id;

    const bookings = await Booking.find({ customer: customerId });

    const populatedBookings = await Promise.all(bookings.map(populatePackageDetails));

    res.status(200).json({
        success: true,
        results: populatedBookings.length,
        data: {
            bookings: populatedBookings
        }
    });
});

exports.getVendorBookings = catchAsync(async (req, res, next) => {
    const vendorId = req.user.id;

    const bookings = await Booking.find({ vendor: vendorId });

    const populatedBookings = await Promise.all(bookings.map(populatePackageDetails));

    res.status(200).json({
        success: true,
        results: populatedBookings.length,
        data: {
            bookings: populatedBookings
        }
    });
});

exports.getBookingDetails = catchAsync(async (req, res, next) => {
    const booking = await Booking.findById(req.params.id)
        .populate({
            path: 'vendor',
            select: 'vendorProfile.businessName vendorProfile.ownerName email phoneNumber'
        });

    if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Authorization check
    const isCustomer = booking.customer._id.equals(req.user.id);
    const isVendor = booking.vendor._id.equals(req.user.id);

    if (!isCustomer && !isVendor && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'You do not have permission to view this booking.' });
    }

    const populatedBooking = await populatePackageDetails(booking);

    res.status(200).json({
        success: true,
        data: {
            booking: populatedBooking
        }
    });
});

exports.updateBookingStatus = catchAsync(async (req, res, next) => {
    const { status } = req.body;
    const { id } = req.params;

    // 1. Validate status
    const allowedStatuses = ['Pending', 'Confirmed', 'Cancelled', 'Completed'];
    if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            message: `Invalid status. Status must be one of: ${allowedStatuses.join(', ')}.` 
        });
    }

    // 2. Find the booking
    const booking = await Booking.findById(id);

    if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // 3. Authorization: Ensure the logged-in user is the vendor for this booking
    if (!booking.vendor._id.equals(req.user.id)) {
        return res.status(403).json({ success: false, message: 'You do not have permission to update this booking.' });
    }
    
    // 4. Update and save
    booking.status = status;
    await booking.save();

    // 5. Send response with the updated booking
    const populatedBooking = await populatePackageDetails(booking);

    res.status(200).json({
        success: true,
        message: `Booking status successfully updated to ${status}.`,
        data: {
            booking: populatedBooking
        }
    });
});

// @desc    Get booked vendors for a customer
// @route   GET /api/bookings/booked-vendors
// @access  Private (Customer only)
exports.getBookedVendors = catchAsync(async (req, res, next) => {
    const customerId = req.user.id;

    // Check if user is a customer
    if (req.user.role !== 'customer') {
        return res.status(403).json({
            success: false,
            message: 'Only customers can access booked vendors'
        });
    }

    // Get all bookings for the customer with vendor details
    // Use lean() to avoid the pre-find hook and manually populate
    const bookings = await Booking.find({ 
        customer: customerId,
        status: { $in: ['Pending', 'Confirmed'] } // Only active bookings
    }).lean();
    
    // Manually populate vendor and event details
    const populatedBookings = await Promise.all(
        bookings.map(async (booking) => {
            try {
                const [vendor, event] = await Promise.all([
                    User.findById(booking.vendor).select('vendorProfile.businessName vendorProfile.ownerName vendorProfile.description vendorProfile.rating vendorProfile.reviewCount email phoneNumber role'),
                    Event.findById(booking.event).select('name imageUrls location')
                ]);
                
                return {
                    ...booking,
                    vendor: vendor,
                    event: event
                };
            } catch (error) {
                console.error('Error populating booking details:', error);
                return booking;
            }
        })
    );

    // Group vendors by vendor ID to avoid duplicates
    const vendorMap = new Map();
    
    populatedBookings.forEach(booking => {
        // Skip bookings with null or undefined vendor
        if (!booking.vendor || !booking.vendor._id) {
            console.warn('Skipping booking with null/undefined vendor:', booking._id);
            return;
        }
        
        // Skip if vendor is not actually a vendor
        if (booking.vendor.role !== 'vendor') {
            console.warn('Skipping booking with non-vendor user:', booking._id);
            return;
        }
        
        const vendorId = booking.vendor._id.toString();
        
        if (!vendorMap.has(vendorId)) {
            vendorMap.set(vendorId, {
                _id: booking.vendor._id,
                businessName: booking.vendor.vendorProfile?.businessName || 'Unknown Business',
                ownerName: booking.vendor.vendorProfile?.ownerName || 'Unknown Owner',
                description: booking.vendor.vendorProfile?.description || 'No description available',
                rating: booking.vendor.vendorProfile?.rating || 0,
                reviewCount: booking.vendor.vendorProfile?.reviewCount || 0,
                email: booking.vendor.email,
                phoneNumber: booking.vendor.phoneNumber,
                bookings: []
            });
        }
        
        // Add booking info to vendor
        vendorMap.get(vendorId).bookings.push({
            _id: booking._id,
            eventName: booking.event?.name || 'Unknown Event',
            eventDate: booking.eventDate,
            status: booking.status,
            totalPrice: booking.totalPrice,
            attendees: booking.attendees
        });
    });

    const bookedVendors = Array.from(vendorMap.values());

    res.status(200).json({
        success: true,
        results: bookedVendors.length,
        data: {
            bookedVendors
        }
    });
}); 