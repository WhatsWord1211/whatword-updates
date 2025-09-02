// AdMob imports - will work in development builds, fallback for Expo Go
let mobileAds, BannerAd, BannerAdSize, TestIds, InterstitialAd, RewardedAd, RewardedAdEventType;

try {
  const adModule = require('react-native-google-mobile-ads');
  mobileAds = adModule.default;
  BannerAd = adModule.BannerAd;
  BannerAdSize = adModule.BannerAdSize;
  TestIds = adModule.TestIds;
  InterstitialAd = adModule.InterstitialAd;
  RewardedAd = adModule.RewardedAd;
  RewardedAdEventType = adModule.RewardedAdEventType;
  console.log('AdMob module loaded successfully');
} catch (error) {
  console.log('AdMob not available in Expo Go - using fallback mode');
  // Fallback for Expo Go development
  mobileAds = null;
  BannerAd = null;
  BannerAdSize = null;
  TestIds = null;
  InterstitialAd = null;
  RewardedAd = null;
  RewardedAdEventType = null;
}

// Test Ad Unit IDs (replace with real ones for production)
const AD_UNIT_IDS = {
  // Test IDs for development - using Google's official test IDs
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712', 
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
  
  // Production IDs (uncomment and replace when ready to publish)
  // BANNER: 'ca-app-pub-XXXXXXXXXXXXXXX/YYYYYYYYYY',
  // INTERSTITIAL: 'ca-app-pub-XXXXXXXXXXXXXXX/YYYYYYYYYY',
  // REWARDED: 'ca-app-pub-XXXXXXXXXXXXXXX/YYYYYYYYYY',
};

