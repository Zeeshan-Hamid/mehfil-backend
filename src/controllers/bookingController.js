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
    } else if (booking.packageType === 'custom') {
        eventPackage = event.customPackages.id(booking.package);
    } else if (booking.packageType === 'flatPrice') {
        // For flat price bookings, return a special package object
        eventPackage = { name: 'Flat Price' };
    }

    return {
        ...booking.toObject(),
        package: eventPackage ? (eventPackage.toObject ? eventPackage.toObject() : eventPackage) : { name: 'Package not found' }
    };
};


exports.bookEvent = catchAsync(async (req, res, next) => {
    const { eventId, packageId, packageType, eventDate, eventTime, attendees, totalPrice } = req.body;
    const customerId = req.user.id;

    if (!eventId || !packageType || !eventDate || !eventTime || !attendees || totalPrice === undefined) {
        return res.status(400).json({ success: false, message: 'Please provide eventId, packageType, eventDate, eventTime, attendees, and totalPrice.' });
    }

    // For flat price items, packageId is not required
    if (packageType !== 'flatPrice' && !packageId) {
        return res.status(400).json({ success: false, message: 'packageId is required for regular and custom packages.' });
    }

    if (!['regular', 'custom', 'flatPrice'].includes(packageType)) {
        return res.status(400).json({ success: false, message: 'packageType must be either "regular", "custom", or "flatPrice".' });
    }

    // Handle both ObjectId and slug for event lookup
    let event = null;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
    
    if (isValidObjectId) {
        // If it's a valid ObjectId, search by ID
        event = await Event.findById(eventId);
    } else {
        // If it's not a valid ObjectId, treat it as a slug
        event = await Event.findOne({ slug: eventId });
    }

    if (!event) {
        return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    let eventPackage;
    
    if (packageType === 'flatPrice') {
        // For flat price, check if the event has an active flat price
        if (!event.flatPrice || !event.flatPrice.isActive) {
            return res.status(400).json({ success: false, message: 'This event does not have an active flat price.' });
        }
        eventPackage = { name: 'Flat Price', price: event.flatPrice.amount };
    } else if (packageType === 'regular') {
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
    const bookingData = {
        customer: customerId,
        vendor: event.vendor,
        event: event._id, // Use the actual ObjectId from the found event
        packageType,
        eventDate,
        eventTime,
        attendees,
        totalPrice
    };

    // For flat price items, don't set package field
    if (packageType !== 'flatPrice') {
        bookingData.package = packageId;
    }

    const newBooking = await Booking.create(bookingData);

    // Remove the event from the cart if it exists there
    try {
        let cartPullQuery;
        if (packageType === 'flatPrice') {
            // For flat price items, only match event and packageType
            cartPullQuery = { 
                event: eventId, 
                packageType: packageType 
            };
        } else {
            // For regular and custom packages, match event, package, and packageType
            cartPullQuery = { 
                event: eventId, 
                package: packageId, 
                packageType: packageType 
            };
        }

        await User.findOneAndUpdate(
            { _id: customerId },
            { 
                $pull: { 
                    'customerProfile.customerCart': cartPullQuery
                } 
            }
        );
    } catch (cartError) {
        // Log the error but don't fail the booking creation
        // Error removing item from cart
        // Continue with booking creation even if cart removal fails
    }

    // Fetch the booking with all populated data (this triggers the pre-find hook)
    const fetchedBooking = await Booking.findById(newBooking._id);
    
    // Populate the booking for response with package details
    const populatedBooking = await populatePackageDetails(fetchedBooking);

    res.status(201).json({
        success: true,
        message: 'Event booked successfully.',
        data: {
            booking: populatedBooking
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
                // Error populating booking details
                return booking;
            }
        })
    );

    // Group vendors by vendor ID to avoid duplicates
    const vendorMap = new Map();
    
    populatedBookings.forEach(booking => {
        // Skip bookings with null or undefined vendor
        if (!booking.vendor || !booking.vendor._id) {
            // Skipping booking with null/undefined vendor
            return;
        }
        
        // Skip if vendor is not actually a vendor
        if (booking.vendor.role !== 'vendor') {
            // Skipping booking with non-vendor user
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

// @desc    Create a booking as a vendor for manual bookings
// @route   POST /api/bookings/vendor-create
// @access  Private (Vendor only)
exports.createVendorBooking = catchAsync(async (req, res, next) => {
    const { customerName, customerEmail, eventId, customListing, packageName, eventDate, eventTime, attendees, totalPrice, status } = req.body;
    let { packageType } = req.body;
    const vendorId = req.user.id;

    // Validation - either eventId or customListing must be provided
    if (!customerName || !customerEmail || (!eventId && !customListing) || !packageName || !packageType || !eventDate || !eventTime || !attendees || totalPrice === undefined) {
        return res.status(400).json({ 
            success: false, 
            message: 'Please provide customerName, customerEmail, either eventId or customListing, packageName, packageType, eventDate, eventTime, attendees, and totalPrice.' 
        });
    }

    // If customListing is provided, validate its structure
    if (customListing && (!customListing.name || !customListing.location)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Custom listing must include name and location.' 
        });
    }

    if (!['regular', 'custom', 'flatPrice'].includes(packageType)) {
        return res.status(400).json({ success: false, message: 'packageType must be either "regular", "custom", or "flatPrice".' });
    }

    // Handle event - either find existing or create new one
    let event = null;
    
    if (customListing) {
        // Check if an event with the same name already exists for this vendor
        let eventName = customListing.name;
        let counter = 1;
        
        while (await Event.findOne({ 
            vendor: vendorId, 
            name: eventName, 
            category: 'Other' 
        })) {
            eventName = `${customListing.name} (${counter})`;
            counter++;
        }
        
        // Create a new event for the custom listing
        const newEventData = {
            vendor: vendorId,
            name: eventName,
            category: 'Other', // Default category for custom listings
            description: `Custom listing created for ${customerName}`,
            imageUrls: ['/food.jpg'], // Use default food image for custom listings
            services: ['Custom Service'], // Default service
            packages: [], // Will be populated below if needed
            location: {
                address: customListing.location,
                city: 'Unknown', // Default values since we only have location string
                state: 'Unknown',
                zipCode: '00000',
                country: 'United States'
            }
        };

        // Create the new event
        event = await Event.create(newEventData);
    } else {
        // Verify the event belongs to the vendor
        // Handle both ObjectId and slug for event lookup
        const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
        
        if (isValidObjectId) {
            // If it's a valid ObjectId, search by ID
            event = await Event.findById(eventId);
        } else {
            // If it's not a valid ObjectId, treat it as a slug
            event = await Event.findOne({ slug: eventId });
        }

        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found.' });
        }

        if (!event.vendor.equals(vendorId)) {
            return res.status(403).json({ success: false, message: 'You can only create bookings for your own events.' });
        }
    }

    // Find or create customer
    let customer = await User.findOne({ email: customerEmail });
    if (!customer) {
        // Create a basic customer account for vendor-created bookings
        // Use 'vendor-created' authProvider to bypass normal validation requirements
        customer = await User.create({
            email: customerEmail,
            password: 'VendorCreated123!', // Temporary password (meets minimum requirements)
            role: 'customer',
            authProvider: 'vendor-created', // Custom auth provider to bypass email validation requirements
            emailVerified: false,
            customerProfile: {
                fullName: customerName,
                profileCompleted: false
            }
        });
    }

    // Find the package
    let eventPackage;
    let packageId;

    // For custom listings, force packageType to be 'custom'
    if (customListing && packageType !== 'flatPrice') {
        packageType = 'custom';
    }

    if (packageType === 'flatPrice') {
        // For flat price, check if the event has an active flat price
        if (!event.flatPrice || !event.flatPrice.isActive) {
            return res.status(400).json({ success: false, message: 'This event does not have an active flat price.' });
        }
        eventPackage = { name: 'Flat Price', price: event.flatPrice.amount };
        packageId = null; // No package ID for flat price
    } else if (packageType === 'regular') {
        eventPackage = event.packages.find(pkg => pkg.name === packageName);
        if (!eventPackage) {
            return res.status(404).json({ success: false, message: 'Package not found for this event.' });
        }
        packageId = eventPackage._id;
    } else {
        // For custom packages, create a new one or find existing
        eventPackage = event.customPackages.find(pkg => pkg.name === packageName);
        if (!eventPackage) {
            // Create a new custom package
            const newCustomPackage = {
                name: packageName,
                price: totalPrice,
                description: `Custom package for ${customerName}`,
                includes: ['Custom package services'], // Required field - at least one inclusion
                createdFor: customer._id,
                createdBy: vendorId, // Required field - the vendor creating this package
                isActive: true
            };
            event.customPackages.push(newCustomPackage);
            await event.save();
            packageId = event.customPackages[event.customPackages.length - 1]._id;
        } else {
            packageId = eventPackage._id;
        }
    }

    // Convert 24-hour time format to 12-hour AM/PM format
    const convertTo12HourFormat = (time24) => {
        if (!time24) return time24;
        
        // If already in 12-hour format, return as is
        if (/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(time24)) {
            return time24;
        }
        
        // Convert from 24-hour format (HH:MM) to 12-hour format (HH:MM AM/PM)
        const [hours, minutes] = time24.split(':');
        const hour24 = parseInt(hours, 10);
        
        if (hour24 === 0) {
            return `12:${minutes} AM`;
        } else if (hour24 < 12) {
            return `${hour24}:${minutes} AM`;
        } else if (hour24 === 12) {
            return `12:${minutes} PM`;
        } else {
            return `${hour24 - 12}:${minutes} PM`;
        }
    };

    // Create the booking
    const bookingData = {
        customer: customer._id,
        vendor: vendorId,
        event: event._id, // Use the actual ObjectId from the found event
        packageType,
        eventDate,
        eventTime: convertTo12HourFormat(eventTime),
        attendees,
        totalPrice,
        status: status || 'Pending'
    };

    // For flat price items, don't set package field
    if (packageType !== 'flatPrice') {
        bookingData.package = packageId;
    }

    const newBooking = await Booking.create(bookingData);

    // Fetch the booking with all populated data (this triggers the pre-find hook)
    const fetchedBooking = await Booking.findById(newBooking._id);
    
    // Populate the booking for response with package details
    const populatedBooking = await populatePackageDetails(fetchedBooking);

    res.status(201).json({
        success: true,
        message: 'Booking created successfully.',
        data: {
            booking: populatedBooking
        }
    });
});

// @desc    Update a booking as a vendor
// @route   PATCH /api/bookings/vendor-update/:id
// @access  Private (Vendor only)
exports.updateVendorBooking = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { customerName, customerEmail, eventDate, eventTime, attendees, totalPrice, status } = req.body;
    const vendorId = req.user.id;

    // Find the booking
    const booking = await Booking.findById(id);
    if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Verify the booking belongs to the vendor
    if (!booking.vendor.equals(vendorId)) {
        return res.status(403).json({ success: false, message: 'You can only update your own bookings.' });
    }

    // Update customer info if provided
    if (customerName || customerEmail) {
        const customer = await User.findById(booking.customer);
        if (customer) {
            if (customerName) customer.customerProfile.fullName = customerName;
            if (customerEmail) customer.email = customerEmail;
            await customer.save();
        }
    }

    // Convert 24-hour time format to 12-hour AM/PM format
    const convertTo12HourFormat = (time24) => {
        if (!time24) return time24;
        
        // If already in 12-hour format, return as is
        if (/^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i.test(time24)) {
            return time24;
        }
        
        // Convert from 24-hour format (HH:MM) to 12-hour format (HH:MM AM/PM)
        const [hours, minutes] = time24.split(':');
        const hour24 = parseInt(hours, 10);
        
        if (hour24 === 0) {
            return `12:${minutes} AM`;
        } else if (hour24 < 12) {
            return `${hour24}:${minutes} AM`;
        } else if (hour24 === 12) {
            return `12:${minutes} PM`;
        } else {
            return `${hour24 - 12}:${minutes} PM`;
        }
    };

    // Update booking fields
    if (eventDate) booking.eventDate = eventDate;
    if (eventTime) booking.eventTime = convertTo12HourFormat(eventTime);
    if (attendees) booking.attendees = attendees;
    if (totalPrice !== undefined) booking.totalPrice = totalPrice;
    if (status) booking.status = status;

    await booking.save();

    // Refetch the booking to ensure all data is populated after updates
    const updatedBooking = await Booking.findById(booking._id);
    
    // Populate the booking for response
    const populatedBooking = await populatePackageDetails(updatedBooking);

    res.status(200).json({
        success: true,
        message: 'Booking updated successfully.',
        data: {
            booking: populatedBooking
        }
    });
});

// @desc    Delete a booking as a vendor
// @route   DELETE /api/bookings/vendor-delete/:id
// @access  Private (Vendor only)
exports.deleteVendorBooking = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const vendorId = req.user.id;

    // Find the booking
    const booking = await Booking.findById(id);
    if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Verify the booking belongs to the vendor
    if (!booking.vendor.equals(vendorId)) {
        return res.status(403).json({ success: false, message: 'You can only delete your own bookings.' });
    }

    await Booking.findByIdAndDelete(id);

    res.status(200).json({
        success: true,
        message: 'Booking deleted successfully.'
    });
});