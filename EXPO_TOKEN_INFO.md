# 📱 Expo Push Token Information

## Do Expo Push Tokens Change?

**Yes, Expo push tokens CAN change in these scenarios:**

### 1. **App Reinstall** ✅
- When user uninstalls and reinstalls the app
- **New token generated** - old token becomes invalid
- **Solution:** Re-register token after reinstall

### 2. **App Data Cleared** ✅
- When user clears app data/cache
- **New token generated** - old token becomes invalid
- **Solution:** Re-register token after data clear

### 3. **Expo SDK Update** ⚠️
- Major Expo SDK updates might invalidate tokens
- **Solution:** Re-register tokens after major updates

### 4. **Development vs Production** ⚠️
- Development builds use different tokens than production
- **Solution:** Make sure you're using the right token for the right environment

### 5. **Token Expiration** ⚠️
- Expo tokens can expire if not used for a long time
- **Solution:** Re-register token periodically

## When Tokens DON'T Change

- ✅ Normal app usage
- ✅ App updates (minor)
- ✅ Device restarts
- ✅ App backgrounding/foregrounding

## Best Practices

### 1. **Always Re-register on App Start**
```javascript
// In your app, after login/on app start
const token = await registerForPushNotificationsAsync();
if (token) {
  await apiClient.post('/api/users/push-token', { 
    expoPushToken: token 
  });
}
```

### 2. **Handle Token Changes**
- Listen for token changes in your app
- Re-register when token changes
- Remove old tokens from backend if needed

### 3. **Clean Up Invalid Tokens**
- When Expo API returns "DeviceNotRegistered" error
- Remove that token from user's `expoPushTokens` array
- User will re-register on next app open

## How to Check if Token is Valid

**In your backend logs, look for:**
- `[PushService] Expo push request succeeded` → Token is valid ✅
- `[PushService] Expo push request failed` with `DeviceNotRegistered` → Token is invalid ❌

**Expo API response format:**
```json
{
  "data": [
    {
      "status": "ok",  // ✅ Valid
      "id": "..."
    }
  ]
}
```

OR

```json
{
  "data": [
    {
      "status": "error",  // ❌ Invalid
      "message": "DeviceNotRegistered",
      "details": {...}
    }
  ]
}
```

## Testing Token Validity

Use the test script:
```bash
# List all users and their tokens
node src/scripts/test-push-notification.js --list-users

# Find user by email
node src/scripts/test-push-notification.js --find-user user@example.com

# Test push with user ID and token
node src/scripts/test-push-notification.js <USER_ID> ExponentPushToken[xxxxx]
```

