const Booking = require('../models/Booking');
const Event = require('../models/Event');
const Review = require('../models/Review');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get dashboard statistics for a vendor
// @route   GET /api/dashboard/stats
// @access  Private (Vendors only)
exports.getDashboardStats = catchAsync(async (req, res) => {
  const vendorId = req.user.id;

  // Get total bookings count
  const totalBookings = await Booking.countDocuments({ vendor: vendorId });

  // Get total revenue from completed bookings
  const completedBookings = await Booking.find({ 
    vendor: vendorId, 
    status: 'Completed' 
  });

  let totalRevenue = 0;
  completedBookings.forEach(booking => {
    totalRevenue += booking.totalPrice || 0;
  });

  // Calculate average rating from all reviews for this vendor's events
  const vendorEvents = await Event.find({ vendor: vendorId }).select('_id');
  const eventIds = vendorEvents.map(event => event._id);
  const totalListings = vendorEvents.length;

  const reviews = await Review.find({ 
    event: { $in: eventIds } 
  }).select('rating');

  let totalRating = 0;
  let reviewCount = 0;

  reviews.forEach(review => {
    if (review.rating) {
      totalRating += review.rating;
      reviewCount++;
    }
  });

  const averageRating = reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : 0;

  res.status(200).json({
    success: true,
    data: {
      stats: {
        bookings: totalBookings,
        totalRevenue: totalRevenue,
        avgRating: parseFloat(averageRating),
        totalListings: totalListings
      }
    }
  });
});

module.exports = {
  getDashboardStats: exports.getDashboardStats
}; 