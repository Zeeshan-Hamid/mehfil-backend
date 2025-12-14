const { processVendorChatStream } = require('../services/agentService');
const { getOrCreateConversation } = require('../services/conversationService');

/**
 * @desc    Process vendor chat message through AI agent with streaming
 * @route   POST /api/agent/chat
 * @access  Private (Vendor only)
 */
const vendorAgentChat = async (req, res) => {
    try {
        const { message, sessionId } = req.body;

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

        // Get vendor ID from authenticated user
        const vendorId = req.user?._id || req.user?.id;

        if (!vendorId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Get or create conversation session
        const conversation = await getOrCreateConversation(vendorId, sessionId);

        // Process the message through the agent with streaming
        // Pass conversation object and vendorId to service
        await processVendorChatStream(message, conversation, res, vendorId);

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
