const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

/**
 * Request Context Manager using AsyncLocalStorage
 * 
 * Stores request-scoped data (requestId, userId, ip, userAgent) that persists
 * across async operations, allowing correlation of logs within a single request.
 */
class RequestContext {
  constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage();
  }

  /**
   * Run a function with request context
   * @param {Object} context - Request context object
   * @param {string} context.requestId - Unique request ID
   * @param {string|null} context.userId - User ID if authenticated
   * @param {string} context.ip - Client IP address
   * @param {string} context.userAgent - User agent string
   * @param {Function} fn - Function to run within context
   * @returns {*} - Return value of fn
   */
  run(context, fn) {
    return this.asyncLocalStorage.run(context, fn);
  }

  /**
   * Get the current request context
   * @returns {Object|null} - Current context or null if not in a request
   */
  getContext() {
    const store = this.asyncLocalStorage.getStore();
    return store || null;
  }

  /**
   * Get request ID from current context
   * @returns {string|null} - Request ID or null
   */
  getRequestId() {
    const context = this.getContext();
    return context?.requestId || null;
  }

  /**
   * Get user ID from current context
   * @returns {string|null} - User ID or null
   */
  getUserId() {
    const context = this.getContext();
    return context?.userId || null;
  }

  /**
   * Get IP address from current context
   * @returns {string|null} - IP address or null
   */
  getIp() {
    const context = this.getContext();
    return context?.ip || null;
  }

  /**
   * Get user agent from current context
   * @returns {string|null} - User agent or null
   */
  getUserAgent() {
    const context = this.getContext();
    return context?.userAgent || null;
  }

  /**
   * Update context with new values (useful for updating userId after auth)
   * @param {Object} updates - Partial context updates
   */
  updateContext(updates) {
    const context = this.getContext();
    if (context) {
      Object.assign(context, updates);
    }
  }
}

// Singleton instance
const requestContext = new RequestContext();

/**
 * Generate a UUID v4
 * @returns {string} - UUID string
 */
function generateRequestId() {
  // Use crypto.randomUUID() if available (Node 14.17.0+), otherwise fallback
  try {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (e) {
    // Fall through to fallback
  }
  
  // Fallback: generate a simple UUID-like string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  requestContext,
  generateRequestId
};
