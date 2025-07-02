const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const {
  subscribe,
  unsubscribe,
  updatePreferences,
  getUnsubscribeToken,
  getAllSubscribers
} = require('../../controllers/newsletterController');
const {
  validateSubscription,
  validatePreferencesUpdate
} = require('../../validators/newsletterValidators');

// Public routes
router.post('/subscribe', validateSubscription, subscribe);
router.get('/unsubscribe/:token', unsubscribe);
router.patch('/preferences', validatePreferencesUpdate, updatePreferences);

// Protected routes
router.get('/token', protect, getUnsubscribeToken);

// Admin only routes
router.get('/', protect, restrictTo('admin'), getAllSubscribers);

module.exports = router; 