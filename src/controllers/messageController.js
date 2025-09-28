const Message = require('../models/Message');
const User = require('../models/User');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');
const EmailService = require('../services/emailService');
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
  
  
  const userId = req.user.id;
  
  try {
    const conversations = await Message.getConversations(userId);
    
    
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
    
    
    
    res.status(200).json({
      status: 'success',
      data: {
        conversations: populatedConversations
      }
    });
  } catch (error) {
    // Error getting conversations
    throw error;
  }
});

// @desc    Get messages for a specific conversation
// @route   GET /api/messages/conversation/:eventId/:otherUserId
// @access  Private
exports.getConversation = catchAsync(async (req, res) => {
  
  
  const { eventId, otherUserId } = req.params;
  const currentUserId = req.user.id;
  
  try {
    // Handle both ObjectId and slug for event lookup
    let event = null;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
    
    if (isValidObjectId) {
      // If it's a valid ObjectId, search by ID
      event = await Event.findById(eventId);
    } else {
      // If it's not a valid ObjectId, treat it as a slug
      event = await Event.findOne({ slug: eventId });
    }
    
    if (!event) {
      
      return res.status(404).json({
        status: 'fail',
        message: 'Event not found'
      });
    }
    
    // Validate other user exists
    const otherUser = await User.findById(otherUserId).select('role customerProfile.fullName customerProfile.profileImage vendorProfile.businessName vendorProfile.ownerName');
    if (!otherUser) {
      
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }
    
    // Get conversation messages
    const messages = await Message.getConversation(currentUserId, otherUserId, eventId);
    
    
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
    // Error getting conversation
    throw error;
  }
});

