const Message = require('../models/Message');
const User = require('../models/User');
const Event = require('../models/Event');
const mongoose = require('mongoose');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get all conversations for current user
// @route   GET /api/messages/conversations
// @access  Private
exports.getConversations = catchAsync(async (req, res) => {
  console.log('🔍 [MessageController] Getting conversations for user:', req.user.id);
  
  const userId = req.user.id;
  
  try {
    const conversations = await Message.getConversations(userId);
    console.log('📋 [MessageController] Found conversations:', conversations.length);
    
    // Populate user details for each conversation
    const populatedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = await User.findById(conv.otherUser).select('role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');
        const event = await Event.findById(conv.eventId).select('name imageUrls');
        
        return {
          conversationId: conv._id,
          eventId: conv.eventId,
          lastMessage: conv.lastMessage,
          event: event,
          otherUser: {
            _id: otherUser._id,
            name: otherUser.role === 'customer' 
              ? otherUser.customerProfile?.fullName 
              : otherUser.vendorProfile?.businessName || otherUser.vendorProfile?.ownerName,
            role: otherUser.role
          }
        };
      })
    );
    
    console.log('✅ [MessageController] Successfully retrieved conversations');
    
    res.status(200).json({
      status: 'success',
      data: {
        conversations: populatedConversations
      }
    });
  } catch (error) {
    console.error('❌ [MessageController] Error getting conversations:', error);
    throw error;
  }
});

// @desc    Get messages for a specific conversation
// @route   GET /api/messages/conversation/:eventId/:otherUserId
// @access  Private
exports.getConversation = catchAsync(async (req, res) => {
  console.log('🔍 [MessageController] Getting conversation for event:', req.params.eventId, 'with user:', req.params.otherUserId);
  
  const { eventId, otherUserId } = req.params;
  const currentUserId = req.user.id;
  
  try {
    // Validate event exists
    const event = await Event.findById(eventId);
    if (!event) {
      console.log('❌ [MessageController] Event not found:', eventId);
      return res.status(404).json({
        status: 'fail',
        message: 'Event not found'
      });
    }
    
    // Validate other user exists
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      console.log('❌ [MessageController] Other user not found:', otherUserId);
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }
    
    // Get conversation messages
    const messages = await Message.getConversation(currentUserId, otherUserId, eventId);
    console.log('📨 [MessageController] Found messages:', messages.length);
    
    // Mark messages as read
    await Message.updateMany(
      {
        conversationId: Message.generateConversationId(currentUserId, otherUserId, eventId),
        receiver: currentUserId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );
    
    console.log('✅ [MessageController] Successfully retrieved conversation');
    
    res.status(200).json({
      status: 'success',
      data: {
        messages,
        event,
        otherUser: {
          _id: otherUser._id,
          name: otherUser.role === 'customer' 
            ? otherUser.customerProfile?.fullName 
            : otherUser.vendorProfile?.businessName || otherUser.vendorProfile?.ownerName,
          role: otherUser.role
        }
      }
    });
  } catch (error) {
    console.error('❌ [MessageController] Error getting conversation:', error);
    throw error;
  }
});

// @desc    Send a message
// @route   POST /api/messages/send
// @access  Private
exports.sendMessage = catchAsync(async (req, res) => {
  console.log('📤 [MessageController] Sending message:', req.body);
  
  const { receiverId, eventId, content, messageType = 'text' } = req.body;
  const senderId = req.user.id;
  
  try {
    // Validate required fields
    if (!receiverId || !eventId || !content) {
      console.log('❌ [MessageController] Missing required fields');
      return res.status(400).json({
        status: 'fail',
        message: 'Missing required fields: receiverId, eventId, content'
      });
    }
    
    // Validate event exists
    const event = await Event.findById(eventId);
    if (!event) {
      console.log('❌ [MessageController] Event not found:', eventId);
      return res.status(404).json({
        status: 'fail',
        message: 'Event not found'
      });
    }
    
    // Validate receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      console.log('❌ [MessageController] Receiver not found:', receiverId);
      return res.status(404).json({
        status: 'fail',
        message: 'Receiver not found'
      });
    }
    
    // Generate conversation ID
    const conversationId = Message.generateConversationId(senderId, receiverId, eventId);
    
    // Create new message
    const newMessage = await Message.create({
      conversationId,
      sender: senderId,
      receiver: receiverId,
      content,
      messageType,
      eventId
    });
    
    // Populate sender details
    await newMessage.populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');
    
    console.log('✅ [MessageController] Message sent successfully:', newMessage._id);
    
    res.status(201).json({
      status: 'success',
      data: {
        message: newMessage
      }
    });
  } catch (error) {
    console.error('❌ [MessageController] Error sending message:', error);
    throw error;
  }
});

// @desc    Mark messages as read
// @route   PATCH /api/messages/read/:conversationId
// @access  Private
exports.markAsRead = catchAsync(async (req, res) => {
  console.log('👁️ [MessageController] Marking messages as read for conversation:', req.params.conversationId);
  
  const { conversationId } = req.params;
  const userId = req.user.id;
  
  try {
    const result = await Message.updateMany(
      {
        conversationId,
        receiver: userId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );
    
    console.log('✅ [MessageController] Marked messages as read:', result.modifiedCount);
    
    res.status(200).json({
      status: 'success',
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('❌ [MessageController] Error marking messages as read:', error);
    throw error;
  }
});

// @desc    Get unread message count
// @route   GET /api/messages/unread-count
// @access  Private
exports.getUnreadCount = catchAsync(async (req, res) => {
  console.log('🔢 [MessageController] Getting unread count for user:', req.user.id);
  
  const userId = req.user.id;
  
  try {
    const count = await Message.getUnreadCount(userId);
    console.log('✅ [MessageController] Unread count:', count);
    
    res.status(200).json({
      status: 'success',
      data: {
        unreadCount: count
      }
    });
  } catch (error) {
    console.error('❌ [MessageController] Error getting unread count:', error);
    throw error;
  }
});

// @desc    Delete conversation for current user
// @route   DELETE /api/messages/conversation/:conversationId
// @access  Private
exports.deleteConversation = catchAsync(async (req, res) => {
  console.log('🗑️ [MessageController] Deleting conversation:', req.params.conversationId, 'for user:', req.user.id);
  
  const { conversationId } = req.params;
  const userId = req.user.id;
  
  try {
    // Delete all messages in this conversation where the current user is either sender or receiver
    const result = await Message.deleteMany({
      conversationId,
      $or: [
        { sender: userId },
        { receiver: userId }
      ]
    });
    
    console.log('✅ [MessageController] Deleted messages:', result.deletedCount);
    
    res.status(200).json({
      status: 'success',
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('❌ [MessageController] Error deleting conversation:', error);
    throw error;
  }
});

module.exports = {
  getConversations: exports.getConversations,
  getConversation: exports.getConversation,
  sendMessage: exports.sendMessage,
  markAsRead: exports.markAsRead,
  getUnreadCount: exports.getUnreadCount,
  deleteConversation: exports.deleteConversation
}; 