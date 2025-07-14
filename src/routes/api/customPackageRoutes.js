const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const {
  createCustomPackage,
  getCustomPackagesForEvent,
  getVendorCustomPackages,
  updateCustomPackage,
  deleteCustomPackage
} = require('../../controllers/customPackageController');

// Vendor routes for managing custom packages
router.get('/vendor/my-packages', protect, restrictTo('vendor'), getVendorCustomPackages);

// Create custom package for a specific event and customer
router.post('/:eventId', protect, restrictTo('vendor'), createCustomPackage);

// Update custom package
router.patch('/:eventId/:packageId', protect, restrictTo('vendor'), updateCustomPackage);

// Delete custom package
router.delete('/:eventId/:packageId', protect, restrictTo('vendor'), deleteCustomPackage);

// Get custom packages for a specific event (customer can only see packages created for them)
router.get('/:eventId', protect, restrictTo('customer'), getCustomPackagesForEvent);

module.exports = router; 