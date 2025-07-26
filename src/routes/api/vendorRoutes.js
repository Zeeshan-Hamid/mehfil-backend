const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { getVendorReviews } = require('../../controllers/reviewController');

// All routes in this file are protected and restricted to vendors
router.use(protect, restrictTo('vendor'));

// GET /api/vendor/reviews - Fetches all reviews for the logged-in vendor
router.get('/reviews', getVendorReviews);

module.exports = router; 