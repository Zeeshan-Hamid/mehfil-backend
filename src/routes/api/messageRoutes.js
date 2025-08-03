const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const {
  getConversations,
  getConversation,
  sendMessage,
  markAsRead,
  getUnreadCount,
  deleteConversation,
  getVendorConversation,
  getCustomerConversation
} = require('../../controllers/messageController');
const { uploadInMemory } = require('../../services/fileUploadService');

// All message routes require authentication
router.use(protect);

// Get all conversations for current user
router.get('/conversations', getConversations);

// Get messages for a specific conversation
router.get('/conversation/:eventId/:otherUserId', getConversation);

// Get messages for vendor conversation (vendor-only, no event required)
router.get('/vendor/:vendorId', getVendorConversation);

// Get messages for customer conversation (from vendor's perspective)
router.get('/customer/:customerId', getCustomerConversation);

// Send a message (handles both text and image uploads)
router.post('/send', uploadInMemory.array('images', 4), sendMessage);

// Mark messages as read
router.patch('/read/:conversationId', markAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

// Delete conversation for current user
router.delete('/conversation/:conversationId', deleteConversation);

module.exports = router;
