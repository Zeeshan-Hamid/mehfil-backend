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
    menuData: null,
    conversationHistory: [],
    vectorCollectionCreated: false
  };

  sessions.set(sessionId, session);

  logger.info(
    {
      event: 'session_created',
      sessionId
    },
    `Created new session: ${sessionId}`
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
 * Update session menu data
 * @param {string} sessionId - Session ID
 * @param {Object} menuData - Processed menu data
 * @returns {boolean} Success status
 */
function setMenuData(sessionId, menuData) {
  const session = getSession(sessionId);
  
  if (!session) {
    logger.warn({ event: 'session_not_found', sessionId }, 'Session not found when setting menu data');
    return false;
  }

  session.menuData = menuData;
  session.lastAccessedAt = new Date();

  logger.info(
    {
      event: 'menu_data_set',
      sessionId,
      itemCount: menuData?.itemCount || 0
    },
    `Menu data set for session: ${sessionId}`
  );

  return true;
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
 * Mark vector collection as created
 * @param {string} sessionId - Session ID
 */
function markVectorCollectionCreated(sessionId) {
  const session = getSession(sessionId);
  if (session) {
    session.vectorCollectionCreated = true;
  }
}

/**
 * Check if vector collection exists for session
 * @param {string} sessionId - Session ID
 * @returns {boolean}
 */
function hasVectorCollection(sessionId) {
  const session = getSession(sessionId);
  return session ? session.vectorCollectionCreated : false;
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
        event: 'session_deleted',
        sessionId
      },
      `Deleted session: ${sessionId}`
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
      hasMenu: false,
      messageCount: 0
    };
  }

  return {
    exists: true,
    hasMenu: !!session.menuData,
    messageCount: session.conversationHistory.length,
    createdAt: session.createdAt,
    lastAccessedAt: session.lastAccessedAt,
    itemCount: session.menuData?.itemCount || 0
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
      
      // Session expired and cleaned up - no need to log individual cleanups
    }
  }

  if (cleanedCount > 0) {
    logger.info(
      {
        event: 'cleanup_completed',
        cleanedCount,
        remainingSessions: sessions.size
      },
      `Cleaned up ${cleanedCount} expired sessions`
    );
  }
}

// Start cleanup interval only if not in test environment
// Check if we're running tests by checking for test-related environment variables or module paths
const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                         process.argv.some(arg => arg.includes('test') || arg.includes('jest'));

if (!isTestEnvironment) {
  // Start cleanup interval
  const cleanupInterval = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
  
  // Cleanup on process exit
  const cleanup = () => {
    logger.info({ event: 'shutting_down' }, 'Clearing all sessions on shutdown');
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
  setMenuData,
  addMessage,
  getConversationHistory,
  markVectorCollectionCreated,
  hasVectorCollection,
  deleteSession,
  getSessionStatus
};

