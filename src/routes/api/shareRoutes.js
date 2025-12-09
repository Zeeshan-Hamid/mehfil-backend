const express = require('express');
const router = express.Router();
const { generateShareLink } = require('../../controllers/shareController');

/**
 * @route   GET /api/events/:eventId/share
 * @desc    Generate share link for an event
 * @access  Public
 */
router.get('/events/:eventId/share', generateShareLink);

module.exports = router;

