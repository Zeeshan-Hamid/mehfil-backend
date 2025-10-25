# Google OAuth Setup for iOS Mobile App (2025)

## ✅ Backend Security Status

Your backend has been **secured and updated** with the following improvements:

### Security Fixes Applied
- ✅ **ID Token Verification**: All Google ID tokens are now cryptographically verified with Google's servers
- ✅ **Token Tampering Protection**: Invalid or tampered tokens are automatically rejected
- ✅ **Multi-Platform Support**: Supports iOS, Android, and Web client IDs
- ✅ **Input Validation**: Proper validation of all required fields
- ✅ **Error Handling**: Secure error messages that don't expose sensitive information

---

## 📋 Required Environment Variables for iOS

Add these to your `.env` file:

```bash
# ========================================
# GOOGLE OAUTH - iOS MOBILE APP
# ========================================

# PRIMARY: iOS Client ID (Required for iOS app)
# Get this from: https://console.cloud.google.com/apis/credentials
# Type: OAuth 2.0 Client ID -> iOS Application
GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com

# OPTIONAL: Web Client ID (if you also have a web app)
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com

# OPTIONAL: Android Client ID (if you also have an Android app)
GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
```

### Important Notes:
- **NO CLIENT SECRET** is needed for iOS native apps (this is by design for security)
- The backend uses these Client IDs to **verify ID tokens**, not for OAuth redirects
- You can configure multiple platform client IDs for cross-platform support

---

## 🔧 Google Cloud Console Setup

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Project name: `Mehfil App` (or your app name)

### Step 2: Configure OAuth Consent Screen
1. Navigate to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type
3. Fill in required information:
   - App name: `Mehfil`
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
5. Save and continue

### Step 3: Create iOS OAuth Client ID
1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **iOS** as application type
4. Enter your Bundle ID: `com.moneebb.mehfilapp` (must match your Xcode project)
5. Click **Create**
6. **Copy the Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)
7. Paste this into your `.env` file as `GOOGLE_IOS_CLIENT_ID`

### Step 4: (Optional) Create Web Client ID
If you have a web application:
1. Create Credentials > OAuth client ID > Web application
2. Add authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
3. Copy the Client ID and Secret
4. Add to `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

---

## 📱 iOS App Integration

### Modern Approach (2025 Recommended)

Your iOS/React Native app should use this flow:

```
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│   iOS App   │──────▶│    Google    │──────▶│  iOS App     │
│             │ Login │  Sign-In SDK │ Token │  (ID Token)  │
└─────────────┘       └──────────────┘       └──────┬───────┘
                                                      │
                                                      │ POST /api/auth/google/mobile/verify
                                                      │ Body: { idToken, role }
                                                      ▼
                                              ┌──────────────┐
                                              │   Backend    │
                                              │   Verifies   │
                                              │   ID Token   │
                                              │   with       │
                                              │   Google     │
                                              └──────┬───────┘
                                                      │
                                                      │ Returns JWT
                                                      ▼
                                              ┌──────────────┐
                                              │   iOS App    │
                                              │   Stores JWT │
                                              │   for API    │
                                              │   Requests   │
                                              └──────────────┘
```

### React Native / Expo Implementation

#### Option 1: Using @react-native-google-signin/google-signin

```typescript
// Install: npm install @react-native-google-signin/google-signin

import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Configure
GoogleSignin.configure({
  iosClientId: 'YOUR_GOOGLE_IOS_CLIENT_ID.apps.googleusercontent.com',
});

// Sign in
async function signInWithGoogle() {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    
    // Get ID token
    const tokens = await GoogleSignin.getTokens();
    const idToken = tokens.idToken;
    
    // Send to your backend
    const response = await fetch('http://your-backend.com/api/auth/google/mobile/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: idToken,
        role: 'customer', // or 'vendor'
        platform: 'ios'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Store JWT token
      await AsyncStorage.setItem('token', data.data.token);
      // Navigate to app
    }
  } catch (error) {
    console.error('Sign in error:', error);
  }
}
```

#### Option 2: Using expo-auth-session

```typescript
// Install: expo install expo-auth-session expo-crypto

import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

