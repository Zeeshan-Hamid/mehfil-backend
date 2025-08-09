const Review = require('../models/Review');
const Event = require('../models/Event');
const OpenAI = require('openai');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Lazy/singleton OpenAI client initializer (avoids repeated construction)
let cachedOpenAI = null;
const getOpenAIClient = () => {
  if (!cachedOpenAI) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    cachedOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedOpenAI;
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
  console.log('Delete review debug:', {
    reviewId,
    userId,
    userId_id: req.user._id.toString(),
    userRole: req.user.role,
    userEmail: req.user.email
  });

  const review = await Review.findById(reviewId);

  if (!review) {
    return res.status(404).json({
      status: 'fail',
      message: 'No review found with that ID'
    });
  }

  // Handle both populated and unpopulated customer field
  const reviewCustomerId = review.customer._id ? review.customer._id.toString() : review.customer.toString();
  
  console.log('Review found:', {
    reviewCustomerId,
    reviewCustomerIdType: typeof reviewCustomerId,
    userIdType: typeof userId,
    userIdValue: userId,
    isEqual: reviewCustomerId === userId
  });

  // Convert both IDs to strings for comparison
  const isReviewOwner = reviewCustomerId === userId.toString();
  const isAdmin = req.user.role === 'admin';

  console.log('Permission check:', {
    isReviewOwner,
    isAdmin,
    willAllow: isReviewOwner || isAdmin
  });

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

// @desc    Get AI-generated summary of the most recent reviews for an event (listing)
// @route   GET /api/events/:eventId/reviews/summary
// @access  Public
exports.getEventReviewSummary = catchAsync(async (req, res) => {
  const { eventId } = req.params;

  // Ensure the event exists
  const event = await Event.findById(eventId).select('_id name');
  if (!event) {
    return res.status(404).json({
      status: 'fail',
      message: 'No event found with that ID'
    });
  }

  // Get the 30 most recent reviews
  const recentReviews = await Review.find({ event: eventId })
    .select('rating comment createdAt')
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  if (!recentReviews || recentReviews.length === 0) {
    return res.status(200).json({
      status: 'success',
      data: { summary: null, totalReviewsConsidered: 0 }
    });
  }

  // Build a compact text of reviews for the prompt
  const reviewsText = recentReviews
    .map((r, idx) => {
      const rating = typeof r.rating === 'number' ? r.rating : 'N/A';
      let comment = (r.comment || '').toString().replace(/\s+/g, ' ').trim();
      if (comment.length > 220) comment = comment.slice(0, 220) + '…';
      return `${idx + 1}. Rating: ${rating}/5${comment ? ` | Comment: ${comment}` : ''}`;
    })
    .join('\n');

  const systemPrompt = `You are an assistant that writes very concise, neutral summaries of customer reviews for an event listing. Capture common themes, sentiment, strengths/weaknesses, and any consistent complaints. Keep it factual and avoid exaggeration. Output 2-4 sentences only.`;

  const userPrompt = `Event: ${event.name || 'Listing'}\nYou are given the 30 most recent reviews. Write a concise summary of what customers are saying.\n\nReviews:\n${reviewsText}`;

  // Generate with OpenAI
  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 220,
    temperature: 0.3
  });

  const summary = completion.choices?.[0]?.message?.content?.trim() || null;

  return res.status(200).json({
    status: 'success',
    data: {
      summary,
      totalReviewsConsidered: recentReviews.length
    }
  });
});

module.exports = {
  addReview: exports.addReview,
  getEventReviews: exports.getEventReviews,
  deleteReview: exports.deleteReview,
  getVendorReviews: exports.getVendorReviews,
  getEventReviewSummary: exports.getEventReviewSummary
}; 