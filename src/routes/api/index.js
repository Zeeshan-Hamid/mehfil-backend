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

module.exports = router; 