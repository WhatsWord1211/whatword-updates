// AdMob imports - load in production builds
import Constants from 'expo-constants';
import { Platform, InteractionManager, Alert } from 'react-native';

let mobileAds, InterstitialAd;

// ============================================================================
// iOS AD DEBUGGING CONFIGURATION
// ============================================================================
// Set to true to enable iOS-specific debug alerts (DISABLE BEFORE PRODUCTION!)
const IOS_DEBUG_ADS = false;

// Set to true to use Google's test ad units for iOS (for testing propagation issues)
const IOS_USE_TEST_ADS = false;

// iOS Test Ad Unit ID (always works immediately)
const IOS_TEST_AD_UNIT = 'ca-app-pub-3940256099942544/4411468910';

// iOS Production Ad Unit ID (requires 24-48h propagation after AdMob setup)
const IOS_PROD_AD_UNIT = 'ca-app-pub-8036041739101786/9274366810';

function iosDebugLog(message, showAlert = false) {
  if (Platform.OS === 'ios') {
    console.log(`[iOS AD DEBUG] ${message}`);
    if (IOS_DEBUG_ADS && showAlert) {
      Alert.alert('iOS Ad Debug', message, [{ text: 'OK' }], { cancelable: true });
    }
  }
}
// ============================================================================

// Always try to load AdMob in production builds
// Only skip in development with Expo Go
const isExpoGo = Constants?.appOwnership === 'expo' && __DEV__;

if (isExpoGo) {
  // Running in Expo Go development - native module unavailable
  console.log('AdService: Running in Expo Go, AdMob not available');
  mobileAds = null;
  InterstitialAd = null;
} else {
  try {
    console.log('AdService: Attempting to load AdMob module...');
    const adModule = require('react-native-google-mobile-ads');
    mobileAds = adModule.default;
    InterstitialAd = adModule.InterstitialAd;
    console.log('AdService: AdMob module loaded successfully');
  } catch (error) {
    console.error('AdService: Failed to load AdMob module:', error);
    mobileAds = null;
    InterstitialAd = null;
  }
}

// Interstitial Ad Unit IDs
const AD_UNIT_IDS = {
  INTERSTITIAL: Platform.OS === 'ios'
    ? (IOS_USE_TEST_ADS ? IOS_TEST_AD_UNIT : IOS_PROD_AD_UNIT)
    : 'ca-app-pub-8036041739101786/1836533025' // Android production interstitial (UNCHANGED)
};

class AdService {
  constructor() {
    this.interstitialAd = null;
    this.isInitialized = false;
    this.isAdLoaded = false;
    this.isLoadingAd = false; // Prevent concurrent loads - Grok's suggestion
    this.loadRetries = 0; // Track retry attempts with exponential backoff
    this.adFrequency = 1; // Show ad after every X games (1 = every game)
    this.gamesPlayed = 0;
    this.showCompletionCallback = null; // Callback for when ad closes
    this.attStatus = null; // Track iOS ATT status
    
    // Don't auto-initialize - wait for consent manager to complete first
    // this.initialize();
  }

