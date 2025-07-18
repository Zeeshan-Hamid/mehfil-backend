const User = require('../models/User');
const Event = require('../models/Event');
const mongoose = require('mongoose');

const catchAsync = fn => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
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

    const user = await User.findById(customerId);

    const newBooking = {
        event: eventId,
        package: packageId,
        packageType,
        vendor: event.vendor,
        eventDate,
        attendees,
        totalPrice,
    };

    user.customerProfile.bookedEvents.push(newBooking);

    // Remove the event from the cart if it exists there
    const cartItemIndex = user.customerProfile.customerCart.findIndex(item => 
        item.event.equals(eventId) && 
        item.package.equals(packageId) && 
        item.packageType === packageType
    );
    if (cartItemIndex > -1) {
        user.customerProfile.customerCart.splice(cartItemIndex, 1);
    }

    await user.save();

    res.status(201).json({
        success: true,
        message: 'Event booked successfully.',
        data: {
            booking: newBooking
        }
    });
});

exports.getBookedEvents = catchAsync(async (req, res, next) => {
    const customerId = req.user.id;

    const user = await User.findById(customerId).populate({
        path: 'customerProfile.bookedEvents.event',
        select: 'name imageUrls location packages customPackages vendor',
        populate: {
            path: 'vendor',
            select: 'vendorProfile.businessName'
        }
    });

    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    const bookedEvents = user.customerProfile.bookedEvents.map(booking => {
        if (!booking.event) {
            return {
                ...booking.toObject(),
                event: null,
                package: null,
                error: 'The original event for this booking has been deleted.'
            };
        }
        
        let eventPackage;
        if (booking.packageType === 'regular') {
            eventPackage = booking.event.packages.id(booking.package);
        } else {
            // For custom packages, find the specific custom package
            eventPackage = booking.event.customPackages.find(pkg => pkg._id.toString() === booking.package.toString());
        }
        
        return {
            _id: booking._id,
            event: {
                _id: booking.event._id,
                name: booking.event.name,
                imageUrls: booking.event.imageUrls,
                location: booking.event.location,
                vendor: booking.event.vendor
            },
            package: eventPackage ? eventPackage.toObject() : { name: 'Package not found' },
            packageType: booking.packageType,
            vendor: booking.vendor,
            eventDate: booking.eventDate,
            attendees: booking.attendees,
            totalPrice: booking.totalPrice,
            bookingDate: booking.bookingDate,
            status: booking.status
        }
    });

    res.status(200).json({
        success: true,
        data: {
            bookedEvents
        }
    });
}); 