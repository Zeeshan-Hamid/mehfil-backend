const { Resend } = require('resend');
require('dotenv').config();

// Resend configuration - only initialize if API key is present
let resend = null;

// Get API key from environment
const apiKey = process.env.RESEND_API_KEY;

const { getLogger } = require('./logging');

const logger = getLogger(__filename);

// Verify API key is present before initializing Resend
if (!apiKey) {
  logger.error(
    {
      event: 'email_config_error',
      error: {
        type: 'ConfigurationError',
        message: 'RESEND_API_KEY is not set in environment variables',
      },
    },
    'RESEND_API_KEY is not set in environment variables'
  );
  logger.warn(
    {
      event: 'email_config_warning',
      message: 'Email sending will fail until RESEND_API_KEY is configured',
    },
    'Email sending will fail until RESEND_API_KEY is configured'
  );
} else {
  try {
    resend = new Resend(apiKey);
    logger.info(
      {
        event: 'email_config_ready',
      },
      'Resend email service initialized successfully'
    );
  } catch (error) {
    logger.error(
      {
        event: 'email_config_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      'Failed to initialize Resend'
    );
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