  async initialize() {
    try {
      console.log('AdService: Initializing (called from consentManager after SDK init)...');
      console.log('AdService: Platform:', Platform?.OS || 'unknown');
      console.log('AdService: Constants.appOwnership:', Constants?.appOwnership);
      console.log('AdService: __DEV__:', __DEV__);
      
      // iOS-specific debug info
      if (Platform.OS === 'ios') {
        iosDebugLog(`iOS Ad Mode: ${IOS_USE_TEST_ADS ? 'TEST ADS' : 'PRODUCTION ADS'}`, true);
        iosDebugLog(`iOS Ad Unit ID: ${AD_UNIT_IDS.INTERSTITIAL}`);
        iosDebugLog('iOS Debug Alerts: ' + (IOS_DEBUG_ADS ? 'ENABLED' : 'DISABLED'));
      }
      
      // Check if AdMob is available
      if (!mobileAds || !InterstitialAd) {
        console.log('AdService: AdMob not available, running in fallback mode');
        console.log('AdService: mobileAds available:', !!mobileAds);
        console.log('AdService: InterstitialAd available:', !!InterstitialAd);
        iosDebugLog('AdMob module NOT AVAILABLE - ads will not work', true);
        this.isInitialized = false;
        return;
      }

      // ATT status will be set by consentManager, but we can check it here
      if (Platform.OS === 'ios') {
        try {
          const { getTrackingPermissionsAsync } = require('expo-tracking-transparency');
          const { status } = await getTrackingPermissionsAsync();
          this.attStatus = status; // Store for ad request configuration
          console.log('AdService: ATT status:', status);
          
          if (status === 'denied') {
            console.warn('AdService: ATT denied - will use non-personalized ads only');
            iosDebugLog('ATT Status: DENIED - Non-personalized ads only (20-50% fill rate)', true);
          } else if (status === 'granted') {
            console.log('AdService: ATT granted - personalized ads available for better fill rates');
            iosDebugLog('ATT Status: GRANTED - Personalized ads enabled (80% fill rate)', true);
          } else {
            iosDebugLog(`ATT Status: ${status} - Using non-personalized ads`, true);
          }
        } catch (attError) {
          console.log('AdService: Could not get ATT status:', attError);
          this.attStatus = 'unavailable';
          iosDebugLog('ATT Status: UNAVAILABLE - Error checking permissions', true);
        }
      }

      // SDK is already initialized by consentManager, just mark as ready
      this.isInitialized = true;
      console.log('AdService: Marked as initialized, loading first ad...');
      
      // Pre-load first ad immediately
      this.loadInterstitialAd();
      
      console.log('AdService: Successfully initialized');
    } catch (error) {
      console.error('AdService: Failed to initialize:', error);
      console.error('AdService: Error details:', error.message, error.stack);
      this.isInitialized = false;
    }
  }

  // Cleanup method - prevent concurrent ads and stale state
  cleanupAd() {
    try {
      if (this.interstitialAd) {
        console.log('AdService: Cleaning up old ad instance');
        this.interstitialAd.removeAllListeners();
        this.interstitialAd = null;
      }
      this.isAdLoaded = false;
      this.isLoadingAd = false;
    } catch (error) {
      console.error('AdService: Error during ad cleanup:', error);
    }
  }

  // Load interstitial ad
  loadInterstitialAd() {
    try {
      console.log('AdService: loadInterstitialAd called');
      
      // Prevent concurrent loads
      if (this.isLoadingAd) {
        console.log('AdService: Ad load already in progress, skipping');
        return;
      }
      
      if (!InterstitialAd) {
        console.log('AdService: InterstitialAd not available, skipping load');
        return;
      }

      // Cleanup old ad instance to prevent stale state
      this.cleanupAd();
      
      this.isLoadingAd = true;
      console.log('AdService: Creating interstitial ad with ID:', AD_UNIT_IDS.INTERSTITIAL);
      
      // Configure ad request based on ATT status
      // If ATT granted on iOS, allow personalized ads for better fill rates
      // Otherwise use non-personalized ads (works on both iOS and Android)
      const requestNonPersonalized = Platform.OS === 'ios' ? this.attStatus !== 'granted' : true;
      console.log('AdService: Creating ad with requestNonPersonalizedAdsOnly:', requestNonPersonalized);
      console.log('AdService: ATT status:', this.attStatus, 'Platform:', Platform.OS);
      
      this.interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
        requestNonPersonalizedAdsOnly: requestNonPersonalized,
        keywords: ['word games', 'puzzle games', 'brain games', 'word puzzle'],
      });

      this.interstitialAd.addAdEventListener('loaded', () => {
        console.log('AdService: Interstitial ad loaded successfully');
        this.isAdLoaded = true;
        this.isLoadingAd = false;
        this.loadRetries = 0;
        iosDebugLog('Ad LOADED successfully! Ready to show.', true);
      });

      this.interstitialAd.addAdEventListener('closed', () => {
        console.log('AdService: Interstitial ad closed');
        
        // Call completion callback FIRST if one is waiting
        if (this.showCompletionCallback) {
          console.log('AdService: Calling show completion callback');
          const callback = this.showCompletionCallback;
          this.showCompletionCallback = null;
          callback(); // Call after clearing to prevent recursion
        }
        
        // THEN mark as not loaded and reload
        this.isAdLoaded = false;
        
        // Reload for next use after a delay
        setTimeout(() => {
          if (!this.isLoadingAd) {
            this.loadInterstitialAd();
          }
        }, 2000); // Increased delay to prevent interference
      });

