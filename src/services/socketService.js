const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Notification = require('../models/Notification');

class SocketService {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map(); // userId -> socketId
    this.socketUsers = new Map(); // socketId -> userId
    
    this.setupMiddleware();
    this.setupEventHandlers();
  }

  setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        console.log('🔍 [SocketService] Middleware: Checking authentication...');
        const token = socket.handshake.auth.token;
        if (!token) {
          console.log('❌ [SocketService] Middleware: No token provided');
          return next(new Error('Authentication error'));
        }

        console.log('🔍 [SocketService] Middleware: Token provided, verifying...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('🔍 [SocketService] Middleware: Token decoded:', decoded);
        
        // Check for both possible field names (userId from auth, id from some tokens)
        const userId = decoded.userId || decoded.id;
        if (!userId) {
          console.log('❌ [SocketService] Middleware: No user ID found in token');
          return next(new Error('Invalid token format'));
        }
        
        console.log('🔍 [SocketService] Middleware: User ID from token:', userId);
        const user = await User.findById(userId).select('_id role');
        
        if (!user) {
          console.log('❌ [SocketService] Middleware: User not found:', userId);
          return next(new Error('User not found'));
        }

        socket.userId = user._id.toString();
        socket.userRole = user.role;
        console.log('✅ [SocketService] Middleware: User authenticated:', socket.userId, socket.userRole);
        next();
      } catch (error) {
        console.error('❌ [SocketService] Middleware: Authentication error:', error.message);
        next(new Error('Authentication error'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('🔌 [SocketService] User connected:', socket.userId);
      console.log('🔌 [SocketService] Socket ID:', socket.id);
      console.log('🔌 [SocketService] User role:', socket.userRole);
      console.log('🔌 [SocketService] Total connected users:', this.userSockets.size + 1);
      
      // Store user socket mapping
      this.userSockets.set(socket.userId, socket.id);
      this.socketUsers.set(socket.id, socket.userId);

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);
      console.log('🔌 [SocketService] User joined room: user_' + socket.userId);

      // Handle private message
      socket.on('send_message', async (data) => {
        console.log('📤 [SocketService] Received message:', data);
        await this.handleSendMessage(socket, data);
      });

      // Handle typing events
      socket.on('typing_start', (data) => {
        console.log('⌨️ [SocketService] User typing:', socket.userId);
        this.handleTypingStart(socket, data);
      });

      socket.on('typing_stop', (data) => {
        console.log('⏹️ [SocketService] User stopped typing:', socket.userId);
        this.handleTypingStop(socket, data);
      });

      // Handle read receipts
      socket.on('mark_read', async (data) => {
        console.log('👁️ [SocketService] Marking messages as read:', data);
        await this.handleMarkAsRead(socket, data);
      });

      // Handle notification events
      socket.on('mark_notification_read', async (data) => {
        console.log('🔔 [SocketService] Marking notification as read:', data);
        await this.handleMarkNotificationAsRead(socket, data);
      });

      socket.on('get_notifications', async (data) => {
        console.log('🔔 [SocketService] Getting notifications for user:', socket.userId);
        await this.handleGetNotifications(socket, data);
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log('🔌 [SocketService] User disconnected:', socket.userId);
        console.log('🔌 [SocketService] Disconnect reason:', reason);
        console.log('🔌 [SocketService] Remaining connected users:', this.userSockets.size - 1);
        this.userSockets.delete(socket.userId);
        this.socketUsers.delete(socket.id);
      });
    });
  }

  async handleSendMessage(socket, data) {
    try {
      const { receiverId, eventId, content, messageType = 'text' } = data;
      
      if (!receiverId || !content) {
        console.log('❌ [SocketService] Missing required fields for message');
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

      // Add eventId only if provided (for backward compatibility)
      if (eventId) {
        messageData.eventId = eventId;
      }

      const newMessage = await Message.create(messageData);

      // Populate sender details
      await newMessage.populate('sender', 'role customerProfile.fullName vendorProfile.businessName vendorProfile.ownerName');

      console.log('✅ [SocketService] Message saved to database:', newMessage._id);

      // Create notification for the receiver FIRST
      console.log('🔔 [SocketService] Attempting to create notification for receiver:', receiverId);
      
      let notification = null;
      try {
        notification = await Notification.createMessageNotification({
          sender: socket.userId,
          receiver: receiverId,
          message: newMessage
        });
        
        console.log('🔔 [SocketService] Notification created successfully:', notification._id);
        console.log('🔔 [SocketService] Notification details:', {
          recipient: notification.recipient,
          sender: notification.sender,
          title: notification.title,
          message: notification.message
        });
        
      } catch (notificationError) {
        console.error('❌ [SocketService] Error creating notification:', notificationError);
        console.error('❌ [SocketService] Error stack:', notificationError.stack);
      }

      // Then broadcast the message
      console.log('📤 [SocketService] Broadcasting message...');
      this.broadcastMessage(newMessage);
      
      // Finally broadcast notification if it was created successfully
      if (notification) {
        console.log('🔔 [SocketService] Broadcasting notification...');
        this.broadcastNotification(notification);
        this.sendUnreadCountUpdate(receiverId);
      }

    } catch (error) {
      console.error('❌ [SocketService] Error handling send message:', error);
      socket.emit('message_error', { message: 'Failed to send message' });
    }
  }

  broadcastMessage(message) {
    try {
      console.log('📤 [SocketService] Broadcasting message with data:', {
        messageId: message._id,
        sender: message.sender,
        receiver: message.receiver,
        conversationId: message.conversationId
      });
      
      const { sender, receiver, conversationId } = message;
      const senderId = sender._id ? sender._id.toString() : sender.toString();
      const receiverId = receiver._id ? receiver._id.toString() : receiver.toString();

      console.log('📤 [SocketService] Extracted IDs:', { senderId, receiverId });

      const senderSocketId = this.userSockets.get(senderId);
      if (senderSocketId) {
          this.io.to(senderSocketId).emit('message_sent', {
              message,
              conversationId
          });
          console.log('📨 [SocketService] Sent confirmation to sender:', senderId);
      } else {
          console.log('⚠️ [SocketService] Sender not online:', senderId);
      }

      const receiverSocketId = this.userSockets.get(receiverId);
      if (receiverSocketId) {
          this.io.to(receiverSocketId).emit('new_message', {
              message,
              conversationId
          });
          console.log('📨 [SocketService] Sent new message to receiver:', receiverId);
      } else {
          console.log('⚠️ [SocketService] Receiver not online:', receiverId);
      }
      
      console.log('✅ [SocketService] Message broadcast completed');
    } catch (error) {
      console.error('❌ [SocketService] Error in broadcastMessage:', error);
      console.error('❌ [SocketService] Error stack:', error.stack);
    }
  }

  handleTypingStart(socket, data) {
    const { receiverId, eventId } = data;
    const receiverSocketId = this.userSockets.get(receiverId);
    
    if (receiverSocketId) {
      this.io.to(receiverSocketId).emit('user_typing', {
        userId: socket.userId,
        eventId: eventId || null // Allow null eventId for vendor-only conversations
      });
    }
  }

  handleTypingStop(socket, data) {
    const { receiverId, eventId } = data;
    const receiverSocketId = this.userSockets.get(receiverId);
    
    if (receiverSocketId) {
      this.io.to(receiverSocketId).emit('user_stopped_typing', {
        userId: socket.userId,
        eventId: eventId || null // Allow null eventId for vendor-only conversations
      });
    }
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

      console.log('✅ [SocketService] Marked messages as read:', result.modifiedCount);

      // Notify sender that messages were read
      const messages = await Message.find({
        conversationId,
        receiver: socket.userId,
        isRead: true
      }).select('sender');

      const senderIds = [...new Set(messages.map(m => m.sender.toString()))];
      
      senderIds.forEach(senderId => {
        const senderSocketId = this.userSockets.get(senderId);
        if (senderSocketId) {
          this.io.to(senderSocketId).emit('messages_read', {
            conversationId,
            readBy: socket.userId
          });
        }
      });

    } catch (error) {
      console.error('❌ [SocketService] Error marking messages as read:', error);
    }
  }

  // Utility method to send message to specific user
  sendToUser(userId, event, data) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  // Utility method to check if user is online
  isUserOnline(userId) {
    return this.userSockets.has(userId);
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.userSockets.size;
  }

  // Broadcast notification to user
  broadcastNotification(notification) {
    const recipientId = notification.recipient._id 
      ? notification.recipient._id.toString() 
      : notification.recipient.toString();
    
    console.log('🔔 [SocketService] Broadcasting notification to user:', recipientId);
    
    const recipientSocketId = this.userSockets.get(recipientId);
    if (recipientSocketId) {
      this.io.to(recipientSocketId).emit('new_notification', {
        notification
      });
      console.log('✅ [SocketService] Notification sent to user:', recipientId);
      return true;
    } else {
      console.log('⚠️ [SocketService] User not online for notification:', recipientId);
      return false;
    }
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

      // Send updated unread count
      const unreadCount = await Notification.getUnreadCount(socket.userId);
      
      socket.emit('notification_read_success', {
        notificationId,
        unreadCount
      });

      console.log('✅ [SocketService] Notification marked as read via socket:', notificationId);

    } catch (error) {
      console.error('❌ [SocketService] Error marking notification as read:', error);
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

      console.log('✅ [SocketService] Notifications sent via socket:', notifications.length);

    } catch (error) {
      console.error('❌ [SocketService] Error getting notifications via socket:', error);
      socket.emit('notification_error', { message: 'Failed to load notifications' });
    }
  }

  // Send unread count update to user
  async sendUnreadCountUpdate(userId) {
    try {
      const unreadCount = await Notification.getUnreadCount(userId);
      const sent = this.sendToUser(userId, 'unread_count_update', { unreadCount });
      
      if (sent) {
        console.log('📊 [SocketService] Sent unread count update to user:', userId, 'Count:', unreadCount);
      }
      
      return sent;
    } catch (error) {
      console.error('❌ [SocketService] Error sending unread count update:', error);
      return false;
    }
  }
}

module.exports = SocketService;
