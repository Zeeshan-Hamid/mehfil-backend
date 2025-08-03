const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { uploadInMemory } = require('../../services/fileUploadService');
const { 
  getCustomerProfile,
  updateCustomerProfile
} = require('../../controllers/customerController');

// All customer routes require authentication and are restricted to customers
router.use(protect, restrictTo('customer'));

// @route   GET /api/customer/profile
// @desc    Get customer profile
// @access  Private (Customers only)
router.get('/profile', getCustomerProfile);

// @route   PUT /api/customer/profile
// @desc    Update customer profile
// @access  Private (Customers only)
router.put('/profile', uploadInMemory.single('profileImage'), updateCustomerProfile);

module.exports = router; 