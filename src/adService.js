// AdMob imports - load in production builds
import Constants from 'expo-constants';

let mobileAds, TestIds, InterstitialAd;

// Always try to load AdMob in production builds
// Only skip in development with Expo Go
const isExpoGo = Constants?.appOwnership === 'expo' && __DEV__;

if (isExpoGo) {
  // Running in Expo Go development - native module unavailable
  console.log('AdService: Running in Expo Go, AdMob not available');
  mobileAds = null;
  TestIds = null;
  InterstitialAd = null;
} else {
  try {
    console.log('AdService: Attempting to load AdMob module...');
    const adModule = require('react-native-google-mobile-ads');
    mobileAds = adModule.default;
    TestIds = adModule.TestIds;
    InterstitialAd = adModule.InterstitialAd;
    console.log('AdService: AdMob module loaded successfully');
  } catch (error) {
    console.error('AdService: Failed to load AdMob module:', error);
    mobileAds = null;
    TestIds = null;
    InterstitialAd = null;
  }
}

// Test Ad Unit IDs (Google's official test INTERSTITIAL ID)
const AD_UNIT_IDS = {
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712'
};

class AdService {
  constructor() {
    this.interstitialAd = null;
    this.isInitialized = false;
    this.adFrequency = 1; // Show ad after every X games (1 = every game)
    this.gamesPlayed = 0;
    this.hintsRequested = 0;
    this.maxHintsPerDay = 5; // Maximum hints per day
    this.lastHintReset = new Date().toDateString();
    
    this.initialize();
  }

  async initialize() {
    try {
      console.log('AdService: Initializing...');
      console.log('AdService: mobileAds available:', !!mobileAds);
      console.log('AdService: InterstitialAd available:', !!InterstitialAd);
      console.log('AdService: Constants.appOwnership:', Constants?.appOwnership);
      console.log('AdService: __DEV__:', __DEV__);
      
      // Check if AdMob is available
      if (!mobileAds) {
        console.log('AdService: AdMob not available, running in fallback mode');
        this.isInitialized = false; // Mark as NOT initialized for fallback
        return;
      }

      console.log('AdService: Initializing mobile ads SDK...');
      // Initialize mobile ads SDK
      await mobileAds().initialize();
      this.isInitialized = true;
      
      console.log('AdService: Mobile ads SDK initialized, loading interstitial ad...');
      // Pre-load ads
      this.loadInterstitialAd();
      console.log('AdService: Successfully initialized with AdMob');
    } catch (error) {
      console.error('AdService: Failed to initialize AdMob:', error);
      // Fallback mode - mark as NOT initialized so hints are blocked
      this.isInitialized = false;
    }
  }

  // Load interstitial ad for after-game display
  loadInterstitialAd() {
    try {
      console.log('AdService: loadInterstitialAd called');
      // Check if AdMob is available
      if (!InterstitialAd) {
        console.log('AdService: InterstitialAd not available, skipping load');
        return;
      }

      console.log('AdService: Creating interstitial ad with ID:', AD_UNIT_IDS.INTERSTITIAL);
      this.interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
        // Default to non-personalized; consent flow can later adjust if needed
        requestNonPersonalizedAdsOnly: true,
        keywords: ['word game', 'puzzle', 'brain game'],
      });

      const unsubscribeLoaded = this.interstitialAd.addAdEventListener('loaded', () => {
        console.log('AdService: Interstitial ad loaded successfully');
      });

      const unsubscribeClosed = this.interstitialAd.addAdEventListener('closed', () => {
        console.log('AdService: Interstitial ad closed, reloading...');
        // Reload for next use
        this.loadInterstitialAd();
      });

      const unsubscribeError = this.interstitialAd.addAdEventListener('error', (error) => {
        console.error('AdService: Interstitial ad error:', error);
        // Retry loading after delay
        setTimeout(() => this.loadInterstitialAd(), 30000);
      });

      console.log('AdService: Starting to load interstitial ad...');
      this.interstitialAd.load();
      