// @desc    Send a message
// @route   POST /api/messages/send
// @access  Private
exports.sendMessage = catchAsync(async (req, res) => {
    
    
    const { receiverId, eventId, content, messageType: requestedMessageType } = req.body;
    const senderId = req.user.id;
    const socketService = req.app.get('socketService');

    try {
        if (!receiverId) {
            
            return res.status(400).json({
                status: 'fail',
                message: 'Missing required field: receiverId'
            });
        }

        if (!content && !req.file && !req.files) {
            
            return res.status(400).json({
                status: 'fail',
                message: 'Message must contain either text content or an image'
            });
        }

        // Validate receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            
            return res.status(404).json({
                status: 'fail',
                message: 'Receiver not found'
            });
        }

        // If eventId is provided, validate it exists (for backward compatibility)
        let actualEventId = null;
        if (eventId) {
            let event = null;
            const isValidObjectId = mongoose.Types.ObjectId.isValid(eventId) && /^[0-9a-fA-F]{24}$/.test(eventId);
            
            if (isValidObjectId) {
                // If it's a valid ObjectId, search by ID
                event = await Event.findById(eventId);
                actualEventId = eventId; // Use the original eventId if it's already an ObjectId
            } else {
                // If it's not a valid ObjectId, treat it as a slug
                event = await Event.findOne({ slug: eventId });
                actualEventId = event ? event._id : null; // Use the actual ObjectId from the found event
            }
            
            if (!event) {
                
                return res.status(404).json({
                    status: 'fail',
                    message: 'Event not found'
                });
            }
        }

        const conversationId = Message.generateConversationId(senderId, receiverId, actualEventId);
        
        let messageContent = content;
        let messageType = requestedMessageType || 'text';
        let originalFileName = null;

        if (req.files && req.files.length > 0) {
            
            
            // Check if more than 4 images are being uploaded
            if (req.files.length > 4) {
                
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
                    
                    messageType = 'image';
                    const imageUrls = await processAndUploadMultipleMessageImages(req.files, senderId, conversationId);
                    messageContent = JSON.stringify(imageUrls); // Store as JSON array
                    
                } else if (allDocuments) {
                    
                    messageType = 'document';
                    const documentUrls = await Promise.all(
                        req.files.map(async (file) => {
                            const url = await uploadMessageDocument(file, senderId, conversationId);
                            return { url, originalFileName: file.originalname };
                        })
                    );
                    messageContent = JSON.stringify(documentUrls); // Store as JSON array
                    
                } else {
                    
                    return res.status(400).json({
                        status: 'error',
                        message: 'Cannot mix image and document files in the same message'
                    });
                }
            } catch (uploadError) {
                // Multiple file upload failed
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to upload files'
                });
            }
        } else if (req.file) {
            
            
            try {
                if (req.file.mimetype.startsWith('image/')) {
                    
                    messageType = 'image';
                    messageContent = await processAndUploadMessageImage(req.file, senderId, conversationId);
                    
                } else {
                    
                    messageType = 'document';
                    originalFileName = req.file.originalname;
                    messageContent = await uploadMessageDocument(req.file, senderId, conversationId);
                    
                }
            } catch (uploadError) {
                // Single file upload failed
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

        // Map custom payload into customData when messageType is custom (content may be JSON)
        if (messageType === 'custom' && messageContent) {
            try {
                const parsed = typeof messageContent === 'string' ? JSON.parse(messageContent) : messageContent;
                if (parsed && typeof parsed === 'object') {
                    messageData.customData = parsed;
                }
            } catch (e) {
                // ignore JSON parse error
            }
        }

        // Add eventId only if provided (for backward compatibility)
        if (actualEventId) {
            messageData.eventId = actualEventId;
        }

        const newMessage = await Message.create(messageData);

        await newMessage.populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');
        
        // Check if this is a cancellation request and send email to vendor
        const isCancellationRequest = content && content.includes('🚨 CANCELLATION REQUEST');
        if (isCancellationRequest && receiver.role === 'vendor') {
            try {
                // Extract order details from the cancellation message
                const orderIdMatch = content.match(/Order ID: ([^\n]+)/);
                const eventMatch = content.match(/Event: ([^\n]+)/);
                const dateMatch = content.match(/Date: ([^\n]+)/);
                const locationMatch = content.match(/Location: ([^\n]+)/);
                const amountMatch = content.match(/Total Amount: \$ ([^\n]+)/);
                const reasonMatch = content.match(/Reason for Cancellation: ([^\n]+)/);
                
                if (orderIdMatch && eventMatch) {
                    const orderId = orderIdMatch[1].trim();
                    const eventTitle = eventMatch[1].trim();
                    const eventDate = dateMatch ? dateMatch[1].trim() : 'Not specified';
                    const eventLocation = locationMatch ? locationMatch[1].trim() : 'Not specified';
                    const totalAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
                    const cancellationReason = reasonMatch ? reasonMatch[1].trim() : 'No specific reason provided';
                    
                    // Extract time from date if it contains time
                    let eventTime = null;
                    if (eventDate.includes(' at ')) {
                        const timeMatch = eventDate.match(/ at (.+)$/);
                        if (timeMatch) {
                            eventTime = timeMatch[1].trim();
                        }
                    }
                    
                    // Get customer details
                    const customer = await User.findById(senderId).select('email customerProfile.fullName customerProfile.firstName customerProfile.lastName phoneNumber');
                    const customerName = customer.customerProfile?.fullName || 
                                       `${customer.customerProfile?.firstName || ''} ${customer.customerProfile?.lastName || ''}`.trim() || 
                                       'Customer';
                    
                    // Send cancellation email to vendor
                    await EmailService.sendCancellationRequestEmail({
                        vendorEmail: receiver.email,
                        vendorName: receiver.vendorProfile?.businessName || receiver.vendorProfile?.ownerName || 'Vendor',
                        customerName: customerName,
                        customerEmail: customer.email,
                        customerPhone: customer.phoneNumber,
                        customerId: senderId, // Pass the customer ID for URL parameter
                        orderId: orderId,
                        eventTitle: eventTitle,
                        eventDate: eventDate.replace(/ at .+$/, ''), // Remove time from date
                        eventTime: eventTime,
                        eventLocation: eventLocation,
                        totalAmount: totalAmount,
                        cancellationReason: cancellationReason
                    });
                }
            } catch (emailError) {
                // Error sending cancellation email
                // Don't fail the message sending if email fails
            }
        }

        // Create notification for the receiver
        try {
            const notification = await Notification.createMessageNotification({
                sender: senderId,
                receiver: receiverId,
                message: newMessage
            });
            
            
            
            if (socketService) {
                
                socketService.broadcastMessage(newMessage);
                socketService.broadcastNotification(notification);
                socketService.sendUnreadCountUpdate(receiverId); // Ensure receiver gets unread count update
            } else {
                
            }
        } catch (notificationError) {
            // Error creating notification
            // Still broadcast the message even if notification fails
            if (socketService) {
                socketService.broadcastMessage(newMessage);
            }
        }

        res.status(201).json({
            status: 'success',
            data: {
                message: newMessage
            }
        });
    } catch (error) {
        // Error sending message
        throw error;
    }
});

