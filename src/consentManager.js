import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } from 'expo-tracking-transparency';

export async function initializeConsentAndAds() {
  try {
    // iOS ATT prompt MUST be requested FIRST before any tracking/ad initialization
    // This is required by Apple App Store guidelines
    if (Platform.OS === 'ios') {
      try {
        console.log('ConsentManager: [iOS ATT] Starting App Tracking Transparency flow...');
        
        // First check current status
        const currentStatus = await getTrackingPermissionsAsync();
        console.log('ConsentManager: [iOS ATT] Current permission status:', currentStatus.status);
        
        // If not determined yet, request permission (this shows the system prompt)
        if (currentStatus.status === 'undetermined') {
          console.log('ConsentManager: [iOS ATT] Status is undetermined, requesting permission...');
          const { status } = await requestTrackingPermissionsAsync();
          console.log('ConsentManager: [iOS ATT] Permission request result:', status);
          
          if (status === 'denied') {
            console.warn('ConsentManager: [iOS ATT] User denied tracking permission - ads will be non-personalized');
            console.warn('ConsentManager: [iOS ATT] User can enable in Settings > Privacy & Security > Tracking');
          } else if (status === 'granted') {
            console.log('ConsentManager: [iOS ATT] User granted tracking permission - personalized ads enabled');
          } else if (status === 'restricted') {
            console.warn('ConsentManager: [iOS ATT] Tracking is restricted (parental controls or MDM)');
          }
        } else {
          // Status was already determined (granted, denied, or restricted)
          console.log('ConsentManager: [iOS ATT] Permission was previously determined:', currentStatus.status);
          
          if (currentStatus.status === 'denied') {
            console.warn('ConsentManager: [iOS ATT] User previously denied tracking - ads will be non-personalized');
            console.warn('ConsentManager: [iOS ATT] To enable, go to Settings > Privacy & Security > Tracking > WhatWord');
          } else if (currentStatus.status === 'granted') {
            console.log('ConsentManager: [iOS ATT] User previously granted tracking - personalized ads enabled');
          } else if (currentStatus.status === 'restricted') {
            console.warn('ConsentManager: [iOS ATT] Tracking is restricted by device settings');
          }
        }
      } catch (error) {
        console.error('ConsentManager: [iOS ATT] Error during tracking permission flow:', error);
        console.error('ConsentManager: [iOS ATT] Error details:', error.message, error.stack);
      }
    }

    // NOW initialize ad modules AFTER ATT has been handled
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
        // iOS-specific: Add delay before requiring native modules
        if (Platform.OS === 'ios') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
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

    // Initialize the SDK ONCE here (not in adService)
    try {
      if (mobileAds) {
        console.log('ConsentManager: Initializing AdMob SDK...');
        await mobileAds().initialize();
        console.log('ConsentManager: AdMob SDK initialized successfully');
        
        // Set request configuration AFTER initialization
        if (MaxAdContentRating) {
          try {
            console.log('ConsentManager: Setting AdMob request configuration...');
            await mobileAds().setRequestConfiguration({
              maxAdContentRating: MaxAdContentRating.T,
              // tagForUnderAgeOfConsent: false,
              // tagForChildDirectedTreatment: false,
            });
            console.log('ConsentManager: Request configuration set successfully');
          } catch (configError) {
            console.warn('ConsentManager: Failed to set request configuration:', configError);
          }
        }
        
        // Now initialize the ad service (which will load the first ad)
        const adService = require('./adService').default;
        await adService.initialize();
        console.log('ConsentManager: AdService initialized successfully');
      }
    } catch (initError) {
      console.error('ConsentManager: Failed to initialize AdMob SDK:', initError);
      console.error('ConsentManager: Error details:', initError.message);
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



