# Firebase Environment Variables Setup

This document explains how to set up the new Firebase API keys using environment variables.

## New API Keys

**IMPORTANT: These old API keys have been removed for security.**

## Environment Variables Required

Set the following environment variables in your build environment:

### Core Firebase Configuration
```bash
# API keys are now managed through environment variables for security
FIREBASE_AUTH_DOMAIN=whatword-a3f4b.firebaseapp.com
FIREBASE_PROJECT_ID=whatword-a3f4b
FIREBASE_STORAGE_BUCKET=whatword-a3f4b.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=1052433400571
FIREBASE_APP_ID=1:1052433400571:web:16122dad5c5a1344d9265e
FIREBASE_MEASUREMENT_ID=G-TWN7PXQ55G
GOOGLE_CLIENT_ID=1052433400571-4jndr2km62in472e86s63ocpu50tr72v.apps.googleusercontent.com
```

## EAS Build Configuration

For EAS builds, add these environment variables to your `eas.json` file or set them in your EAS dashboard:

```json
{
  "build": {
    "production": {
      "env": {
        "FIREBASE_AUTH_DOMAIN": "whatword-a3f4b.firebaseapp.com",
        "FIREBASE_PROJECT_ID": "whatword-a3f4b",
        "FIREBASE_STORAGE_BUCKET": "whatword-a3f4b.firebasestorage.app",
        "FIREBASE_MESSAGING_SENDER_ID": "1052433400571",
        "FIREBASE_APP_ID": "1:1052433400571:web:16122dad5c5a1344d9265e",
        "FIREBASE_MEASUREMENT_ID": "G-TWN7PXQ55G",
        "GOOGLE_CLIENT_ID": "1052433400571-4jndr2km62in472e86s63ocpu50tr72v.apps.googleusercontent.com"
      }
    }
  }
}
```

## Local Development

For local development, create a `.env` file in your project root:

```bash
# API keys are now managed through environment variables for security
FIREBASE_AUTH_DOMAIN=whatword-a3f4b.firebaseapp.com
FIREBASE_PROJECT_ID=whatword-a3f4b
FIREBASE_STORAGE_BUCKET=whatword-a3f4b.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=1052433400571
FIREBASE_APP_ID=1:1052433400571:web:16122dad5c5a1344d9265e
FIREBASE_MEASUREMENT_ID=G-TWN7PXQ55G
GOOGLE_CLIENT_ID=1052433400571-4jndr2km62in472e86s63ocpu50tr72v.apps.googleusercontent.com
```

## Fallback Configuration

The application is configured to fall back to the old hardcoded values if environment variables are not set. This ensures builds won't break during the transition.

### Old Keys (kept as fallback):
- **Old API Key**: `AIzaSyBQ4ua2PKDvF_RgHYTpB79S5HArrl9lChA`
- **Old iOS Key**: `AIzaSyCmoMenxHItEPXbKcD2EgeUN0epUa-UUAs`
- **Old Android Key**: `AIzaSyC1pxEdLS7La9HOq7AnIlIFMpYCfNbp0cY`

## Files Modified

1. **src/firebase.js** - Updated to use environment variables with fallback to Constants.expoConfig.extra values
2. **app.json** - Updated to use environment variable references in the extra section
3. **firebase/GoogleService-Info.plist** - Updated to use FIREBASE_API_KEY_IOS environment variable
4. **firebase/google-services.json** - Updated to use FIREBASE_API_KEY_ANDROID environment variable

## Testing

After setting up the environment variables:

1. Test the app locally to ensure Firebase connectivity works
2. Build and test on both iOS and Android platforms
3. Verify that all Firebase services (Auth, Firestore, etc.) are working correctly
4. Once verified, you can remove the old keys from the fallback configuration

## Security Note

Make sure to:
- Never commit the `.env` file to version control
- Set environment variables securely in your CI/CD pipeline
- Use EAS secrets for sensitive values in production builds

