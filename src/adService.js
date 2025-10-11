// AdMob imports - load in production builds
import Constants from 'expo-constants';
import { Platform, InteractionManager } from 'react-native';

let mobileAds, InterstitialAd;

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
    ? 'ca-app-pub-8036041739101786/9274366810' // iOS production interstitial
    : 'ca-app-pub-8036041739101786/1836533025' // Android production interstitial
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
      console.log('AdService: Initializing...');
      console.log('AdService: Platform:', Platform?.OS || 'unknown');
      console.log('AdService: Constants.appOwnership:', Constants?.appOwnership);
      console.log('AdService: __DEV__:', __DEV__);
      
      // iOS-specific: Add delay before AdMob initialization
      if (Platform.OS === 'ios') {
        console.log('AdService: iOS detected, adding initialization delay...');
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Check if AdMob is available
      if (!mobileAds || !InterstitialAd) {
        console.log('AdService: AdMob not available, running in fallback mode');
        console.log('AdService: mobileAds available:', !!mobileAds);
        console.log('AdService: InterstitialAd available:', !!InterstitialAd);
        this.isInitialized = false;
        return;
      }

      // iOS App Tracking Transparency (ATT)
      if (Platform.OS === 'ios') {
        try {
          const { requestTrackingPermission } = require('expo-tracking-transparency');
          const status = await requestTrackingPermission();
          this.attStatus = status; // Store for ad request configuration
          console.log('AdService: ATT status:', status);
          
          if (status === 'denied') {
            console.warn('AdService: ATT denied - this may prevent ads from loading on iOS');
            console.warn('AdService: Users can enable tracking in Settings > Privacy > Tracking');
            console.warn('AdService: Will request non-personalized ads only');
            // Continue anyway - we'll try non-personalized ads
          } else if (status === 'authorized') {
            console.log('AdService: ATT authorized - personalized ads available for better fill rates');
          }
        } catch (attError) {
          console.log('AdService: ATT not available or failed:', attError);
          this.attStatus = 'unavailable';
          // ATT not available, continue without it
        }
      }

      // Retry logic with exponential backoff - Grok's suggestion
      let retries = 3;
      while (retries > 0) {
        try {
          console.log(`AdService: Initializing mobile ads SDK (attempt ${4 - retries}/3)...`);
          await mobileAds().initialize();
          this.isInitialized = true;
          
          console.log('AdService: Mobile ads SDK initialized, loading interstitial ad...');
          // Pre-load ads
          this.loadInterstitialAd();
          console.log('AdService: Successfully initialized with AdMob');
          return; // Success, exit loop
        } catch (error) {
          console.error(`AdService: Init failed (attempt ${4 - retries}/3):`, error);
          retries--;
          if (retries > 0) {
            const delay = 2000 * (3 - retries); // 2s, 4s, 6s
            console.log(`AdService: Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // Final failure after all retries
      console.error('AdService: Failed to initialize after 3 attempts');
      this.isInitialized = false;
    } catch (error) {
      console.error('AdService: Failed to initialize AdMob:', error);
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
      // If ATT authorized on iOS, allow personalized ads for better fill rates (~80% vs ~30%)
      // If denied or Android, use non-personalized ads
      const requestNonPersonalized = Platform.OS === 'ios' ? this.attStatus !== 'authorized' : true;
      console.log('AdService: Request non-personalized ads:', requestNonPersonalized, '(ATT status:', this.attStatus, ')');
      
      this.interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
        requestNonPersonalizedAdsOnly: requestNonPersonalized,
        keywords: ['word game', 'puzzle', 'brain game'],
      });

      this.interstitialAd.addAdEventListener('loaded', () => {
        console.log('AdService: Interstitial ad loaded successfully');
        this.isAdLoaded = true;
        this.isLoadingAd = false;
        this.loadRetries = 0;
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
        if (error.code === 1) {
          console.error('AdService: Error code 1 (No fill) - often caused by ATT denial on iOS');
          if (Platform.OS === 'ios' && this.attStatus === 'denied') {
            console.error('AdService: ATT is denied - this is likely preventing ad fill');
          }
        } else if (error.code === 3) {
          console.error('AdService: Error code 3 (No ad config) - check AdMob setup or ATT status');
        }
        
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
        setTimeout(() => {
          if (!this.isLoadingAd) {
            this.loadInterstitialAd();
          }
        }, retryDelay);
      });

      console.log('AdService: Starting to load interstitial ad...');
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
      
      // Check if AdMob is available first
      if (!InterstitialAd || !this.interstitialAd) {
        console.log('AdService: AdMob not available, skipping ad');
        return true;
      }

      if (!this.isInitialized) {
        console.log('AdService: AdMob not initialized, skipping ad');
        return true;
      }

      this.gamesPlayed++;

      // Ensure ad is loaded before attempting to show
      if (!this.isAdLoaded || !this.interstitialAd) {
        console.log('AdService: Ad not loaded or ad instance missing, skipping');
        if (!this.isLoadingAd) {
          this.loadInterstitialAd();
        }
        return true;
      }

      // iOS CRITICAL: Show ad IMMEDIATELY without delays
      // Delays cause ads to expire on iOS
      console.log('AdService: Showing ad immediately (no delays)');
      
      return new Promise((resolve) => {
        // Set up timeout
        const timeout = setTimeout(() => {
          console.log('AdService: Ad show timeout (15s), continuing');
          this.showCompletionCallback = null;
          resolve(true);
        }, 15000);
        
        // Set callback that existing 'closed'/'error' listeners will call
        this.showCompletionCallback = () => {
          clearTimeout(timeout);
          console.log('AdService: Ad show completed via listener callback');
          resolve(true);
        };
        
        // Show the ad IMMEDIATELY - existing listeners will handle the rest
        try {
          console.log('AdService: Calling show() on interstitialAd');
          this.interstitialAd.show();
          console.log('AdService: show() called successfully');
        } catch (showError) {
          console.error('AdService: Exception calling show():', showError);
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
      
      // Wait for ad to load - iOS can take 3-5s (Grok's suggestion)
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max (increased from 1.5s)
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