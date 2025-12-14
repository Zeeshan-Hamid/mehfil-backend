const Conversation = require('../models/schemas/Conversation');
const { v4: uuidv4 } = require('uuid');

/**
 * Get or create a conversation session for a vendor
 * @param {string} vendorId - The vendor's user ID
 * @param {string} sessionId - Optional session ID to retrieve specific conversation
 * @returns {Promise<Object>} Conversation document
 */
const getOrCreateConversation = async (vendorId, sessionId = null) => {
    try {
        // If sessionId provided, try to find it
        if (sessionId) {
            const conversation = await Conversation.findOne({
                sessionId,
                vendorId,
                status: 'active'
            });

            if (conversation) {
                // Check if expired
                const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
                if (conversation.lastActivity < fortyEightHoursAgo) {
                    // Expired, create new one
                    return await createNewConversation(vendorId);
                }
                return conversation;
            }
        }

        // Try to find the most recent active conversation for the vendor
        const recentConversation = await Conversation.findOne({
            vendorId,
            status: 'active'
        }).sort({ lastActivity: -1 });

        if (recentConversation) {
            // Check if expired
            const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
            if (recentConversation.lastActivity < fortyEightHoursAgo) {
                // Expired, create new one
                return await createNewConversation(vendorId);
            }
            return recentConversation;
        }

        // No active conversation found, create new one
        return await createNewConversation(vendorId);

    } catch (error) {
        console.error('Error in getOrCreateConversation:', error);
        throw error;
    }
};

/**
 * Create a new conversation session
 * @param {string} vendorId - The vendor's user ID
 * @returns {Promise<Object>} New conversation document
 */
const createNewConversation = async (vendorId) => {
    const conversation = new Conversation({
        vendorId,
        sessionId: uuidv4(),
        messages: [],
        lastActivity: new Date(),
        status: 'active'
    });

    await conversation.save();
    return conversation;
};

/**
 * Add a message to a conversation
 * @param {string} sessionId - The conversation session ID
 * @param {string} role - Message role (user, assistant, system, tool)
 * @param {string} content - Message content
 * @param {Array} toolCalls - Optional tool calls
 * @param {string} toolCallId - Optional tool call ID
 * @returns {Promise<Object>} Updated conversation
 */
const addMessage = async (sessionId, role, content, toolCalls = null, toolCallId = null) => {
    try {
        const conversation = await Conversation.findOne({ sessionId, status: 'active' });

        if (!conversation) {
            throw new Error('Conversation not found or expired');
        }

        conversation.addMessage(role, content, toolCalls, toolCallId);
        await conversation.save();

        return conversation;
    } catch (error) {
        console.error('Error in addMessage:', error);
        throw error;
    }
};

/**
 * Get conversation history for a session
 * @param {string} sessionId - The conversation session ID
 * @returns {Promise<Array>} Array of formatted messages
 */
const getConversationHistory = async (sessionId) => {
    try {
        const conversation = await Conversation.findOne({ sessionId, status: 'active' });

        if (!conversation) {
            return [];
        }

        return conversation.getFormattedMessages();
    } catch (error) {
        console.error('Error in getConversationHistory:', error);
        throw error;
    }
};

/**
 * Archive a conversation
 * @param {string} sessionId - The conversation session ID
 * @returns {Promise<Object>} Updated conversation
 */
const archiveConversation = async (sessionId) => {
    try {
        const conversation = await Conversation.findOneAndUpdate(
            { sessionId },
            { status: 'archived' },
            { new: true }
        );

        return conversation;
    } catch (error) {
        console.error('Error in archiveConversation:', error);
        throw error;
    }
};

/**
 * Get all active conversations for a vendor
 * @param {string} vendorId - The vendor's user ID
 * @returns {Promise<Array>} Array of active conversations
 */
const getVendorConversations = async (vendorId) => {
    try {
        const conversations = await Conversation.find({
            vendorId,
            status: 'active'
        }).sort({ lastActivity: -1 });

        return conversations;
    } catch (error) {
        console.error('Error in getVendorConversations:', error);
        throw error;
    }
};

/**
 * Clean up expired conversations (run periodically)
 * @returns {Promise<Object>} Cleanup result
 */
const cleanExpiredConversations = async () => {
    try {
        const result = await Conversation.cleanExpiredConversations();
        console.log(`Cleaned up ${result.modifiedCount} expired conversations`);
        return result;
    } catch (error) {
        console.error('Error in cleanExpiredConversations:', error);
        throw error;
    }
};

module.exports = {
    getOrCreateConversation,
    createNewConversation,
    addMessage,
    getConversationHistory,
    archiveConversation,
    getVendorConversations,
    cleanExpiredConversations
};
