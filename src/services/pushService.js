const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// Note: You need to set up Firebase credentials
// Place your serviceAccountKey.json in the project root or set GOOGLE_APPLICATION_CREDENTIALS env var
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) {
    return;
  }

  try {
    // Check if Firebase is already initialized
    if (admin.apps.length === 0) {
      // Option 1: Use service account key file
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      // Option 2: Use GOOGLE_APPLICATION_CREDENTIALS environment variable
      else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      }
      // Option 3: Use service account key file path
      else {
        const serviceAccount = require('../../serviceAccountKey.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
    }
    firebaseInitialized = true;
    console.log('[PushService] Firebase Admin SDK initialized');
  } catch (error) {
    console.error('[PushService] Failed to initialize Firebase Admin SDK:', error.message);
    throw error;
  }
}

// Detect if token is iOS (APNS) or Android (FCM)
function detectPlatform(token) {
  // FCM tokens are typically longer and don't have a specific prefix
  // iOS APNS tokens are 64 hex characters
  // For now, we'll assume all tokens are FCM tokens unless specified
  // You can enhance this by storing platform info with the token
  return 'android'; // Default to Android/FCM
}

// Send push notification to FCM (works for both Android and iOS)
async function sendFCMPushNotification(tokens, notification) {
  initializeFirebase();

  const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
  
  if (tokenArray.length === 0) {
    console.warn('[PushService] No tokens provided; skipping send');
    return;
  }

  const message = {
    notification: {
      title: notification.title,
      body: notification.message,
    },
    data: {
      notificationId: String(notification.data?.notificationId || ''),
      type: String(notification.data?.type || ''),
      ...Object.fromEntries(
        Object.entries(notification.data || {}).map(([key, value]) => [
          key,
          String(value),
        ])
      ),
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default-channel',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: notification.data?.badge || undefined,
        },
      },
    },
    tokens: tokenArray,
  };

  try {
    console.log('[PushService] Sending FCM push notification', {
      tokensCount: tokenArray.length,
      title: notification.title,
    });

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log('[PushService] FCM push notification sent', {
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    // Handle failures
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`[PushService] Failed to send to token ${idx}:`, {
            error: resp.error?.code,
            message: resp.error?.message,
            token: tokenArray[idx]?.substring(0, 20) + '...',
          });
          
          // Check if token is invalid and should be removed
          if (
            resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered'
          ) {
            failedTokens.push(tokenArray[idx]);
          }
        }
      });

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens,
      };
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error('[PushService] FCM push notification error:', {
      error: error.message,
      code: error.code,
    });
    throw error;
  }
}

// Send to single device
async function sendPushNotification(token, notification) {
  return sendFCMPushNotification([token], notification);
}

// Send to multiple devices
async function sendPushNotificationToMultiple(tokens, notification) {
  return sendFCMPushNotification(tokens, notification);
}

module.exports = {
  sendFCMPushNotification,
  sendPushNotification,
  sendPushNotificationToMultiple,
  initializeFirebase,
};
