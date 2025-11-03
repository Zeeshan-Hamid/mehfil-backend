const express = require('express');
const router = express.Router();
const menuChatbotController = require('../../controllers/menuChatbotController');
const { uploadInMemory } = require('../../services/fileUploadService');

/**
 * @route   POST /api/menu-chatbot/session
 * @desc    Create a new chat session
 * @access  Public
 */
router.post('/session', menuChatbotController.createSession);

/**
 * @route   POST /api/menu-chatbot/upload
 * @desc    Upload menu file (PDF or image)
 * @access  Public
 */
router.post('/upload', uploadInMemory.single('menu'), menuChatbotController.uploadMenu);

/**
 * @route   POST /api/menu-chatbot/chat
 * @desc    Send chat message
 * @access  Public
 */
router.post('/chat', menuChatbotController.chat);

/**
 * @route   GET /api/menu-chatbot/session/:sessionId/status
 * @desc    Get session status
 * @access  Public
 */
router.get('/session/:sessionId/status', menuChatbotController.getSessionStatus);

/**
 * @route   DELETE /api/menu-chatbot/session/:sessionId
 * @desc    Clear/delete session
 * @access  Public
 */
router.delete('/session/:sessionId', menuChatbotController.clearSession);

module.exports = router;

