const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[');
}

async function sendExpoPushNotification(tokens, notification) {
  const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
  const validTokens = tokenArray.filter(isExpoPushToken);

  if (validTokens.length === 0) {
    console.warn('[PushService] No valid Expo tokens; skipping send', {
      rawTokensCount: tokenArray.length,
      rawTokens: tokenArray,
    });
    return;
  }

  const messages = validTokens.map((to) => ({
    to,
    sound: 'default',
    title: notification.title,
    body: notification.message,
    data: notification.data || {},
  }));

  // Use global fetch if available (Node 18+), otherwise lazy-require node-fetch
  const fetchFn =
    typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;

  console.log('[PushService] Sending Expo push request', {
    url: EXPO_PUSH_URL,
    messagesCount: messages.length,
  });

  const response = await fetchFn(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'gzip, deflate',
      'content-type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  let json;
  try {
    json = await response.json();
  } catch (e) {
    json = null;
  }

  if (!response.ok) {
    console.error('[PushService] Expo push request failed', {
      status: response.status,
      statusText: response.statusText,
      body: json,
    });
  } else {
    // Expo API returns 200 even if individual messages fail
    // Check the data array for error statuses
    if (json && json.data && Array.isArray(json.data)) {
      json.data.forEach((result, index) => {
        if (result.status === 'error') {
          console.error(`[PushService] Expo push failed for message ${index}:`, {
            status: result.status,
            message: result.message,
            details: result.details,
            token: validTokens[index]
          });
        } else if (result.status === 'ok') {
          console.log(`[PushService] Expo push succeeded for message ${index}:`, {
            status: result.status,
            id: result.id,
            token: validTokens[index]?.substring(0, 30) + '...'
          });
        }
      });
    }
    
    console.log('[PushService] Expo push request completed', {
      status: response.status,
      totalMessages: messages.length,
      responseBody: JSON.stringify(json, null, 2),
    });
  }

  return json;
}

module.exports = {
  sendExpoPushNotification,
  isExpoPushToken,
};


