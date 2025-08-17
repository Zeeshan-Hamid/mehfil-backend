const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/authMiddleware');
const { createCheckoutSession } = require('../../controllers/paymentController');

// Customer creates checkout session from their cart
router.post('/checkout', protect, restrictTo('customer'), createCheckoutSession);

// Webhook is mounted in root index.js with raw body parser

module.exports = router;


