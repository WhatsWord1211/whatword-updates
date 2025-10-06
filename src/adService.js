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

// Interstitial Ad Unit IDs - Production (both platforms)
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

      // Add event listeners with enhanced error logging
      this.interstitialAd.addAdEventListener('loaded', () => {
        console.log('AdService: Interstitial ad loaded successfully');
        this.isAdLoaded = true;
        this.isLoadingAd = false;
      });

      this.interstitialAd.addAdEventListener('closed', () => {
        console.log('AdService: Interstitial ad closed, reloading...');
        // Reload for next use
        setTimeout(() => this.loadInterstitialAd(), 1000);
      });

      this.interstitialAd.addAdEventListener('error', (error) => {
        console.error('AdService: Interstitial ad error:', error);
        console.error('AdService: Error details:', {
          code: error.code,
          message: error.message,
          domain: error.domain,
          userInfo: error.userInfo
        });
        this.isLoadingAd = false;
        // Retry loading after delay
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

      // iOS-specific: Use InteractionManager and longer delay for stable presentation
      if (Platform.OS === 'ios') {
        console.log('AdService: iOS - Waiting for interactions to complete...');
        await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased to 500ms
        
        // Double-check ad is still loaded after delay
        if (!this.isAdLoaded) {
          console.log('AdService: iOS - Ad no longer loaded after delay, skipping');
          return true;
        }
      } else {
        // Android: shorter delay but still wait for interactions
        await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Final check before showing
      if (!this.isAdLoaded) {
        console.log('AdService: Ad not loaded after delays, skipping to prevent failure');
        return true;
      }
      
      console.log('AdService: Attempting to show interstitial ad');
      
      // Try to show the ad with timeout to prevent hanging
      try {
        const showAdPromise = this.interstitialAd.show();
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => {
            console.log('AdService: Ad show timeout (15s), continuing without ad');
            resolve();
          }, 15000) // Increased to 15 seconds
        );
        
        await Promise.race([showAdPromise, timeoutPromise]);
        console.log('AdService: Successfully showed interstitial ad');
        return true;
      } catch (showError) {
        console.error('AdService: Failed to show interstitial ad:', showError);
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
        console.log('AdService: Hint - ad not loaded yet, triggering immediate reload');
        this.loadInterstitialAd();
        return true;
      }

      console.log('AdService: Hint pre-show state:', { 
        isInitialized: this.isInitialized, 
        isAdLoaded: this.isAdLoaded, 
        platform: Platform.OS,
        hasAdInstance: !!this.interstitialAd
      });

      // iOS-specific: Use InteractionManager and longer delay for stable presentation
      if (Platform.OS === 'ios') {
        console.log('AdService: iOS Hint - Waiting for interactions to complete...');
        await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased to 500ms
        
        // Double-check ad is still loaded after delay
        if (!this.isAdLoaded) {
          console.log('AdService: iOS Hint - Ad no longer loaded after delay, skipping');
          return true;
        }
      } else {
        // Android: shorter delay but still wait for interactions
        await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Final check before showing
      if (!this.isAdLoaded) {
        console.log('AdService: Hint - Ad not loaded after delays, skipping to prevent failure');
        return true;
      }
      
      console.log('AdService: Attempting to show interstitial ad for hint');
      
      // Try to show the ad with timeout to prevent hanging
      try {
        const showAdPromise = this.interstitialAd.show();
        const timeoutPromise = new Promise((resolve) => 
          setTimeout(() => {
            console.log('AdService: Hint ad show timeout (15s), continuing without ad');
            resolve();
          }, 15000) // Increased to 15 seconds
        );
        
        await Promise.race([showAdPromise, timeoutPromise]);
        console.log('AdService: Successfully showed interstitial ad for hint');
        return true; // Ad shown successfully
      } catch (showError) {
        console.error('AdService: Failed to show interstitial ad for hint:', showError);
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