const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const { getLogger } = require('../config/logging');
const { requestContext } = require('../utils/requestContext');

const logger = getLogger(__filename);

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
    logger.warn(
      {
        event: 'auth_failed',
        reason: 'missing_token',
        http: {
          method: req.method,
          path: req.path,
        },
      },
      'Authentication failed: No token provided'
    );
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
    logger.warn(
      {
        event: 'auth_failed',
        reason: 'invalid_token',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
        http: {
          method: req.method,
          path: req.path,
        },
      },
      'Authentication failed: Invalid or expired token'
    );
    return res.status(401).json({
      status: 'fail',
      message: 'Invalid or expired token. Please log in again.'
    });
  }

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.userId);
  if (!currentUser) {
    logger.warn(
      {
        event: 'auth_failed',
        reason: 'user_not_found',
        userId: decoded.userId,
        http: {
          method: req.method,
          path: req.path,
        },
      },
      `Authentication failed: User ${decoded.userId} not found`
    );
    return res.status(401).json({
      status: 'fail',
      message: 'Your account has been deleted. Please contact support if you believe this is an error.'
    });
  }

  // 4) Check if user is active (additional security check)
  if (currentUser.isActive === false) {
    logger.warn(
      {
        event: 'auth_failed',
        reason: 'account_inactive',
        userId: currentUser._id.toString(),
        http: {
          method: req.method,
          path: req.path,
        },
      },
      `Authentication failed: Account ${currentUser._id} is inactive`
    );
    return res.status(401).json({
      status: 'fail',
      message: 'Your account has been deactivated. Please contact support for assistance.'
    });
  }

  // 5) Check if user changed password after the token was issued
  if (currentUser.passwordChangedAt && currentUser.passwordChangedAfter(decoded.iat)) {
    logger.warn(
      {
        event: 'auth_failed',
        reason: 'password_changed',
        userId: currentUser._id.toString(),
        http: {
          method: req.method,
          path: req.path,
        },
      },
      `Authentication failed: Password changed after token issued for user ${currentUser._id}`
    );
    return res.status(401).json({
      status: 'fail',
      message: 'User recently changed password. Please log in again.'
    });
  }

  // Grant access to protected route
  req.user = currentUser;
  
  // Update request context with userId
  requestContext.updateContext({ userId: currentUser._id.toString() });
  
  logger.debug(
    {
      event: 'auth_success',
      userId: currentUser._id.toString(),
      role: currentUser.role,
      http: {
        method: req.method,
        path: req.path,
      },
    },
    `Authentication successful for user ${currentUser._id}`
  );
 
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      logger.warn(
        {
          event: 'authorization_failed',
          userId: req.user._id.toString(),
          userRole: req.user.role,
          requiredRoles: roles,
          http: {
            method: req.method,
            path: req.path,
          },
        },
        `Authorization failed: User ${req.user._id} with role ${req.user.role} does not have required roles: ${roles.join(', ')}`
      );
      return res.status(403).json({
        status: 'fail',
        message: 'You do not have permission to perform this action.'
      });
    }
    next();
  };
}; 