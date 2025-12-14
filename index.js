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

// Import Cron service
const cronService = require('./src/services/cronService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL, 'https://www.mehfil.app', 'https://mehfil.app']
      : true, // Allow all origins in development
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6
});

// Initialize Socket.IO service
const socketService = new SocketService(io);
app.set('socketService', socketService);

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

// Initialize Cron service
cronService.init();


// API Routes
app.use('/api', apiRoutes);

// Share redirect routes (before welcome and 404)
const shareRedirectRoutes = require('./src/routes/shareRedirectRoutes');
app.use('/share', shareRedirectRoutes);

// Universal/App Link routes (must be at root level for deep linking)
const { handleAppLinkLanding, serveAppleAppSiteAssociation } = require('./src/controllers/shareController');
app.get('/app/event/:eventId', handleAppLinkLanding);
app.get('/app/listing/:eventId', handleAppLinkLanding); // alias
app.get('/app/vendor/event/:eventId', handleAppLinkLanding); // vendor-specific route
app.get('/app/vendor/listing/:eventId', handleAppLinkLanding); // vendor-specific route alias

// Apple App Site Association file (required for Universal Links)
app.get('/.well-known/apple-app-site-association', serveAppleAppSiteAssociation);

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
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});


// Start server - bind to 0.0.0.0 to be accessible from network
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Network access: Server is accessible on your local network`);
});

module.exports = app;
