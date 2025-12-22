const Availability = require('../models/Availability');
const Booking = require('../models/Booking');

// Async error handling wrapper
const catchAsync = fn => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

/**
 * Get vendor availability for a specific month and year
 * @route GET /api/vendor/availability/:year/:month
 */
exports.getAvailability = catchAsync(async (req, res, next) => {
    const { year, month } = req.params;
    const vendorId = req.user.id;

    const parsedYear = parseInt(year);
    const parsedMonth = parseInt(month);

    // 1. Fetch manual availability
    const availability = await Availability.findOne({
        vendor: vendorId,
        year: parsedYear,
        month: parsedMonth
    });

    // 2. Fetch bookings for this vendor in this month/year
    // We define the month range
    const startDate = new Date(parsedYear, parsedMonth - 1, 1);
    const endDate = new Date(parsedYear, parsedMonth, 0, 23, 59, 59);

    const bookings = await Booking.find({
        vendor: vendorId,
        eventDate: {
            $gte: startDate,
            $lte: endDate
        },
        status: { $in: ['Confirmed', 'Pending'] }
    });

    // Extract day numbers from bookings
    const bookedDays = bookings.map(b => new Date(b.eventDate).getDate());
    // Remove duplicates
    const uniqueBookedDays = [...new Set(bookedDays)];

    res.status(200).json({
        success: true,
        data: {
            vendor: vendorId,
            year: parsedYear,
            month: parsedMonth,
            unavailableDays: availability?.unavailableDays || [],
            bookedDays: uniqueBookedDays,
            updatedAt: availability?.updatedAt || null
        }
    });
});

/**
 * Update vendor availability
 * @route POST /api/vendor/availability
 */
exports.updateAvailability = catchAsync(async (req, res, next) => {
    const { year, month, unavailableDays } = req.body;
    const vendorId = req.user.id;

    if (!year || !month) {
        return res.status(400).json({
            success: false,
            message: 'Please provide year and month'
        });
    }

    // Upsert the availability record
    const availability = await Availability.findOneAndUpdate(
        {
            vendor: vendorId,
            year: parseInt(year),
            month: parseInt(month)
        },
        {
            unavailableDays: unavailableDays || [],
            updatedAt: Date.now()
        },
        {
            new: true,
            upsert: true,
            runValidators: true
        }
    );

    res.status(200).json({
        success: true,
        data: availability
    });
});
