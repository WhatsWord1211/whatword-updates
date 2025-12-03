// AdMob imports - load in production builds
import Constants from 'expo-constants';
import { Platform, InteractionManager } from 'react-native';
import { auth } from './firebase';

let mobileAdsModule;
try {
  mobileAdsModule = require('react-native-google-mobile-ads');
} catch (error) {
  console.warn('AdService: react-native-google-mobile-ads not available', error?.message || error);
  mobileAdsModule = null;
}

const isExpoGo = Constants?.appOwnership === 'expo';

const mobileAds = !isExpoGo && mobileAdsModule ? mobileAdsModule.mobileAds || mobileAdsModule.default : null;
const InterstitialAd = !isExpoGo && mobileAdsModule ? mobileAdsModule.InterstitialAd : null;
const AdEventType = mobileAdsModule?.AdEventType;
const TestIds = mobileAdsModule?.TestIds;

const IOS_USE_TEST_ADS = false;
const IOS_TEST_AD_UNIT = TestIds ? TestIds.INTERSTITIAL : 'ca-app-pub-3940256099942544/4411468910';
const IOS_PROD_AD_UNIT = 'ca-app-pub-8036041739101786/9274366810';

const AD_UNIT_IDS = {
  INTERSTITIAL: Platform.OS === 'ios'
    ? (IOS_USE_TEST_ADS ? IOS_TEST_AD_UNIT : IOS_PROD_AD_UNIT)
    : 'ca-app-pub-8036041739101786/1836533025',
};

// Ad-free accounts - add email addresses or UIDs here
// This prevents ads from showing for developer accounts to avoid AdMob policy violations
const AD_FREE_ACCOUNTS = [
  'wilderbssmstr@gmail.com',
  'scolleenw@gmail.com',
];

class AdService {
  constructor() {
    this.enabled = !!mobileAds && !!InterstitialAd && !isExpoGo;
    this.initializationPromise = null;
    this.interstitialAd = null;
    this.adListeners = [];
    this.loadPromise = null;
    this.isAdLoaded = false;
    this.gamesPlayed = 0;
    this.adFrequency = 1;
    this.activeShowPromise = null;
  }

  async ensureInitialized() {
    if (!this.enabled) {
      return false;
    }

    if (!this.initializationPromise) {
      try {
        const mobileAdsFn = typeof mobileAds === 'function' ? mobileAds : () => mobileAds;
        this.initializationPromise = mobileAdsFn().initialize();
      } catch (error) {
        console.error('AdService: Failed to initialize Mobile Ads SDK:', error);
        this.initializationPromise = Promise.resolve();
      }
    }

    try {
      await this.initializationPromise;
      return true;
    } catch (error) {
      console.error('AdService: Mobile Ads initialization rejected:', error);
      return false;
    }
  }

  cleanupAdInstance() {
    try {
      this.adListeners.forEach(unsubscribe => unsubscribe && unsubscribe());
    } catch (error) {
      console.warn('AdService: Error removing ad listeners:', error?.message || error);
    }
    this.adListeners = [];
    this.interstitialAd = null;
    this.isAdLoaded = false;
  }

  // Check if current user should be ad-free
  isUserAdFree() {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return false;
      }

      // Check by email or UID
      const userEmail = currentUser.email?.toLowerCase();
      const userUid = currentUser.uid;

      return AD_FREE_ACCOUNTS.some(account => {
        const accountLower = account.toLowerCase();
        return accountLower === userEmail || accountLower === userUid.toLowerCase();
      });
    } catch (error) {
      console.warn('AdService: Error checking ad-free status:', error?.message || error);
      return false;
    }
  }

  async loadInterstitialAd() {
    if (!this.enabled) {
      return false;
    }

    await this.ensureInitialized();

    if (this.isAdLoaded && this.interstitialAd) {
      return true;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.cleanupAdInstance();

    try {
      const requestNonPersonalizedAdsOnly = Platform.OS === 'ios';
      const ad = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
        requestNonPersonalizedAdsOnly,
        keywords: ['word games', 'puzzle games', 'brain games'],
      });

      this.interstitialAd = ad;

      this.loadPromise = new Promise((resolve, reject) => {
        const onLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
          this.isAdLoaded = true;
          this.loadPromise = null;
          resolve(true);
        });

        const onError = ad.addAdEventListener(AdEventType.ERROR, error => {
          console.error('AdService: Ad load error:', error?.message || error);
          this.isAdLoaded = false;
          this.loadPromise = null;
          reject(error);
        });

        this.adListeners.push(onLoaded, onError);
      });

      ad.load();
      return this.loadPromise.catch(() => false);
    } catch (error) {
      console.error('AdService: Exception while creating interstitial ad:', error);
      this.loadPromise = null;
      return false;
    }
  }

  async showInterstitialAd() {
    if (!this.enabled) {
      return true;
    }

    // Check if user is ad-free (developer account)
    if (this.isUserAdFree()) {
      console.log('AdService: User is ad-free, skipping ad');
      return true;
    }

    if (this.activeShowPromise) {
      console.warn('AdService: showInterstitialAd called while another ad is active. Reusing existing promise.');
      return this.activeShowPromise;
    }

    this.gamesPlayed += 1;

    const loaded = await this.loadInterstitialAd();
    if (!loaded || !this.interstitialAd) {
      return true;
    }

    this.activeShowPromise = new Promise(resolve => {
      const cleanUpAfterShow = () => {
        tempListeners.forEach(unsub => unsub && unsub());
        this.cleanupAdInstance();
        this.loadInterstitialAd().catch(() => {});
        this.activeShowPromise = null;
        resolve(true);
      };

      const tempListeners = [
        this.interstitialAd.addAdEventListener(AdEventType.CLOSED, cleanUpAfterShow),
        this.interstitialAd.addAdEventListener(AdEventType.ERROR, error => {
          console.error('AdService: Error while showing ad:', error?.message || error);
          cleanUpAfterShow();
        }),
      ];

      InteractionManager.runAfterInteractions(() => {
        try {
          this.interstitialAd?.show();
        } catch (error) {
          console.error('AdService: Exception calling show():', error);
          cleanUpAfterShow();
        }
      });
    });

    return this.activeShowPromise;
  }

  async showInterstitialAdForHint() {
    return this.showInterstitialAd();
  }

  async preloadGameCompletionAd() {
    const loaded = await this.loadInterstitialAd();
    return loaded && this.isAdLoaded;
  }

  setAdFrequency(frequency) {
    this.adFrequency = Math.max(1, frequency || 1);
  }

  getAdStats() {
    return {
      gamesPlayed: this.gamesPlayed,
      adFrequency: this.adFrequency,
      isInitialized: this.enabled,
    };
  }

  areAdsReady() {
    return this.enabled && this.isAdLoaded;
  }
}

export default new AdService();