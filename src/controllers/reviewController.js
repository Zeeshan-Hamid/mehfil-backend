const Review = require('../models/Review');
const Event = require('../models/Event');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Add a review to an event
// @route   POST /api/events/:eventId/reviews
// @access  Private (Customers only)
exports.addReview = catchAsync(async (req, res, next) => {
  const { eventId } = req.params;
  const customerId = req.user.id;
  const { rating, comment } = req.body;

  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  // Check if the customer has already reviewed this event
  const existingReview = await Review.findOne({ event: eventId, customer: customerId });

  if (existingReview) {
    return res.status(400).json({
      status: 'fail',
      message: 'You have already submitted a review for this event.'
    });
  }

  const newReview = await Review.create({
    event: eventId,
    vendor: event.vendor,
    customer: customerId,
    rating,
    comment
  });

  // Populate the review with customer details
  const populatedReview = await Review.findById(newReview._id)
    .populate({
      path: 'customer',
      select: 'customerProfile.fullName customerProfile.profileImage'
    })
    .populate({
      path: 'event',
      select: 'name'
    });

  res.status(201).json({
    status: 'success',
    data: {
      review: populatedReview
    }
  });
});

// @desc    Get all reviews for an event
// @route   GET /api/events/:eventId/reviews
// @access  Public
exports.getEventReviews = catchAsync(async (req, res, next) => {
  const { eventId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const reviews = await Review.find({ event: eventId })
    .populate({
      path: 'customer',
      select: 'customerProfile.fullName customerProfile.profileImage'
    })
    .populate({
      path: 'event',
      select: 'name'
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalReviews = await Review.countDocuments({ event: eventId });

  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: {
      reviews,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalReviews / limit),
        totalReviews,
      }
    }
  });
});

// @desc    Delete a review
// @route   DELETE /api/events/:eventId/reviews/:reviewId
// @access  Private (Review owner or Admin)
exports.deleteReview = catchAsync(async (req, res, next) => {
  const { reviewId } = req.params;
  const userId = req.user.id;

  const review = await Review.findById(reviewId);

  if (!review) {
    return res.status(404).json({
      status: 'fail',
      message: 'No review found with that ID'
    });
  }

  const isReviewOwner = review.customer.toString() === userId;
  const isAdmin = req.user.role === 'admin';

  if (!isReviewOwner && !isAdmin) {
    return res.status(403).json({
      status: 'fail',
      message: 'You do not have permission to delete this review'
    });
  }

  await Review.findByIdAndDelete(reviewId);

  res.status(204).json({
    status: 'success',
    data: null
  });
});

exports.getVendorReviews = catchAsync(async (req, res, next) => {
    const vendorId = req.user.id;
    const { rating, sort } = req.query;

    let query = Review.find({ vendor: vendorId });

    if (rating) {
        query = query.find({ rating: parseInt(rating) });
    }

    if (sort) {
        const sortBy = sort.split(',').join(' ');
        query = query.sort(sortBy);
    } else {
        query = query.sort('-createdAt');
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    query = query.skip(skip).limit(limit);

    const reviews = await query;

    const totalReviews = await Review.countDocuments({ vendor: vendorId });

    res.status(200).json({
        success: true,
        results: reviews.length,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalReviews / limit),
            totalReviews
        },
        data: {
            reviews
        }
    });
});

module.exports = {
  addReview: exports.addReview,
  getEventReviews: exports.getEventReviews,
  deleteReview: exports.deleteReview,
  getVendorReviews: exports.getVendorReviews
}; 