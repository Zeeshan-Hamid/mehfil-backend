const User = require('../models/User');
const { sendExpoPushNotification } = require('./pushService');

async function sendPushForNotification(notification) {
  console.log('🚀 [EXPO PUSH] sendPushForNotification called', {
    notificationId: notification?._id,
    recipientId: notification?.recipient,
    type: notification?.type,
    title: notification?.title
  });

  try {
    if (!notification || !notification.recipient) {
      console.warn('⚠️ [EXPO PUSH] Notification or recipient missing', {
        notificationId: notification && notification._id,
        hasNotification: !!notification,
        hasRecipient: !!(notification && notification.recipient),
      });
      return;
    }

    console.log('🔍 [EXPO PUSH] Loading recipient user from database', {
      notificationId: notification._id,
      recipientId: notification.recipient
    });

    const user = await User.findById(notification.recipient).select('expoPushTokens');

    console.log('✅ [EXPO PUSH] Loaded recipient for notification', {
      notificationId: notification._id,
      recipientId: notification.recipient,
      hasUser: !!user,
      expoPushTokensCount: user?.expoPushTokens?.length || 0,
      expoPushTokens: user?.expoPushTokens,
    });

    if (!user || !user.expoPushTokens || user.expoPushTokens.length === 0) {
      console.warn('⚠️ [EXPO PUSH] No Expo tokens for recipient; skipping push', {
        recipientId: notification.recipient,
        hasUser: !!user,
        expoPushTokensCount: user?.expoPushTokens?.length || 0,
      });
      return;
    }

    const payload = {
      title: notification.title,
      message: notification.message,
      data: {
        notificationId: notification._id,
        type: notification.type,
        ...(notification.data || {}),
      },
    };

    console.log('📤 [EXPO PUSH] Sending Expo push notification to Expo API', {
      recipientId: notification.recipient,
      notificationId: notification._id,
      title: payload.title,
      message: payload.message,
      expoPushTokensCount: user.expoPushTokens.length,
      expoPushTokens: user.expoPushTokens,
    });

    const result = await sendExpoPushNotification(user.expoPushTokens, payload);
    
    console.log('✅ [EXPO PUSH] Expo push notification sent successfully', {
      notificationId: notification._id,
      recipientId: notification.recipient,
      result: result
    });

    return result;
  } catch (err) {
    console.error('❌ [EXPO PUSH] Failed to send push for notification', {
      notificationId: notification && notification._id,
      recipientId: notification?.recipient,
      error: err.message,
      stack: err.stack
    });
    throw err; // Re-throw so caller can handle it
  }
}

module.exports = {
  sendPushForNotification,
};


