const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant', 'system', 'tool'],
        required: true
    },
    content: {
        type: String,
        required: false,
        default: ''
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    toolCalls: {
        type: Array,
        default: []
    },
    toolCallId: {
        type: String
    }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    messages: [messageSchema],
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'archived'],
        default: 'active'
    },
    metadata: {
        totalMessages: {
            type: Number,
            default: 0
        },
        toolsUsed: {
            type: [String],
            default: []
        }
    }
}, {
    timestamps: true
});

// Index for cleaning up old conversations
conversationSchema.index({ lastActivity: 1, status: 1 });

// Auto-expire conversations after 48 hours of inactivity
conversationSchema.pre('save', function (next) {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    if (this.lastActivity < fortyEightHoursAgo && this.status === 'active') {
        this.status = 'expired';
    }

    next();
});

// Method to add a message to the conversation
conversationSchema.methods.addMessage = function (role, content, toolCalls = null, toolCallId = null) {
    const message = {
        role,
        content,
        timestamp: new Date()
    };

    if (toolCalls) message.toolCalls = toolCalls;
    if (toolCallId) message.toolCallId = toolCallId;

    this.messages.push(message);
    this.metadata.totalMessages = this.messages.length;
    this.lastActivity = new Date();

    // Keep only last 25 messages for context window efficiency
    // Increased from 15 to allow more tool-use rounds
    if (this.messages.length > 25) {
        this.messages = this.messages.slice(-25);

        // Ensure we don't start with a 'tool' message which would break OpenAI API
        // Starting with 'user' is the safest for both API rules and model context
        while (this.messages.length > 0 && this.messages[0].role !== 'user') {
            this.messages.shift();
        }
    }
};

// Method to get formatted messages for OpenAI
conversationSchema.methods.getFormattedMessages = function () {
    let formattedMessages = this.messages.map(msg => {
        const formatted = {
            role: msg.role,
            content: msg.content || ""
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
            formatted.tool_calls = msg.toolCalls;
        }

        if (msg.toolCallId) {
            formatted.tool_call_id = msg.toolCallId;
        }

        return formatted;
    });

    // CRITICAL FIX: Ensure history doesn't start with a 'tool' message
    // OpenAI requires 'tool' messages to follow an 'assistant' message with 'tool_calls'
    // Starting with 'user' is the most robust way to ensure valid sequences and clean context
    while (formattedMessages.length > 0 &&
        formattedMessages[0].role !== 'user' &&
        formattedMessages[0].role !== 'system') {
        formattedMessages.shift();
    }

    return formattedMessages;
};

// Static method to clean expired conversations
conversationSchema.statics.cleanExpiredConversations = async function () {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const result = await this.updateMany(
        {
            lastActivity: { $lt: fortyEightHoursAgo },
            status: 'active'
        },
        {
            $set: { status: 'expired' }
        }
    );

    return result;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
