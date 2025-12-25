const User = require('../models/User');
const { sendFCMPushNotification } = require('./pushService');

/**
 * Send push notification for an in-app notification
 * This is ALWAYS called when a notification is created, regardless of user online status
 * The flow: In-app notification created → Socket.IO broadcast → Push notification sent
 */
async function sendPushForNotification(notification) {
  console.log('🚀 [PUSH NOTIFICATION] sendPushForNotification called', {
    notificationId: notification?._id,
    recipientId: notification?.recipient,
    type: notification?.type,
    title: notification?.title
  });

  try {
    if (!notification || !notification.recipient) {
      console.warn('⚠️ [PUSH NOTIFICATION] Notification or recipient missing', {
        notificationId: notification && notification._id,
        hasNotification: !!notification,
        hasRecipient: !!(notification && notification.recipient),
      });
      return;
    }

    const recipientId = notification.recipient._id 
      ? notification.recipient._id.toString() 
      : notification.recipient.toString();

    console.log('🔍 [PUSH NOTIFICATION] Loading recipient user from database', {
      notificationId: notification._id,
      recipientId: recipientId
    });

    const user = await User.findById(recipientId).select('fcmTokens fcmTokenPlatforms');

    console.log('✅ [PUSH NOTIFICATION] Loaded recipient for notification', {
      notificationId: notification._id,
      recipientId: recipientId,
      hasUser: !!user,
      fcmTokensCount: user?.fcmTokens?.length || 0,
    });

    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      console.warn('⚠️ [PUSH NOTIFICATION] No FCM tokens for recipient; skipping push', {
        recipientId: recipientId,
        hasUser: !!user,
        fcmTokensCount: user?.fcmTokens?.length || 0,
      });
      return;
    }

    const payload = {
      title: notification.title,
      message: notification.message,
      data: {
        notificationId: String(notification._id),
        type: notification.type,
        ...(notification.data || {}),
      },
    };

    console.log('📤 [PUSH NOTIFICATION] Sending FCM push notification', {
      recipientId: recipientId,
      notificationId: notification._id,
      title: payload.title,
      message: payload.message,
      fcmTokensCount: user.fcmTokens.length,
    });

    // Always send push notification (works for both online and offline users)
    // Socket.IO handles in-app updates, push handles system notifications
    const result = await sendFCMPushNotification(user.fcmTokens, payload);
    
    console.log('✅ [PUSH NOTIFICATION] FCM push notification sent successfully', {
      notificationId: notification._id,
      recipientId: recipientId,
      successCount: result?.successCount || 0,
      failureCount: result?.failureCount || 0,
    });

    // If there are failed tokens (invalid tokens), remove them from user
    if (result?.failedTokens && result.failedTokens.length > 0) {
      console.log('🧹 [PUSH NOTIFICATION] Removing invalid FCM tokens', {
        recipientId: recipientId,
        invalidTokensCount: result.failedTokens.length,
      });
      
      await User.findByIdAndUpdate(
        recipientId,
        { 
          $pull: { fcmTokens: { $in: result.failedTokens } }
        }
      );
    }

    return result;
  } catch (err) {
    console.error('❌ [PUSH NOTIFICATION] Failed to send push for notification', {
      notificationId: notification && notification._id,
      recipientId: notification?.recipient,
      error: err.message,
      stack: err.stack
    });
    // Don't throw - we don't want push failures to break notification creation
    return null;
  }
}

module.exports = {
  sendPushForNotification,
};
