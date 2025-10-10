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
          await requestTrackingPermission();
        } catch (attError) {
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
      this.interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
        requestNonPersonalizedAdsOnly: true,
        keywords: ['word game', 'puzzle', 'brain game'],
      });

      this.interstitialAd.addAdEventListener('loaded', () => {
        console.log('AdService: Interstitial ad loaded successfully');
        this.isAdLoaded = true;
        this.isLoadingAd = false;
        this.loadRetries = 0;
      });

      this.interstitialAd.addAdEventListener('closed', () => {
        console.log('AdService: Interstitial ad closed, reloading...');
        this.isAdLoaded = false; // Mark as not loaded after close
        // Reload for next use
        setTimeout(() => this.loadInterstitialAd(), 1000);
      });

      this.interstitialAd.addAdEventListener('error', (error) => {
        console.error('AdService: Ad error:', error.code, error.message);
        this.isLoadingAd = false;
        this.isAdLoaded = false;
        
        // Retry with exponential backoff
        const retryDelay = 5000 * Math.pow(2, Math.min(this.loadRetries || 0, 2));
        this.loadRetries = (this.loadRetries || 0) + 1;
        setTimeout(() => this.loadInterstitialAd(), retryDelay);
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
      console.log('AdService: gamesPlayed:', this.gamesPlayed, 'adFrequency:', this.adFrequency);
      
      // Check if AdMob is available first
      if (!InterstitialAd || !this.interstitialAd) {
        console.log('AdService: AdMob not available, skipping ad');
        return true; // Return true so game flow continues
      }

      if (!this.isInitialized) {
        console.log('AdService: AdMob not initialized, skipping ad');
        return true; // Return true so game flow continues
      }

      // NOTE: Frequency check removed - ads should always show at designated moments
      // as per requirements (win/lose/quit/max guesses)
      this.gamesPlayed++;

      // Ensure ad is loaded before attempting to show
      if (!this.isAdLoaded) {
        console.log('AdService: Ad not loaded yet, will skip this time');
        // Trigger reload for next time but don't wait
        this.loadInterstitialAd();
        return true;
      }

      console.log('AdService: Pre-show state:', { 
        isInitialized: this.isInitialized, 
        isAdLoaded: this.isAdLoaded, 
        platform: Platform.OS,
        hasAdInstance: !!this.interstitialAd
      });

      // Wait for UI to settle before showing ad (both platforms)
      await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Final check before showing
      if (!this.isAdLoaded) {
        console.log('AdService: Ad not loaded after delays, skipping to prevent failure');
        return true;
      }
      
      // INDUSTRY STANDARD: Both iOS and Android should WAIT for ad completion
      // This ensures proper UI flow and prevents conflicts with popups/navigation
      console.log('AdService: Showing ad with blocking (wait for completion)');
      try {
        // Create a promise that resolves when ad closes or errors
        const adCompletionPromise = new Promise((resolve, reject) => {
          let completed = false;
          
          // Set up one-time listeners for this ad show attempt
          const closeListener = this.interstitialAd.addAdEventListener('closed', () => {
            if (!completed) {
              completed = true;
              console.log('AdService: Ad closed, resolving promise');
              resolve();
            }
          });
          
          const errorListener = this.interstitialAd.addAdEventListener('error', (error) => {
            if (!completed) {
              completed = true;
              console.log('AdService: Ad error during show, resolving promise:', error);
              resolve(); // Resolve, don't reject - game should continue
            }
          });
          
          // Show the ad
          try {
            this.interstitialAd.show();
            console.log('AdService: Ad show() called successfully');
          } catch (showError) {
            console.error('AdService: Exception calling show():', showError);
            if (!completed) {
              completed = true;
              resolve(); // Continue game flow even if show fails
            }
          }
        });
        
        // Wait for ad to complete with 15 second timeout
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => {
            console.log('AdService: Ad show timeout (15s), continuing');
            resolve();
          }, 15000)
        );
        
        await Promise.race([adCompletionPromise, timeoutPromise]);
        console.log('AdService: Successfully completed ad show');
        return true;
      } catch (showError) {
        console.error('AdService: Failed to show interstitial ad:', showError);
        return true;
      }
      
    } catch (error) {
      console.error('AdService: Failed to show interstitial ad:', error);
      return true; // Return true so game flow continues
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
        return true; // Allow hint without ad if AdMob not available
      }

      if (!this.isInitialized) {
        console.log('AdService: AdMob not initialized, allowing hint without ad');
        return true; // Allow hint without ad if not initialized
      }

      // Ensure ad is loaded before attempting to show
      if (!this.isAdLoaded) {
        console.log('AdService: Hint - ad not loaded yet, allowing hint anyway');
        // Don't block hints if ads fail to load - just skip the ad
        if (!this.isLoadingAd) {
          this.loadInterstitialAd(); // Try to load for next time
        }
        return true;
      }

      console.log('AdService: Hint pre-show state:', { 
        isInitialized: this.isInitialized, 
        isAdLoaded: this.isAdLoaded, 
        platform: Platform.OS,
        hasAdInstance: !!this.interstitialAd
      });

      // Wait for UI to settle before showing ad (both platforms)
      await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Final check before showing
      if (!this.isAdLoaded) {
        console.log('AdService: Hint - Ad not loaded after delays, skipping to prevent failure');
        return true;
      }
      
      // INDUSTRY STANDARD: Both iOS and Android should WAIT for ad completion
      console.log('AdService: Hint - Showing ad with blocking (wait for completion)');
      try {
        // Create a promise that resolves when ad closes or errors
        const adCompletionPromise = new Promise((resolve, reject) => {
          let completed = false;
          
          // Set up one-time listeners for this ad show attempt
          const closeListener = this.interstitialAd.addAdEventListener('closed', () => {
            if (!completed) {
              completed = true;
              console.log('AdService: Hint ad closed, resolving promise');
              resolve();
            }
          });
          
          const errorListener = this.interstitialAd.addAdEventListener('error', (error) => {
            if (!completed) {
              completed = true;
              console.log('AdService: Hint ad error during show, resolving promise:', error);
              resolve(); // Resolve, don't reject - hint should continue
            }
          });
          
          // Show the ad
          try {
            this.interstitialAd.show();
            console.log('AdService: Hint ad show() called successfully');
          } catch (showError) {
            console.error('AdService: Exception calling hint ad show():', showError);
            if (!completed) {
              completed = true;
              resolve(); // Continue hint flow even if show fails
            }
          }
        });
        
        // Wait for ad to complete with 15 second timeout
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => {
            console.log('AdService: Hint ad show timeout (15s), continuing');
            resolve();
          }, 15000)
        );
        
        await Promise.race([adCompletionPromise, timeoutPromise]);
        console.log('AdService: Successfully completed hint ad show');
        return true;
      } catch (showError) {
        console.error('AdService: Failed to show hint ad:', showError);
        return true;
      }
      
    } catch (error) {
      console.error('AdService: Failed to show interstitial ad for hint:', error);
      return true; // Allow hint even if ad fails
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