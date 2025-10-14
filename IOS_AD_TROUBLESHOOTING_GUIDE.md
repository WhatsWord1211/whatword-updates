# iOS Ad Troubleshooting Guide - WhatWord

## 🚨 Current Status: Build 39 - Comprehensive Debugging Enabled

This guide will help you diagnose and fix iOS ad issues using the new debugging system.

---

## 📱 Quick Start: Testing iOS Ads

### Step 1: Choose Test Mode or Production Mode

**In `src/adService.js` (lines 11-14):**

```javascript
// Set to true to enable iOS-specific debug alerts (DISABLE BEFORE PRODUCTION!)
const IOS_DEBUG_ADS = true;

// Set to true to use Google's test ad units for iOS (for testing propagation issues)
const IOS_USE_TEST_ADS = false;
```

**Options:**
- `IOS_USE_TEST_ADS = true` → Uses Google's test ad unit (always works immediately)
- `IOS_USE_TEST_ADS = false` → Uses your production ad unit (requires 24-48h propagation)

### Step 2: Build and Deploy

```bash
# Install updated dependencies
npm install

# Build for iOS TestFlight
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios
```

### Step 3: Test on Physical iOS Device

1. Install from TestFlight (REQUIRED - simulators don't support AdMob)
2. Launch app
3. Play a solo game to completion
4. Watch for debug alerts that will tell you exactly what's happening

---

## 🔍 What the Debug Alerts Tell You

### On App Launch:

**Alert 1: "iOS Ad Mode"**
- `TEST ADS` → Using Google's test ad unit (always works)
- `PRODUCTION ADS` → Using your ad unit (may take 48h to activate)

**Alert 2: "ATT Status"**
- `GRANTED` → Best case, 80% ad fill rate
- `DENIED` → 20-50% fill rate, but still works
- `NOT DETERMINED` → User hasn't decided, using non-personalized ads

**Alert 3: "Ad LOADED successfully"**
- ✅ Ad is ready to show (this is what you want to see!)
- If you DON'T see this, there's a load error (see below)

### When Ad Tries to Show:

**Alert: "showInterstitialAd() called"**
- Confirms the game is attempting to show an ad

**Possible outcomes:**

✅ **"Ad is loaded! Attempting to show now..."**
- Good! Ad should appear

❌ **"SKIPPED: Ad not loaded yet"**
- Ad didn't load in time
- Check for load error alerts

❌ **"Ad Load ERROR!"**
- Shows error code and diagnosis (see Error Codes below)

✅ **"Ad closed successfully!"**
- Ad showed and user closed it - SUCCESS!

---

## 🐛 Common Error Codes and Fixes

### Error Code 1: NO FILL

**What it means:** No ads available to show

**iOS-specific causes:**
1. **New Ad Unit ID (MOST LIKELY)** - AdMob takes 24-48 hours to propagate new iOS ad units
2. **ATT Denied** - Check Settings > Privacy > Tracking > WhatWord
3. **Low inventory** - Try different times of day

**How to test:**
1. In `adService.js`, set `IOS_USE_TEST_ADS = true`
2. Rebuild and test
3. If test ads work → Wait 48-72 hours for production ads to activate
4. If test ads don't work → Check other causes below

### Error Code 3: NO AD CONFIG

**What it means:** AdMob can't find your app configuration

**Causes:**
1. **Bundle ID mismatch** - Most common iOS issue
2. **Ad unit not linked to iOS app in AdMob**
3. **iOS app not verified in AdMob console**

**Fix: Verify Bundle ID in AdMob Console**

1. Go to https://apps.admob.com
2. Click "Apps" in left sidebar
3. Find "WhatWord" iOS app
4. Click "App settings"
5. **Verify Bundle ID matches EXACTLY:** `com.whatword.app`
6. If not, add iOS app:
   - Click "Add app" → "iOS"
   - Enter Bundle ID: `com.whatword.app`
   - Download new `GoogleService-Info.plist`
   - Replace `firebase/GoogleService-Info.plist` in project
   - Rebuild

**Fix: Verify Ad Unit is Linked**

1. In AdMob console, click "Ad units" in left sidebar
2. Find your iOS interstitial ad unit: `ca-app-pub-8036041739101786/9274366810`
3. Verify it's linked to the iOS app "WhatWord"
4. If not, create new ad unit:
   - Click "Add ad unit"
   - Select "WhatWord" iOS app
   - Choose "Interstitial"
   - Copy new ad unit ID
   - Update `IOS_PROD_AD_UNIT` in `adService.js`
   - Rebuild

### Error Code 2: NETWORK ERROR

**What it means:** Device can't reach AdMob servers

**Fix:**
1. Check device internet connection
2. Try cellular data vs WiFi
3. Check if AdMob is blocked (VPN, firewall, enterprise networks)

---

## 🎯 Step-by-Step Diagnostic Process

### Scenario 1: "Ad Load ERROR! Code: 1" (No Fill)

**If you just changed ad unit IDs or created new ad units:**

1. This is EXPECTED for 24-48 hours
2. Temporary solution: Set `IOS_USE_TEST_ADS = true` to verify everything else works
3. After 48 hours: Set back to `false` and test again
4. Check AdMob console Reports > Requests to see if iOS requests are being logged

**If ad units have been live for >72 hours:**

1. Check ATT status alert - if DENIED:
   - Go to Settings > Privacy & Security > Tracking
   - Enable "WhatWord"
   - Restart app
2. Check AdMob account status - any policy violations?
3. Check AdMob Reports > Requests - seeing iOS requests but no impressions?
   - This indicates low fill rate (normal for non-personalized ads)
   - Grant ATT permission for better fill

### Scenario 2: "Ad Load ERROR! Code: 3" (No Config)

**Follow the Bundle ID verification steps above:**

1. AdMob console > Apps > WhatWord iOS > Settings
2. Verify bundle ID: `com.whatword.app`
3. If mismatch:
   - Either fix in AdMob to match, OR
   - Update `app.json` bundleIdentifier to match AdMob
   - Rebuild

### Scenario 3: "SKIPPED: Ad not loaded yet"

**This means ad never loaded successfully**

1. Look back in alerts/console for "Ad Load ERROR" message
2. Follow steps for that error code
3. If no error shown:
   - Ad may be taking >10 seconds to load (network issue)
   - Try on faster internet connection

### Scenario 4: No alerts appearing at all

**This means adService isn't initializing**

1. Check console for "AdMob module NOT AVAILABLE" alert
2. If you see this:
   - You're testing in Expo Go (not supported)
   - Build with EAS and test on physical device
3. Check `App.js` - ensure `initializeConsentAndAds()` is called

---

## ✅ Success Indicators

You'll know ads are working when you see this sequence:

1. **App Launch:**
   - ✅ "iOS Ad Mode: PRODUCTION ADS" (or TEST ADS)
   - ✅ "ATT Status: GRANTED" (or DENIED - both work)
   - ✅ "Ad LOADED successfully! Ready to show."

2. **After Game Completion:**
   - ✅ "showInterstitialAd() called"
   - ✅ "Ad is loaded! Attempting to show now..."
   - ✅ "show() called - ad should appear now!"
   - ✅ **Ad appears on screen**
   - ✅ "Ad closed successfully!" (after you close it)

---

## 🔧 AdMob Console Verification Checklist

### Check iOS App Configuration

**Go to: AdMob Console > Apps**

- [ ] iOS app "WhatWord" exists
- [ ] Bundle ID is exactly `com.whatword.app`
- [ ] App status is "Ready" (not "Needs attention")
- [ ] `GoogleService-Info.plist` was downloaded from this app

### Check Ad Unit Configuration

**Go to: AdMob Console > Ad units**

- [ ] iOS interstitial ad unit exists
- [ ] Ad unit ID: `ca-app-pub-8036041739101786/9274366810`
- [ ] Ad unit is linked to "WhatWord" iOS app
- [ ] Ad unit status is "Ready" or "Serving"
- [ ] Ad unit was created >48 hours ago (if testing production)

### Check App Privacy Settings

**Go to: AdMob Console > Apps > WhatWord iOS > App privacy**

- [ ] "User messaging platform" status: Configured
- [ ] Privacy policy URL is set
- [ ] ATT message is set: "Your data will be used to deliver personalized ads..."

### Check Reports

**Go to: AdMob Console > Reports**

1. Select date range: Last 7 days
2. Filter by: App = "WhatWord" iOS
3. Check metrics:
   - [ ] **Requests > 0** → App is reaching AdMob servers ✅
   - [ ] **Match rate > 0%** → AdMob has ads available
   - [ ] **Impressions > 0** → Ads are showing successfully ✅

**If Requests = 0:**
- Bundle ID mismatch (most likely)
- App not initialized
- Device offline during test

**If Requests > 0 but Impressions = 0:**
- No fill (Code 1) - wait 48h for propagation
- ATT denied - enable in device settings
- Low inventory - normal for new ad units

---

## 🚀 Production Release Checklist

**BEFORE submitting final build to App Store:**

1. In `src/adService.js`:
   ```javascript
   const IOS_DEBUG_ADS = false;  // DISABLE alerts for production
   const IOS_USE_TEST_ADS = false;  // Use production ads
   ```

2. Test on TestFlight:
   - Ads load successfully
   - Ads display without debug alerts
   - No crashes after ad closes

3. Verify AdMob console:
   - Seeing iOS requests
   - Seeing impressions (>0%)
   - No policy warnings

4. Update version and build:
   ```bash
   npm run update-version patch  # or minor/major
   eas build --platform ios --profile production
   ```

---

## 📊 Expected Ad Fill Rates (iOS)

| Scenario | Fill Rate | Notes |
|----------|-----------|-------|
| Test ads | 100% | Always works immediately |
| Production ads (NEW) | 0% for 24-48h | Normal propagation delay |
| Production ads + ATT Granted | 80-90% | Best case |
| Production ads + ATT Denied | 20-50% | Non-personalized ads |
| Production ads (<10 daily users) | 30-60% | Low traffic penalty |
| Production ads (mature app) | 70-95% | Expected after 2-3 weeks |

---

## 🆘 Still Not Working?

### Collect Diagnostic Information

1. Build with `IOS_DEBUG_ADS = true`
2. Play full game on TestFlight
3. Screenshot ALL alerts that appear
4. Note the sequence and exact error codes

### Share with Support

Include:
- Build number (current: 39)
- iOS version
- Device model
- All alert screenshots
- When ad units were created/last changed
- ATT permission status
- AdMob console screenshots (Requests/Impressions)

### Contact Points

- Expo Forums: https://forums.expo.dev
- react-native-google-mobile-ads: https://github.com/invertase/react-native-google-mobile-ads/issues
- AdMob Support: https://support.google.com/admob

---

## 📝 Version History

- **Build 39** (Current)
  - Added iOS Privacy Manifest for iOS 17+ compliance
  - Added comprehensive debug alerts
  - Increased preload timeout to 10s
  - Added test/production ad mode toggle
  - Pinned react-native-google-mobile-ads to 15.4.0
  - Added pod repo update to EAS builds

- **Build 38** (Previous)
  - Fire-and-forget ad implementation
  - Basic error handling
  - 5s preload timeout

---

## 🔑 Key Files Reference

| File | Purpose |
|------|---------|
| `src/adService.js` | Ad loading, showing, debug configuration |
| `src/consentManager.js` | ATT permission, AdMob SDK initialization |
| `app.json` | iOS bundle ID, privacy manifest, ad plugin config |
| `firebase/GoogleService-Info.plist` | Firebase/AdMob iOS app configuration |
| `eas.json` | Build configuration, pod install settings |
| `package.json` | Dependencies including react-native-google-mobile-ads |

---

**Good luck! The debug system will tell you exactly what's happening. 🎯**

