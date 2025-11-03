const { processMenuFile } = require('../services/menuProcessingService');
const { processChatQuery, processChatQueryStream, generateMenuQuestions } = require('../services/ragChatbotService');
const sessionManager = require('../services/menuChatbotSessionManager');
const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

/**
 * Upload and process menu file
 * POST /api/menu-chatbot/upload
 */
exports.uploadMenu = async (req, res) => {
  try {
    // Get sessionId from body (multipart/form-data), query, or create new one
    let sessionId = req.body?.sessionId || req.query?.sessionId;
    
    // Log for debugging
    logger.debug(
      {
        event: 'upload_menu_session_check',
        sessionId,
        bodyKeys: Object.keys(req.body || {}),
        hasFile: !!req.file
      },
      'Checking session for menu upload'
    );

    // Create session if not provided
    if (!sessionId) {
      sessionId = sessionManager.createSession();
      logger.info({ event: 'session_auto_created_on_upload', sessionId }, 'Auto-created session for menu upload');
    } else {
      // Validate session exists
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        // If session doesn't exist, create a new one instead of failing
        logger.warn({ event: 'session_not_found_creating_new', requestedSessionId: sessionId }, 'Session not found, creating new session');
        sessionId = sessionManager.createSession();
      }
    }

    // Check if file is provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a menu file (PDF or image)'
      });
    }

    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload a PDF or image file (JPG, PNG, GIF, WebP)'
      });
    }

    logger.info(
      {
        event: 'menu_upload_started',
        sessionId,
        fileType: req.file.mimetype,
        fileSize: req.file.size
      },
      'Processing menu upload'
    );

    // Process menu file
    const menuData = await processMenuFile(req.file);

    // Store menu data in session (no vector database needed)
    sessionManager.setMenuData(sessionId, menuData);

    logger.debug(
      {
        event: 'menu_data_stored_in_session',
        sessionId,
        itemCount: menuData.itemCount,
        rawTextLength: menuData.rawText?.length || 0
      },
      'Menu data stored in session for LLM context'
    );

    logger.info(
      {
        event: 'menu_upload_success',
        sessionId,
        itemCount: menuData.itemCount,
        categories: menuData.categories
      },
      'Menu uploaded and processed successfully'
    );

    // Generate contextual questions based on the menu
    logger.debug({ event: 'generating_menu_questions', sessionId }, 'Generating menu questions');
    const suggestedQuestions = await generateMenuQuestions(menuData);

    res.status(200).json({
      success: true,
      message: 'Menu uploaded and processed successfully',
      sessionId,
      data: {
        itemCount: menuData.itemCount,
        categories: menuData.categories,
        sampleItems: menuData.menuItems.slice(0, 5), // Return first 5 items as sample
        suggestedQuestions: suggestedQuestions // Add LLM-generated questions
      }
    });
  } catch (error) {
    logger.error(
      {
        event: 'menu_upload_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      'Error uploading menu'
    );

    res.status(500).json({
      success: false,
      message: 'Failed to process menu file',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Handle chat query
 * POST /api/menu-chatbot/chat
 */
exports.chat = async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Validate session exists
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found. Please upload a menu first.'
      });
    }

    // Check if menu is uploaded
    if (!session.menuData) {
      return res.status(400).json({
        success: false,
        message: 'No menu uploaded for this session. Please upload a menu first.'
      });
    }

    logger.info(
      {
        event: 'chat_query_received',
        sessionId,
        messageLength: message.length
      },
      'Processing streaming chat query'
    );

    // Set up Server-Sent Events (SSE) for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Handle client disconnect
    req.on('close', () => {
      logger.debug({ event: 'client_disconnected', sessionId }, 'Client disconnected during streaming');
      if (!res.headersSent && !res.destroyed) {
        res.end();
      }
    });

    // Process chat query with streaming
    await processChatQueryStream(sessionId, message.trim(), res);
  } catch (error) {
    logger.error(
      {
        event: 'chat_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      'Error processing streaming chat'
    );

    // Send error via SSE format
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }
    
    const errorMsg = process.env.NODE_ENV === 'development' 
      ? error.message 
      : 'Failed to process chat message';
    
    if (!res.destroyed && res.writable) {
      try {
        res.write(`data: ${JSON.stringify({ content: errorMsg, done: true, error: true })}\n\n`);
        res.end();
      } catch (writeError) {
        // Stream might already be closed, ignore
        logger.debug({ event: 'stream_already_closed', error: writeError.message }, 'Stream already closed when trying to send error');
      }
    }
  }
};

/**
 * Create a new session
 * POST /api/menu-chatbot/session
 */
exports.createSession = async (req, res) => {
  try {
    const sessionId = sessionManager.createSession();

    logger.info(
      {
        event: 'session_created_via_api',
        sessionId
      },
      'New session created via API'
    );

    res.status(201).json({
      success: true,
      sessionId,
      message: 'Session created successfully'
    });
  } catch (error) {
    logger.error(
      {
        event: 'session_creation_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error creating session'
    );

    res.status(500).json({
      success: false,
      message: 'Failed to create session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get session status
 * GET /api/menu-chatbot/session/:sessionId/status
 */
exports.getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const status = sessionManager.getSessionStatus(sessionId);

    if (!status.exists) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    res.status(200).json({
      success: true,
      status
    });
  } catch (error) {
    logger.error(
      {
        event: 'session_status_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
        },
      },
      'Error getting session status'
    );

    res.status(500).json({
      success: false,
      message: 'Failed to get session status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Clear/delete session
 * DELETE /api/menu-chatbot/session/:sessionId
 */
exports.clearSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    // Delete session from memory (no vector database to clean up)
    const deleted = sessionManager.deleteSession(sessionId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    logger.info(
      {
        event: 'session_cleared',
        sessionId
      },
      'Session cleared successfully'
    );

    res.status(200).json({
      success: true,
      message: 'Session cleared successfully'
    });
  } catch (error) {
    logger.error(
      {
        event: 'session_clear_error',
        sessionId: req.params.sessionId,
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      'Error clearing session'
    );

    res.status(500).json({
      success: false,
      message: 'Failed to clear session',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