      this.interstitialAd.addAdEventListener('error', (error) => {
        console.error('AdService: Ad error:', error.code, error.message);
        
        // Log detailed error information for diagnosis
        let errorMessage = `Ad Load ERROR!\nCode: ${error.code}\nMessage: ${error.message}`;
        
        if (error.code === 1) {
          console.error('AdService: Error code 1 (No fill) - often caused by ATT denial on iOS');
          errorMessage += '\n\nCause: NO FILL';
          if (Platform.OS === 'ios' && this.attStatus === 'denied') {
            console.error('AdService: ATT is denied - this is likely preventing ad fill');
            errorMessage += '\nATT is DENIED - enable in Settings > Privacy > Tracking';
          } else if (Platform.OS === 'ios') {
            errorMessage += '\nPossible causes:\n- New Ad Unit ID (wait 48h)\n- Low inventory\n- Network issue';
          }
        } else if (error.code === 3) {
          console.error('AdService: Error code 3 (No ad config) - check AdMob setup or ATT status');
          errorMessage += '\n\nCause: NO AD CONFIG\nPossible causes:\n- Bundle ID mismatch in AdMob\n- Ad Unit not linked to app\n- AdMob app not verified';
        } else if (error.code === 2) {
          errorMessage += '\n\nCause: NETWORK ERROR\nCheck internet connection';
        } else {
          errorMessage += '\n\nUnknown error - check AdMob console';
        }
        
        iosDebugLog(errorMessage, true);
        
        // Call completion callback FIRST if one is waiting (ad failed, continue game flow)
        if (this.showCompletionCallback) {
          console.log('AdService: Ad error, calling show completion callback to continue game flow');
          const callback = this.showCompletionCallback;
          this.showCompletionCallback = null;
          callback(); // Call after clearing to prevent recursion
        }
        
        // THEN update state
        this.isLoadingAd = false;
        this.isAdLoaded = false;
        
        // Retry with exponential backoff
        const retryDelay = 5000 * Math.pow(2, Math.min(this.loadRetries || 0, 2));
        this.loadRetries = (this.loadRetries || 0) + 1;
        iosDebugLog(`Will retry loading ad in ${retryDelay/1000}s (attempt ${this.loadRetries})`);
        setTimeout(() => {
          if (!this.isLoadingAd) {
            this.loadInterstitialAd();
          }
        }, retryDelay);
      });

