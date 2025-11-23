const { processVendorChatStream } = require('../services/agentService');

/**
 * @desc    Process vendor chat message through AI agent with streaming
 * @route   POST /api/agent/chat
 * @access  Private (Vendor only)
 */
const vendorAgentChat = async (req, res) => {
    try {
        const { message, conversationHistory } = req.body;

        // Validate input
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message is required and must be a non-empty string'
            });
        }

        // Validate message length (prevent abuse)
        if (message.length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Message is too long. Maximum 2000 characters allowed.'
            });
        }

        // Validate conversation history if provided
        if (conversationHistory && !Array.isArray(conversationHistory)) {
            return res.status(400).json({
                success: false,
                message: 'Conversation history must be an array'
            });
        }

        // Limit conversation history to prevent token overflow
        const limitedHistory = conversationHistory
            ? conversationHistory.slice(-10) // Keep last 10 messages
            : [];

        // Process the message through the agent with streaming
        await processVendorChatStream(message, limitedHistory, res);

    } catch (error) {
        console.error('Vendor agent chat error:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        // If headers not sent, send error response
        if (!res.headersSent) {
            // Handle specific error types
            if (error.message?.includes('OPENAI_API_KEY')) {
                return res.status(500).json({
                    success: false,
                    message: 'AI service configuration error. Please contact support.'
                });
            }

            if (error.message?.includes('rate limit')) {
                return res.status(429).json({
                    success: false,
                    message: 'Too many requests. Please try again in a moment.'
                });
            }

            // Generic error response
            res.status(500).json({
                success: false,
                message: 'Failed to process your request. Please try again.',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
};

module.exports = {
    vendorAgentChat
};
