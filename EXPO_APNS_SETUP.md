# 📱 Setting Up APNs for Expo Development (expo run:ios --device)

## Quick Setup for Development

### Step 1: Configure Expo Credentials

Run this in your **Expo app project** (not backend):

```bash
npx expo credentials:manager
```

Select:
1. **iOS** → **Push Notifications**
2. Choose **"Set up new credentials"** or **"Use existing credentials"**
3. If setting up new:
   - Expo will guide you through Apple Developer account setup
   - You'll need an Apple Developer account ($99/year)
   - Expo can generate the certificates for you

### Step 2: Alternative - Use EAS Credentials (Recommended)

```bash
# Install EAS CLI if you haven't
npm install -g eas-cli

# Login to Expo
eas login

# Configure credentials
eas credentials
```

Select:
- Platform: **iOS**
- Workflow: **Development** (for `expo run:ios`)
- Select **Push Notifications** → **Set up new** or **Use existing**

### Step 3: Verify Your app.json/app.config.js

Make sure your Expo config has:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.moneebb.mehfilapp",
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "sound": true,
          "badge": true,
          "alert": true
        }
      ]
    ]
  }
}
```

### Step 4: Run on Device

```bash
npx expo run:ios --device
```

This will:
- Build the native iOS app
- Install on your connected device
- Use the credentials you configured

## Important Notes

### Development vs Production Credentials

- **Development credentials**: Used for `expo run:ios --device` and development builds
- **Production credentials**: Used for App Store builds

For development, you need **development APNs certificates**.

### Testing Push Notifications

1. **App must be in background/closed** - Push notifications don't show when app is in foreground (by default)
2. **Device must be connected** - For `expo run:ios --device`
3. **Check notification permissions** - Make sure your app requests notification permissions

### Common Issues

**Issue: "Could not find APNs credentials"**
- Solution: Run `eas credentials` or `npx expo credentials:manager` and set up push notification credentials

**Issue: "Invalid bundle identifier"**
- Solution: Make sure `bundleIdentifier` in app.json matches your Apple Developer account

**Issue: Push works in Expo Go but not in development build**
- Solution: Development builds need separate credentials from Expo Go

## Quick Test After Setup

Once credentials are configured:

1. Run: `npx expo run:ios --device`
2. Make sure app registers push token (check backend logs)
3. Send a test push from backend
4. **Put app in background** (home button/swipe up)
5. Push notification should appear

## Alternative: Use Expo Go for Quick Testing

If you just want to test quickly without setting up credentials:

```bash
npx expo start
# Scan QR code with Expo Go app
```

**Note**: Expo Go uses Expo's shared credentials, so push notifications work without setup, but you can't use `expo run:ios --device` with Expo Go.

