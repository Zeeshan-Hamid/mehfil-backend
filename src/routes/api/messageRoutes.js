const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const {
  getConversations,
  getConversation,
  sendMessage,
  markAsRead,
  getUnreadCount,
  deleteConversation
} = require('../../controllers/messageController');

// All message routes require authentication
router.use(protect);

// Get all conversations for current user
router.get('/conversations', getConversations);

// Get messages for a specific conversation
router.get('/conversation/:eventId/:otherUserId', getConversation);

// Send a message
router.post('/send', sendMessage);

// Mark messages as read
router.patch('/read/:conversationId', markAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

// Delete conversation for current user
router.delete('/conversation/:conversationId', deleteConversation);

module.exports = router; 