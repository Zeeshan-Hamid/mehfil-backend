const express = require('express');
const router = express.Router();
const sonioxController = require('../../controllers/sonioxController');

/**
 * @route   GET /api/soniox/api-key
 * @desc    Get Soniox API key for frontend
 * @access  Public
 */
router.get('/api-key', sonioxController.getApiKey);

module.exports = router;

