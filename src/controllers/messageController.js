const Message = require('../models/Message');
const User = require('../models/User');
const Event = require('../models/Event');
const mongoose = require('mongoose');
const { processAndUploadMessageImage, processAndUploadMultipleMessageImages, uploadMessageDocument } = require('../services/fileUploadService');

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
        const otherUser = await User.findById(conv.otherUser).select('role customerProfile.fullName customerProfile.profileImage vendorProfile.businessName vendorProfile.ownerName');
        
        // Handle both event-based and vendor-only conversations
        let event = null;
        if (conv.eventId) {
          event = await Event.findById(conv.eventId).select('name imageUrls');
        }
        
        // Get profile picture based on user role
        let profileImage = null;
        if (otherUser.role === 'customer' && otherUser.customerProfile?.profileImage) {
          profileImage = otherUser.customerProfile.profileImage;
        }
        // Note: Vendors don't have profile pictures in the current schema
        
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
            role: otherUser.role,
            profileImage: profileImage
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
    const otherUser = await User.findById(otherUserId).select('role customerProfile.fullName customerProfile.profileImage vendorProfile.businessName vendorProfile.ownerName');
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
    
    // Get profile picture based on user role
    let profileImage = null;
    if (otherUser.role === 'customer' && otherUser.customerProfile?.profileImage) {
      profileImage = otherUser.customerProfile.profileImage;
    }
    
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
          role: otherUser.role,
          profileImage: profileImage
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
    
    const { receiverId, eventId, content } = req.body;
    const senderId = req.user.id;
    const socketService = req.app.get('socketService');

    try {
        if (!receiverId) {
            console.log('❌ [MessageController] Missing required field: receiverId');
            return res.status(400).json({
                status: 'fail',
                message: 'Missing required field: receiverId'
            });
        }

        if (!content && !req.file && !req.files) {
            console.log('❌ [MessageController] Missing content or image file');
            return res.status(400).json({
                status: 'fail',
                message: 'Message must contain either text content or an image'
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

        // If eventId is provided, validate it exists (for backward compatibility)
        if (eventId) {
            const event = await Event.findById(eventId);
            if (!event) {
                console.log('❌ [MessageController] Event not found:', eventId);
                return res.status(404).json({
                    status: 'fail',
                    message: 'Event not found'
                });
            }
        }

        const conversationId = Message.generateConversationId(senderId, receiverId, eventId);
        
        let messageContent = content;
        let messageType = 'text';
        let originalFileName = null;

        if (req.files && req.files.length > 0) {
            console.log('📄 [MessageController] Multiple files detected:', req.files.length);
            
            // Check if more than 4 images are being uploaded
            if (req.files.length > 4) {
                console.log('❌ [MessageController] Too many files uploaded. Maximum allowed is 4.');
                return res.status(400).json({
                    status: 'error',
                    message: 'You can only upload up to 4 images at a time'
                });
            }
            
            try {
                // Check if all files are images
                const allImages = req.files.every(file => file.mimetype.startsWith('image/'));
                const allDocuments = req.files.every(file => !file.mimetype.startsWith('image/'));
                
                if (allImages) {
                    console.log('🖼️ [MessageController] Multiple image files detected, starting upload process');
                    messageType = 'image';
                    const imageUrls = await processAndUploadMultipleMessageImages(req.files, senderId, conversationId);
                    messageContent = JSON.stringify(imageUrls); // Store as JSON array
                    console.log('✅ [MessageController] Multiple images uploaded successfully:', imageUrls.length);
                } else if (allDocuments) {
                    console.log('📁 [MessageController] Multiple document files detected, starting upload process');
                    messageType = 'document';
                    const documentUrls = await Promise.all(
                        req.files.map(async (file) => {
                            const url = await uploadMessageDocument(file, senderId, conversationId);
                            return { url, originalFileName: file.originalname };
                        })
                    );
                    messageContent = JSON.stringify(documentUrls); // Store as JSON array
                    console.log('✅ [MessageController] Multiple documents uploaded successfully:', documentUrls.length);
                } else {
                    console.log('❌ [MessageController] Mixed file types not allowed');
                    return res.status(400).json({
                        status: 'error',
                        message: 'Cannot mix image and document files in the same message'
                    });
                }
            } catch (uploadError) {
                console.error('❌ [MessageController] Multiple file upload failed:', uploadError);
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to upload files'
                });
            }
        } else if (req.file) {
            console.log('📄 [MessageController] Single file detected:', req.file.originalname, 'Type:', req.file.mimetype);
            
            try {
                if (req.file.mimetype.startsWith('image/')) {
                    console.log('🖼️ [MessageController] Single image file detected, starting upload process');
                    messageType = 'image';
                    messageContent = await processAndUploadMessageImage(req.file, senderId, conversationId);
                    console.log('✅ [MessageController] Single image uploaded successfully:', messageContent);
                } else {
                    console.log('📁 [MessageController] Single document file detected, starting upload process');
                    messageType = 'document';
                    originalFileName = req.file.originalname;
                    messageContent = await uploadMessageDocument(req.file, senderId, conversationId);
                    console.log('✅ [MessageController] Single document uploaded successfully:', messageContent);
                }
            } catch (uploadError) {
                console.error('❌ [MessageController] Single file upload failed:', uploadError);
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to upload file'
                });
            }
        }

        const messageData = {
            conversationId,
            sender: senderId,
            receiver: receiverId,
            content: messageContent,
            messageType,
            originalFileName
        };

        // Add eventId only if provided (for backward compatibility)
        if (eventId) {
            messageData.eventId = eventId;
        }

        const newMessage = await Message.create(messageData);

        await newMessage.populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');
        
        console.log('✅ [MessageController] Message sent successfully:', newMessage._id);

        if (socketService) {
            console.log('📡 [MessageController] Broadcasting message via SocketService');
            socketService.broadcastMessage(newMessage);
        } else {
            console.log('⚠️ [MessageController] SocketService not available');
        }

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

