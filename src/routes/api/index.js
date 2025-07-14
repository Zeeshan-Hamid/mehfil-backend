const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./authRoutes');
const eventRoutes = require('./eventRoutes');
const cartRoutes = require('./cartRoutes');
const searchRoutes = require('./searchRoutes');
const newsletterRoutes = require('./newsletterRoutes');
const favoriteRoutes = require('./favoriteRoutes');
const todoRoutes = require('./todoRoutes');
const bookingRoutes = require('./bookingRoutes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/cart', cartRoutes);
router.use('/search', searchRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/todos', todoRoutes);
router.use('/bookings', bookingRoutes);

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