const Notification = require('../models/Notification');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Get all notifications for current user
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = catchAsync(async (req, res) => {

  
  const { page = 1, limit = 20, type, unreadOnly } = req.query;
  const userId = req.user.id;
  
  try {
    const notifications = await Notification.getNotifications(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      unreadOnly: unreadOnly === 'true'
    });
    
    // Get total count for pagination
    const query = {
      recipient: userId,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    };
    
    if (type) {
      // Support comma-separated types for multiple notification types
      if (type.includes(',')) {
        query.type = { $in: type.split(',').map(t => t.trim()) };
      } else {
        query.type = type;
      }
    }
    if (unreadOnly === 'true') query.isRead = false;
    
    const totalCount = await Notification.countDocuments(query);
    const unreadCount = await Notification.getUnreadCount(userId);
    

    
    res.status(200).json({
      status: 'success',
      data: {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasMore: (parseInt(page) * parseInt(limit)) < totalCount
        },
        unreadCount
      }
    });
  } catch (error) {
  
    throw error;
  }
});

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
exports.getUnreadCount = catchAsync(async (req, res) => {

  
  const userId = req.user.id;
  
  try {
    const count = await Notification.getUnreadCount(userId);

    
    res.status(200).json({
      status: 'success',
      data: {
        unreadCount: count
      }
    });
  } catch (error) {

    throw error;
  }
});

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
exports.markAsRead = catchAsync(async (req, res) => {

  
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const notification = await Notification.findOne({
      _id: id,
      recipient: userId
    });
    
    if (!notification) {

      return res.status(404).json({
        status: 'fail',
        message: 'Notification not found'
      });
    }
    
    if (!notification.isRead) {
      await notification.markAsRead();
    }
    
    
    
    res.status(200).json({
      status: 'success',
      data: {
        notification
      }
    });
  } catch (error) {
   
    throw error;
  }
});

// @desc    Mark multiple notifications as read
// @route   PATCH /api/notifications/mark-read
// @access  Private
exports.markMultipleAsRead = catchAsync(async (req, res) => {
  const { notificationIds = [] } = req.body;
  const userId = req.user.id;
  
  try {
    const result = await Notification.markMultipleAsRead(userId, notificationIds);
    

    
    res.status(200).json({
      status: 'success',
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {

    throw error;
  }
});

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = catchAsync(async (req, res) => {
  
  
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: userId
    });
    
    if (!notification) {

      return res.status(404).json({
        status: 'fail',
        message: 'Notification not found'
      });
    }
    
    
    
    res.status(200).json({
      status: 'success',
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    
    throw error;
  }
});

// @desc    Delete multiple notifications
// @route   DELETE /api/notifications/bulk-delete
// @access  Private
exports.bulkDeleteNotifications = catchAsync(async (req, res) => {
 
  
  const { notificationIds, deleteRead = false } = req.body;
  const userId = req.user.id;
  
  try {
    let query = { recipient: userId };
    
    if (notificationIds && notificationIds.length > 0) {
      query._id = { $in: notificationIds };
    } else if (deleteRead) {
      query.isRead = true;
    } else {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide notification IDs or set deleteRead to true'
      });
    }
    
    const result = await Notification.deleteMany(query);
    
   
    
    res.status(200).json({
      status: 'success',
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
 
    throw error;
  }
});

// @desc    Create a notification (mainly for testing or admin use)
// @route   POST /api/notifications
// @access  Private
exports.createNotification = catchAsync(async (req, res) => {

  
  const { recipientId, type, title, message, data, actionUrl, priority } = req.body;
  const senderId = req.user.id;
  
  try {
    if (!recipientId || !type || !title || !message) {
      return res.status(400).json({
        status: 'fail',
        message: 'Missing required fields: recipientId, type, title, message'
      });
    }
    
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      message,
      data: data || {},
      actionUrl,
      priority: priority || 'medium'
    });
    
    await notification.populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');
    
  
    
    // Broadcast notification via socket if available
    const socketService = req.app.get('socketService');
    if (socketService) {
      
      socketService.broadcastNotification(notification);
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        notification
      }
    });
  } catch (error) {
  
    throw error;
  }
});

// @desc    Create a cart notification when event is added to cart
// @route   POST /api/notifications/cart
// @access  Private (Customers only)
exports.createCartNotification = catchAsync(async (req, res) => {
  const { eventId, packageType, eventDate, eventTime, attendees, totalPrice } = req.body;
  const customerId = req.user.id;
  
  try {
    if (!eventId || !packageType || !eventDate || !eventTime || !attendees || totalPrice === undefined) {
      return res.status(400).json({
        status: 'fail',
        message: 'Missing required fields: eventId, packageType, eventDate, eventTime, attendees, totalPrice'
      });
    }
    
    // Only customers can add items to cart
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        status: 'fail',
        message: 'Only customers can add items to cart'
      });
    }
    
    const cartData = {
      customerId,
      eventId,
      packageType,
      eventDate,
      eventTime,
      attendees,
      totalPrice
    };
    
    const notification = await Notification.createCartNotification(cartData);
    
    // Broadcast notification via socket if available
    const socketService = req.app.get('socketService');
    if (socketService) {
      socketService.broadcastNotification(notification);
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        notification
      }
    });
  } catch (error) {
    // Create cart notification error
    throw error;
  }
});

module.exports = {
  getNotifications: exports.getNotifications,
  getUnreadCount: exports.getUnreadCount,
  markAsRead: exports.markAsRead,
  markMultipleAsRead: exports.markMultipleAsRead,
  deleteNotification: exports.deleteNotification,
  bulkDeleteNotifications: exports.bulkDeleteNotifications,
  createNotification: exports.createNotification,
  createCartNotification: exports.createCartNotification
};