      console.log('AdService: Starting to load interstitial ad...');
      iosDebugLog('Starting ad load request...', false);
      this.interstitialAd.load();
      
    } catch (error) {
      console.error('AdService: Failed to load interstitial ad:', error);
      this.isLoadingAd = false;
    }
  }

  // Show interstitial ad after game completion
  async showInterstitialAd() {
    try {
      console.log('AdService: showInterstitialAd called');
      console.log('AdService: Platform:', Platform?.OS);
      console.log('AdService: isInitialized:', this.isInitialized);
      console.log('AdService: interstitialAd exists:', !!this.interstitialAd);
      console.log('AdService: isAdLoaded:', this.isAdLoaded);
      
      iosDebugLog('showInterstitialAd() called - attempting to show ad', true);
      
      // Check if AdMob is available first
      if (!InterstitialAd || !this.interstitialAd) {
        console.log('AdService: AdMob not available, skipping ad');
        iosDebugLog('SKIPPED: AdMob not available', true);
        return true;
      }

      if (!this.isInitialized) {
        console.log('AdService: AdMob not initialized, skipping ad');
        iosDebugLog('SKIPPED: AdService not initialized', true);
        return true;
      }

      this.gamesPlayed++;

      // Ensure ad is loaded before attempting to show
      if (!this.isAdLoaded || !this.interstitialAd) {
        console.log('AdService: Ad not loaded or ad instance missing, skipping');
        iosDebugLog('SKIPPED: Ad not loaded yet (still loading or failed to load)', true);
        if (!this.isLoadingAd) {
          this.loadInterstitialAd();
        }
        return true;
      }

      // iOS CRITICAL: Show ad IMMEDIATELY without delays
      // Delays cause ads to expire on iOS
      console.log('AdService: Showing ad immediately (no delays)');
      iosDebugLog('Ad is loaded! Attempting to show now...', true);
      
      return new Promise((resolve) => {
        // Set up timeout
        const timeout = setTimeout(() => {
          console.log('AdService: Ad show timeout (15s), continuing');
          iosDebugLog('Ad show TIMEOUT (15s) - ad may have failed to display', true);
          this.showCompletionCallback = null;
          resolve(true);
        }, 15000);
        
        // Set callback that existing 'closed'/'error' listeners will call
        this.showCompletionCallback = () => {
          clearTimeout(timeout);
          console.log('AdService: Ad show completed via listener callback');
          iosDebugLog('Ad closed successfully!', false);
          resolve(true);
        };
        
        // Show the ad IMMEDIATELY - existing listeners will handle the rest
        try {
          console.log('AdService: Calling show() on interstitialAd');
          this.interstitialAd.show();
          console.log('AdService: show() called successfully');
          iosDebugLog('show() called - ad should appear now!', false);
        } catch (showError) {
          console.error('AdService: Exception calling show():', showError);
          iosDebugLog(`EXCEPTION calling show(): ${showError.message}`, true);
          clearTimeout(timeout);
          this.showCompletionCallback = null;
          resolve(true);
        }
      });
      
    } catch (error) {
      console.error('AdService: Failed to show interstitial ad:', error);
      return true;
    }
  }

  // Show interstitial ad for hint (always shows if available)
  async showInterstitialAdForHint() {
    try {
      console.log('AdService: showInterstitialAdForHint called');
      console.log('AdService: Platform:', Platform?.OS);
      
      // Check if AdMob is available
      if (!InterstitialAd || !this.interstitialAd) {
        console.log('AdService: AdMob not available, allowing hint without ad');
        return true;
      }

      if (!this.isInitialized) {
        console.log('AdService: AdMob not initialized, allowing hint without ad');
        return true;
      }

      // Ensure ad is loaded before attempting to show
      if (!this.isAdLoaded || !this.interstitialAd) {
        console.log('AdService: Hint - ad not loaded or ad instance missing, allowing hint anyway');
        if (!this.isLoadingAd) {
          this.loadInterstitialAd();
        }
        return true;
      }

      // iOS CRITICAL: Show ad IMMEDIATELY without delays
      // Delays cause ads to expire on iOS
      console.log('AdService: Hint - Showing ad immediately (no delays)');
      
      return new Promise((resolve) => {
        // Set up timeout
        const timeout = setTimeout(() => {
          console.log('AdService: Hint ad show timeout (15s), continuing');
          this.showCompletionCallback = null;
          resolve(true);
        }, 15000);
        
        // Set callback that existing 'closed'/'error' listeners will call
        this.showCompletionCallback = () => {
          clearTimeout(timeout);
          console.log('AdService: Hint ad show completed via listener callback');
          resolve(true);
        };
        
        // Show the ad IMMEDIATELY - existing listeners will handle the rest
        try {
          console.log('AdService: Hint - Calling show() on interstitialAd');
          this.interstitialAd.show();
          console.log('AdService: Hint - show() called successfully');
        } catch (showError) {
          console.error('AdService: Hint - Exception calling show():', showError);
          clearTimeout(timeout);
          this.showCompletionCallback = null;
          resolve(true);
        }
      });
      
    } catch (error) {
      console.error('AdService: Failed to show interstitial ad for hint:', error);
      return true;
    }
  }

  // Update ad frequency setting
  setAdFrequency(frequency) {
    this.adFrequency = Math.max(1, frequency);
  }

  // Get current ad statistics
  getAdStats() {
    return {
      gamesPlayed: this.gamesPlayed,
      adFrequency: this.adFrequency,
      isInitialized: this.isInitialized,
    };
  }

  // Check if ads are ready
  areAdsReady() {
    return this.isInitialized && this.interstitialAd;
  }

  // Preload ad specifically for game completion (iOS optimization)
  async preloadGameCompletionAd() {
    try {
      console.log('AdService: Preloading game completion ad...');
      
      if (!this.isInitialized) {
        console.log('AdService: Cannot preload - not initialized');
        return false;
      }

      // Only reload if no ad is currently loaded (don't destroy working ads!)
      if (this.isAdLoaded) {
        console.log('AdService: Ad already loaded, skipping preload');
        return true;
      }
      
      // Load ad if not already loaded
      if (!this.interstitialAd || !this.isLoadingAd) {
        this.loadInterstitialAd();
      }
      
      // Wait for ad to load - iOS can take 3-10s (Grok's recommendation)
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max (increased from 5s for iOS)
      const checkInterval = 100; // 100ms intervals
      
      while (!this.isAdLoaded && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        attempts++;
      }
      
      return this.isAdLoaded;
      
    } catch (error) {
      console.error('AdService: Failed to preload game completion ad:', error);
      return false;
    }
  }
}

// Export singleton instance
export default new AdService();