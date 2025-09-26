// AdMob imports - load in production builds
import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

// Test Ad Unit IDs (Google's official test INTERSTITIAL ID)
const AD_UNIT_IDS = {
  INTERSTITIAL: Platform.OS === 'ios' 
    ? 'ca-app-pub-3940256099942544/4411468910' // iOS test interstitial
    : 'ca-app-pub-3940256099942544/1033173712'  // Android test interstitial
};

class AdService {
  constructor() {
    this.interstitialAd = null;
    this.isInitialized = false;
    this.isAdLoaded = false;
    this.isLoadingAd = false; // Prevent concurrent loads - Grok's suggestion
    this.adFrequency = 1; // Show ad after every X games (1 = every game)
    this.gamesPlayed = 0;
    
    this.initialize();
  }

  async initialize() {
    try {
      console.log('AdService: Initializing...');
      console.log('AdService: Platform:', Platform?.OS || 'unknown');
      console.log('AdService: Constants.appOwnership:', Constants?.appOwnership);
      console.log('AdService: __DEV__:', __DEV__);
      
      // Check if AdMob is available
      if (!mobileAds || !InterstitialAd) {
        console.log('AdService: AdMob not available, running in fallback mode');
        console.log('AdService: mobileAds available:', !!mobileAds);
        console.log('AdService: InterstitialAd available:', !!InterstitialAd);
        this.isInitialized = false;
        return;
      }

      // iOS App Tracking Transparency (ATT) - Grok's suggestion
      if (Platform.OS === 'ios') {
        try {
          const { requestTrackingPermission } = require('expo-tracking-transparency');
          const status = await requestTrackingPermission();
          if (status !== 'granted') {
            console.warn('AdService: ATT not granted, ads may be limited');
          } else {
            console.log('AdService: ATT granted, ads should work normally');
          }
        } catch (attError) {
          console.warn('AdService: ATT not available or failed:', attError.message);
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

  // Cleanup method - Grok's suggestion
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
      
      // Prevent concurrent loads - Grok's suggestion
      if (this.isLoadingAd) {
        console.log('AdService: Ad load already in progress, skipping');
        return;
      }
      
      if (!InterstitialAd) {
        console.log('AdService: InterstitialAd not available, skipping load');
        return;
      }

      // Cleanup old ad instance - Grok's suggestion
      this.cleanupAd();
      
      this.isLoadingAd = true;
      console.log('AdService: Creating interstitial ad with ID:', AD_UNIT_IDS.INTERSTITIAL);
      this.interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
        requestNonPersonalizedAdsOnly: true,
        keywords: ['word game', 'puzzle', 'brain game'],
      });

      // Add event listeners
      this.interstitialAd.addAdEventListener('loaded', () => {
        console.log('AdService: Interstitial ad loaded successfully');
        this.isAdLoaded = true;
        this.isLoadingAd = false;
      });

      this.interstitialAd.addAdEventListener('closed', () => {
        console.log('AdService: Interstitial ad closed, reloading...');
        // Reload for next use
        setTimeout(() => this.loadInterstitialAd(), 1000); // Reduced delay - Grok's suggestion
      });

      this.interstitialAd.addAdEventListener('error', (error) => {
        console.error('AdService: Interstitial ad error:', error);
        this.isLoadingAd = false;
        // Retry loading after shorter delay - Grok's suggestion
        setTimeout(() => this.loadInterstitialAd(), 5000);
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

      // Check if we should show an ad based on frequency
      this.gamesPlayed++;
      if (this.gamesPlayed % this.adFrequency !== 0) {
        console.log('AdService: Skipping ad based on frequency (gamesPlayed:', this.gamesPlayed, 'frequency:', this.adFrequency, ')');
        return true;
      }

      // iOS-specific: Add delay and checks - Grok's suggestion
      if (Platform.OS === 'ios') {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!this.isAdLoaded) {
          console.log('AdService: iOS - Ad not loaded, triggering immediate reload');
          this.loadInterstitialAd();
          return true;
        }
      }

      // Ensure first call waits for initial load if not yet loaded - Increased wait time
      if (!this.isAdLoaded) {
        console.log('AdService: Ad not loaded yet, waiting longer before first show...');
        let attempts = 0;
        const maxAttempts = 30; // Increased to 3 seconds - Grok's suggestion
        while (!this.isAdLoaded && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        console.log('AdService: Post-wait isAdLoaded:', this.isAdLoaded, 'attempts:', attempts);
        
        // If still not loaded, trigger immediate reload - Grok's suggestion
        if (!this.isAdLoaded) {
          console.log('AdService: Ad still not loaded, triggering immediate reload');
          this.loadInterstitialAd();
          return true;
        }
      }

      console.log('AdService: Attempting to show interstitial ad');
      console.log('AdService: isAdLoaded:', this.isAdLoaded);
      
      // Check if ad is ready before showing (both platforms)
      if (!this.isAdLoaded) {
        console.log('AdService: Ad not loaded yet, skipping to prevent failure');
        return true;
      }
      
      // Add brief delay to ensure UI is stable
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Try to show the ad
      try {
        // Use timeout for both platforms to prevent hanging
        const showAdPromise = this.interstitialAd.show();
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => {
            console.log('AdService: Ad show timeout, continuing without ad');
            resolve();
          }, 10000) // Increased to 10 seconds - Grok's suggestion
        );
        
        await Promise.race([showAdPromise, timeoutPromise]);
        console.log('AdService: Successfully showed interstitial ad');
        return true;
      } catch (showError) {
        console.log('AdService: Failed to show interstitial ad:', showError);
        return true; // Return true so game flow continues
      }
      
    } catch (error) {
      console.error('AdService: Failed to show interstitial ad:', error);
      return true; // Return true so game flow continues
    }
  }

