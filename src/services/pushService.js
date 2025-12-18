const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[');
}

async function sendExpoPushNotification(tokens, notification) {
  const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
  const validTokens = tokenArray.filter(isExpoPushToken);

  if (validTokens.length === 0) return;

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
    console.error('Expo push request failed', {
      status: response.status,
      statusText: response.statusText,
      body: json,
    });
  }

  return json;
}

module.exports = {
  sendExpoPushNotification,
  isExpoPushToken,
};


