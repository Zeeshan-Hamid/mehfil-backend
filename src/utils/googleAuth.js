const { OAuth2Client } = require('google-auth-library');

/**
 * Verify Google ID Token from mobile/web clients
 * @param {string} idToken - The ID token received from the client
 * @param {string} clientId - The Google OAuth Client ID (can be iOS, Android, or Web)
 * @returns {Promise<Object>} Verification result with user data
 */
const verifyGoogleIdToken = async (idToken, clientId) => {
  try {
    if (!idToken) {
      return {
        success: false,
        error: 'ID token is required'
      };
    }

    if (!clientId) {
      return {
        success: false,
        error: 'Client ID is required for verification'
      };
    }

    const client = new OAuth2Client(clientId);
    
    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: clientId, // Specify the CLIENT_ID of the app that accesses the backend
    });
    
    const payload = ticket.getPayload();
    
    // Verify the token is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < currentTime) {
      return {
        success: false,
        error: 'ID token has expired'
      };
    }

    // Verify the token was issued recently (within last hour as extra security)
    if (payload.iat && (currentTime - payload.iat) > 3600) {
      console.warn('⚠️ Warning: ID token was issued more than 1 hour ago');
    }

    return {
      success: true,
      data: {
        googleId: payload['sub'], // Google user ID
        email: payload['email'],
        emailVerified: payload['email_verified'],
        name: payload['name'],
        picture: payload['picture'],
        givenName: payload['given_name'],
        familyName: payload['family_name'],
        locale: payload['locale'],
        // Token metadata
        issuer: payload['iss'],
        audience: payload['aud'],
        issuedAt: payload['iat'],
        expiresAt: payload['exp']
      }
    };
  } catch (error) {
    // Provide more specific error messages
    if (error.message.includes('Token used too early')) {
      return {
        success: false,
        error: 'ID token is not yet valid. Please check your system time.'
      };
    }
    
    if (error.message.includes('Token used too late')) {
      return {
        success: false,
        error: 'ID token has expired. Please sign in again.'
      };
    }
    
    if (error.message.includes('Invalid token signature')) {
      return {
        success: false,
        error: 'Invalid ID token signature. Token may be tampered with.'
      };
    }

    return {
      success: false,
      error: 'Failed to verify Google ID token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

/**
 * Verify Google ID Token with multiple client IDs (iOS, Android, Web)
 * Useful when you want to accept tokens from multiple platforms
 * @param {string} idToken - The ID token received from the client
 * @param {Array<string>} clientIds - Array of Google OAuth Client IDs
 * @returns {Promise<Object>} Verification result with user data
 */
const verifyGoogleIdTokenMultiPlatform = async (idToken, clientIds) => {
  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    return {
      success: false,
      error: 'At least one client ID is required'
    };
  }

  // Try verifying with each client ID until one succeeds
  for (const clientId of clientIds) {
    const result = await verifyGoogleIdToken(idToken, clientId);
    if (result.success) {
      return result;
    }
  }

  return {
    success: false,
    error: 'ID token verification failed with all provided client IDs'
  };
};

/**
 * Get the appropriate client ID based on platform
 * @param {string} platform - Platform type (ios, android, web)
 * @returns {string} The corresponding Google OAuth Client ID
 */
const getClientIdForPlatform = (platform) => {
  const platformLower = platform?.toLowerCase() || 'web';
  
  switch (platformLower) {
    case 'ios':
      return process.env.GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    case 'android':
      return process.env.GOOGLE_ANDROID_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    case 'web':
    default:
      return process.env.GOOGLE_CLIENT_ID;
  }
};

/**
 * Get all configured client IDs for multi-platform verification
 * @returns {Array<string>} Array of all configured client IDs
 */
const getAllClientIds = () => {
  const clientIds = [];
  
  // Web client ID (required)
  if (process.env.GOOGLE_CLIENT_ID) {
    clientIds.push(process.env.GOOGLE_CLIENT_ID);
  }
  
  // iOS client ID
  if (process.env.GOOGLE_IOS_CLIENT_ID) {
    clientIds.push(process.env.GOOGLE_IOS_CLIENT_ID);
  }
  
  // Android client ID
  if (process.env.GOOGLE_ANDROID_CLIENT_ID) {
    clientIds.push(process.env.GOOGLE_ANDROID_CLIENT_ID);
  }
  
  // Legacy mobile client ID (backward compatibility)
  if (process.env.GOOGLE_MOBILE_CLIENT_ID && !clientIds.includes(process.env.GOOGLE_MOBILE_CLIENT_ID)) {
    clientIds.push(process.env.GOOGLE_MOBILE_CLIENT_ID);
  }
  
  return clientIds;
};

module.exports = {
  verifyGoogleIdToken,
  verifyGoogleIdTokenMultiPlatform,
  getClientIdForPlatform,
  getAllClientIds
};

