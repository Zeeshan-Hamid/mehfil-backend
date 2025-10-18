const express = require('express');
const router = express.Router();
const { vendorChatbot, customerChatbot, generateOfferings, generateDescription, generatePackage, generateEventChecklist } = require('../../controllers/chatbotController');
const { protect, restrictTo } = require('../../middleware/authMiddleware');

// Vendor chatbot endpoint - requires authentication and vendor role
router.post('/vendor-chat', protect, restrictTo('vendor'), vendorChatbot);

// Customer chatbot endpoint - requires authentication (any user can use)
router.post('/customer-chat', protect, customerChatbot);

// AI offerings generation endpoint - requires authentication and vendor or admin role
router.post('/generate-offerings', protect, restrictTo('vendor', 'admin'), generateOfferings);

// AI description generation endpoint - requires authentication and vendor or admin role
router.post('/generate-description', protect, restrictTo('vendor', 'admin'), generateDescription);

// AI package generation endpoint - requires authentication and vendor role
router.post('/generate-package', protect, restrictTo('vendor'), generatePackage);

// AI event checklist generation endpoint - requires authentication and customer role
router.post('/generate-event-checklist', protect, restrictTo('customer'), generateEventChecklist);

module.exports = router; 