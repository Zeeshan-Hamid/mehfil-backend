const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Apple's public key endpoint
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

// Create JWKS client for fetching Apple's public keys
const client = jwksClient({
  jwksUri: APPLE_KEYS_URL,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

/**
 * Get signing key from Apple's JWKS endpoint
 * @param {string} kid - Key ID from the token header
 * @returns {Promise<Object>} The signing key
 */
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

/**
 * Verify Apple Identity Token
 * @param {string} identityToken - The identity token received from Apple Sign In
 * @returns {Promise<Object>} Verification result with user data
 */
const verifyAppleIdentityToken = async (identityToken) => {
  try {
    if (!identityToken) {
      return {
        success: false,
        error: 'Identity token is required'
      };
    }

    // Decode token without verification to get header and payload
    const decoded = jwt.decode(identityToken, { complete: true });
    
    if (!decoded) {
      return {
        success: false,
        error: 'Invalid token format'
      };
    }

    const { header, payload } = decoded;

    // Verify token signature using Apple's public keys
    return new Promise((resolve) => {
      jwt.verify(identityToken, getKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID, // Your app's bundle ID
      }, (err, verifiedPayload) => {
        if (err) {
          console.error('Apple token verification error:', err);
          return resolve({
            success: false,
            error: 'Failed to verify Apple identity token',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
          });
        }

        // Verify token is not expired
        const currentTime = Math.floor(Date.now() / 1000);
        if (verifiedPayload.exp && verifiedPayload.exp < currentTime) {
          return resolve({
            success: false,
            error: 'Identity token has expired'
          });
        }

        // Extract user information
        // Note: Apple only provides email/name on first sign-in
        // Subsequent sign-ins may not include email if user chose to hide it
        const appleUser = {
          appleId: verifiedPayload.sub, // Apple user ID (stable across sign-ins)
          email: verifiedPayload.email || null, // May be null if user hid email
          emailVerified: verifiedPayload.email_verified || false,
          // Name is only provided on first sign-in
          // It's in the token payload if user granted name permission
          name: null, // We'll handle this separately if needed
          // Token metadata
          issuer: verifiedPayload.iss,
          audience: verifiedPayload.aud,
          issuedAt: verifiedPayload.iat,
          expiresAt: verifiedPayload.exp
        };

        // If email is in the token, it's verified by Apple
        if (verifiedPayload.email) {
          appleUser.emailVerified = true;
        }

        resolve({
          success: true,
          data: appleUser
        });
      });
    });
  } catch (error) {
    console.error('Apple token verification error:', error);
    return {
      success: false,
      error: 'Failed to verify Apple identity token',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

module.exports = {
  verifyAppleIdentityToken
};

