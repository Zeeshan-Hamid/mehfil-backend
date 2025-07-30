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
    enum: ['text', 'image', 'file'],
    default: 'text'
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
    required: true
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

// Static method to get conversation between two users for a specific event
messageSchema.statics.getConversation = function(user1Id, user2Id, eventId) {
  const conversationId = this.generateConversationId(user1Id, user2Id, eventId);
  return this.find({ conversationId })
    .populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName')
    .sort({ createdAt: 1 });
};

// Static method to generate conversation ID
messageSchema.statics.generateConversationId = function(user1Id, user2Id, eventId) {
  const sortedIds = [user1Id.toString(), user2Id.toString()].sort();
  return `${sortedIds[0]}_${sortedIds[1]}_${eventId.toString()}`;
};

// Static method to get unread count for a user
messageSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    receiver: userId,
    isRead: false
  });
};

// Static method to get conversations for a user
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
        eventId: { $first: '$eventId' },
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