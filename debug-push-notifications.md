# 🔍 Push Notification Debugging Checklist

## Step 1: Verify Push Token Registration

**Check if the user has Expo tokens in the database:**

```bash
# In MongoDB shell or Compass
db.users.findOne({ email: "user@example.com" }, { expoPushTokens: 1, email: 1 })
```

**Expected:** Should see `expoPushTokens: ["ExponentPushToken[...]"]`

**If empty:**
- Check if `/api/users/push-token` endpoint is being called from the app
- Check logs for `[PushToken] Registering Expo push token`
- Verify the token format starts with `ExponentPushToken[`

---

## Step 2: Check Notification Creation

**When you send a message, look for these logs in order:**

1. `🔔 [NOTIFICATION TRIGGER] Creating message notification`
2. `💬 [MESSAGE NOTIFICATION] Creating notification`
3. `📬 Notification created:`
4. `🔔 [NOTIFICATION TRIGGER] Calling sendPushForNotification`

**If you DON'T see these:**
- Notification creation is failing
- Check for errors in the logs

---

## Step 3: Check Push Service Execution

**Look for these logs in order:**

1. `🚀 [EXPO PUSH] sendPushForNotification called`
2. `🔍 [EXPO PUSH] Loading recipient user from database`
3. `✅ [EXPO PUSH] Loaded recipient for notification` - **CHECK expoPushTokensCount**
4. `📤 [EXPO PUSH] Sending Expo push notification to Expo API`
5. `[PushService] Sending Expo push request`
6. `[PushService] Expo push request succeeded` OR `[PushService] Expo push request failed`

**If you see `⚠️ [EXPO PUSH] No Expo tokens for recipient`:**
- User hasn't registered their push token
- Go back to Step 1

**If you see `[PushService] No valid Expo tokens`:**
- Token format is wrong
- Token doesn't start with `ExponentPushToken[`

**If you see `[PushService] Expo push request failed`:**
- Check the error status and body
- Could be invalid token, network issue, or Expo API problem

---

## Step 4: Common Issues

### Issue: No logs at all
**Possible causes:**
- Code not deployed to the server you're testing
- Wrong backend URL
- Logs going to different place

### Issue: Token registered but push not sent
**Check:**
- Is `sendPushForNotification` being called? (Look for `🚀 [EXPO PUSH]`)
- Is the recipient ID correct?
- Are tokens in the right user document?

### Issue: Push sent but not received
**Check:**
- Is the app in background/closed? (Push only works when app is not foreground)
- Is the token still valid? (Tokens can expire)
- Check Expo's response - does it say the token is invalid?

---

## Step 5: Test Manually

**Test push token registration:**
```bash
curl -X POST "https://your-backend.com/api/users/push-token" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"expoPushToken":"ExponentPushToken[YOUR_TOKEN_HERE]"}'
```

**Test notification creation:**
```bash
curl -X POST "https://your-backend.com/api/notifications" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientId": "RECIPIENT_USER_ID",
    "type": "message",
    "title": "Test Notification",
    "message": "This is a test"
  }'
```

---

## Step 6: Check Expo API Response

When push is sent, check the response from Expo:

**Success response should look like:**
```json
{
  "data": [
    {
      "status": "ok",
      "id": "..."
    }
  ]
}
```

**Error response might look like:**
```json
{
  "data": [
    {
      "status": "error",
      "message": "InvalidCredentials",
      "details": {...}
    }
  ]
}
```

**Common Expo errors:**
- `InvalidCredentials` - Token is invalid/expired
- `DeviceNotRegistered` - Token no longer valid
- `MessageTooBig` - Notification payload too large

---

## Quick Debug Query

Run this in MongoDB to see all users with push tokens:
```javascript
db.users.find(
  { expoPushTokens: { $exists: true, $ne: [] } },
  { email: 1, expoPushTokens: 1, role: 1 }
)
```

