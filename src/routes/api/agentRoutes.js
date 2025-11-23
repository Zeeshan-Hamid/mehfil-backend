const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { vendorAgentChat } = require('../../controllers/agentController');
const { protect, restrictTo } = require('../../middleware/authMiddleware');

// Rate limiter for agent endpoints
// 10 requests per minute per user
const agentRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per window
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    keyGenerator: (req) => {
        // Use user ID for rate limiting (requires authentication)
        return req.user?._id?.toString() || req.ip;
    },
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again in a minute.',
            retryAfter: 60
        });
    },
    skip: (req) => {
        // Skip rate limiting in development if needed
        return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
    }
});

/**
 * @route   POST /api/agent/chat
 * @desc    Vendor AI agent chat endpoint with search insights and analytics
 * @access  Private (Vendor only)
 */
router.post('/chat', protect, restrictTo('vendor'), agentRateLimiter, vendorAgentChat);

module.exports = router;