class AdService {
  constructor() {
    this.interstitialAd = null;
    this.rewardedAd = null;
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
      // Check if AdMob is available
      if (!mobileAds) {
        console.log('AdMob not available - running in fallback mode');
        this.isInitialized = true; // Mark as initialized for fallback
        return;
      }

      // Initialize mobile ads SDK
      await mobileAds().initialize();
      this.isInitialized = true;
      console.log('AdMob initialized successfully');
      
      // Pre-load ads
      this.loadInterstitialAd();
      this.loadRewardedAd();
    } catch (error) {
      console.error('Failed to initialize AdMob:', error);
      // Fallback mode - mark as initialized so app doesn't crash
      this.isInitialized = true;
    }
  }

  // Load interstitial ad for after-game display
  loadInterstitialAd() {
    try {
      // Check if AdMob is available
      if (!InterstitialAd) {
        console.log('Interstitial ads not available - using fallback');
        return;
      }

      this.interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
        requestNonPersonalizedAdsOnly: true,
        keywords: ['word game', 'puzzle', 'brain game'],
      });

      const unsubscribeLoaded = this.interstitialAd.addAdEventListener('loaded', () => {
        console.log('Interstitial ad loaded');
      });

      const unsubscribeClosed = this.interstitialAd.addAdEventListener('closed', () => {
        console.log('Interstitial ad closed');
        // Reload for next use
        this.loadInterstitialAd();
      });

      const unsubscribeError = this.interstitialAd.addAdEventListener('error', (error) => {
        console.error('Interstitial ad error:', error);
        // Retry loading after delay
        setTimeout(() => this.loadInterstitialAd(), 30000);
      });

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

  // Load rewarded ad for hints
  loadRewardedAd() {
    try {
      // Check if AdMob is available
      if (!RewardedAd) {
        console.log('Rewarded ads not available - using fallback');
        return;
      }

      this.rewardedAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.REWARDED, {
        requestNonPersonalizedAdsOnly: true,
        keywords: ['word game', 'puzzle', 'brain game'],
      });

      const unsubscribeLoaded = this.rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
        console.log('Rewarded ad loaded');
      });

      const unsubscribeEarned = this.rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
        console.log('User earned reward:', reward);
      });

      const unsubscribeClosed = this.rewardedAd.addAdEventListener(RewardedAdEventType.CLOSED, () => {
        console.log('Rewarded ad closed');
        // Reload for next use
        this.loadRewardedAd();
      });

      const unsubscribeError = this.rewardedAd.addAdEventListener(RewardedAdEventType.ERROR, (error) => {
        console.error('Rewarded ad error:', error);
        // Retry loading after delay
        setTimeout(() => this.loadRewardedAd(), 30000);
      });

      this.rewardedAd.load();
      
      return () => {
        unsubscribeLoaded();
        unsubscribeEarned();
        unsubscribeClosed();
        unsubscribeError();
      };
    } catch (error) {
      console.error('Failed to load rewarded ad:', error);
    }
  }

  // Show interstitial ad after game completion
  async showInterstitialAd() {
    try {
      // Check if we should show an ad based on frequency
      this.gamesPlayed++;
      if (this.gamesPlayed % this.adFrequency !== 0) {
        console.log('Skipping ad (frequency control)');
        return false;
      }

      // Check if AdMob is available
      if (!InterstitialAd || !this.interstitialAd) {
        console.log('Interstitial ads not available - skipping in fallback mode');
        return true; // Return true so game flow continues
      }

      if (!this.isInitialized) {
        console.log('Interstitial ad not ready');
        return false;
      }

      const isLoaded = await this.interstitialAd.isLoaded();
      if (!isLoaded) {
        console.log('Interstitial ad not loaded yet');
        // Try to load and show
        this.interstitialAd.load();
        return false;
      }

      await this.interstitialAd.show();
      console.log('Interstitial ad shown');
      return true;
    } catch (error) {
      console.error('Failed to show interstitial ad:', error);
      return false;
    }
  }

  // Show rewarded ad for hint (returns promise that resolves when ad is watched)
  async showRewardedAdForHint() {
    return new Promise(async (resolve, reject) => {
      try {
        // Check daily hint limit
        const today = new Date().toDateString();
        if (today !== this.lastHintReset) {
          this.hintsRequested = 0;
          this.lastHintReset = today;
        }

        if (this.hintsRequested >= this.maxHintsPerDay) {
          reject(new Error('Daily hint limit reached'));
          return;
        }

        // Check if AdMob is available
        if (!RewardedAd || !this.rewardedAd) {
          console.log('Rewarded ads not available - giving hint for free in fallback mode');
          this.hintsRequested++;
          resolve(true);
          return;
        }

        if (!this.isInitialized) {
          reject(new Error('Rewarded ad not ready'));
          return;
        }

        const isLoaded = await this.rewardedAd.isLoaded();
        if (!isLoaded) {
          reject(new Error('Rewarded ad not loaded yet'));
          return;
        }

        // Set up reward listener
        const unsubscribeEarned = this.rewardedAd.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          () => {
            this.hintsRequested++;
            unsubscribeEarned();
            resolve(true);
          }
        );

        // Set up closed listener
        const unsubscribeClosed = this.rewardedAd.addAdEventListener(
          RewardedAdEventType.CLOSED,
          () => {
            unsubscribeClosed();
            reject(new Error('Ad was closed without reward'));
          }
        );

        // Show the ad
        await this.rewardedAd.show();
        console.log('Rewarded ad shown for hint');
        
      } catch (error) {
        console.error('Failed to show rewarded ad:', error);
        reject(error);
      }
    });
  }

  // Update ad frequency setting
  setAdFrequency(frequency) {
    this.adFrequency = Math.max(1, frequency);
    console.log(`Ad frequency set to: every ${this.adFrequency} games`);
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
    console.log('Daily hint counter reset');
  }

  // Check if ads are ready
  areAdsReady() {
    // In fallback mode, always return true so app doesn't crash
    if (!mobileAds) {
      return true;
    }
    return this.isInitialized && (this.interstitialAd || this.rewardedAd);
  }
}

// Export singleton instance
export default new AdService();
