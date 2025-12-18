const User = require('../models/User');
const { sendExpoPushNotification } = require('./pushService');

async function sendPushForNotification(notification) {
  try {
    const user = await User.findById(notification.recipient).select('expoPushTokens');

    if (!user || !user.expoPushTokens || user.expoPushTokens.length === 0) {
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


