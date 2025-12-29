const pino = require('pino');
const { requestContext } = require('../utils/requestContext');

const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Base logger configuration
const baseConfig = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  // Add request context to all logs with explicit field names
  mixin() {
    const context = requestContext.getContext();
    return {
      requestId: context?.requestId || null,
      userId: context?.userId || null,
    };
  },
};

let logger;

if (isDevelopment) {
  // Development: Pretty console output with colors (single line)
  const { Writable } = require('stream');
  
  // Create a writable stream that colorizes paths and writes to stdout
  const colorizedStdout = new Writable({
    write(chunk, encoding, callback) {
      let output = chunk.toString();
      // Colorize paths in single-line format: http.path="/api/path" or http.url="/api/path"
      // Escape quotes properly in regex
      output = output.replace(/(http\.(?:path|url)=")(\/[^"]+)(")/g, 
        (match, prefix, path, suffix) => `${prefix}\x1b[36m${path}\x1b[0m${suffix}`);
      process.stdout.write(output, encoding, callback);
    }
  });

  logger = pino(
    {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: true,
          hideObject: false,
          messageFormat: 'requestId={requestId} userId={userId} {msg}',
        },
        destination: colorizedStdout,
      },
    }
  );
} else {
  // Production: JSON console output (no file logging)
  logger = pino(
    baseConfig,
    pino.destination({
      sync: false,
    })
  );
}

/**
 * Get a logger instance for a specific module
 * @param {string} module - Module name (usually __filename or module path)
 * @returns {pino.Logger} - Logger instance with module context
 */
function getLogger(module = 'app') {
  // Extract module name from file path if provided
  let moduleName = module;
  if (typeof module === 'string' && module.includes('/')) {
    const parts = module.split('/');
    moduleName = parts[parts.length - 1].replace('.js', '');
  }

  return logger.child({ module: moduleName });
}

/**
 * Set request context for logging
 * This is called by the request middleware
 * @param {string} requestId - Request ID
 * @param {string|null} userId - User ID
 * @param {string} ip - Client IP
 * @param {string} userAgent - User agent
 */
function setRequestContext(requestId, userId, ip, userAgent) {
  // Context is set via AsyncLocalStorage in middleware, this is just for reference
  // The actual context is managed by requestContext.run() in the middleware
}

/**
 * Clear request context
 * This is called after request completes
 */
function clearRequestContext() {
  // Context is automatically cleared when asyncLocalStorage.run() completes
  // This is just for reference/consistency with the Python API
}

module.exports = {
  logger,
  getLogger,
  setRequestContext,
  clearRequestContext,
};