// @desc    Get messages for vendor conversation (vendor-only, no event required)
// @route   GET /api/messages/vendor/:vendorId
// @access  Private
exports.getVendorConversation = catchAsync(async (req, res) => {
  console.log('🔍 [MessageController] Getting vendor conversation for vendor:', req.params.vendorId);
  
  const { vendorId } = req.params;
  const currentUserId = req.user.id;
  
  try {
    // Validate vendor exists
    const vendor = await User.findById(vendorId).select('role vendorProfile.businessName vendorProfile.ownerName');
    if (!vendor || vendor.role !== 'vendor') {
      console.log('❌ [MessageController] Vendor not found:', vendorId);
      return res.status(404).json({
        status: 'fail',
        message: 'Vendor not found'
      });
    }
    
    // Get conversation messages (vendor-only format)
    const messages = await Message.getConversation(currentUserId, vendorId);
    console.log('📨 [MessageController] Found messages:', messages.length);
    
    // Mark messages as read
    await Message.updateMany(
      {
        conversationId: Message.generateConversationId(currentUserId, vendorId),
        receiver: currentUserId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );
    
    // Vendors don't have profile pictures in current schema
    const profileImage = null;
    
    console.log('✅ [MessageController] Successfully retrieved vendor conversation');
    
    res.status(200).json({
      status: 'success',
      data: {
        messages,
        event: null, // No specific event for vendor-only conversations
        otherUser: {
          _id: vendor._id,
          name: vendor.vendorProfile?.businessName || vendor.vendorProfile?.ownerName || 'Vendor',
          role: vendor.role,
          profileImage: profileImage
        }
      }
    });
  } catch (error) {
    console.error('❌ [MessageController] Error getting vendor conversation:', error);
    throw error;
  }
});

module.exports = {
  getConversations: exports.getConversations,
  getConversation: exports.getConversation,
  sendMessage: exports.sendMessage,
  markAsRead: exports.markAsRead,
  getUnreadCount: exports.getUnreadCount,
  deleteConversation: exports.deleteConversation,
  getVendorConversation: exports.getVendorConversation
};