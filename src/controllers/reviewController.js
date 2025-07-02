const Event = require('../models/Event');
const User = require('../models/User');

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
  const userId = req.user.id;
  const { rating, comment } = req.body;

  // 1. Check if user is a customer
  if (req.user.role !== 'customer') {
    return res.status(403).json({
      status: 'fail',
      message: 'Only customers can leave reviews.'
    });
  }

  // 2. Find the event
  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  // 3. Check if user has already reviewed this event
  const hasReviewed = event.reviews.some(review => 
    review.user.toString() === userId
  );

  if (hasReviewed) {
    return res.status(400).json({
      status: 'fail',
      message: 'You have already reviewed this event. You can only leave one review per event.'
    });
  }

  // 4. Validate rating
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({
      status: 'fail',
      message: 'Rating is required and must be between 1 and 5.'
    });
  }

  // 5. Add the review
  const newReview = {
    user: userId,
    rating: parseInt(rating),
    comment: comment || '',
    createdAt: Date.now()
  };

  event.reviews.push(newReview);
  await event.save();

  // 6. Get the customer's name for the response
  const user = await User.findById(userId).select('customerProfile.fullName');

  // 7. Return the new review with user details
  const reviewWithUserDetails = {
    ...newReview,
    user: {
      _id: userId,
      fullName: user.customerProfile.fullName
    }
  };

  res.status(201).json({
    status: 'success',
    data: {
      review: reviewWithUserDetails
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

  // 1. Find the event and populate user details for each review
  const event = await Event.findById(eventId)
    .select('reviews averageRating totalReviews')
    .populate({
      path: 'reviews.user',
      select: 'customerProfile.fullName customerProfile.profileImage'
    });

  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  // 2. Sort reviews by date (newest first) and apply pagination
  const sortedReviews = event.reviews.sort((a, b) => b.createdAt - a.createdAt);
  const paginatedReviews = sortedReviews.slice(skip, skip + limit);

  res.status(200).json({
    status: 'success',
    data: {
      reviews: paginatedReviews,
      averageRating: event.averageRating,
      totalReviews: event.totalReviews,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(event.reviews.length / limit),
        totalReviews: event.reviews.length,
        hasNextPage: skip + paginatedReviews.length < event.reviews.length,
        hasPrevPage: page > 1
      }
    }
  });
});

// @desc    Delete a review
// @route   DELETE /api/events/:eventId/reviews/:reviewId
// @access  Private (Review owner or Admin)
exports.deleteReview = catchAsync(async (req, res, next) => {
  const { eventId, reviewId } = req.params;
  const userId = req.user.id;
  
  // 1. Find the event
  const event = await Event.findById(eventId);
  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  // 2. Find the review
  const reviewIndex = event.reviews.findIndex(review => 
    review._id.toString() === reviewId
  );

  if (reviewIndex === -1) {
    return res.status(404).json({
      status: 'fail',
      message: 'No review found with that ID'
    });
  }

  // 3. Check if user is the review owner or admin
  const isReviewOwner = event.reviews[reviewIndex].user.toString() === userId;
  const isAdmin = req.user.role === 'admin';

  if (!isReviewOwner && !isAdmin) {
    return res.status(403).json({
      status: 'fail',
      message: 'You do not have permission to delete this review'
    });
  }

  // 4. Remove the review
  event.reviews.splice(reviewIndex, 1);
  await event.save();

  res.status(200).json({
    status: 'success',
    message: 'Review deleted successfully'
  });
});

module.exports = {
  addReview: exports.addReview,
  getEventReviews: exports.getEventReviews,
  deleteReview: exports.deleteReview
}; 