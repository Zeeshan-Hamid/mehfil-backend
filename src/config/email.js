const { Resend } = require('resend');
require('dotenv').config();

// Resend configuration - only initialize if API key is present
let resend = null;

// Get API key from environment
const apiKey = process.env.RESEND_API_KEY;

// Debug: Log email configuration
console.log('📧 Email Configuration (Resend):');
console.log('  Service: Resend');
console.log('  From Email:', process.env.EMAIL_USER || process.env.MAIL_FROM || 'info@mehfil.app');
console.log('  Admin Email:', process.env.ADMIN_NOTIFICATION_EMAIL);

// Verify API key is present before initializing Resend
if (!apiKey) {
  console.error('❌ RESEND_API_KEY is not set in environment variables');
  console.error('⚠️  Email sending will fail until RESEND_API_KEY is configured');
} else {
  try {
    resend = new Resend(apiKey);
    console.log('  API Key: ✅ Configured');
    console.log('✅ Resend email service is ready to send messages');
  } catch (error) {
    console.error('❌ Failed to initialize Resend:', error.message);
    resend = null;
  }
}

// Export resend instance or a mock object that throws helpful errors
module.exports = resend || {
  emails: {
    send: async (options) => {
      throw new Error('Resend email service is not configured. Please set RESEND_API_KEY in your environment variables.');
    }
  }
}; 