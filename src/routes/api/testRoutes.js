const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const { testPushNotification, getUserTokens } = require('../../controllers/testController');

// Test push notification endpoint
// Note: You can remove 'protect' middleware if you want to test without authentication
// For production, you might want to add admin-only access
router.post('/push-notification', protect, testPushNotification);

// Get user tokens (for debugging)
router.get('/user-tokens/:userId', protect, getUserTokens);

module.exports = router;

