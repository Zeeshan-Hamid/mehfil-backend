const { getLogger } = require('../config/logging');

const logger = getLogger(__filename);

/**
 * Get Soniox API key for frontend
 * GET /api/soniox/api-key
 * @access Public
 */
exports.getApiKey = (req, res) => {
  try {
    const apiKey = process.env.SONIOX_API_KEY;

    if (!apiKey) {
      logger.error(
        {
          event: 'soniox_api_key_missing',
        },
        'SONIOX_API_KEY is not set in environment variables'
      );

      return res.status(500).json({
        success: false,
        message: 'Soniox API key is not configured on the server'
      });
    }

    // API key provided successfully - no need to log this routine operation

    res.json({
      success: true,
      apiKey: apiKey
    });
  } catch (error) {
    logger.error(
      {
        event: 'soniox_api_key_error',
        error: {
          type: error?.constructor?.name || 'Error',
          message: error?.message || 'Unknown error',
          stack: error?.stack,
        },
      },
      'Error providing Soniox API key'
    );

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Soniox API key',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