// @desc    Mark messages as read
// @route   PATCH /api/messages/read/:conversationId
// @access  Private
exports.markAsRead = catchAsync(async (req, res) => {
  
  
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
    
    
    
    res.status(200).json({
      status: 'success',
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    // Error marking messages as read
    throw error;
  }
});

// @desc    Get unread message count
// @route   GET /api/messages/unread-count
// @access  Private
exports.getUnreadCount = catchAsync(async (req, res) => {
  
  
  const userId = req.user.id;
  
  try {
    const count = await Message.getUnreadCount(userId);
    
    
    res.status(200).json({
      status: 'success',
      data: {
        unreadCount: count
      }
    });
  } catch (error) {
    // Error getting unread count
    throw error;
  }
});

// @desc    Delete conversation for current user
// @route   DELETE /api/messages/conversation/:conversationId
// @access  Private
exports.deleteConversation = catchAsync(async (req, res) => {
  
  
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
    
    
    
    res.status(200).json({
      status: 'success',
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    // Error deleting conversation
    throw error;
  }
});

// @desc    Get messages for vendor conversation (vendor-only, no event required)
// @route   GET /api/messages/vendor/:vendorId
// @access  Private
exports.getVendorConversation = catchAsync(async (req, res) => {
  
  
  const { vendorId } = req.params;
  const currentUserId = req.user.id;
  
  try {
    // Validate vendorId format first
    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
      
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid vendor ID format'
      });
    }

    // Validate vendor exists and has the correct role
    const vendor = await User.findById(vendorId).select('role vendorProfile.businessName vendorProfile.ownerName');
    if (!vendor) {
      
      return res.status(404).json({
        status: 'fail',
        message: 'Vendor not found'
      });
    }
    
    if (vendor.role !== 'vendor') {
      
      return res.status(404).json({
        status: 'fail',
        message: 'User is not a vendor'
      });
    }
    
    // Get conversation messages (vendor-only format)
    const messages = await Message.getConversation(currentUserId, vendorId);
    
    
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
    // Error getting vendor conversation
    throw error;
  }
});

// @desc    Get messages for customer conversation (from vendor's perspective)
// @route   GET /api/messages/customer/:customerId
// @access  Private (Vendor only)
exports.getCustomerConversation = catchAsync(async (req, res) => {
  
  
  const { customerId } = req.params;
  const currentUserId = req.user.id;
  
  try {
    // Ensure current user is a vendor
    const currentUser = await User.findById(currentUserId).select('role');
    if (!currentUser || currentUser.role !== 'vendor') {
      
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied. Only vendors can access this endpoint.'
      });
    }

    // Validate customerId format first
    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid customer ID format'
      });
    }

    // Validate customer exists and has the correct role
    const customer = await User.findById(customerId).select('role customerProfile.fullName customerProfile.profileImage');
    if (!customer) {
      
      return res.status(404).json({
        status: 'fail',
        message: 'Customer not found'
      });
    }
    
    if (customer.role !== 'customer') {
      
      return res.status(404).json({
        status: 'fail',
        message: 'User is not a customer'
      });
    }
    
    // Get conversation messages (vendor-to-customer format)
    const messages = await Message.getConversation(currentUserId, customerId);
    
    
    // Mark messages as read
    await Message.updateMany(
      {
        conversationId: Message.generateConversationId(currentUserId, customerId),
        receiver: currentUserId,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );
    
    const profileImage = customer.customerProfile?.profileImage || null;
    
    
    
    res.status(200).json({
      status: 'success',
      data: {
        messages,
        event: null, // No specific event for vendor-customer conversations
        otherUser: {
          _id: customer._id,
          name: customer.customerProfile?.fullName || 'Customer',
          role: customer.role,
          profileImage: profileImage
        }
      }
    });
  } catch (error) {
    // Error getting customer conversation
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
  getVendorConversation: exports.getVendorConversation,
  getCustomerConversation: exports.getCustomerConversation
};