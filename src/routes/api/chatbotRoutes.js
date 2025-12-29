const express = require('express');
const router = express.Router();
const { vendorChatbot, customerChatbot } = require('../../controllers/chatbotController');
const { protect, restrictTo } = require('../../middleware/authMiddleware');

// Vendor chatbot endpoint - requires authentication and vendor role
router.post('/vendor-chat', protect, restrictTo('vendor'), vendorChatbot);

// Customer chatbot endpoint - requires authentication (any user can use)
router.post('/customer-chat', protect, customerChatbot);

module.exports = router;
