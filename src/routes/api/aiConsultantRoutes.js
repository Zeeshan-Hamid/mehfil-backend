const express = require('express');
const router = express.Router();
const { chat, createSession, getSessionStatus } = require('../../controllers/aiConsultantController');

// Chat endpoint - public access for studio page
router.post('/chat', chat);

// Session management endpoints - public access
router.post('/session', createSession);
router.get('/session/:sessionId', getSessionStatus);

module.exports = router;

