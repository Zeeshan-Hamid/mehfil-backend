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

// Import logging
const { getLogger } = require('./src/config/logging');
const requestLoggingMiddleware = require('./src/middleware/requestLogging');
const performanceLoggingMiddleware = require('./src/middleware/performanceLogging');

const logger = getLogger(__filename);

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

// Request logging middleware (must be after body parsers, before other middleware)
app.use(requestLoggingMiddleware);

// Performance logging middleware
app.use(performanceLoggingMiddleware({ slowRequestThresholdMs: 1000 }));

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
  const { getLogger } = require('./src/config/logging');
  const errorLogger = getLogger(__filename);

  errorLogger.error(
    {
      event: 'unhandled_error',
      error: {
        type: error?.constructor?.name || 'Error',
        message: error?.message || 'Internal server error',
        stack: error?.stack,
      },
      http: {
        method: req.method,
        path: req.path,
        url: req.originalUrl || req.url,
      },
    },
    `Unhandled error: ${error?.message || 'Unknown error'}`
  );

  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});


// Start server
server.listen(PORT, () => {
  logger.info(
    {
      event: 'server_started',
      server: {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
      },
    },
    `Server running on port ${PORT}`
  );
  logger.info(
    {
      event: 'server_environment',
      environment: process.env.NODE_ENV || 'development',
    },
    `Environment: ${process.env.NODE_ENV || 'development'}`
  );
});

module.exports = app;
