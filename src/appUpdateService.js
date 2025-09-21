import { Platform, Linking, Alert } from 'react-native';
import Constants from 'expo-constants';

class AppUpdateService {
  constructor() {
    this.isChecking = false;
    this.lastCheckTime = null;
    this.checkInterval = 24 * 60 * 60 * 1000; // Check once per day
  }

  /**
   * Check for app updates by comparing current version with latest on Google Play Store
   */
  async checkForUpdates() {
    try {
      // Prevent multiple simultaneous checks
      if (this.isChecking) {
        return;
      }

      // Only check once per day to avoid excessive API calls
      const now = Date.now();
      if (this.lastCheckTime && (now - this.lastCheckTime) < this.checkInterval) {
        return;
      }

      this.isChecking = true;
      this.lastCheckTime = now;

      // Only check for updates in production builds
      if (__DEV__) {
        console.log('AppUpdateService: Update checking disabled in development mode');
        return;
      }

      // Check for updates using local version comparison
      const updateAvailable = await this.checkGooglePlayStoreForUpdates();
      
      if (updateAvailable) {
        console.log('AppUpdateService: Update available, showing update prompt');
        await this.redirectToUpdate();
      } else {
        console.log('AppUpdateService: No update available');
      }

    } catch (error) {
      console.error('AppUpdateService: Failed to check for updates:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Check Google Play Store for available updates
   */
  async checkGooglePlayStoreForUpdates() {
    try {
      // Method 1: Check against a remote version endpoint
      // Using a simple JSON file hosted on GitHub
      const versionCheckUrl = 'https://raw.githubusercontent.com/WhatsWord1211/whatword-updates/refs/heads/main/version.json';
      
      try {
        const response = await fetch(versionCheckUrl, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        
        if (response.ok) {
          const versionData = await response.json();
          const currentBuildNumber = this.getCurrentBuildNumber();
          const latestBuildNumber = versionData.latestBuildNumber || versionData.versionCode;
          
          console.log('AppUpdateService: Current build:', currentBuildNumber, 'Latest build:', latestBuildNumber);
          
          if (currentBuildNumber < latestBuildNumber) {
            console.log('AppUpdateService: Update available - current build is older than latest');
            return true;
          }
          
          console.log('AppUpdateService: No update available - current build is up to date');
          return false;
        }
      } catch (fetchError) {
        console.log('AppUpdateService: Failed to fetch version info, falling back to local check');
      }
      
      // Method 2: Fallback to local version comparison
      // This is a simple approach where you manually update the target version
      const currentBuildNumber = this.getCurrentBuildNumber();
      const targetBuildNumber = 15; // Fallback target (same as current)
      
      console.log('AppUpdateService: Current build:', currentBuildNumber, 'Target build:', targetBuildNumber);
      
      if (currentBuildNumber < targetBuildNumber) {
        console.log('AppUpdateService: Update available - current build is older than target');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('AppUpdateService: Failed to check Google Play Store:', error);
      return false;
    }
  }

  /**
   * Redirect user to appropriate app store update page
   */
  async redirectToUpdate() {
    try {
      let storeUrl, storeName;
      
      if (Platform.OS === 'ios') {
        // iOS App Store
        const bundleId = Constants.expoConfig?.ios?.bundleIdentifier || 'com.whatword.app';
        storeUrl = `https://apps.apple.com/app/id${bundleId}`;
        storeName = 'App Store';
      } else {
        // Android Google Play Store
        const packageName = Constants.expoConfig?.android?.package || 'com.whatword.app';
        storeUrl = `https://play.google.com/store/apps/details?id=${packageName}`;
        storeName = 'Google Play Store';
      }
      
      // Show alert first to inform user
      Alert.alert(
        'Update Available',
        `A new version of WhatWord is available. You will be redirected to the ${storeName} to update the app.`,
        [
          {
            text: 'Update Now',
            onPress: async () => {
              try {
                const supported = await Linking.canOpenURL(storeUrl);
                if (supported) {
                  await Linking.openURL(storeUrl);
                } else {
                  console.error(`AppUpdateService: Cannot open ${storeName} URL`);
                  Alert.alert('Error', `Cannot open ${storeName}. Please update manually.`);
                }
              } catch (error) {
                console.error(`AppUpdateService: Failed to open ${storeName}:`, error);
                Alert.alert('Error', `Failed to open ${storeName}. Please update manually.`);
              }
            }
          },
          {
            text: 'Later',
            style: 'cancel'
          }
        ],
        { cancelable: false } // Prevent dismissing without action
      );

    } catch (error) {
      console.error('AppUpdateService: Failed to redirect to update:', error);
      Alert.alert('Error', 'Failed to redirect to update. Please check the Google Play Store manually.');
    }
  }

  /**
   * Force check for updates (bypasses daily check limit)
   */
  async forceCheckForUpdates() {
    this.lastCheckTime = null; // Reset last check time
    await this.checkForUpdates();
  }

  /**
   * Update the target build number (call this when you release a new version)
   */
  updateTargetBuildNumber(newBuildNumber) {
    // This would update the target build number in your version file
    // For now, you need to manually update the targetBuildNumber in the code
    console.log('AppUpdateService: To update target build number, edit the targetBuildNumber variable in checkGooglePlayStoreForUpdates()');
    console.log('AppUpdateService: Current target should be updated to:', newBuildNumber);
  }

  /**
   * Check if app is running in development mode
   */
  isDevelopmentMode() {
    return __DEV__ || !Updates.isEnabled;
  }

  /**
   * Get current app version
   */
  getCurrentVersion() {
    return Constants.expoConfig?.version || '1.0.0';
  }

  /**
   * Get current build number
   */
  getCurrentBuildNumber() {
    return Constants.expoConfig?.android?.versionCode || 1;
  }
}

// Export singleton instance
const appUpdateService = new AppUpdateService();
export default appUpdateService;
