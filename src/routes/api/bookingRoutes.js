const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { 
  bookEvent,
  getBookedEvents
} = require('../../controllers/bookingController');

// All routes in this file are protected and for customers only
router.use(protect, restrictTo('customer'));

router.route('/')
  .post(bookEvent)
  .get(getBookedEvents);

module.exports = router; 