const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { getVendorReviews } = require('../../controllers/reviewController');
const { getCurrentVendorProfile, updateVendorGeneralProfile } = require('../../controllers/vendorController');
const { getAvailability, updateAvailability } = require('../../controllers/availabilityController');
const { uploadInMemory } = require('../../services/fileUploadService');
const { validateVendorGeneralProfile } = require('../../validators/vendorValidators');

// All routes in this file are protected and restricted to vendors
router.use(protect, restrictTo('vendor'));

// GET /api/vendor/profile - Get current vendor's profile
router.get('/profile', getCurrentVendorProfile);

// PUT /api/vendor/profile/general - Update vendor profile general settings
router.put('/profile/general', uploadInMemory.fields([
  { name: 'vendorProfileImage', maxCount: 1 },
  { name: 'halalCertificationImage', maxCount: 1 }
]), validateVendorGeneralProfile, updateVendorGeneralProfile);

// GET /api/vendor/reviews - Fetches all reviews for the logged-in vendor
router.get('/reviews', getVendorReviews);

// Availability Routes
router.get('/availability/:year/:month', getAvailability);
router.post('/availability', updateAvailability);

module.exports = router;
