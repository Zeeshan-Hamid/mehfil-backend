const { getLogger } = require('../config/logging');
const { requestContext } = require('../utils/requestContext');

const logger = getLogger(__filename);

/**
 * Performance Logging Middleware
 * 
 * Logs warnings for slow requests to help identify performance issues.
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.slowRequestThresholdMs - Threshold in milliseconds (default: 1000)
 */
function performanceLoggingMiddleware(options = {}) {
  const slowRequestThresholdMs = options.slowRequestThresholdMs || 1000;

  return (req, res, next) => {
    const startTime = Date.now();

    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
      const durationMs = Date.now() - startTime;
      const context = requestContext.getContext();

      if (durationMs > slowRequestThresholdMs) {
        const exceededBy = durationMs - slowRequestThresholdMs;

        logger.warn(
          {
            event: 'slow_request',
            http: {
              method: req.method,
              path: req.path,
              url: req.originalUrl || req.url,
              statusCode: res.statusCode,
              durationMs: Math.round(durationMs * 100) / 100,
            },
            performance: {
              thresholdMs: slowRequestThresholdMs,
              exceededByMs: Math.round(exceededBy * 100) / 100,
            },
          },
          `Slow request detected: ${req.method} ${req.path} - ${durationMs}ms`
        );
      }

      // Call original end
      originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

module.exports = performanceLoggingMiddleware;
