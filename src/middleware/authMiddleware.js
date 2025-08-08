const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');

// A simplified error handler for this middleware
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get token and check if it exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      status: 'fail',
      message: 'You are not logged in. Please log in to get access.'
    });
  }

  // 2) Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.userId);
  if (!currentUser) {
    return res.status(401).json({
      status: 'fail',
      message: 'The user belonging to this token no longer exists.'
    });
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.passwordChangedAt && currentUser.passwordChangedAfter(decoded.iat)) {
    return res.status(401).json({
      status: 'fail',
      message: 'User recently changed password. Please log in again.'
    });
  }

  // Grant access to protected route
  req.user = currentUser;
  console.log('Auth middleware - User set:', {
    userId: currentUser._id.toString(),
    userRole: currentUser.role,
    userEmail: currentUser.email
  });
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action.'
      });
    }
    next();
  };
}; 