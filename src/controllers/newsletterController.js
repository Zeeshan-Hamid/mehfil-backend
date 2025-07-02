const Newsletter = require('../models/Newsletter');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

// A simplified error handler
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Subscribe to newsletter
// @route   POST /api/newsletter/subscribe
// @access  Public
exports.subscribe = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation error',
      errors: errors.array()
    });
  }

  const { email, preferences } = req.body;

  // Check if already subscribed
  let subscriber = await Newsletter.findOne({ email });

  if (subscriber) {
    // If already subscribed but inactive, reactivate
    if (!subscriber.isActive) {
      subscriber.isActive = true;
      
      // Update preferences if provided
      if (preferences) {
        subscriber.subscribedTo = {
          ...subscriber.subscribedTo,
          ...preferences
        };
      }
      
      await subscriber.save();
      
      return res.status(200).json({
        status: 'success',
        message: 'Your subscription has been reactivated.',
        data: {
          email: subscriber.email,
          subscribedTo: subscriber.subscribedTo
        }
      });
    }
    
    // Already subscribed and active
    return res.status(200).json({
      status: 'success',
      message: 'You are already subscribed to our newsletter.',
      data: {
        email: subscriber.email,
        subscribedTo: subscriber.subscribedTo
      }
    });
  }

  // Create new subscription
  const newSubscriber = new Newsletter({
    email,
    subscribedTo: preferences || undefined
  });

  await newSubscriber.save();

  res.status(201).json({
    status: 'success',
    message: 'Thank you for subscribing to our newsletter!',
    data: {
      email: newSubscriber.email,
      subscribedTo: newSubscriber.subscribedTo
    }
  });
});

// @desc    Unsubscribe from newsletter
// @route   GET /api/newsletter/unsubscribe/:token
// @access  Public
exports.unsubscribe = catchAsync(async (req, res) => {
  const { token } = req.params;

  // Find subscriber by token
  const subscriber = await Newsletter.findOne({ unsubscribeToken: token }).select('+unsubscribeToken');

  if (!subscriber) {
    return res.status(404).json({
      status: 'fail',
      message: 'Invalid or expired unsubscribe link.'
    });
  }

  // Set as inactive rather than deleting
  subscriber.isActive = false;
  await subscriber.save();

  res.status(200).json({
    status: 'success',
    message: 'You have been successfully unsubscribed from our newsletter.'
  });
});

// @desc    Update newsletter preferences
// @route   PATCH /api/newsletter/preferences
// @access  Public (with email verification)
exports.updatePreferences = catchAsync(async (req, res) => {
  const { email, preferences, token } = req.body;

  if (!email || !preferences) {
    return res.status(400).json({
      status: 'fail',
      message: 'Email and preferences are required.'
    });
  }

  // Find subscriber
  const subscriber = await Newsletter.findOne({ email }).select('+unsubscribeToken');

  if (!subscriber) {
    return res.status(404).json({
      status: 'fail',
      message: 'Subscriber not found.'
    });
  }

  // Verify token if provided (for security)
  if (token && token !== subscriber.unsubscribeToken) {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid token.'
    });
  }

  // Update preferences
  subscriber.subscribedTo = {
    ...subscriber.subscribedTo,
    ...preferences
  };

  await subscriber.save();

  res.status(200).json({
    status: 'success',
    message: 'Your newsletter preferences have been updated.',
    data: {
      email: subscriber.email,
      subscribedTo: subscriber.subscribedTo
    }
  });
});

// @desc    Get unsubscribe token (for authenticated users)
// @route   GET /api/newsletter/token
// @access  Private
exports.getUnsubscribeToken = catchAsync(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({
      status: 'fail',
      message: 'Email is required.'
    });
  }

  // Only allow if user is authenticated and it's their email or admin
  if (req.user.email !== email && req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'fail',
      message: 'You do not have permission to access this token.'
    });
  }

  const subscriber = await Newsletter.findOne({ email }).select('+unsubscribeToken');

  if (!subscriber) {
    return res.status(404).json({
      status: 'fail',
      message: 'Subscriber not found.'
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      email: subscriber.email,
      token: subscriber.unsubscribeToken
    }
  });
});

// For admin use
exports.getAllSubscribers = catchAsync(async (req, res) => {
  // Only accessible by admin role (middleware check should be in routes)
  
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;
  
  // Filter by active status if specified
  const filter = {};
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;
  
  const subscribers = await Newsletter.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
    
  const total = await Newsletter.countDocuments(filter);
  
  res.status(200).json({
    status: 'success',
    data: {
      subscribers,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    }
  });
});

module.exports = {
  subscribe: exports.subscribe,
  unsubscribe: exports.unsubscribe,
  updatePreferences: exports.updatePreferences,
  getUnsubscribeToken: exports.getUnsubscribeToken,
  getAllSubscribers: exports.getAllSubscribers
}; 