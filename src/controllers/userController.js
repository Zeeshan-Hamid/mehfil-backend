const User = require('../models/User');

// Simple async wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Register or update FCM push token for current user
// @route   POST /api/users/push-token
// @access  Private
exports.registerPushToken = catchAsync(async (req, res) => {
  const { fcmToken, platform } = req.body;

  if (!fcmToken) {
    console.warn('[PushToken] Missing fcmToken in request body', {
      userId: req.user && req.user.id,
    });
    return res.status(400).json({
      success: false,
      message: 'fcmToken is required',
    });
  }

  const userId = req.user.id;
  const platformType = platform || 'android'; // Default to android, can be 'ios' or 'android'

  console.log('[PushToken] Registering FCM push token', {
    userId,
    fcmToken: fcmToken.substring(0, 20) + '...',
    platform: platformType,
  });

  // Get current user to update tokens
  const user = await User.findById(userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Remove old token if it exists (to avoid duplicates)
  const updatedTokens = user.fcmTokens.filter(token => token !== fcmToken);
  updatedTokens.push(fcmToken);

  // Update platform info
  const updatedPlatforms = user.fcmTokenPlatforms || new Map();
  updatedPlatforms.set(fcmToken, platformType);

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { 
      fcmTokens: updatedTokens,
      fcmTokenPlatforms: updatedPlatforms,
    },
    { new: true }
  );

  console.log('[PushToken] Updated user FCM tokens', {
    userId,
    fcmTokensCount: updatedUser?.fcmTokens?.length || 0,
    platform: platformType,
  });

  return res.status(200).json({ 
    success: true,
    tokensCount: updatedUser?.fcmTokens?.length || 0,
  });
});


