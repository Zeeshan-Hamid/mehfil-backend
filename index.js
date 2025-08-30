require('dotenv').config();

// Validate essential environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_KEY',
  'AWS_REGION',
  'S3_BUCKET_NAME',
  'EMAIL_USER',
  'EMAIL_PASSWORD'
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is missing.`);
  }
}

// Set default value for FRONTEND_URL if not provided
if (!process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL = 'http://localhost:3000';
  console.log(`FRONTEND_URL not set, using default: ${process.env.FRONTEND_URL}`);
}

const express = require('express');
const cors = require('cors');
const passport = require('passport');
const http = require('http');
const socketIo = require('socket.io');

// Import utilities
const connectDB = require('./src/config/database');

// Import routes
const apiRoutes = require('./src/routes/api');

// Import Socket.IO service
const SocketService = require('./src/services/socketService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true, // Allow all origins
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Add connection logging
io.on('connection', (socket) => {
 
  
  socket.on('disconnect', (reason) => {

  });
  
  socket.on('error', (error) => {

  });
});

const PORT = process.env.PORT || 8000;

// Passport config
require('./src/config/passport')(passport);

// Connect to MongoDB
connectDB();

// Middleware
app.use(passport.initialize());
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// Stripe webhook needs raw body. Mount the webhook handler before JSON parsing.
const { handleStripeWebhook } = require('./src/controllers/paymentController');
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Regular parsers for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Initialize Socket.IO service
const socketService = new SocketService(io);
app.set('socketService', socketService);


// API Routes
app.use('/api', apiRoutes);

// Welcome route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Mehfil API - Event Planning Platform for Muslim & Desi Communities',
    version: '1.0.0',
    documentation: '/api/health'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});


// Start server
server.listen(PORT, () => {
  console.log(`App server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`API Health Check: http://localhost:${PORT}/api/health`);
  console.log(`Socket.IO initialized`);
});

module.exports = app;
