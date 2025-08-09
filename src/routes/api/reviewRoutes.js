const express = require('express');
// Allow review routes to access params from parent routers (e.g., :eventId)
const router = express.Router({ mergeParams: true });
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { 
  addReview,
  getEventReviews,
  deleteReview,
  getEventReviewSummary
} = require('../../controllers/reviewController');


router.route('/')
  .get(getEventReviews) // GET /api/events/:eventId/reviews
  .post(protect, restrictTo('customer'), addReview); // POST /api/events/:eventId/reviews

// AI Review Summary for a specific event
router.get('/summary', getEventReviewSummary);

router.route('/:reviewId')
  .delete(protect, deleteReview); // DELETE /api/events/:eventId/reviews/:reviewId

module.exports = router; 