function App() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: 'YOUR_GOOGLE_IOS_CLIENT_ID.apps.googleusercontent.com',
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      
      // Send to backend
      verifyWithBackend(id_token);
    }
  }, [response]);

  async function verifyWithBackend(idToken: string) {
    const response = await fetch('http://your-backend.com/api/auth/google/mobile/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: idToken,
        role: 'customer',
        platform: 'ios'
      })
    });
    
    const data = await response.json();
    if (data.success) {
      // Store token and proceed
    }
  }

  return (
    <Button
      disabled={!request}
      title="Sign in with Google"
      onPress={() => promptAsync()}
    />
  );
}
```

---

## 🔐 Backend API Endpoint

### POST `/api/auth/google/mobile/verify`

**Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "role": "customer",
  "platform": "ios"
}
```

**Parameters:**
- `idToken` (required): The Google ID token from the mobile app
- `role` (required): Either `"customer"` or `"vendor"`
- `platform` (optional): `"ios"`, `"android"`, or `"web"`

**Success Response (200 OK):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": {
      "_id": "...",
      "email": "user@example.com",
      "role": "customer",
      "emailVerified": true,
      "profileCompleted": false,
      ...
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "message": "Invalid Google ID token",
  "error": "ID token verification failed with all provided client IDs"
}
```

---

## 🧪 Testing Your Setup

### 1. Test Configuration
```bash
cd backend
node src/scripts/test-google-oauth.js
```

### 2. Test Complete Flow
```bash
node src/scripts/test-oauth-complete.js
```

### 3. Test with Real Token (from your iOS app)
```bash
# Export your real Google ID token
export GOOGLE_ID_TOKEN="your-real-id-token-from-ios-app"

# Run the test
node src/scripts/test-mobile-auth-flow.js
```

---

## ✅ Verification Checklist

- [ ] Google Cloud Project created
- [ ] OAuth consent screen configured
- [ ] iOS OAuth Client ID created with correct Bundle ID
- [ ] `GOOGLE_IOS_CLIENT_ID` added to backend `.env` file
- [ ] Backend server restarted
- [ ] Tests passing: `node src/scripts/test-oauth-complete.js`
- [ ] iOS app configured with Google Sign-In SDK
- [ ] iOS app sends ID token to backend
- [ ] Backend verifies token and returns JWT
- [ ] JWT stored in iOS app for API requests

---

## 🔒 Security Features

Your backend now includes:

1. **ID Token Verification**: All tokens are verified with Google's servers
2. **No Client Secret Exposure**: iOS apps don't need client secrets
3. **Token Expiration Check**: Expired tokens are rejected
4. **Issuer Validation**: Only tokens from Google are accepted
5. **Audience Validation**: Tokens must be for your app
6. **Multi-Platform Support**: iOS, Android, and Web tokens accepted
7. **Rate Limiting**: Protection against brute force attacks
8. **Input Validation**: All fields validated before processing

---

## 🐛 Troubleshooting

### "Invalid Google ID token" Error

**Cause**: ID token verification failed

**Solutions**:
1. Verify `GOOGLE_IOS_CLIENT_ID` matches your Google Cloud Console iOS client ID
2. Check that your iOS app Bundle ID matches the one in Google Cloud Console
3. Ensure the ID token is fresh (not expired)
4. Verify you're sending the `idToken`, not the `accessToken`

### "Missing required fields" Error

**Cause**: Request missing `idToken` or `role`

**Solution**: Ensure your iOS app sends both fields:
```typescript
{
  idToken: "<token-from-google>",
  role: "customer" // or "vendor"
}
```

### "Server configuration error" Error

**Cause**: No Google Client IDs configured in `.env`

**Solution**: Add at least `GOOGLE_CLIENT_ID` or `GOOGLE_IOS_CLIENT_ID` to your `.env` file

---

## 📚 Additional Resources

- [Google Sign-In for iOS](https://developers.google.com/identity/sign-in/ios)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [React Native Google Sign-In](https://github.com/react-native-google-signin/google-signin)
- [Expo Auth Session](https://docs.expo.dev/versions/latest/sdk/auth-session/)

---

## 📝 Summary

Your backend is now **production-ready** for iOS Google OAuth authentication with:
- ✅ Secure ID token verification
- ✅ Protection against token tampering
- ✅ Multi-platform support
- ✅ Comprehensive error handling
- ✅ Input validation
- ✅ Rate limiting

Simply add your `GOOGLE_IOS_CLIENT_ID` to `.env` and configure your iOS app to send ID tokens to the `/api/auth/google/mobile/verify` endpoint!

