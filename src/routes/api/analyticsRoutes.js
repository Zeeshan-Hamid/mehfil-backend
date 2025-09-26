const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { getVendorAnalytics } = require('../../controllers/analyticsController');
const { 
  trackView, 
  getVendorViewAnalytics, 
  getVendorViewCount, 
  aggregateViews,
  getTopCustomers,
  getAllVendorsTopCustomers
} = require('../../controllers/viewTrackingController');

// Public route for tracking views
router.post('/track-view', trackView);

// Protected routes for vendors
router.use('/vendor', protect, restrictTo('vendor'));
router.get('/vendor', getVendorAnalytics);
router.get('/vendor/views', getVendorViewAnalytics);
router.get('/vendor/view-count', getVendorViewCount);
router.get('/vendor/top-customers', getTopCustomers);

// Admin routes
router.get('/admin/top-customers', protect, restrictTo('admin'), getAllVendorsTopCustomers);
router.post('/aggregate-views', protect, restrictTo('admin'), aggregateViews);

// Test route for manual aggregation (remove in production)
router.post('/test-aggregate', aggregateViews);

module.exports = router;


