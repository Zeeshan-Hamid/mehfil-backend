const express = require('express');
const router = express.Router();
const { getAllEvents } = require('../../controllers/eventController');

// @route   GET /api/marketplace/listings
// @desc    Get all marketplace listings with filtering and sorting
// @access  Public
router.get('/listings', getAllEvents);

module.exports = router;