  // Show interstitial ad for hint (always shows if available)
  async showInterstitialAdForHint() {
    try {
      // Check if AdMob is available
      if (!InterstitialAd || !this.interstitialAd) {
        console.log('AdService: AdMob not available, allowing hint without ad');
        return true; // Allow hint without ad if AdMob not available
      }

      if (!this.isInitialized) {
        console.log('AdService: AdMob not initialized, allowing hint without ad');
        return true; // Allow hint without ad if not initialized
      }

      // iOS-specific: Add delay and checks - Grok's suggestion
      if (Platform.OS === 'ios') {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!this.isAdLoaded) {
          console.log('AdService: iOS - Ad not loaded for hint, triggering immediate reload');
          this.loadInterstitialAd();
          return true;
        }
      }

      // Ensure ad is loaded on first hint call - Increased wait time
      if (!this.isAdLoaded) {
        console.log('AdService: Hint - ad not loaded yet, waiting longer...');
        let attempts = 0;
        const maxAttempts = 20; // Increased to 2 seconds - Grok's suggestion
        while (!this.isAdLoaded && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        console.log('AdService: Hint post-wait isAdLoaded:', this.isAdLoaded, 'attempts:', attempts);
        
        // If still not loaded, trigger immediate reload - Grok's suggestion
        if (!this.isAdLoaded) {
          console.log('AdService: Hint - Ad still not loaded, triggering immediate reload');
          this.loadInterstitialAd();
          return true;
        }
      }

      console.log('AdService: Attempting to show interstitial ad for hint');
      
      // iOS-specific: Add small delay for iOS hint ads
      if (Platform.OS === 'ios') {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (!this.isAdLoaded) {
          console.log('AdService: iOS - Ad no longer loaded after delay for hint, skipping');
          return true;
        }
      }
      
      // Simple approach - just try to show the ad
      try {
        await this.interstitialAd.show();
        console.log('AdService: Successfully showed interstitial ad for hint');
        return true; // Ad shown successfully
      } catch (showError) {
        console.log('AdService: Failed to show interstitial ad for hint:', showError);
        return true; // Allow hint even if ad fails
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
      
      if (!this.isInitialized || !this.interstitialAd) {
        console.log('AdService: Cannot preload - not initialized');
        return false;
      }

      // Force reload the ad to ensure it's fresh
      this.loadInterstitialAd();
      
      // Wait a bit for the ad to load with timeout to prevent infinite loop
      let attempts = 0;
      const maxAttempts = 15; // 1.5 seconds max
      const checkInterval = 100; // 100ms intervals
      
      while (!this.isAdLoaded && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        attempts++;
      }
      
      console.log('AdService: Game completion ad preloaded:', this.isAdLoaded, `(attempts: ${attempts})`);
      return this.isAdLoaded;
      
    } catch (error) {
      console.error('AdService: Failed to preload game completion ad:', error);
      return false;
    }
  }
}

// Export singleton instance
export default new AdService();