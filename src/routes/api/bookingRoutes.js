const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { 
  bookEvent,
  getCustomerBookings,
  getVendorBookings,
  getBookingDetails,
  updateBookingStatus
} = require('../../controllers/bookingController');

// --- Customer Routes ---
// These routes are protected and for customers only
router.post('/', protect, restrictTo('customer'), bookEvent);
router.get('/my-bookings', protect, restrictTo('customer'), getCustomerBookings);

// --- Vendor Routes ---
// This route is protected and for vendors only
router.get('/vendor-bookings', protect, restrictTo('vendor'), getVendorBookings);
router.patch('/:id/status', protect, restrictTo('vendor'), updateBookingStatus);

// --- Shared Routes ---
// This route is for both customers and vendors to view a specific booking they are involved in
router.get('/:id', protect, getBookingDetails);

module.exports = router; 