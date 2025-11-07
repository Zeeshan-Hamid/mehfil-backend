const express = require('express');
const router = express.Router();
const { submitDemoRequest, getDemoRequests } = require('../../controllers/demoRequestController');
// const { protect, restrictTo } = require('../../middleware/authMiddleware');

// Public route - anyone can submit a demo request
router.post('/', submitDemoRequest);

// Admin route - get all demo requests (uncomment when auth is needed)
// router.get('/', protect, restrictTo('admin'), getDemoRequests);
router.get('/', getDemoRequests);

module.exports = router;

