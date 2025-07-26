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

// Import utilities
const connectDB = require('./src/config/database');

// Import routes
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 8000;

// Passport config
require('./src/config/passport')(passport);

// Connect to MongoDB
connectDB();

// Middleware
app.use(passport.initialize());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

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
app.listen(PORT, () => {
  console.log(`App server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`API Health Check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
