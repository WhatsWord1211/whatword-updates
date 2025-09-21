# WhatWord Update System

## How It Works

The app automatically checks for updates when users open it by comparing the current build number with the latest version hosted on GitHub.

## Setup (One-time)

1. **Create GitHub Repository:**
   - Create a new repository: `whatword-updates`
   - Make it public
   - Upload the `version.json` file

2. **Update the URL:**
   - In `src/appUpdateService.js`, update the `versionCheckUrl` to your repository:
   ```javascript
   const versionCheckUrl = 'https://raw.githubusercontent.com/WhatsWord1211/whatword-updates/refs/heads/main/version.json';
   ```

## Release Process (Automatic)

1. **Update version in app.json:**
   ```json
   {
     "expo": {
       "android": {
         "versionCode": 16
       }
     }
   }
   ```

2. **Update version file:**
   ```bash
   npm run update-version
   ```

3. **Commit and push to GitHub:**
   ```bash
   git add version.json
   git commit -m "Update to version 16"
   git push
   ```

4. **Build and upload to Google Play:**
   ```bash
   eas build --platform android --profile production --non-interactive
   ```

## What Happens

- **Users with old versions** → See "Update Available" alert
- **Users with current version** → No alert
- **Users click "Update Now"** → Opens Google Play Store

## Files

- `version.json` - Contains latest version info
- `scripts/update-version.js` - Automatically updates version.json
- `src/appUpdateService.js` - Handles update checking in the app

## Testing

- Change `latestBuildNumber` in `version.json` to a higher number
- Users will see update notification
- Change it back to current number to stop notifications
