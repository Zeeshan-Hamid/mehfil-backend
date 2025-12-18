const User = require('../models/User');

// Simple async wrapper
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// @desc    Register or update Expo push token for current user
// @route   POST /api/users/push-token
// @access  Private
exports.registerPushToken = catchAsync(async (req, res) => {
  const { expoPushToken } = req.body;

  if (!expoPushToken) {
    console.warn('[PushToken] Missing expoPushToken in request body', {
      userId: req.user && req.user.id,
    });
    return res.status(400).json({
      success: false,
      message: 'expoPushToken is required',
    });
  }

  const userId = req.user.id;

  console.log('[PushToken] Registering Expo push token', {
    userId,
    expoPushToken,
  });

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { $addToSet: { expoPushTokens: expoPushToken } },
    { new: true }
  );

  console.log('[PushToken] Updated user expoPushTokens', {
    userId,
    expoPushTokensCount: updatedUser?.expoPushTokens?.length || 0,
    expoPushTokens: updatedUser?.expoPushTokens,
  });

  return res.status(200).json({ success: true });
});


