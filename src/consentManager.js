import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

export async function initializeConsentAndAds() {
  try {
    // Lazy-load Google Mobile Ads so Expo Go doesn't crash (native module not present)
    let adModule = null;
    const isExpoGo = Constants?.appOwnership === 'expo' && __DEV__;
    
    if (isExpoGo) {
      // Expo Go: do not require the native module at all
      console.log('ConsentManager: Running in Expo Go, skipping AdMob');
      adModule = null;
    } else {
      try {
        console.log('ConsentManager: Attempting to load AdMob module...');
        adModule = require('react-native-google-mobile-ads');
        console.log('ConsentManager: AdMob module loaded successfully');
      } catch (error) {
        console.error('ConsentManager: Failed to load AdMob module:', error);
        adModule = null;
      }
    }

    const mobileAds = adModule ? adModule.default : null;
    const MaxAdContentRating = adModule ? adModule.MaxAdContentRating : null;
    // Skip UMP consent entirely for now to avoid blocking test ads
    const AdsConsent = null;
    const AdsConsentStatus = null;

    console.log('ConsentManager: mobileAds available:', !!mobileAds);
    console.log('ConsentManager: MaxAdContentRating available:', !!MaxAdContentRating);
    console.log('ConsentManager: AdsConsent available:', !!AdsConsent);

    // iOS ATT prompt (required for personalized ads)
    if (Platform.OS === 'ios') {
      try {
        console.log('ConsentManager: Requesting iOS tracking permissions...');
        await requestTrackingPermissionsAsync();
        console.log('ConsentManager: iOS tracking permissions completed');
      } catch (error) {
        console.error('ConsentManager: iOS tracking permissions error:', error);
      }
    }

    // UMP disabled for now

    // After consent, set request configuration
    if (mobileAds && MaxAdContentRating) {
      try {
        console.log('ConsentManager: Setting AdMob request configuration...');
        await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.T,
          // tagForUnderAgeOfConsent: false, // add if needed
          // tagForChildDirectedTreatment: false, // add if needed
        });
      } catch (configError) {
        console.warn('ConsentManager: Failed to set request configuration:', configError);
      }
    }

    // Initialize the SDK (prepares ads per adService logic)
    try {
      if (mobileAds) {
        await mobileAds().initialize();
        console.log('ConsentManager: AdMob SDK initialized successfully');
      }
    } catch (initError) {
      console.warn('ConsentManager: Failed to initialize AdMob SDK:', initError);
    }

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



