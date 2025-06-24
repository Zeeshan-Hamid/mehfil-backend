const express = require('express');
const router = express.Router();
const eventController = require('../../controllers/eventController');
const { protect, restrictTo } = require('../../middleware/authMiddleware');

// @route   POST /api/events
// @desc    Create a new event
// @access  Private (Vendors only)
router.post(
  '/',
  protect,
  restrictTo('vendor'),
  eventController.createEvent
);

module.exports = router; 