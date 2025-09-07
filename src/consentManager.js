import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

export async function initializeConsentAndAds() {
  try {
    // Lazy-load Google Mobile Ads so Expo Go doesn't crash (native module not present)
    let adModule = null;
    if (Constants?.appOwnership === 'expo') {
      // Expo Go: do not require the native module at all
      adModule = null;
    } else {
      try {
        adModule = require('react-native-google-mobile-ads');
      } catch (_) {
        adModule = null;
      }
    }

    const mobileAds = adModule ? adModule.default : null;
    const MaxAdContentRating = adModule ? adModule.MaxAdContentRating : null;
    const AdsConsent = adModule ? adModule.AdsConsent : null;
    const AdsConsentStatus = adModule ? adModule.AdsConsentStatus : null;

    // iOS ATT prompt (required for personalized ads)
    if (Platform.OS === 'ios') {
      try {
        await requestTrackingPermissionsAsync();
      } catch (_) {}
    }

    // Google UMP: fetch and show if required
    try {
      if (AdsConsent && AdsConsentStatus) {
        await AdsConsent.requestInfoUpdate({});
        const status = await AdsConsent.getStatus();
        if (status === AdsConsentStatus.REQUIRED) {
          const form = await AdsConsent.loadForm();
          await form.show();
        }
      }
    } catch (_) {}

    // After consent, set request configuration
    if (mobileAds && MaxAdContentRating) {
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.T,
        // tagForUnderAgeOfConsent: false, // add if needed
        // tagForChildDirectedTreatment: false, // add if needed
      });
    }

    // Initialize the SDK (prepares ads per adService logic)
    try {
      if (mobileAds) {
        await mobileAds().initialize();
      }
    } catch (_) {}

    // Determine personalization status for callers
    let personalizedAllowed = false;
    try {
      if (AdsConsent && AdsConsentStatus) {
        const finalStatus = await AdsConsent.getStatus();
        personalizedAllowed = finalStatus === AdsConsentStatus.OBTAINED;
      }
    } catch (_) {}

    return { personalizedAllowed };
  } catch (e) {
    return { personalizedAllowed: false };
  }
}


