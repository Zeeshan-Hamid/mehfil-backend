const { cleanExpiredConversations } = require('./services/conversationService');

/**
 * Cleanup job to expire old conversations
 * Run this periodically (e.g., once a day via cron job)
 * 
 * Usage:
 * node src/cleanupConversations.js
 * 
 * Or schedule with cron:
 * 0 2 * * * cd /path/to/mehfil-backend && node src/cleanupConversations.js
 */
const runConversationCleanup = async () => {
    try {
        console.log('🧹 Starting conversation cleanup...');
        const result = await cleanExpiredConversations();
        console.log(`✅ Conversation cleanup complete. Modified ${result.modifiedCount} conversations.`);
        return result;
    } catch (error) {
        console.error('❌ Error during conversation cleanup:', error);
        throw error;
    }
};

// If run directly
if (require.main === module) {
    // Connect to MongoDB first
    const mongoose = require('mongoose');
    require('dotenv').config();

    mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URI)
        .then(async () => {
            console.log('📦 Connected to MongoDB');
            await runConversationCleanup();
            await mongoose.connection.close();
            console.log('👋 MongoDB connection closed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Failed to run cleanup:', error);
            process.exit(1);
        });
}

module.exports = { runConversationCleanup };
