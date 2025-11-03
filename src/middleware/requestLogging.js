const { requestContext, generateRequestId } = require('../utils/requestContext');
const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

/**
 * Request Logging Middleware
 * 
 * Automatically logs all HTTP requests with structured logging.
 * Features:
 * - Assigns unique request ID to each request
 * - Tracks request duration
 * - Logs request/response details in JSON format
 * - Adds request context for correlation across all logs
 */
function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();

  // Generate or extract request ID
  const requestId = req.headers['x-request-id'] || generateRequestId();
  
  // Extract user ID if available (will be set after auth middleware)
  let userId = null;
  if (req.user && req.user._id) {
    userId = req.user._id.toString();
  }

  // Extract client IP
  const clientIp = req.ip || 
                   req.connection?.remoteAddress || 
                   req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.socket?.remoteAddress ||
                   'unknown';

  // Extract user agent
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Create request context
  const context = {
    requestId,
    userId,
    ip: clientIp,
    userAgent,
  };

  // Run request within context
  requestContext.run(context, () => {
    // Log incoming request
    logger.info(
      {
        event: 'request_started',
        http: {
          method: req.method,
          path: req.path,
          url: req.originalUrl || req.url,
          query: req.query,
          ip: clientIp,
          userAgent,
        },
      },
      `Request started: ${req.method} ${req.path}`
    );

    // Override res.end to capture response
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
      // Calculate duration
      const durationMs = Date.now() - startTime;

      // Update userId if it was set during request (after auth)
      const currentContext = requestContext.getContext();
      if (req.user && req.user._id && currentContext) {
        if (!currentContext.userId) {
          requestContext.updateContext({ userId: req.user._id.toString() });
        }
      }

      // Get final context for logging
      const finalContext = requestContext.getContext();

      // Log response
      logger.info(
        {
          event: 'request_completed',
          http: {
            method: req.method,
            path: req.path,
            url: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100, // Round to 2 decimals
          },
        },
        `Request completed: ${req.method} ${req.path} - ${res.statusCode}`
      );

      // Add request ID to response headers (only if headers haven't been sent)
      if (!res.headersSent) {
        res.setHeader('X-Request-ID', finalContext?.requestId || requestId);
      }

      // Call original end
      originalEnd.call(this, chunk, encoding);
    };

    // Call next middleware
    next();
  });
}

module.exports = requestLoggingMiddleware;
