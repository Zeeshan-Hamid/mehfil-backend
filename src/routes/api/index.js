const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const eventRoutes = require('./eventRoutes');
const bookingRoutes = require('./bookingRoutes');
const cartRoutes = require('./cartRoutes');
const favoriteRoutes = require('./favoriteRoutes');
const searchRoutes = require('./searchRoutes');
const customPackageRoutes = require('./customPackageRoutes');
const newsletterRoutes = require('./newsletterRoutes');
const contactUsRoutes = require('./contactUsRoutes');
const todoRoutes = require('./todoRoutes');
const vendorRoutes = require('./vendorRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const messageRoutes = require('./messageRoutes');
const notificationRoutes = require('./notificationRoutes');
const publicVendorRoutes = require('./publicVendorRoutes');
const customerRoutes = require('./customerRoutes');
const userEventRoutes = require('./userEventRoutes');

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    socket: {
      enabled: true,
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    }
  });
});

router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/bookings', bookingRoutes);
router.use('/cart', cartRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/search', searchRoutes);
router.use('/custom-packages', customPackageRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/contact-us', contactUsRoutes);
router.use('/todos', todoRoutes);
router.use('/vendor', vendorRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/messages', messageRoutes);
router.use('/notifications', notificationRoutes);
router.use('/public-vendor', publicVendorRoutes);
router.use('/customer', customerRoutes);
router.use('/user-events', userEventRoutes);

module.exports = router; 