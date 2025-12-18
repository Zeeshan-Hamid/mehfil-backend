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
    return res.status(400).json({
      success: false,
      message: 'expoPushToken is required',
    });
  }

  await User.findByIdAndUpdate(
    req.user.id,
    { $addToSet: { expoPushTokens: expoPushToken } },
    { new: true }
  );

  return res.status(200).json({ success: true });
});


