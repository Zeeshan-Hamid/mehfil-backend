const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./authRoutes');
const eventRoutes = require('./eventRoutes');
const cartRoutes = require('./cartRoutes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/cart', cartRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Mehfil API is running successfully',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

module.exports = router; 