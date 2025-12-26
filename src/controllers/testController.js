const User = require('../models/User');
const { sendFCMPushNotification } = require('../services/pushService');

// Simple async wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Test push notification endpoint
// @route   POST /api/test/push-notification
// @access  Private (or Public for testing - adjust as needed)
exports.testPushNotification = catchAsync(async (req, res) => {
  const { userId, title, message, data } = req.body;

  // Validate required fields
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'userId is required',
    });
  }

  if (!title || !message) {
    return res.status(400).json({
      success: false,
      message: 'title and message are required',
    });
  }

  console.log('🧪 [TEST PUSH] Testing push notification', {
    userId,
    title,
    message,
  });

  try {
    // Get user and their FCM tokens
    const user = await User.findById(userId).select('fcmTokens fcmTokenPlatforms email');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.fcmTokens || user.fcmTokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User has no FCM tokens registered',
        userId,
        userEmail: user.email,
        fcmTokensCount: 0,
      });
    }

    console.log('📱 [TEST PUSH] User FCM tokens found', {
      userId,
      fcmTokensCount: user.fcmTokens.length,
      tokens: user.fcmTokens.map(t => t.substring(0, 20) + '...'),
    });

    // Prepare push notification payload
    const payload = {
      title: title || 'Test Notification',
      message: message || 'This is a test push notification',
      data: {
        type: 'test',
        testNotification: true,
        timestamp: new Date().toISOString(),
        ...(data || {}),
      },
    };

    // Send push notification
    console.log('📤 [TEST PUSH] Sending test push notification', {
      userId,
      title: payload.title,
      message: payload.message,
      fcmTokensCount: user.fcmTokens.length,
    });

    const result = await sendFCMPushNotification(user.fcmTokens, payload);

    console.log('✅ [TEST PUSH] Test push notification sent', {
      userId,
      successCount: result?.successCount || 0,
      failureCount: result?.failureCount || 0,
    });

    // Return result
    return res.status(200).json({
      success: true,
      message: 'Test push notification sent',
      data: {
        userId,
        userEmail: user.email,
        fcmTokensCount: user.fcmTokens.length,
        result: {
          successCount: result?.successCount || 0,
          failureCount: result?.failureCount || 0,
          failedTokens: result?.failedTokens || [],
        },
      },
    });
  } catch (error) {
    console.error('❌ [TEST PUSH] Error sending test push notification', {
      userId,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to send test push notification',
      error: error.message,
    });
  }
});

// @desc    Get user FCM tokens (for debugging)
// @route   GET /api/test/user-tokens/:userId
// @access  Private
exports.getUserTokens = catchAsync(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'userId is required',
    });
  }

  const user = await User.findById(userId).select('fcmTokens fcmTokenPlatforms email role');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      userId: user._id,
      email: user.email,
      role: user.role,
      fcmTokensCount: user.fcmTokens?.length || 0,
      fcmTokens: user.fcmTokens || [],
      fcmTokenPlatforms: user.fcmTokenPlatforms || {},
    },
  });
});

