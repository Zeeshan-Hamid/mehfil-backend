const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'document'],
    default: 'text'
  },
  originalFileName: {
    type: String,
    trim: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: false // Made optional since we're removing event dependency
  }
}, {
  timestamps: true
});

// Index for efficient querying
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ isRead: 1 });

// Virtual for conversation participants
messageSchema.virtual('participants', {
  ref: 'User',
  localField: 'sender',
  foreignField: '_id',
  justOne: true
});

// Method to mark message as read
messageSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to get conversation between two users (vendor-based, not event-based)
messageSchema.statics.getConversation = function(user1Id, user2Id, eventId = null) {
  const conversationId = this.generateConversationId(user1Id, user2Id, eventId);
  return this.find({ conversationId })
    .populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName')
    .sort({ createdAt: 1 });
};

// Static method to generate conversation ID (now vendor-based instead of event-based)
messageSchema.statics.generateConversationId = function(user1Id, user2Id, eventId = null) {
  const sortedIds = [user1Id.toString(), user2Id.toString()].sort();
  // If eventId is provided (for backward compatibility), use it, otherwise use vendor-only format
  if (eventId) {
    return `${sortedIds[0]}_${sortedIds[1]}_${eventId.toString()}`;
  }
  return `${sortedIds[0]}_${sortedIds[1]}`;
};

// Static method to get unread count for a user
messageSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    receiver: userId,
    isRead: false
  });
};

// Static method to get conversations for a user (updated to handle vendor-based conversations)
messageSchema.statics.getConversations = function(userId) {
  const userIdObj = new mongoose.Types.ObjectId(userId);
  
  return this.aggregate([
    {
      $match: {
        $or: [
          { sender: userIdObj },
          { receiver: userIdObj }
        ]
      }
    },
    {
      $addFields: {
        otherUser: {
          $cond: {
            if: { $eq: ['$sender', userIdObj] },
            then: '$receiver',
            else: '$sender'
          }
        }
      }
    },
    {
      $group: {
        _id: '$conversationId',
        lastMessage: { $last: '$$ROOT' },
        eventId: { $first: '$eventId' }, // May be null for vendor-only conversations
        otherUser: { $first: '$otherUser' }
      }
    },
    {
      $sort: { 'lastMessage.createdAt': -1 }
    }
  ]);
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 