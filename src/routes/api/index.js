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
const chatbotRoutes = require('./chatbotRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const adminRoutes = require('./adminRoutes');
const paymentRoutes = require('./paymentRoutes');
const taxRoutes = require('./taxRoutes');
const blogRoutes = require('./blogRoutes');
const marketplaceRoutes = require('./marketplaceRoutes');

const shareRoutes = require('./shareRoutes');
const userRoutes = require('./userRoutes');
const testRoutes = require('./testRoutes');
const menuChatbotRoutes = require('./menuChatbotRoutes');
const sonioxRoutes = require('./sonioxRoutes');
const aiConsultantRoutes = require('./aiConsultantRoutes');
const demoRequestRoutes = require('./demoRequestRoutes');
const agentRoutes = require('./agentRoutes');
const leadGenerationRoutes = require('./leadGenerationRoutes');
const rateLimit = require('express-rate-limit');

// Rate limiter for AI endpoints - max 12 requests per minute per IP
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 12, // Limit each IP to 12 requests per windowMs
  message: {
    status: 429,
    message: 'Too many AI requests, please try again after a minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
});


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
router.use('/chatbot', aiRateLimiter, chatbotRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/tax', taxRoutes);
router.use('/blogs', blogRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/', shareRoutes);
router.use('/users', userRoutes);
router.use('/test', testRoutes);
router.use('/menu-chatbot', aiRateLimiter, menuChatbotRoutes);
router.use('/soniox', sonioxRoutes);
router.use('/ai-consultant', aiRateLimiter, aiConsultantRoutes);
router.use('/demo-request', demoRequestRoutes);
router.use('/agent', aiRateLimiter, agentRoutes);
router.use('/lead-generation', aiRateLimiter, leadGenerationRoutes);


module.exports = router; 