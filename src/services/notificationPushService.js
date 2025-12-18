const User = require('../models/User');
const { sendExpoPushNotification } = require('./pushService');

async function sendPushForNotification(notification) {
  try {
    if (!notification || !notification.recipient) {
      console.warn('[NotificationPush] Notification or recipient missing', {
        notificationId: notification && notification._id,
      });
      return;
    }

    const user = await User.findById(notification.recipient).select('expoPushTokens');

    console.log('[NotificationPush] Loaded recipient for notification', {
      notificationId: notification._id,
      recipientId: notification.recipient,
      hasUser: !!user,
      expoPushTokensCount: user?.expoPushTokens?.length || 0,
      expoPushTokens: user?.expoPushTokens,
    });

    if (!user || !user.expoPushTokens || user.expoPushTokens.length === 0) {
      console.warn('[NotificationPush] No Expo tokens for recipient; skipping push', {
        recipientId: notification.recipient,
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

    console.log('[NotificationPush] Sending Expo push notification', {
      recipientId: notification.recipient,
      notificationId: notification._id,
      title: payload.title,
      message: payload.message,
      expoPushTokensCount: user.expoPushTokens.length,
    });

    await sendExpoPushNotification(user.expoPushTokens, payload);
  } catch (err) {
    console.error(
      'Failed to send push for notification',
      notification && notification._id,
      err
    );
  }
}

module.exports = {
  sendPushForNotification,
};


