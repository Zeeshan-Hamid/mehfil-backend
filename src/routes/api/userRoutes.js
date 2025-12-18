const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const { registerPushToken } = require('../../controllers/userController');

// All user routes here require authentication
router.use(protect);

// @route   POST /api/users/push-token
// @desc    Register Expo push token for current user
// @access  Private
router.post('/push-token', registerPushToken);

module.exports = router;


