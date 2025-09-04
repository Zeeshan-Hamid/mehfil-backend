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
  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid or expired token. Please log in again.'
    });
  }

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.userId);
  if (!currentUser) {
    return res.status(401).json({
      status: 'fail',
      message: 'Your account has been deleted. Please contact support if you believe this is an error.'
    });
  }

  // 4) Check if user is active (additional security check)
  if (currentUser.isActive === false) {
    return res.status(401).json({
      status: 'fail',
      message: 'Your account has been deactivated. Please contact support for assistance.'
    });
  }

  // 5) Check if user changed password after the token was issued
  if (currentUser.passwordChangedAt && currentUser.passwordChangedAfter(decoded.iat)) {
    return res.status(401).json({
      status: 'fail',
      message: 'User recently changed password. Please log in again.'
    });
  }

  // Grant access to protected route
  req.user = currentUser;
 
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