const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');

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

      this.broadcastMessage(newMessage);

    } catch (error) {
      console.error('❌ [SocketService] Error handling send message:', error);
      socket.emit('message_error', { message: 'Failed to send message' });
    }
  }

  broadcastMessage(message) {
    const { sender, receiver, conversationId } = message;
    const senderId = sender._id.toString();
    const receiverId = receiver.toString();

    const senderSocketId = this.userSockets.get(senderId);
    if (senderSocketId) {
        this.io.to(senderSocketId).emit('message_sent', {
            message,
            conversationId
        });
        console.log('📨 [SocketService] Sent confirmation to sender:', senderId);
    }

    const receiverSocketId = this.userSockets.get(receiverId);
    if (receiverSocketId) {
        this.io.to(receiverSocketId).emit('new_message', {
            message,
            conversationId
        });
        console.log('📨 [SocketService] Sent new message to receiver:', receiverId);
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
}

module.exports = SocketService;