      return () => {
        unsubscribeLoaded();
        unsubscribeClosed();
        unsubscribeError();
      };
    } catch (error) {
      console.error('Failed to load interstitial ad:', error);
    }
  }

  // Wait for interstitial to load with timeout
  async waitForInterstitialLoaded(timeoutMs = 4000) {
    try {
      if (!this.interstitialAd) {
        this.loadInterstitialAd();
      }

      const isAlreadyLoaded = this.interstitialAd && (await this.interstitialAd.isLoaded());
      if (isAlreadyLoaded) {
        return true;
      }

      return await new Promise((resolve) => {
        let settled = false;

        const onLoaded = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(true);
        };

        const onError = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(false);
        };

        const cleanup = () => {
          if (unsubscribeLoaded) unsubscribeLoaded();
          if (unsubscribeError) unsubscribeError();
        };

        const unsubscribeLoaded = this.interstitialAd?.addAdEventListener('loaded', onLoaded);
        const unsubscribeError = this.interstitialAd?.addAdEventListener('error', onError);

        // Ensure a load attempt is in progress
        this.interstitialAd?.load();

        setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(false);
        }, timeoutMs);
      });
    } catch (e) {
      return false;
    }
  }

  // Show interstitial with retry and wait
  async showInterstitialWithRetry(options = { timeoutMs: 5000, retries: 1 }) {
    const { timeoutMs, retries } = options;
    try {
      if (!InterstitialAd || !this.interstitialAd) {
        return false;
      }
      if (!this.isInitialized) {
        return false;
      }

      let loaded = await this.interstitialAd.isLoaded();
      let attemptsRemaining = Math.max(0, retries);
      while (!loaded && attemptsRemaining >= 0) {
        loaded = await this.waitForInterstitialLoaded(timeoutMs);
        if (!loaded) {
          attemptsRemaining -= 1;
          if (attemptsRemaining >= 0) {
            // force another load attempt between waits
            this.interstitialAd.load();
          }
        }
      }

      if (!loaded) {
        return false;
      }

      await this.interstitialAd.show();
      return true;
    } catch (e) {
      console.error('showInterstitialWithRetry failed:', e);
      return false;
    }
  }

  // Show interstitial ad after game completion
  async showInterstitialAd() {
    try {
      // Check if we should show an ad based on frequency
      this.gamesPlayed++;
      if (this.gamesPlayed % this.adFrequency !== 0) {
        return false;
      }

      // Check if AdMob is available
      if (!InterstitialAd || !this.interstitialAd) {
        console.log('AdService: AdMob not available, skipping ad');
        return true; // Return true so game flow continues
      }

      if (!this.isInitialized) {
        console.log('AdService: AdMob not initialized, skipping ad');
        return true; // Return true so game flow continues
      }

      console.log('AdService: Attempting to show interstitial ad');
      const shown = await this.showInterstitialWithRetry({ timeoutMs: 5000, retries: 1 });
      
      if (shown) {
        console.log('AdService: Successfully showed interstitial ad');
      } else {
        console.log('AdService: Failed to show interstitial ad');
      }
      
      return shown;
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

      console.log('AdService: Attempting to show interstitial ad for hint');
      const shown = await this.showInterstitialWithRetry({ timeoutMs: 5000, retries: 1 });
      
      if (shown) {
        console.log('AdService: Successfully showed interstitial ad for hint');
      } else {
        console.log('AdService: Failed to show interstitial ad for hint');
      }
      
      return shown;
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
      hintsRequested: this.hintsRequested,
      maxHintsPerDay: this.maxHintsPerDay,
      adFrequency: this.adFrequency,
      isInitialized: this.isInitialized,
    };
  }

  // Reset daily hint counter (for testing)
  resetDailyHints() {
    this.hintsRequested = 0;
    this.lastHintReset = new Date().toDateString();
  }

  // Check if ads are ready
  areAdsReady() {
    // In fallback mode, always return true so app doesn't crash
    if (!mobileAds) {
      return true;
    }
    return this.isInitialized && this.interstitialAd;
  }
}

// Export singleton instance
export default new AdService();
