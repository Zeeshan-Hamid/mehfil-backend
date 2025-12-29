const crypto = require('crypto');
const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

// In-memory session storage
const sessions = new Map();

// Session timeout (30 minutes of inactivity)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Cleanup interval (check every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Generate a unique session ID
 * @returns {string} Session ID
 */
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create a new session
 * @returns {string} Session ID
 */
function createSession() {
  const sessionId = generateSessionId();
  const session = {
    sessionId,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    conversationHistory: []
  };

  sessions.set(sessionId, session);

  logger.info(
    {
      event: 'ai_consultant_session_created',
      sessionId
    },
    `Created new AI consultant session: ${sessionId}`
  );

  return sessionId;
}

/**
 * Get session data
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session object or null if not found
 */
function getSession(sessionId) {
  const session = sessions.get(sessionId);
  
  if (session) {
    // Update last accessed time
    session.lastAccessedAt = new Date();
  }
  
  return session;
}

/**
 * Add message to conversation history
 * @param {string} sessionId - Session ID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @returns {boolean} Success status
 */
function addMessage(sessionId, role, content) {
  const session = getSession(sessionId);
  
  if (!session) {
    logger.warn({ event: 'session_not_found', sessionId }, 'Session not found when adding message');
    return false;
  }

  session.conversationHistory.push({
    role,
    content,
    timestamp: new Date()
  });

  // Limit conversation history to last 20 messages to avoid token limit issues
  if (session.conversationHistory.length > 20) {
    session.conversationHistory = session.conversationHistory.slice(-20);
  }

  session.lastAccessedAt = new Date();

  return true;
}

/**
 * Get conversation history
 * @param {string} sessionId - Session ID
 * @returns {Array} Conversation history
 */
function getConversationHistory(sessionId) {
  const session = getSession(sessionId);
  return session ? session.conversationHistory : [];
}

/**
 * Delete session
 * @param {string} sessionId - Session ID
 * @returns {boolean} Success status
 */
function deleteSession(sessionId) {
  const deleted = sessions.delete(sessionId);
  
  if (deleted) {
    logger.info(
      {
        event: 'ai_consultant_session_deleted',
        sessionId
      },
      `Deleted AI consultant session: ${sessionId}`
    );
  }

  return deleted;
}

/**
 * Get session status
 * @param {string} sessionId - Session ID
 * @returns {Object} Session status
 */
function getSessionStatus(sessionId) {
  const session = getSession(sessionId);
  
  if (!session) {
    return {
      exists: false,
      messageCount: 0
    };
  }

  return {
    exists: true,
    messageCount: session.conversationHistory.length,
    createdAt: session.createdAt,
    lastAccessedAt: session.lastAccessedAt
  };
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions() {
  const now = new Date();
  let cleanedCount = 0;

  for (const [sessionId, session] of sessions.entries()) {
    const timeSinceLastAccess = now - session.lastAccessedAt;
    
    if (timeSinceLastAccess > SESSION_TIMEOUT_MS) {
      sessions.delete(sessionId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    logger.info(
      {
        event: 'ai_consultant_cleanup_completed',
        cleanedCount,
        remainingSessions: sessions.size
      },
      `Cleaned up ${cleanedCount} expired AI consultant sessions`
    );
  }
}

// Start cleanup interval only if not in test environment
const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                         process.argv.some(arg => arg.includes('test') || arg.includes('jest'));

if (!isTestEnvironment) {
  // Start cleanup interval
  const cleanupInterval = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
  
  // Cleanup on process exit
  const cleanup = () => {
    logger.info({ event: 'ai_consultant_shutting_down' }, 'Clearing all AI consultant sessions on shutdown');
    clearInterval(cleanupInterval);
    sessions.clear();
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

module.exports = {
  createSession,
  getSession,
  addMessage,
  getConversationHistory,
  deleteSession,
  getSessionStatus
};

