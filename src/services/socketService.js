const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');

class SocketService {
  constructor(io) {
    this.io = io;
    // Support multiple sockets per user (multiple devices/tabs)
    this.userSockets = new Map(); // userId -> Set<socketId>
    this.socketUsers = new Map(); // socketId -> userId
    
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check for both possible field names (userId from auth, id from some tokens)
        const userId = decoded.userId || decoded.id;
        if (!userId) {
          return next(new Error('Invalid token format'));
        }
        
        const user = await User.findById(userId).select('_id role');
        
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user._id.toString();
        socket.userRole = user.role;
        
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 User ${socket.userId} connected with socket ${socket.id}`);
      
      // Add socket to user's set of sockets (support multiple devices/tabs)
      if (!this.userSockets.has(socket.userId)) {
        this.userSockets.set(socket.userId, new Set());
      }
      this.userSockets.get(socket.userId).add(socket.id);
      this.socketUsers.set(socket.id, socket.userId);

      // Join user to their personal room (used for broadcasting to all user's devices)
      socket.join(`user_${socket.userId}`);
      
      console.log(`📊 User ${socket.userId} now has ${this.userSockets.get(socket.userId).size} active connection(s)`);

      // Handle private message
      socket.on('send_message', async (data) => {
        await this.handleSendMessage(socket, data);
      });

      // Handle typing events
      socket.on('typing_start', (data) => {
        this.handleTypingStart(socket, data);
      });

      socket.on('typing_stop', (data) => {
        this.handleTypingStop(socket, data);
      });

      // Handle read receipts
      socket.on('mark_read', async (data) => {
        await this.handleMarkAsRead(socket, data);
      });

      // Handle notification events
      socket.on('mark_notification_read', async (data) => {
        await this.handleMarkNotificationAsRead(socket, data);
      });

      socket.on('get_notifications', async (data) => {
        await this.handleGetNotifications(socket, data);
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`🔌 User ${socket.userId} disconnected (${reason}), socket: ${socket.id}`);
        
        // Remove only this socket from user's set
        const userSocketSet = this.userSockets.get(socket.userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          // Clean up if no more sockets for this user
          if (userSocketSet.size === 0) {
            this.userSockets.delete(socket.userId);
            console.log(`👋 User ${socket.userId} has no more active connections`);
          } else {
            console.log(`📊 User ${socket.userId} still has ${userSocketSet.size} active connection(s)`);
          }
        }
        this.socketUsers.delete(socket.id);
      });
    });
  }

  async handleSendMessage(socket, data) {
    try {
      const { receiverId, eventId, content, messageType = 'text' } = data;
      
      if (!receiverId || !content) {
        socket.emit('message_error', { message: 'Missing required fields' });
        return;
      }

      // Create message in database
      const conversationId = Message.generateConversationId(socket.userId, receiverId, eventId);
      
      const messageData = {
        conversationId,
        sender: socket.userId,
        receiver: receiverId,
        content,
        messageType
      };

      // Attach structured custom data when sending custom messages
      if (messageType === 'custom') {
        try {
          const parsed = typeof content === 'string' ? JSON.parse(content) : content;
          if (parsed && typeof parsed === 'object') {
            messageData.customData = parsed;
          }
        } catch (_) {
          // ignore JSON parse errors, content stays as-is
        }
      }

      // Add eventId only if provided (for backward compatibility)
      if (eventId) {
        messageData.eventId = eventId;
      }

      const newMessage = await Message.create(messageData);

      // Populate sender details
      await newMessage.populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');
      
      // If message has customData, ensure content stores the same JSON so older clients can parse
      if (messageData.customData && typeof messageData.customData === 'object') {
        try {
          newMessage.content = JSON.stringify(messageData.customData);
        } catch (_) {}
      }

      // Get sender and receiver roles for logging
      const senderUser = await mongoose.model('User').findById(socket.userId).select('role');
      const receiverUser = await mongoose.model('User').findById(receiverId).select('role');
      const messageDirection = `${senderUser?.role || 'unknown'} → ${receiverUser?.role || 'unknown'}`;
      
      console.log('🔔 [NOTIFICATION TRIGGER] Creating message notification via Socket.IO', {
        senderId: socket.userId,
        senderRole: senderUser?.role,
        receiverId,
        receiverRole: receiverUser?.role,
        direction: messageDirection,
        messageId: newMessage._id,
        conversationId: newMessage.conversationId
      });
      
      let notification = null;
      try {
        notification = await Notification.createMessageNotification({
          sender: socket.userId,
          receiver: receiverId,
          message: newMessage
        });
        
        console.log('✅ [NOTIFICATION TRIGGER] Message notification created successfully via Socket.IO', {
          notificationId: notification._id,
          recipientId: notification.recipient
        });
        
      } catch (notificationError) {
        // Error creating notification
        console.error('❌ [NOTIFICATION TRIGGER] Failed to create message notification via Socket.IO', {
          senderId: socket.userId,
          receiverId,
          messageId: newMessage._id,
          error: notificationError.message,
          stack: notificationError.stack
        });
      }

      this.broadcastMessage(newMessage);
      
      // Finally broadcast notification if it was created successfully
      if (notification) {
        console.log('📡 [NOTIFICATION TRIGGER] Broadcasting notification via Socket.IO', {
          notificationId: notification._id
        });
        this.broadcastNotification(notification);
        this.sendUnreadCountUpdate(receiverId);
      }

    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      socket.emit('message_error', { message: 'Failed to send message' });
    }
  }

  // Use rooms to broadcast to ALL user's devices/tabs
  broadcastMessage(message) {
    try {
      const { sender, receiver, conversationId } = message;
      const senderId = sender._id ? sender._id.toString() : sender.toString();
      const receiverId = receiver._id ? receiver._id.toString() : receiver.toString();

      // Broadcast to ALL sender's devices/tabs using room
      this.io.to(`user_${senderId}`).emit('message_sent', {
        message,
        conversationId
      });
      console.log(`📤 Broadcasted message_sent to room user_${senderId}`);

      // Broadcast to ALL receiver's devices/tabs using room
      this.io.to(`user_${receiverId}`).emit('new_message', {
        message,
        conversationId
      });
      console.log(`📨 Broadcasted new_message to room user_${receiverId}`);

    } catch (error) {
      console.error('Error in broadcastMessage:', error);
    }
  }

  // Use rooms for typing indicators
  handleTypingStart(socket, data) {
    const { receiverId, eventId } = data;
    this.io.to(`user_${receiverId}`).emit('user_typing', {
      userId: socket.userId,
      eventId: eventId || null
    });
  }

  handleTypingStop(socket, data) {
    const { receiverId, eventId } = data;
    this.io.to(`user_${receiverId}`).emit('user_stopped_typing', {
      userId: socket.userId,
      eventId: eventId || null
    });
  }

  async handleMarkAsRead(socket, data) {
    try {
      const { conversationId } = data;
      
      const result = await Message.updateMany(
        {
          conversationId,
          receiver: socket.userId,
          isRead: false
        },
        {
          isRead: true,
          readAt: new Date()
        }
      );

      // Notify sender that messages were read (using rooms for all devices)
      const messages = await Message.find({
        conversationId,
        receiver: socket.userId,
        isRead: true
      }).select('sender');

      const senderIds = [...new Set(messages.map(m => m.sender.toString()))];
      
      senderIds.forEach(senderId => {
        this.io.to(`user_${senderId}`).emit('messages_read', {
          conversationId,
          readBy: socket.userId
        });
      });

    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  }

  // Utility method to send message to specific user (all their devices)
  sendToUser(userId, event, data) {
    this.io.to(`user_${userId}`).emit(event, data);
    return this.isUserOnline(userId);
  }

  // Utility method to check if user is online (has any connected sockets)
  isUserOnline(userId) {
    const sockets = this.userSockets.get(userId);
    return sockets && sockets.size > 0;
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.userSockets.size;
  }

  // Broadcast notification to user (all their devices)
  broadcastNotification(notification) {
    const recipientId = notification.recipient._id 
      ? notification.recipient._id.toString() 
      : notification.recipient.toString();
    
    this.io.to(`user_${recipientId}`).emit('new_notification', {
      notification
    });
    
    console.log(`🔔 Broadcasted notification to room user_${recipientId}`);
    return this.isUserOnline(recipientId);
  }

  // Handle marking notification as read via socket
  async handleMarkNotificationAsRead(socket, data) {
    try {
      const { notificationId } = data;
      
      if (!notificationId) {
        socket.emit('notification_error', { message: 'Missing notification ID' });
        return;
      }

      const notification = await Notification.findOne({
        _id: notificationId,
        recipient: socket.userId
      });

      if (!notification) {
        socket.emit('notification_error', { message: 'Notification not found' });
        return;
      }

      if (!notification.isRead) {
        await notification.markAsRead();
      }

      // Send updated unread count to all user's devices
      const unreadCount = await Notification.getUnreadCount(socket.userId);
      
      this.io.to(`user_${socket.userId}`).emit('notification_read_success', {
        notificationId,
        unreadCount
      });

    } catch (error) {
      console.error('Error marking notification as read:', error);
      socket.emit('notification_error', { message: 'Failed to mark notification as read' });
    }
  }

  // Handle getting notifications via socket
  async handleGetNotifications(socket, data) {
    try {
      const { page = 1, limit = 20, type, unreadOnly = false } = data || {};
      
      const notifications = await Notification.getNotifications(socket.userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        type,
        unreadOnly
      });

      const unreadCount = await Notification.getUnreadCount(socket.userId);

      socket.emit('notifications_loaded', {
        notifications,
        unreadCount,
        page: parseInt(page),
        hasMore: notifications.length === parseInt(limit)
      });

    } catch (error) {
      console.error('Error loading notifications:', error);
      socket.emit('notification_error', { message: 'Failed to load notifications' });
    }
  }

  // Send unread count update to user (all their devices)
  async sendUnreadCountUpdate(userId) {
    try {
      const unreadCount = await Notification.getUnreadCount(userId);
      this.io.to(`user_${userId}`).emit('unread_count_update', { unreadCount });
      
      if (this.isUserOnline(userId)) {
        console.log(`📊 Sent unread count update to user ${userId}: ${unreadCount}`);
      }
      
      return this.isUserOnline(userId);
    } catch (error) {
      console.error('Error sending unread count update:', error);
      return false;
    }
  }
}

module.exports = SocketService;
