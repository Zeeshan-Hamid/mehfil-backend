const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'message',           // New message received
      'booking',           // Booking related
      'payment',           // Payment related
      'review',            // Review received
      'system',            // System notifications
      'reminder',          // Reminders
      'event_update',      // Event updates
      'vendor_inquiry'     // Vendor inquiry
    ],
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  data: {
    type: mongoose.Schema.Types.Mixed, // Flexible data for different notification types
    default: {}
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  },
  actionUrl: {
    type: String, // URL to navigate to when notification is clicked
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  expiresAt: {
    type: Date, // Optional expiration for temporary notifications
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Virtual for time since created
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) {
    return minutes <= 1 ? 'just now' : `${minutes} minutes ago`;
  } else if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  } else {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
});

// Instance method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to create a message notification
notificationSchema.statics.createMessageNotification = async function(messageData) {
  console.log('🔔 [NotificationModel] Creating message notification with data:', messageData);
  
  const { sender, receiver, message } = messageData;
  
  console.log('🔔 [NotificationModel] Extracted data:', { sender, receiver, messageId: message._id });
  
  // Get sender details for notification
  const senderUser = await mongoose.model('User').findById(sender).select('role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');
  
  console.log('🔔 [NotificationModel] Sender user found:', !!senderUser);
  
  const senderName = senderUser.role === 'customer' 
    ? senderUser.customerProfile?.fullName 
    : senderUser.vendorProfile?.businessName || senderUser.vendorProfile?.ownerName || 'Vendor';

  console.log('🔔 [NotificationModel] Sender name:', senderName);

  const notificationData = {
    recipient: receiver,
    sender: sender,
    type: 'message',
    title: 'New Message',
    message: `${senderName} sent you a message`,
    data: {
      messageId: message._id,
      conversationId: message.conversationId,
      messageType: message.messageType,
      senderName: senderName,
      senderRole: senderUser.role
    },
    actionUrl: `/messages/${message.conversationId}`
  };

  console.log('🔔 [NotificationModel] Creating notification with data:', notificationData);

  const notification = await this.create(notificationData);

  console.log('🔔 [NotificationModel] Notification created successfully:', notification._id);

  return notification;
};

// Static method to get unread count for a user
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipient: userId,
    isRead: false,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

// Static method to get notifications for a user
notificationSchema.statics.getNotifications = function(userId, { page = 1, limit = 20, type = null, unreadOnly = false } = {}) {
  const query = {
    recipient: userId,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  };

  if (type) {
    query.type = type;
  }

  if (unreadOnly) {
    query.isRead = false;
  }

  return this.find(query)
    .populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to mark multiple notifications as read
notificationSchema.statics.markMultipleAsRead = function(userId, notificationIds = []) {
  const query = { recipient: userId };
  
  if (notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  } else {
    query.isRead = false; // Mark all unread as read
  }

  return this.updateMany(query, {
    isRead: true,
    readAt: new Date()
  });
};

// Static method to delete old read notifications (cleanup)
notificationSchema.statics.cleanupOldNotifications = function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
  
  return this.deleteMany({
    isRead: true,
    readAt: { $lt: cutoffDate }
  });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;