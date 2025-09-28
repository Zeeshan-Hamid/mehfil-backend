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
      
      
      // Store user socket mapping
      this.userSockets.set(socket.userId, socket.id);
      this.socketUsers.set(socket.id, socket.userId);

      // Join user to their personal room
      socket.join(`user_${socket.userId}`);
  

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
     
        this.userSockets.delete(socket.userId);
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

     
      
      let notification = null;
      try {
        notification = await Notification.createMessageNotification({
          sender: socket.userId,
          receiver: receiverId,
          message: newMessage
        });
        
       
        
      } catch (notificationError) {
        // Error creating notification
        
      }


      this.broadcastMessage(newMessage);
      
      // Finally broadcast notification if it was created successfully
      if (notification) {
       
        this.broadcastNotification(notification);
        this.sendUnreadCountUpdate(receiverId);
      }

    } catch (error) {

      socket.emit('message_error', { message: 'Failed to send message' });
    }
  }

  broadcastMessage(message) {
    try {
      
      
      const { sender, receiver, conversationId } = message;
      const senderId = sender._id ? sender._id.toString() : sender.toString();
      const receiverId = receiver._id ? receiver._id.toString() : receiver.toString();

      

      const senderSocketId = this.userSockets.get(senderId);
      if (senderSocketId) {
          this.io.to(senderSocketId).emit('message_sent', {
              message,
              conversationId
          });
          
      } else {
          
      }

      const receiverSocketId = this.userSockets.get(receiverId);
      if (receiverSocketId) {
          this.io.to(receiverSocketId).emit('new_message', {
              message,
              conversationId
          });
          
      } else {
          
      }
      

    } catch (error) {
      // Error in broadcastMessage
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
      // Error marking messages as read
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
    
    
    
    const recipientSocketId = this.userSockets.get(recipientId);
    if (recipientSocketId) {
      this.io.to(recipientSocketId).emit('new_notification', {
        notification
      });
    
      return true;
    } else {
      
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

      

    } catch (error) {
      
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
      
      socket.emit('notification_error', { message: 'Failed to load notifications' });
    }
  }

  // Send unread count update to user
  async sendUnreadCountUpdate(userId) {
    try {
      const unreadCount = await Notification.getUnreadCount(userId);
      const sent = this.sendToUser(userId, 'unread_count_update', { unreadCount });
      
      if (sent) {
        
      }
      
      return sent;
    } catch (error) {
      
      return false;
    }
  }
}

module.exports = SocketService;
