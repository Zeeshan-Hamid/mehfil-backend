const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { getVendorAnalytics } = require('../../controllers/analyticsController');

// Vendors only
router.use(protect, restrictTo('vendor'));

// GET /api/analytics/vendor
router.get('/vendor', getVendorAnalytics);

module.exports = router;


