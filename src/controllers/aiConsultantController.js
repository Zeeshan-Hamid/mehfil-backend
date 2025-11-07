const { processChatQuery, processChatQueryStream } = require('../services/aiConsultantService');
const sessionManager = require('../services/aiConsultantSessionManager');
const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

/**
 * Handle chat query with streaming support
 * POST /api/ai-consultant/chat
 */
exports.chat = async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Get or create session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = sessionManager.createSession();
      logger.info(
        {
          event: 'ai_consultant_session_auto_created',
          sessionId: currentSessionId
        },
        'Auto-created session for AI consultant chat'
      );
    } else {
      // Validate session exists
      const session = sessionManager.getSession(currentSessionId);
      if (!session) {
        // If session doesn't exist, create a new one
        logger.warn(
          {
            event: 'ai_consultant_session_not_found_creating_new',
            requestedSessionId: currentSessionId
          },
          'Session not found, creating new session'
        );
        currentSessionId = sessionManager.createSession();
      }
    }

    logger.info(
      {
        event: 'ai_consultant_chat_query_received',
        sessionId: currentSessionId,
        messageLength: message.length
      },
      'Processing streaming AI consultant chat query'
    );

    // Set up Server-Sent Events (SSE) for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send session ID to client
    res.write(`data: ${JSON.stringify({ sessionId: currentSessionId, type: 'session' })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      // Client disconnected during streaming
      if (!res.headersSent && !res.destroyed) {
        res.end();
      }
    });

    // Process chat query with streaming
    await processChatQueryStream(currentSessionId, message.trim(), res);
  } catch (error) {
    logger.error(
      {
        event: 'ai_consultant_chat_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      'Error in AI consultant chat endpoint'
    );

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } else {
      // If headers already sent (streaming started), try to send error via SSE
      try {
        res.write(`data: ${JSON.stringify({ content: "I'm sorry, an error occurred. Please try again.", done: true, error: true })}\n\n`);
        res.end();
      } catch (writeError) {
        // Stream already closed
      }
    }
  }
};

/**
 * Create a new session
 * POST /api/ai-consultant/session
 */
exports.createSession = async (req, res) => {
  try {
    const sessionId = sessionManager.createSession();
    
    logger.info(
      {
        event: 'ai_consultant_session_created_via_endpoint',
        sessionId
      },
      'Created new AI consultant session via endpoint'
    );

    res.status(200).json({
      success: true,
      sessionId
    });
  } catch (error) {
    logger.error(
      {
        event: 'ai_consultant_session_creation_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      'Error creating AI consultant session'
    );

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get session status
 * GET /api/ai-consultant/session/:sessionId
 */
exports.getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const status = sessionManager.getSessionStatus(sessionId);

    res.status(200).json({
      success: true,
      status
    });
  } catch (error) {
    logger.error(
      {
        event: 'ai_consultant_session_status_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error getting AI consultant session status'
    );

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

